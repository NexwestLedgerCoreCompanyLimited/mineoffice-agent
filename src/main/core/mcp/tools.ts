import fs from 'fs';
import path from 'path';
import { AgentRole, Task, PlanMode, TaskCategory } from '@shared/types';
import { ROLE_DEFINITIONS, ROLE_ORDER } from '@shared/roles';
import { pingServer } from '../bot/mineflayerSwarm';
import { SwarmOrchestrator } from '../foreman/orchestrator';

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, any>;
  readOnly: boolean;
}

/** What an MCP server talks to: this process's engine, or a running app through its control port. */
export interface ToolBackend {
  list(): Promise<ToolDefinition[]>;
  call(name: string, args: Record<string, any>): Promise<any>;
}

const MAX_CONTROL_CALLS_PER_MINUTE = 30;
const MAX_AUDIT_BYTES = 1024 * 1024;
const CATEGORIES: TaskCategory[] = ['code', 'minecraft', 'research'];
const PLAN_MODES: PlanMode[] = [...CATEGORIES, 'project'];
const PRIORITIES: Task['priority'][] = ['low', 'medium', 'high', 'urgent'];

function text(args: Record<string, any>, key: string, maxLength: number, required = true): string {
  const value = args[key];
  if (value === undefined || value === null || value === '') {
    if (required) throw new Error(`"${key}" is required.`);
    return '';
  }
  if (typeof value !== 'string') throw new Error(`"${key}" must be a string.`);
  if (value.length > maxLength) throw new Error(`"${key}" is longer than ${maxLength} characters.`);
  return value;
}

function oneOf<T extends string>(args: Record<string, any>, key: string, allowed: T[], fallback?: T): T {
  const value = args[key] ?? fallback;
  if (!allowed.includes(value)) throw new Error(`"${key}" must be one of: ${allowed.join(', ')}.`);
  return value;
}

const AGENT_ID = { type: 'string', description: 'Agent id from mineoffice_get_state, such as "wren".' };

const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: 'mineoffice_get_state',
    description: 'Returns the team, each role, tasks, in-game bot status and the configured server.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    readOnly: true
  },
  {
    name: 'mineoffice_get_logs',
    description: 'Returns recent work logs for one agent. In-game chat is left out because other players write it.',
    inputSchema: {
      type: 'object',
      properties: { agentId: AGENT_ID, limit: { type: 'number', description: 'Most recent entries, up to 100.' } },
      required: ['agentId'],
      additionalProperties: false
    },
    readOnly: true
  },
  {
    name: 'mineoffice_list_skills',
    description: 'Lists Minecraft skills and which roles may use each one.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    readOnly: true
  },
  {
    name: 'mineoffice_test_server',
    description: 'Pings the Minecraft server configured in MineOffice, without logging in.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    readOnly: true
  },
  {
    name: 'mineoffice_plan_goal',
    description: 'Gives a goal to the Commander, who splits it into tasks and delegates them by role. Tasks wait until started.',
    inputSchema: {
      type: 'object',
      properties: { goal: { type: 'string' }, category: { type: 'string', enum: PLAN_MODES } },
      required: ['goal'],
      additionalProperties: false
    },
    readOnly: false
  },
  {
    name: 'mineoffice_start_tasks',
    description: 'Starts a group of tasks as a team. Each begins once the tasks it depends on are done. A project ends with a review in the desktop app.',
    inputSchema: {
      type: 'object',
      properties: { taskIds: { type: 'array', items: { type: 'string' }, maxItems: 50 } },
      required: ['taskIds'],
      additionalProperties: false
    },
    readOnly: false
  },
  {
    name: 'mineoffice_create_task',
    description: 'Adds one task to the Task Wall without going through the Commander.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        description: { type: 'string' },
        category: { type: 'string', enum: CATEGORIES },
        agentId: AGENT_ID,
        priority: { type: 'string', enum: PRIORITIES }
      },
      required: ['title', 'category'],
      additionalProperties: false
    },
    readOnly: false
  },
  {
    name: 'mineoffice_execute_task',
    description: 'Starts a task and returns at once. Check progress with mineoffice_get_state.',
    inputSchema: {
      type: 'object',
      properties: { taskId: { type: 'string' } },
      required: ['taskId'],
      additionalProperties: false
    },
    readOnly: false
  },
  {
    name: 'mineoffice_set_role',
    description: 'Changes an agent\'s role. Taking the commander role swaps it with the current Commander.',
    inputSchema: {
      type: 'object',
      properties: { agentId: AGENT_ID, role: { type: 'string', enum: ROLE_ORDER } },
      required: ['agentId', 'role'],
      additionalProperties: false
    },
    readOnly: false
  },
  {
    name: 'mineoffice_connect_bots',
    description: 'Sends bots into the configured server. Leave agentId out to send every field crew member.',
    inputSchema: { type: 'object', properties: { agentId: AGENT_ID }, additionalProperties: false },
    readOnly: false
  },
  {
    name: 'mineoffice_disconnect_bots',
    description: 'Takes bots out of the server. Leave agentId out to disconnect every bot.',
    inputSchema: { type: 'object', properties: { agentId: AGENT_ID }, additionalProperties: false },
    readOnly: false
  },
  {
    name: 'mineoffice_send_chat',
    description: 'Says a message in game chat. Slash commands are not allowed from this tool.',
    inputSchema: {
      type: 'object',
      properties: { message: { type: 'string' }, agentId: AGENT_ID },
      required: ['message'],
      additionalProperties: false
    },
    readOnly: false
  }
];

/**
 * The actions AI tools may take. Deliberately missing, because an AI should not be able to do
 * them unattended: reading or changing settings and API keys, pointing bots at a different
 * server, approving its own merges, and adding executable skills.
 */
export class ToolHost implements ToolBackend {
  private orchestrator: SwarmOrchestrator;
  private auditPath: string;
  private onSettingsChanged: () => void;
  private recentControlCalls: number[] = [];

  constructor(orchestrator: SwarmOrchestrator, dataDirectory: string, onSettingsChanged: () => void) {
    this.orchestrator = orchestrator;
    this.auditPath = path.join(dataDirectory, 'audit.log');
    this.onSettingsChanged = onSettingsChanged;
  }

  public async list(): Promise<ToolDefinition[]> {
    return TOOL_DEFINITIONS;
  }

  public async call(name: string, args: Record<string, any> = {}): Promise<any> {
    const tool = TOOL_DEFINITIONS.find(t => t.name === name);
    if (!tool) throw new Error(`Unknown tool: ${name}`);

    if (!tool.readOnly) {
      this.enforceRateLimit();
      this.audit(name, args);
    }
    return this.run(name, args);
  }

  /** An AI stuck in a loop should not be able to burn API credits or spam a server. */
  private enforceRateLimit() {
    const now = Date.now();
    this.recentControlCalls = this.recentControlCalls.filter(time => now - time < 60 * 1000);
    if (this.recentControlCalls.length >= MAX_CONTROL_CALLS_PER_MINUTE) {
      throw new Error('Too many control actions this minute. Wait and try again.');
    }
    this.recentControlCalls.push(now);
  }

  private audit(tool: string, args: Record<string, any>) {
    try {
      if (fs.existsSync(this.auditPath) && fs.statSync(this.auditPath).size > MAX_AUDIT_BYTES) {
        fs.renameSync(this.auditPath, `${this.auditPath}.1`);
      }
      const line = JSON.stringify({ time: new Date().toISOString(), tool, args });
      fs.appendFileSync(this.auditPath, `${line}\n`, { mode: 0o600 });
    } catch (err) {
      console.error('[Audit] Could not write the audit log:', err);
    }
  }

  private requireAgent(agentId: string) {
    const agent = this.orchestrator.getAgents().find(a => a.id === agentId);
    if (!agent) throw new Error(`Unknown agent: ${agentId}`);
    return agent;
  }

  private async run(name: string, args: Record<string, any>): Promise<any> {
    const orchestrator = this.orchestrator;
    switch (name) {
      case 'mineoffice_get_state':
        return this.getState();

      case 'mineoffice_get_logs': {
        const agent = this.requireAgent(text(args, 'agentId', 64));
        const limit = Math.min(Math.max(Number(args.limit) || 30, 1), 100);
        return orchestrator
          .getLogs(agent.id)
          .filter(log => !/^\[(Chat|Whisper)\]/.test(log.message))
          .slice(-limit)
          .map(log => ({ time: log.timestamp, level: log.level, message: log.message }));
      }

      case 'mineoffice_list_skills':
        return orchestrator.skills.getAllSkills().map(skill => ({
          id: skill.id,
          description: skill.description,
          parameters: skill.parameters,
          roles: ROLE_ORDER.filter(role => ROLE_DEFINITIONS[role].skillCategories.includes(skill.category))
        }));

      case 'mineoffice_test_server': {
        const { kind, targets } = orchestrator.settings.minecraft;
        return pingServer(targets[kind]);
      }

      case 'mineoffice_plan_goal': {
        const category = oneOf(args, 'category', PLAN_MODES, 'minecraft');
        return orchestrator.planGoal(text(args, 'goal', 2000), category);
      }

      case 'mineoffice_start_tasks': {
        const ids = Array.isArray(args.taskIds) ? args.taskIds.filter((id: unknown) => typeof id === 'string').slice(0, 50) : [];
        if (ids.length === 0) throw new Error('taskIds must list at least one task.');
        const { runId } = await orchestrator.startRun(ids as string[]);
        return { runId, started: ids.length };
      }

      case 'mineoffice_create_task':
        return orchestrator.createTask(
          text(args, 'title', 200),
          text(args, 'description', 2000, false) || text(args, 'title', 200),
          oneOf(args, 'category', CATEGORIES),
          text(args, 'agentId', 64, false) || undefined,
          oneOf(args, 'priority', PRIORITIES, 'medium')
        );

      case 'mineoffice_execute_task': {
        const taskId = text(args, 'taskId', 64);
        const task = orchestrator.getTasks().find(t => t.id === taskId);
        if (!task) throw new Error(`Unknown task: ${taskId}`);
        orchestrator.executeTask(taskId).catch(err => {
          console.error(`[Tools] Task ${taskId} failed:`, err);
        });
        return { started: true, taskId };
      }

      case 'mineoffice_set_role': {
        const result = orchestrator.setAgentRole(text(args, 'agentId', 64), oneOf<AgentRole>(args, 'role', ROLE_ORDER));
        if (!result.ok) throw new Error(result.error);
        this.onSettingsChanged();
        return { changed: true };
      }

      case 'mineoffice_connect_bots': {
        const agentId = text(args, 'agentId', 64, false);
        if (agentId) {
          const agent = this.requireAgent(agentId);
          if (!ROLE_DEFINITIONS[agent.role].inGame) throw new Error(`${agent.displayName} works outside the game.`);
          orchestrator.swarm.spawnBot(agent.id, agent.name);
        } else {
          orchestrator.connectAllBots();
        }
        return { queued: true };
      }

      case 'mineoffice_disconnect_bots': {
        const agentId = text(args, 'agentId', 64, false);
        if (agentId) orchestrator.swarm.disconnectBot(this.requireAgent(agentId).id);
        else orchestrator.swarm.disconnectAll();
        return { disconnected: true };
      }

      case 'mineoffice_send_chat': {
        const message = text(args, 'message', 256).trim();
        // A slash command can /op a player or /tp a bot, which needs a person's decision
        if (message.startsWith('/')) throw new Error('Slash commands are not allowed from this tool.');
        return { sentFrom: orchestrator.swarm.broadcastChat(message, text(args, 'agentId', 64, false) || undefined) };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }

  private getState() {
    const orchestrator = this.orchestrator;
    const { kind, targets } = orchestrator.settings.minecraft;
    return {
      server: { kind, host: targets[kind].host, port: targets[kind].port, version: targets[kind].version },
      agents: orchestrator.getAgents().map(agent => ({
        id: agent.id,
        name: agent.displayName,
        role: agent.role,
        status: agent.status,
        activity: agent.currentActivity,
        tasksCompleted: agent.stats.tasksCompleted
      })),
      tasks: orchestrator.getTasks().map(task => ({
        id: task.id,
        title: task.title,
        status: task.status,
        category: task.category,
        priority: task.priority,
        agentId: task.assignedAgentId,
        lastError: task.lastError,
        branch: task.worktreeBranch
      })),
      decisionsWaitingForAPerson: orchestrator.getDecisions().filter(d => d.status === 'pending').length,
      bots: orchestrator.swarm.getBotStates().map(bot => ({
        agentId: bot.agentId,
        username: bot.username,
        status: bot.status,
        connected: bot.connected,
        lastError: bot.lastError,
        health: bot.health,
        food: bot.food,
        position: bot.position,
        waitingForMicrosoftSignIn: !!bot.authPrompt
      }))
    };
  }
}
