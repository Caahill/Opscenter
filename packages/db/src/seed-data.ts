// Seed users per role (QuickStart section 6). Invented data only: no real SySpree staff or clients.
import type { Department, Role } from '@prisma/client';

export interface SeedUser {
  email: string;
  name: string;
  roles: Role[];
  team?: Department;
  leadsTeam?: boolean;
}

export const SEED_USERS: SeedUser[] = [
  { email: 'admin@dev.local', name: 'Asha Admin', roles: ['ADMIN'] },
  { email: 'pm@dev.local', name: 'Pavan PM', roles: ['PM'] },
  { email: 'pm2@dev.local', name: 'Meera PM', roles: ['PM'] },
  { email: 'tl.seo@dev.local', name: 'Tara Lead', roles: ['TEAM_LEADER'], team: 'SEO', leadsTeam: true },
  { email: 'member.seo@dev.local', name: 'Manoj Member', roles: ['TEAM_MEMBER'], team: 'SEO' },
  // A second SEO member, so the Team Leader has someone to rebalance work to (Phase 1C).
  { email: 'member2.seo@dev.local', name: 'Sana Member', roles: ['TEAM_MEMBER'], team: 'SEO' },
  { email: 'accounts@dev.local', name: 'Anil Accounts', roles: ['ACCOUNTS'] },
  { email: 'hr@dev.local', name: 'Hema HR', roles: ['HR'] },
];

/** One team per department; Admin can rename or split them later. */
export const SEED_TEAMS: Array<{ department: Department; name: string }> = [
  { department: 'PRE_SALES', name: 'Pre-Sales' },
  { department: 'ONBOARDING', name: 'Client Onboarding' },
  { department: 'WEB_DEV', name: 'Web Development' },
  { department: 'AMC', name: 'AMC' },
  { department: 'SPEED_AUDIT', name: 'Speed Audit' },
  { department: 'SEO', name: 'SEO' },
  { department: 'GOOGLE_ADS', name: 'Google Ads' },
  { department: 'SOCIAL_MEDIA', name: 'Social Media' },
  { department: 'GRAPHIC_DESIGN', name: 'Graphic Design' },
];

/**
 * Fixed-date national holidays for the India office. Movable festivals differ by year and by
 * office, so HR adds those (Leave -> Holidays). Full holiday calendars are PRD 3.4 (P1).
 */
export const SEED_HOLIDAYS: Array<{ date: string; location: string; name: string }> = [2026, 2027].flatMap((y) => [
  { date: `${y}-01-26`, location: 'IN', name: 'Republic Day' },
  { date: `${y}-08-15`, location: 'IN', name: 'Independence Day' },
  { date: `${y}-10-02`, location: 'IN', name: 'Gandhi Jayanti' },
]);
