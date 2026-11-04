import { AgentRole } from './types';

/** The whole company. Roles with two people can work on two things at once. */
export const TEAM: { id: string; role: AgentRole }[] = [
  { id: 'marlow', role: 'commander' },

  { id: 'wren', role: 'builder' },
  { id: 'kit', role: 'miner' },
  { id: 'rowan', role: 'defender' },
  { id: 'tove', role: 'explorer' },

  { id: 'sage', role: 'product_manager' },
  { id: 'ellis', role: 'business_analyst' },
  { id: 'iris', role: 'ux_designer' },
  { id: 'fern', role: 'ui_designer' },
  { id: 'ash', role: 'architect' },
  { id: 'briar', role: 'tech_lead' },
  { id: 'juniper', role: 'coder' },
  { id: 'robin', role: 'frontend' },
  { id: 'hollis', role: 'frontend' },
  { id: 'reed', role: 'backend' },
  { id: 'quinn', role: 'backend' },
  { id: 'linden', role: 'mobile' },
  { id: 'moss', role: 'data_engineer' },
  { id: 'aspen', role: 'ml_engineer' },
  { id: 'flint', role: 'devops' },
  { id: 'onyx', role: 'security' },
  { id: 'clover', role: 'qa' },
  { id: 'page', role: 'tech_writer' }
];

export const TEAM_IDS = TEAM.map(member => member.id);
