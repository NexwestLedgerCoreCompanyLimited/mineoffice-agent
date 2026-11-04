import fs from 'fs';
import path from 'path';
import { writePrivateFile } from '../runtime/paths';

const MAX_FACTS = 60;
const MAX_NOTES = 30;
const MAX_ROUTINES = 30;
const MAX_TEXT = 300;
const MAX_ROUTINE_STEPS = 12;

export interface RoutineStep {
  tool: string;
  args: Record<string, unknown>;
}

interface WorldMemory {
  facts: { agent: string; text: string }[];
  places: Record<string, { x: number; y: number; z: number; by: string }>;
  notes: { from: string; text: string; time: string }[];
  routines: Record<string, { description: string; steps: RoutineStep[]; by: string }>;
}

const emptyWorld = (): WorldMemory => ({ facts: [], places: {}, notes: [], routines: {} });

/**
 * What the team has learned, kept per server so it survives restarts and one world's
 * coordinates never leak into another. Everything here is plain data. A routine is a list
 * of existing tools to call, never code, so saving one cannot give an agent new powers.
 */
export class AgentMemory {
  private filePath: string;
  private worlds: Record<string, WorldMemory> = {};

  constructor(directory: string) {
    this.filePath = path.join(directory, 'memory.json');
    try {
      this.worlds = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
    } catch {
      this.worlds = {}; // First run, or an unreadable file: start fresh rather than fail
    }
  }

  private world(key: string): WorldMemory {
    this.worlds[key] = { ...emptyWorld(), ...this.worlds[key] };
    return this.worlds[key];
  }

  private save() {
    try {
      writePrivateFile(this.filePath, JSON.stringify(this.worlds, null, 2));
    } catch (err) {
      console.error('[Memory] Could not save:', err);
    }
  }

  public remember(key: string, agent: string, text: string) {
    const world = this.world(key);
    const clean = text.trim().slice(0, MAX_TEXT);
    if (!clean) throw new Error('There is nothing to remember.');
    if (!world.facts.some(fact => fact.text === clean)) world.facts.push({ agent, text: clean });
    if (world.facts.length > MAX_FACTS) world.facts.shift();
    this.save();
  }

  public rememberPlace(key: string, agent: string, name: string, position: { x: number; y: number; z: number }) {
    const label = name.trim().slice(0, 60);
    if (!label) throw new Error('A place needs a name.');
    this.world(key).places[label] = { x: Math.round(position.x), y: Math.round(position.y), z: Math.round(position.z), by: agent };
    this.save();
  }

  public getPlace(key: string, name: string) {
    return this.world(key).places[name.trim()];
  }

  public addNote(key: string, from: string, text: string) {
    const world = this.world(key);
    const clean = text.trim().slice(0, MAX_TEXT);
    if (!clean) throw new Error('The note is empty.');
    world.notes.push({ from, text: clean, time: new Date().toISOString() });
    if (world.notes.length > MAX_NOTES) world.notes.shift();
    this.save();
  }

  public saveRoutine(key: string, agent: string, name: string, description: string, steps: unknown) {
    const label = name.trim().slice(0, 60);
    if (!label) throw new Error('A routine needs a name.');
    if (!Array.isArray(steps) || steps.length === 0) throw new Error('A routine needs a list of steps.');
    if (steps.length > MAX_ROUTINE_STEPS) throw new Error(`A routine can have at most ${MAX_ROUTINE_STEPS} steps.`);

    const clean: RoutineStep[] = steps.map((step: any) => {
      if (typeof step?.tool !== 'string') throw new Error('Each step needs a tool name.');
      return { tool: step.tool, args: step.args && typeof step.args === 'object' ? step.args : {} };
    });

    const world = this.world(key);
    if (!world.routines[label] && Object.keys(world.routines).length >= MAX_ROUTINES) {
      throw new Error('There are too many saved routines.');
    }
    world.routines[label] = { description: description.trim().slice(0, MAX_TEXT), steps: clean, by: agent };
    this.save();
  }

  public getRoutine(key: string, name: string) {
    return this.world(key).routines[name.trim()];
  }

  /** Everything worth reminding an agent of, kept short because it goes into every prompt. */
  public render(key: string): string {
    const world = this.world(key);
    const lines: string[] = [];
    if (world.facts.length) lines.push(`Facts the team saved:\n${world.facts.map(fact => `- ${fact.text}`).join('\n')}`);
    const places = Object.entries(world.places);
    if (places.length) lines.push(`Known places:\n${places.map(([name, p]) => `- ${name}: ${p.x}, ${p.y}, ${p.z}`).join('\n')}`);
    if (world.notes.length) lines.push(`Notes between teammates:\n${world.notes.slice(-10).map(note => `- ${note.from}: ${note.text}`).join('\n')}`);
    const routines = Object.entries(world.routines);
    if (routines.length) lines.push(`Saved routines you can run with run_routine:\n${routines.map(([name, r]) => `- ${name}: ${r.description}`).join('\n')}`);
    return lines.join('\n\n');
  }
}
