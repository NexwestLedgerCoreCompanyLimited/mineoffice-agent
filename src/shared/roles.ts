import { AgentRole, MinecraftSettings, RoleDefinition, TaskCategory } from './types';
import { tDynamic } from './i18n';

/**
 * Chain of command for the team. A role decides what an agent may be asked to do:
 * the Commander only plans and delegates, field crew act in the Minecraft world
 * using the skill categories listed here, and office staff work on code and research.
 */
function office(role: {
  id: AgentRole;
  label: string;
  department: RoleDefinition['department'];
  readsImages: boolean;
  summary: string;
  prompt: string;
  documentsOnly?: boolean;
}): RoleDefinition {
  const { documentsOnly, ...rest } = role;
  return {
    ...rest,
    tier: 'office',
    icon: `./assets/icons/role_${role.id}.png`,
    inGame: false,
    taskCategories: documentsOnly ? ['research'] : ['code', 'research'],
    skillCategories: []
  };
}

export const ROLE_DEFINITIONS: Record<AgentRole, RoleDefinition> = {
  commander: {
    id: 'commander',
    department: 'command',
    readsImages: true,
    label: 'Commander',
    summary: 'Plans goals and delegates tasks. Never does the work itself.',
    tier: 'command',
    icon: './assets/icons/role_commander.png',
    inGame: false,
    taskCategories: [],
    skillCategories: [],
    prompt:
      'You are the Commander. You break goals into tasks and delegate each one to the right role. You never execute tasks yourself.'
  },
  builder: {
    id: 'builder',
    department: 'field',
    readsImages: true,
    label: 'Builder',
    summary: 'Places blocks: walls, shelters and structures in the world.',
    tier: 'field',
    icon: './assets/icons/role_builder.png',
    inGame: true,
    taskCategories: ['minecraft'],
    skillCategories: ['building', 'crafting', 'logistics', 'survival', 'movement', 'system'],
    prompt:
      'You are the Builder on a Minecraft crew. You construct structures from materials in your inventory. You do not mine resources or fight.'
  },
  miner: {
    id: 'miner',
    department: 'field',
    readsImages: true,
    label: 'Miner',
    summary: 'Gathers ores, wood and other resources, and crafts items.',
    tier: 'field',
    icon: './assets/icons/role_miner.png',
    inGame: true,
    taskCategories: ['minecraft'],
    skillCategories: ['gathering', 'crafting', 'logistics', 'survival', 'movement', 'system'],
    prompt:
      'You are the Miner on a Minecraft crew. You gather blocks and resources and craft items. You do not build structures or fight.'
  },
  defender: {
    id: 'defender',
    department: 'field',
    readsImages: true,
    label: 'Defender',
    summary: 'Protects the crew from hostile mobs. Never attacks players.',
    tier: 'field',
    icon: './assets/icons/role_defender.png',
    inGame: true,
    taskCategories: ['minecraft'],
    skillCategories: ['combat', 'survival', 'movement', 'system'],
    prompt:
      'You are the Defender on a Minecraft crew. You protect the crew from hostile mobs and never attack players. You do not mine or build.'
  },
  explorer: {
    id: 'explorer',
    department: 'field',
    readsImages: true,
    label: 'Explorer',
    summary: 'Scouts the area and reports what is nearby.',
    tier: 'field',
    icon: './assets/icons/role_explorer.png',
    inGame: true,
    taskCategories: ['minecraft'],
    skillCategories: ['scouting', 'survival', 'movement', 'system'],
    prompt:
      'You are the Explorer on a Minecraft crew. You travel, scout the surroundings and report your findings. You do not mine, build or fight.'
  },
  coder: {
    id: 'coder',
    department: 'engineering',
    readsImages: true,
    label: 'Full-Stack Developer',
    summary: 'Full-stack developer. Takes any code work that crosses areas.',
    tier: 'office',
    icon: './assets/icons/role_coder.png',
    inGame: false,
    taskCategories: ['code', 'research'],
    skillCategories: [],
    prompt: 'You are a skilled software engineer. Write clean, modular, tested code.'
  },
  product_manager: office({
    id: 'product_manager',
    label: 'Product Manager',
    department: 'product',
    readsImages: true,
    documentsOnly: true,
    summary: 'Turns the goal into clear requirements, with what is in and out of scope and how to tell it is done.',
    prompt:
      'You are the Product Manager. Work out what the user really wants. Write requirements a developer can build from: who it is for, the features in priority order, what is out of scope, and acceptance criteria for each feature. Stay true to what the user asked for and any pictures they sent. Do not add features they did not ask for.'
  }),
  business_analyst: office({
    id: 'business_analyst',
    label: 'Business Analyst',
    department: 'product',
    readsImages: false,
    documentsOnly: true,
    summary: 'Researches users, rules and alternatives, and maps out business processes and data.',
    prompt:
      'You are the Business Analyst. Research the problem: users, business rules, comparable products and constraints. Report findings and clear recommendations. Say plainly when something is your own reasoning rather than a known fact.'
  }),
  ux_designer: office({
    id: 'ux_designer',
    label: 'UX Designer',
    department: 'design',
    readsImages: true,
    documentsOnly: true,
    summary: 'Designs how it works: user journeys, screens, states and wording.',
    prompt:
      'You are the UX Designer. Design how the product works for the person using it: the journeys, each screen and what is on it, empty, loading and error states, and the wording. Be specific enough that a developer does not have to guess.'
  }),
  ui_designer: office({
    id: 'ui_designer',
    label: 'UI Designer',
    department: 'design',
    readsImages: true,
    summary: 'Designs how it looks: colors, type, spacing and components, matching the style you like.',
    prompt:
      'You are the UI Designer. Define the look: colors with exact values, typography, spacing, and how each component looks in each state. When the user sent pictures, match their style closely and say what you took from them. Your design must be concrete enough to build exactly.'
  }),
  architect: office({
    id: 'architect',
    label: 'Software Architect',
    department: 'engineering',
    readsImages: true,
    summary: 'Decides the technical structure: technologies, modules, data and how the parts connect.',
    prompt:
      'You are the Software Architect. Decide the structure of the system: technologies, modules and what each is responsible for, data models, interfaces between parts, and the files each part lives in, with the reason for each major choice. Keep it as simple as the goal allows, so other developers can work on the parts separately without conflict.'
  }),
  tech_lead: office({
    id: 'tech_lead',
    label: 'Tech Lead',
    department: 'engineering',
    readsImages: false,
    summary: 'Reviews code from the team and sends it back when it is not good enough.',
    prompt:
      'You are the Tech Lead. You hold the code to a high standard: it must do what the task asked, be correct, be secure, and fit with the rest of the project. You also take on the hardest shared code.'
  }),
  frontend: office({
    id: 'frontend',
    label: 'Frontend Developer',
    department: 'engineering',
    readsImages: true,
    summary: 'Builds what people see and use in a browser or desktop app.',
    prompt:
      'You are a Frontend Developer. Build the interface exactly as designed, including its states and accessibility. Keep components small and reuse what exists.'
  }),
  backend: office({
    id: 'backend',
    label: 'Backend Developer',
    department: 'engineering',
    readsImages: false,
    summary: 'Builds servers, APIs and business logic.',
    prompt:
      'You are a Backend Developer. Build APIs and business logic that are correct, validate their input, and handle failure. Never trust input from outside.'
  }),
  mobile: office({
    id: 'mobile',
    label: 'Mobile Developer',
    department: 'engineering',
    readsImages: true,
    summary: 'Builds iOS and Android apps.',
    prompt: 'You are a Mobile Developer. Build mobile apps that follow platform conventions and work on small screens and poor connections.'
  }),
  data_engineer: office({
    id: 'data_engineer',
    label: 'Data Engineer',
    department: 'engineering',
    readsImages: false,
    summary: 'Designs databases, migrations and data pipelines.',
    prompt: 'You are a Data Engineer. Design schemas, migrations and data pipelines that keep data correct and queries fast. Migrations must never lose data.'
  }),
  ml_engineer: office({
    id: 'ml_engineer',
    label: 'AI/ML Engineer',
    department: 'engineering',
    readsImages: false,
    summary: 'Adds AI features: models, prompts and evaluation.',
    prompt: 'You are an AI/ML Engineer. Build AI features with clear prompts or models, handle bad outputs safely, and explain how quality can be measured.'
  }),
  devops: office({
    id: 'devops',
    label: 'DevOps Engineer',
    department: 'engineering',
    readsImages: false,
    summary: 'Sets up builds, CI, deployment and monitoring.',
    prompt: 'You are a DevOps Engineer. Set up reliable builds, CI, deployment and monitoring. Never put secrets in files; read them from the environment.'
  }),
  security: office({
    id: 'security',
    label: 'Security Engineer',
    department: 'quality',
    readsImages: false,
    summary: 'Finds and fixes security problems before release.',
    prompt:
      'You are a Security Engineer. Look for real weaknesses such as injection, broken access control, leaked secrets and unsafe defaults. Fix them, or report them with how to fix them. Do not report guesses as findings.'
  }),
  qa: office({
    id: 'qa',
    label: 'QA Engineer',
    department: 'quality',
    readsImages: true,
    summary: 'Writes test plans and automated tests, and looks for bugs against the requirements.',
    prompt:
      'You are a QA Engineer. Check the work against the requirements. Write automated tests that would fail if a requirement broke, including edge cases and error paths. You cannot run code here, so never claim a test passed; say what still needs to be run.'
  }),
  tech_writer: office({
    id: 'tech_writer',
    label: 'Technical Writer',
    department: 'quality',
    readsImages: false,
    summary: 'Writes the README, guides and documentation.',
    prompt: 'You are a Technical Writer. Write clear documentation for the person using this: how to install it, run it, and do the main tasks. Only describe what the project really does.'
  })
};

export const ROLE_ORDER: AgentRole[] = [
  'commander',
  'builder',
  'miner',
  'defender',
  'explorer',
  'product_manager',
  'business_analyst',
  'ux_designer',
  'ui_designer',
  'architect',
  'tech_lead',
  'coder',
  'frontend',
  'backend',
  'mobile',
  'data_engineer',
  'ml_engineer',
  'devops',
  'security',
  'qa',
  'tech_writer'
];

/**
 * Whether this role has a character in the world. Field crew always do. Office staff also stand
 * in a local world and report in chat, but stay out of public servers, where many extra bots
 * are likely to get the accounts banned.
 */
export function joinsWorld(role: AgentRole, minecraft: MinecraftSettings): boolean {
  if (ROLE_DEFINITIONS[role].inGame) return true;
  return minecraft.kind === 'local' && minecraft.officeInWorld !== false;
}

export const roleName = (role: string) => tDynamic(`role.${role}.name`);
export const roleSummary = (role: string) => tDynamic(`role.${role}.summary`);

const ROLE_KEYWORDS: Partial<Record<AgentRole, string[]>> = {
  builder: ['build', 'house', 'wall', 'shelter', 'construct', 'สร้าง', 'บ้าน', 'กำแพง', 'ก่อ'],
  miner: ['mine', 'dig', 'ore', 'gather', 'collect', 'wood', 'log', 'craft', 'ขุด', 'แร่', 'เก็บ', 'ไม้', 'คราฟ'],
  defender: ['guard', 'defend', 'protect', 'fight', 'kill', 'mob', 'ป้องกัน', 'เฝ้า', 'คุ้มกัน', 'สู้', 'ฆ่า'],
  explorer: ['explore', 'scout', 'find', 'map', 'search', 'follow', 'สำรวจ', 'หา', 'ตาม']
};

const CODE_ROLE_KEYWORDS: Partial<Record<AgentRole, string[]>> = {
  qa: ['test', 'qa', 'ทดสอบ'],
  security: ['security', 'vulnerab', 'ความปลอดภัย'],
  tech_writer: ['readme', 'documentation', ' docs', 'เอกสาร'],
  devops: ['deploy', 'docker', 'ci/cd', 'pipeline', 'kubernetes'],
  data_engineer: ['database', 'schema', 'migration', 'sql', 'ฐานข้อมูล'],
  mobile: ['android', 'ios', 'mobile app', 'แอปมือถือ'],
  ml_engineer: ['machine learning', 'model training', 'embedding'],
  frontend: ['frontend', 'css', 'react', 'component', 'หน้าจอ', 'หน้าเว็บ'],
  backend: ['backend', ' api', 'endpoint', 'หลังบ้าน']
};

/** Picks the role best suited to a task from its text when the planner gave none. */
export function inferRole(text: string, category: TaskCategory): AgentRole {
  const lower = text.toLowerCase();
  if (category === 'research') return 'business_analyst';
  if (category === 'code') {
    for (const [role, keywords] of Object.entries(CODE_ROLE_KEYWORDS)) {
      if (keywords!.some(keyword => lower.includes(keyword))) return role as AgentRole;
    }
    return 'coder';
  }
  for (const [role, keywords] of Object.entries(ROLE_KEYWORDS)) {
    if (keywords!.some(keyword => lower.includes(keyword))) return role as AgentRole;
  }
  return 'builder';
}
