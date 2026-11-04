import pathfinderPackage from 'mineflayer-pathfinder';
import { Vec3 } from 'vec3';
import { AgentRole, VoyagerSkill } from '@shared/types';
import { ROLE_DEFINITIONS } from '@shared/roles';

// This CommonJS package does not expose goals as a named ESM export
const { goals } = pathfinderPackage;

export interface SkillContext {
  say: (message: string) => boolean;
}

const REACH_DISTANCE = 4;
const SIDE_FACES = [
  new Vec3(0, -1, 0),
  new Vec3(1, 0, 0),
  new Vec3(-1, 0, 0),
  new Vec3(0, 0, 1),
  new Vec3(0, 0, -1),
  new Vec3(0, 1, 0)
];

/** Places one block, using any solid neighbour as the surface. Returns 1 if a block was placed. */
/** Older game data files every creature as a "mob", and only its category says it is dangerous. */
function isHostile(bot: any, entity: any): boolean {
  if (entity.type === 'hostile') return true;
  return entity.type === 'mob' && bot.registry.entitiesByName[entity.name]?.category === 'Hostile mobs';
}

async function placeAt(bot: any, position: any, material?: string): Promise<number> {
  const current = bot.blockAt(position);
  if (current && current.boundingBox === 'block') return 0;

  const item = bot.inventory
    .items()
    .find((i: any) => (material ? i.name.includes(material) : /planks|cobblestone|stone|dirt/.test(i.name)));
  if (!item) throw new Error(`Out of building material${material ? ` matching "${material}"` : ''}.`);

  if (bot.entity.position.distanceTo(position) > REACH_DISTANCE) {
    await bot.pathfinder.goto(new goals.GoalNear(position.x, position.y, position.z, REACH_DISTANCE - 1));
  }

  for (const face of SIDE_FACES) {
    const neighbour = bot.blockAt(position.plus(face));
    if (neighbour && neighbour.boundingBox === 'block') {
      await bot.equip(item, 'hand');
      await bot.placeBlock(neighbour, face.scaled(-1));
      return 1;
    }
  }
  throw new Error(`Nothing solid to place against at ${position}.`);
}

/**
 * Voyager Skill Library and Self-Reflection Sandbox
 * Allows agents to generate, execute, verify, and store reusable JavaScript skills
 */
export class VoyagerSkillManager {
  private skills: Map<string, VoyagerSkill> = new Map();

  constructor() {
    this.seedBaselineSkills();
  }

  public getAllSkills(): VoyagerSkill[] {
    return Array.from(this.skills.values());
  }

  public getSkill(id: string): VoyagerSkill | undefined {
    return this.skills.get(id);
  }

  public saveSkill(skill: VoyagerSkill) {
    this.skills.set(skill.id, skill);
  }

  public getSkillsForRole(role: AgentRole): VoyagerSkill[] {
    const allowed = ROLE_DEFINITIONS[role].skillCategories;
    return this.getAllSkills().filter(skill => allowed.includes(skill.category));
  }

  public isSkillAllowed(role: AgentRole, skillId: string): boolean {
    return this.getSkillsForRole(role).some(skill => skill.id === skillId);
  }

  /**
   * Executes a skill dynamically within an asynchronous sandbox context
   */
  public async executeSkill(
    skillId: string,
    bot: any,
    args: Record<string, any> = {},
    context: SkillContext = { say: () => false }
  ): Promise<{ success: boolean; result?: any; error?: string }> {
    const skill = this.skills.get(skillId);
    if (!skill) {
      return { success: false, error: `Skill "${skillId}" not found in library.` };
    }

    try {
      // Async Function constructor provides a contained execution scope
      const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
      const fn = new AsyncFunction('bot', 'args', 'Vec3', 'goals', 'ctx', skill.code);
      const ctx = {
        ...context,
        placeAt: (position: any, material?: string) => placeAt(bot, position, material),
        isHostile: (entity: any) => isHostile(bot, entity)
      };

      const result = await fn(bot, args, Vec3, goals, ctx);
      skill.successCount++;
      skill.lastExecuted = new Date().toISOString();
      return { success: true, result };
    } catch (err: any) {
      skill.failureCount++;
      // Return execution trace for LLM self-reflection & error correction
      return {
        success: false,
        error: `Skill Execution Error in ${skill.name}: ${err.message || String(err)}`
      };
    }
  }

  private seedBaselineSkills() {
    const defaultSkills: VoyagerSkill[] = [
      {
        id: 'mine-block',
        name: 'mineBlock',
        description: 'Finds the nearest matching blocks, walks to them, and mines them with the best tool.',
        category: 'gathering',
        parameters: { blockName: 'string', count: 'number' },
        successCount: 0,
        failureCount: 0,
        code: `
          const wanted = String(args.blockName || 'log');
          const count = Math.min(Math.max(Number(args.count) || 1, 1), 32);
          const ids = bot.registry.blocksArray.filter(b => b.name.includes(wanted)).map(b => b.id);
          if (ids.length === 0) throw new Error('Unknown block: ' + wanted);
          let mined = 0;
          for (let i = 0; i < count; i++) {
            const block = bot.findBlock({ matching: ids, maxDistance: 32 });
            if (!block) break;
            await bot.pathfinder.goto(new goals.GoalLookAtBlock(block.position, bot.world));
            const tool = bot.pathfinder.bestHarvestTool(block);
            if (tool) await bot.equip(tool, 'hand');
            await bot.dig(block);
            mined++;
          }
          if (mined === 0) throw new Error('No ' + wanted + ' found within 32 blocks.');
          return { blocksMined: mined, blockName: wanted };
        `
      },
      {
        id: 'craft-recipe',
        name: 'craftItem',
        description: 'Crafts an item using a nearby crafting table or the personal 2x2 grid.',
        category: 'crafting',
        parameters: { itemName: 'string', amount: 'number' },
        successCount: 0,
        failureCount: 0,
        code: `
          const item = bot.registry.itemsByName[args.itemName];
          if (!item) throw new Error('Unknown item: ' + args.itemName);
          const table = bot.findBlock({ matching: b => b.name === 'crafting_table', maxDistance: 4 });
          const recipe = bot.recipesFor(item.id, null, 1, table || null)[0];
          if (!recipe) throw new Error('Missing materials or crafting table for ' + args.itemName);
          const amount = Math.min(Math.max(Number(args.amount) || 1, 1), 64);
          await bot.craft(recipe, amount, table || null);
          return { crafted: args.itemName, amount };
        `
      },
      {
        id: 'build-shelter-wall',
        name: 'buildWall',
        description: 'Builds a straight wall next to the bot using cobblestone, planks or a chosen material.',
        category: 'building',
        parameters: { material: 'string', length: 'number', height: 'number' },
        successCount: 0,
        failureCount: 0,
        code: `
          const length = Math.min(Math.max(Number(args.length) || 5, 1), 32);
          const height = Math.min(Math.max(Number(args.height) || 3, 1), 8);
          const origin = bot.entity.position.floored().offset(2, 0, 0);
          let placed = 0;
          for (let y = 0; y < height; y++) {
            for (let z = 0; z < length; z++) {
              placed += await ctx.placeAt(origin.offset(0, y, z), args.material);
            }
          }
          return { blocksPlaced: placed, length, height };
        `
      },
      {
        id: 'build-shelter',
        name: 'buildShelter',
        description: 'Builds a small enclosed hut with a roof and a door gap next to the bot.',
        category: 'building',
        parameters: { material: 'string', size: 'number', height: 'number' },
        successCount: 0,
        failureCount: 0,
        code: `
          const size = Math.min(Math.max(Number(args.size) || 5, 3), 9);
          const height = Math.min(Math.max(Number(args.height) || 3, 2), 5);
          const origin = bot.entity.position.floored().offset(2, 0, 0);
          let placed = 0;
          for (let y = 0; y < height; y++) {
            for (let x = 0; x < size; x++) {
              for (let z = 0; z < size; z++) {
                const onEdge = x === 0 || z === 0 || x === size - 1 || z === size - 1;
                const isDoor = x === 0 && z === Math.floor(size / 2) && y < 2;
                if (onEdge && !isDoor) placed += await ctx.placeAt(origin.offset(x, y, z), args.material);
              }
            }
          }
          for (let x = 0; x < size; x++) {
            for (let z = 0; z < size; z++) {
              placed += await ctx.placeAt(origin.offset(x, height, z), args.material);
            }
          }
          return { blocksPlaced: placed, size, height };
        `
      },
      {
        id: 'defend-area',
        name: 'defendArea',
        description: 'Stays nearby and attacks hostile mobs for a set time. Never targets players.',
        category: 'combat',
        parameters: { seconds: 'number', radius: 'number' },
        successCount: 0,
        failureCount: 0,
        code: `
          const seconds = Math.min(Math.max(Number(args.seconds) || 30, 1), 110);
          const radius = Math.min(Math.max(Number(args.radius) || 16, 4), 32);
          const endAt = Date.now() + seconds * 1000;
          let hits = 0;
          while (Date.now() < endAt) {
            const mob = bot.nearestEntity(e =>
              ctx.isHostile(e) && e.position.distanceTo(bot.entity.position) <= radius
            );
            if (!mob) {
              await bot.waitForTicks(10);
              continue;
            }
            if (mob.position.distanceTo(bot.entity.position) > 3) {
              bot.pathfinder.setGoal(new goals.GoalFollow(mob, 2), true);
              await bot.waitForTicks(5);
            } else {
              bot.pathfinder.setGoal(null);
              await bot.lookAt(mob.position.offset(0, mob.height * 0.8, 0));
              bot.attack(mob);
              hits++;
              await bot.waitForTicks(12);
            }
          }
          bot.pathfinder.setGoal(null);
          return { hits, seconds };
        `
      },
      {
        id: 'goto-position',
        name: 'goToPosition',
        description: 'Walks to the given coordinates. The y value is optional.',
        category: 'movement',
        parameters: { x: 'number', y: 'number', z: 'number' },
        successCount: 0,
        failureCount: 0,
        code: `
          const x = Number(args.x), z = Number(args.z);
          if (!Number.isFinite(x) || !Number.isFinite(z)) throw new Error('x and z coordinates are required');
          const y = Number(args.y);
          const goal = Number.isFinite(y) && args.y !== undefined && args.y !== null
            ? new goals.GoalNear(x, y, z, 2)
            : new goals.GoalNearXZ(x, z, 2);
          await bot.pathfinder.goto(goal);
          const p = bot.entity.position;
          return { arrived: { x: Math.round(p.x), y: Math.round(p.y), z: Math.round(p.z) } };
        `
      },
      {
        id: 'follow-player',
        name: 'followPlayer',
        description: 'Follows a player for a set time.',
        category: 'movement',
        parameters: { player: 'string', seconds: 'number' },
        successCount: 0,
        failureCount: 0,
        code: `
          const target = bot.players[args.player]?.entity;
          if (!target) throw new Error('Player ' + args.player + ' is not nearby.');
          const seconds = Math.min(Math.max(Number(args.seconds) || 30, 1), 110);
          bot.pathfinder.setGoal(new goals.GoalFollow(target, 3), true);
          await new Promise(resolve => setTimeout(resolve, seconds * 1000));
          bot.pathfinder.setGoal(null);
          return { followed: args.player, seconds };
        `
      },
      {
        id: 'scan-surroundings',
        name: 'scanSurroundings',
        description: 'Reports notable blocks and the creatures around the bot.',
        category: 'scouting',
        parameters: { radius: 'number' },
        successCount: 0,
        failureCount: 0,
        code: `
          const radius = Math.min(Math.max(Number(args.radius) || 16, 4), 32);
          const counts = {};
          const positions = bot.findBlocks({
            matching: b => /ore|log|chest|crafting_table|water|lava/.test(b.name),
            maxDistance: radius,
            count: 200
          });
          for (const position of positions) {
            const name = bot.blockAt(position)?.name;
            if (name) counts[name] = (counts[name] || 0) + 1;
          }
          const entities = {};
          for (const entity of Object.values(bot.entities)) {
            if (entity === bot.entity || entity.position.distanceTo(bot.entity.position) > radius) continue;
            const name = entity.name || entity.type;
            entities[name] = (entities[name] || 0) + 1;
          }
          return { blocks: counts, entities };
        `
      },
      {
        id: 'say-chat',
        name: 'sayInChat',
        description: 'Says a short message in chat. Cannot run slash commands.',
        category: 'system',
        parameters: { message: 'string' },
        successCount: 0,
        failureCount: 0,
        code: `
          const message = String(args.message || '').replace(/^[\\/\\s]+/, '').slice(0, 200);
          if (!message) throw new Error('Message is empty.');
          if (!ctx.say(message)) throw new Error('Chat queue is full.');
          return { said: message };
        `
      },
      {
        id: 'report-status',
        name: 'reportStatus',
        description: 'Reports position, health, food and inventory.',
        category: 'system',
        parameters: {},
        successCount: 0,
        failureCount: 0,
        code: `
          const p = bot.entity.position;
          return {
            position: { x: Math.round(p.x), y: Math.round(p.y), z: Math.round(p.z) },
            health: bot.health,
            food: bot.food,
            inventory: bot.inventory.items().map(i => i.name + ' x' + i.count)
          };
        `
      },
      {
        id: 'find-block',
        name: 'findBlock',
        description: 'Finds where the nearest blocks of a type are, without walking there.',
        category: 'scouting',
        parameters: { blockName: 'string', radius: 'number' },
        successCount: 0,
        failureCount: 0,
        code: `
          const wanted = String(args.blockName || '');
          const ids = bot.registry.blocksArray.filter(b => b.name.includes(wanted)).map(b => b.id);
          if (!wanted || ids.length === 0) throw new Error('Unknown block: ' + wanted);
          const radius = Math.min(Math.max(Number(args.radius) || 32, 4), 64);
          const found = bot.findBlocks({ matching: ids, maxDistance: radius, count: 5 });
          return { found: found.map(p => ({ x: p.x, y: p.y, z: p.z })) };
        `
      },
      {
        id: 'collect-drops',
        name: 'collectDrops',
        description: 'Walks over dropped items nearby to pick them up.',
        category: 'gathering',
        parameters: { radius: 'number' },
        successCount: 0,
        failureCount: 0,
        code: `
          const radius = Math.min(Math.max(Number(args.radius) || 12, 2), 32);
          let visited = 0;
          for (let i = 0; i < 10; i++) {
            const drop = bot.nearestEntity(e => e.name === 'item' && e.position.distanceTo(bot.entity.position) <= radius);
            if (!drop) break;
            await bot.pathfinder.goto(new goals.GoalNear(drop.position.x, drop.position.y, drop.position.z, 0));
            await bot.waitForTicks(5);
            visited++;
          }
          return { visited };
        `
      },
      {
        id: 'harvest-crops',
        name: 'harvestCrops',
        description: 'Harvests fully grown wheat, carrots, potatoes or beetroot nearby and replants them.',
        category: 'gathering',
        parameters: { count: 'number' },
        successCount: 0,
        failureCount: 0,
        code: `
          const SEEDS = { wheat: 'wheat_seeds', carrots: 'carrot', potatoes: 'potato', beetroots: 'beetroot_seeds' };
          const MATURE = { wheat: 7, carrots: 7, potatoes: 7, beetroots: 3 };
          const count = Math.min(Math.max(Number(args.count) || 8, 1), 32);
          let harvested = 0, replanted = 0;
          for (let i = 0; i < count; i++) {
            const crop = bot.findBlock({
              maxDistance: 24,
              matching: b => MATURE[b.name] !== undefined,
              // Growth is per block, so this second check needs the block in the world
              useExtraInfo: b => b.getProperties().age === MATURE[b.name]
            });
            if (!crop) break;
            const name = crop.name;
            const position = crop.position;
            await bot.pathfinder.goto(new goals.GoalLookAtBlock(position, bot.world));
            await bot.dig(crop);
            harvested++;
            const seed = bot.inventory.items().find(item => item.name === SEEDS[name]);
            const soil = bot.blockAt(position.offset(0, -1, 0));
            if (seed && soil && soil.name === 'farmland') {
              await bot.equip(seed, 'hand');
              await bot.placeBlock(soil, new Vec3(0, 1, 0));
              replanted++;
            }
          }
          if (harvested === 0) throw new Error('No grown crops within 24 blocks.');
          return { harvested, replanted };
        `
      },
      {
        id: 'smelt-item',
        name: 'smeltItem',
        description: 'Smelts items in a furnace within 4 blocks, using fuel from the inventory, and takes the result.',
        category: 'crafting',
        parameters: { itemName: 'string', amount: 'number' },
        successCount: 0,
        failureCount: 0,
        code: `
          const block = bot.findBlock({ matching: b => b.name === 'furnace', maxDistance: 4 });
          if (!block) throw new Error('No furnace within 4 blocks. Place one first.');
          const input = bot.inventory.items().find(i => i.name === args.itemName);
          if (!input) throw new Error('No ' + args.itemName + ' in the inventory.');
          const fuel = bot.inventory.items().find(i => /coal|charcoal|_log|_planks/.test(i.name) && i.name !== input.name);
          if (!fuel) throw new Error('No fuel in the inventory.');
          const amount = Math.min(Math.max(Number(args.amount) || 1, 1), input.count, 16);
          const furnace = await bot.openFurnace(block);
          try {
            await furnace.putFuel(fuel.type, null, Math.min(fuel.count, Math.ceil(amount / 4) + 1));
            await furnace.putInput(input.type, null, amount);
            const deadline = Date.now() + (amount * 10 + 5) * 1000;
            let taken = 0;
            while (taken < amount && Date.now() < deadline) {
              await bot.waitForTicks(20);
              if (furnace.outputItem()) {
                const output = await furnace.takeOutput();
                taken += output ? output.count : 0;
              }
            }
            if (taken === 0) throw new Error('Nothing came out of the furnace. It may not smelt ' + args.itemName + '.');
            return { smelted: args.itemName, amount: taken };
          } finally {
            furnace.close();
          }
        `
      },
      {
        id: 'place-block',
        name: 'placeBlock',
        description: 'Places one block at the given coordinates, using a block from the inventory.',
        category: 'building',
        parameters: { x: 'number', y: 'number', z: 'number', material: 'string' },
        successCount: 0,
        failureCount: 0,
        code: `
          const x = Number(args.x), y = Number(args.y), z = Number(args.z);
          if (![x, y, z].every(Number.isFinite)) throw new Error('x, y and z coordinates are required');
          const placed = await ctx.placeAt(new Vec3(x, y, z), args.material);
          if (placed === 0) throw new Error('Nothing placed: there is already a ' + bot.blockAt(new Vec3(x, y, z))?.name + ' at that spot.');
          return { blocksPlaced: placed };
        `
      },
      {
        id: 'eat-food',
        name: 'eatFood',
        description: 'Eats the best food in the inventory.',
        category: 'survival',
        parameters: {},
        successCount: 0,
        failureCount: 0,
        code: `
          const foods = bot.registry.foodsByName || {};
          const best = bot.inventory.items()
            .filter(i => foods[i.name] && !/rotten_flesh|spider_eye|pufferfish|poisonous/.test(i.name))
            .sort((a, b) => (foods[b.name].foodPoints || 0) - (foods[a.name].foodPoints || 0))[0];
          if (!best) throw new Error('No safe food in the inventory.');
          await bot.equip(best, 'hand');
          await bot.consume();
          return { ate: best.name, food: bot.food };
        `
      },
      {
        id: 'sleep-in-bed',
        name: 'sleepInBed',
        description: 'Walks to a bed within 32 blocks and sleeps, which only works at night.',
        category: 'survival',
        parameters: {},
        successCount: 0,
        failureCount: 0,
        code: `
          const bed = bot.findBlock({ matching: b => bot.isABed(b), maxDistance: 32 });
          if (!bed) throw new Error('No bed within 32 blocks.');
          await bot.pathfinder.goto(new goals.GoalLookAtBlock(bed.position, bot.world));
          await bot.sleep(bed);
          return { sleeping: true };
        `
      },
      {
        id: 'flee-danger',
        name: 'fleeDanger',
        description: 'Runs away from the nearest hostile mob for a few seconds.',
        category: 'survival',
        parameters: { seconds: 'number' },
        successCount: 0,
        failureCount: 0,
        code: `
          const mob = bot.nearestEntity(e => ctx.isHostile(e));
          if (!mob) return { fled: false, reason: 'No hostile mob nearby.' };
          const seconds = Math.min(Math.max(Number(args.seconds) || 6, 1), 20);
          bot.pathfinder.setGoal(new goals.GoalInvert(new goals.GoalFollow(mob, 24)), true);
          await new Promise(resolve => setTimeout(resolve, seconds * 1000));
          bot.pathfinder.setGoal(null);
          return { fled: true, from: mob.name };
        `
      },
      {
        id: 'equip-item',
        name: 'equipItem',
        description: 'Holds or wears an item from the inventory. Destination can be hand, off-hand, head, torso, legs or feet.',
        category: 'survival',
        parameters: { itemName: 'string', destination: 'string' },
        successCount: 0,
        failureCount: 0,
        code: `
          const item = bot.inventory.items().find(i => i.name.includes(String(args.itemName || '')));
          if (!args.itemName || !item) throw new Error('No ' + args.itemName + ' in the inventory.');
          const places = ['hand', 'off-hand', 'head', 'torso', 'legs', 'feet'];
          const destination = places.includes(args.destination) ? args.destination : 'hand';
          await bot.equip(item, destination);
          return { equipped: item.name, destination };
        `
      },
      {
        id: 'chest-list',
        name: 'chestList',
        description: 'Walks to the nearest chest within 16 blocks and lists what is inside.',
        category: 'logistics',
        parameters: {},
        successCount: 0,
        failureCount: 0,
        code: `
          const block = bot.findBlock({ matching: b => /chest|barrel/.test(b.name) && !/ender/.test(b.name), maxDistance: 16 });
          if (!block) throw new Error('No chest within 16 blocks.');
          await bot.pathfinder.goto(new goals.GoalLookAtBlock(block.position, bot.world));
          const chest = await bot.openContainer(block);
          try {
            return { items: chest.containerItems().map(i => i.name + ' x' + i.count) };
          } finally {
            chest.close();
          }
        `
      },
      {
        id: 'chest-store',
        name: 'chestStore',
        description: 'Walks to the nearest chest within 16 blocks and puts items in it.',
        category: 'logistics',
        parameters: { itemName: 'string', amount: 'number' },
        successCount: 0,
        failureCount: 0,
        code: `
          const item = bot.inventory.items().find(i => i.name === args.itemName);
          if (!item) throw new Error('No ' + args.itemName + ' in the inventory.');
          const block = bot.findBlock({ matching: b => /chest|barrel/.test(b.name) && !/ender/.test(b.name), maxDistance: 16 });
          if (!block) throw new Error('No chest within 16 blocks.');
          await bot.pathfinder.goto(new goals.GoalLookAtBlock(block.position, bot.world));
          const amount = Math.min(Math.max(Number(args.amount) || item.count, 1), item.count);
          const chest = await bot.openContainer(block);
          try {
            await chest.deposit(item.type, null, amount);
            return { stored: item.name, amount };
          } finally {
            chest.close();
          }
        `
      },
      {
        id: 'chest-take',
        name: 'chestTake',
        description: 'Walks to the nearest chest within 16 blocks and takes items from it.',
        category: 'logistics',
        parameters: { itemName: 'string', amount: 'number' },
        successCount: 0,
        failureCount: 0,
        code: `
          const block = bot.findBlock({ matching: b => /chest|barrel/.test(b.name) && !/ender/.test(b.name), maxDistance: 16 });
          if (!block) throw new Error('No chest within 16 blocks.');
          await bot.pathfinder.goto(new goals.GoalLookAtBlock(block.position, bot.world));
          const chest = await bot.openContainer(block);
          try {
            const item = chest.containerItems().find(i => i.name === args.itemName);
            if (!item) throw new Error('No ' + args.itemName + ' in that chest.');
            const amount = Math.min(Math.max(Number(args.amount) || item.count, 1), item.count);
            await chest.withdraw(item.type, null, amount);
            return { took: item.name, amount };
          } finally {
            chest.close();
          }
        `
      },
      {
        id: 'give-item',
        name: 'giveItem',
        description: 'Walks to a player and tosses them items.',
        category: 'logistics',
        parameters: { player: 'string', itemName: 'string', amount: 'number' },
        successCount: 0,
        failureCount: 0,
        code: `
          const target = bot.players[args.player]?.entity;
          if (!target) throw new Error('Player ' + args.player + ' is not nearby.');
          const item = bot.inventory.items().find(i => i.name === args.itemName);
          if (!item) throw new Error('No ' + args.itemName + ' in the inventory.');
          await bot.pathfinder.goto(new goals.GoalNear(target.position.x, target.position.y, target.position.z, 2));
          await bot.lookAt(target.position.offset(0, target.height, 0));
          const amount = Math.min(Math.max(Number(args.amount) || 1, 1), item.count);
          await bot.toss(item.type, null, amount);
          return { gave: item.name, amount, to: args.player };
        `
      },
      {
        id: 'stop-moving',
        name: 'stopMoving',
        description: 'Stops walking and following right away.',
        category: 'movement',
        parameters: {},
        successCount: 0,
        failureCount: 0,
        code: `
          bot.pathfinder.setGoal(null);
          bot.clearControlStates();
          return { stopped: true };
        `
      }
    ];

    defaultSkills.forEach(s => this.skills.set(s.id, s));
  }
}
