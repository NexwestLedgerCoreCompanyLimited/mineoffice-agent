import { PublicStatus, ViewerSettings } from '@shared/types';
import { ROLE_DEFINITIONS, joinsWorld } from '@shared/roles';
import { SwarmOrchestrator } from '../foreman/orchestrator';

const MAX_TASKS = 30;
const MAX_TEXT = 140;

function clip(text: string | undefined): string | undefined {
  if (!text) return text;
  return text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT)}...` : text;
}

function displayName(name: string): string {
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/**
 * Builds what strangers may see, copying each field by hand. Never spread a source object
 * in here: a new field on it, such as a bot's account email, would then go public by default.
 */
export function buildPublicStatus(orchestrator: SwarmOrchestrator, viewer: ViewerSettings): PublicStatus {
  const bots = orchestrator.swarm.getBotStates();
  const agents = orchestrator.getAgents();
  const nameOf = (agentId?: string) => {
    const agent = agents.find(a => a.id === agentId);
    return agent ? displayName(agent.name) : undefined;
  };

  return {
    title: viewer.title,
    generatedAt: new Date().toISOString(),
    botsOnline: bots.filter(bot => bot.connected).length,
    botsTotal: agents.filter(agent => joinsWorld(agent.role, orchestrator.settings.minecraft)).length,
    agents: agents.map(agent => {
      const bot = bots.find(b => b.agentId === agent.id);
      const role = ROLE_DEFINITIONS[agent.role];
      return {
        id: agent.id,
        name: displayName(agent.name),
        role: agent.role,
        status: agent.status,
        activity: clip(agent.currentActivity),
        inGame: role.inGame,
        online: !!bot?.connected,
        health: bot?.connected ? bot.health : undefined,
        food: bot?.connected ? bot.food : undefined,
        position: viewer.showCoordinates && bot?.connected ? bot.position : undefined
      };
    }),
    tasks: orchestrator
      .getTasks()
      .slice(-MAX_TASKS)
      .map(task => ({
        id: task.id,
        title: clip(task.title) || '',
        status: task.status,
        category: task.category,
        assignee: nameOf(task.assignedAgentId)
      })),
    events: orchestrator.getPublicEvents().map(event => ({
      time: event.time,
      agent: nameOf(event.agentId),
      kind: event.kind,
      detail: clip(event.detail)
    }))
  };
}
