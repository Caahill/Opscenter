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
 * SySpree's office holidays (Mumbai), as listed by the office for 2026 and 2027. Festival dates
 * follow the Maharashtra calendar and move every year: HR checks them against the state
 * notification and adds the next year's list in Leave -> Office holidays (paste a full list).
 */
const OFFICE_HOLIDAYS: Record<number, Array<[string, string]>> = {
  2026: [
    ['01-01', 'New Year'],
    ['01-26', 'Republic Day'],
    ['03-03', 'Holi'],
    ['03-19', 'Gudi Padwa'],
    ['04-03', 'Good Friday'],
    ['05-01', 'Maharashtra Day'],
    ['09-14', 'Ganesh Chaturthi'],
    ['10-02', 'Gandhi Jayanti'],
    ['10-20', 'Dussehra'],
    ['11-08', 'Diwali (Lakshmi Pujan)'],
    ['12-25', 'Christmas'],
  ],
  2027: [
    ['01-01', 'New Year'],
    ['01-26', 'Republic Day'],
    ['03-22', 'Holi'],
    ['03-26', 'Good Friday'],
    ['04-07', 'Gudi Padwa'],
    ['05-01', 'Maharashtra Day'],
    ['09-04', 'Ganesh Chaturthi'],
    ['10-02', 'Gandhi Jayanti'],
    ['10-09', 'Dussehra'],
    ['10-29', 'Diwali (Lakshmi Pujan)'],
    ['12-25', 'Christmas'],
  ],
};

export const SEED_HOLIDAYS: Array<{ date: string; location: string; name: string }> = Object.entries(OFFICE_HOLIDAYS).flatMap(([year, days]) =>
  days.map(([md, name]) => ({ date: `${year}-${md}`, location: 'IN', name })),
);
