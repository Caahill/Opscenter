// Department pipelines and starter packages (PRD "Department workflows"). Stage names never
// contain a person's name; owners are assignees. Admin edits create new pipeline versions.
import type { Department, ProjectType, StatusType } from '@prisma/client';

export interface StageSeed {
  name: string;
  statusType: StatusType;
  phase: 'SETUP' | 'CYCLE';
  slaDays?: number;
  checklist?: Array<{ text: string; ownerRole?: string }>;
}

const s = (name: string, statusType: StatusType = 'ACTIVE', extra: Partial<StageSeed> = {}): StageSeed => ({
  name,
  statusType,
  phase: 'SETUP',
  ...extra,
});
const cycle = (name: string): StageSeed => ({ name, statusType: 'ACTIVE', phase: 'CYCLE' });

export const PIPELINES: Record<Department, StageSeed[]> = {
  PRE_SALES: [
    s('Requested', 'NOT_STARTED'),
    s('In progress', 'ACTIVE', { slaDays: 3 }),
    s('Internal review', 'ACTIVE', { slaDays: 1 }),
    s('Sent to sales'),
    s('Won', 'DONE'),
    s('Lost', 'DONE'),
  ],
  ONBOARDING: [
    s('Deal closed', 'ACTIVE', { slaDays: 1 }),
    s('Welcome email sent', 'ACTIVE', {
      slaDays: 2,
      checklist: [{ text: 'Welcome email sent' }, { text: 'Questionnaire sent' }],
    }),
    s('Questionnaire and access received', 'WAITING_ON_CLIENT', {
      checklist: [{ text: 'Questionnaire returned' }, { text: 'Website and analytics access shared' }],
    }),
    s('Kickoff call done', 'ACTIVE', { checklist: [{ text: 'Kickoff call held' }, { text: 'Services confirmed' }] }),
    s('Handed over', 'DONE'),
  ],
  WEB_DEV: [
    s('Requirements and sitemap', 'NOT_STARTED', { checklist: [{ text: 'Sitemap agreed' }, { text: 'Content received' }] }),
    s('Design (Figma)', 'ACTIVE', { slaDays: 10 }),
    s('Client design approval', 'WAITING_ON_CLIENT'),
    s('Development', 'ACTIVE', { slaDays: 20 }),
    s('Internal QA', 'ACTIVE', { slaDays: 3, checklist: [{ text: 'Responsive check' }, { text: 'Forms tested' }, { text: 'Speed check' }] }),
    s('Client review', 'WAITING_ON_CLIENT'),
    s('Go live', 'ACTIVE', {
      checklist: [{ text: 'DNS updated' }, { text: 'SSL active' }, { text: 'Analytics installed' }, { text: 'Client sign-off' }],
    }),
    s('Done', 'DONE'),
  ],
  AMC: [cycle('Active'), s('Renewal due'), s('Closed', 'DONE')],
  SPEED_AUDIT: [s('Requested', 'NOT_STARTED'), s('Audit', 'ACTIVE', { slaDays: 3 }), s('Fixes'), s('Verification'), s('Done', 'DONE')],
  SEO: [
    s('Access', 'WAITING_ON_CLIENT', {
      checklist: [{ text: 'GA access' }, { text: 'GSC access' }, { text: 'GMB access' }, { text: 'Sitemap received' }],
    }),
    s('Keyword research', 'ACTIVE', { slaDays: 5 }),
    s('Keywords approved by client', 'WAITING_ON_CLIENT'),
    s('Baseline report', 'ACTIVE', { slaDays: 5 }),
    s('Tech audit'),
    s('On-page creation', 'ACTIVE', { slaDays: 10 }),
    s('On-page QA', 'ACTIVE', { checklist: [{ text: 'Grammar check' }] }),
    s('On-page implementation', 'ACTIVE', { slaDays: 7 }),
    s('Implementation check'),
    cycle('Monthly cycle'),
    s('Contract ended', 'DONE'),
  ],
  GOOGLE_ADS: [
    s('Keyword analysis and budgeting', 'ACTIVE', { slaDays: 5 }),
    s('Strategy call'),
    s('Account setup'),
    s('Landing page / GTM'),
    s('Campaign setup', 'ACTIVE', { checklist: [{ text: 'Conversion tracking verified' }, { text: 'Budget approved by client' }] }),
    cycle('Live optimisation'),
    s('Contract ended', 'DONE'),
  ],
  SOCIAL_MEDIA: [
    s('Brand kit and access', 'WAITING_ON_CLIENT', { checklist: [{ text: 'Brand kit received' }, { text: 'Page access shared' }] }),
    s('Content strategy', 'ACTIVE', { slaDays: 7 }),
    cycle('Monthly cycle'),
    s('Contract ended', 'DONE'),
  ],
  GRAPHIC_DESIGN: [
    s('Brief', 'NOT_STARTED'),
    s('Concepts (options)', 'ACTIVE', { slaDays: 3 }),
    s('Client feedback', 'WAITING_ON_CLIENT'),
    s('Revisions'),
    s('Final files delivered', 'DONE'),
  ],
};

export const PROJECT_TYPE_BY_DEPARTMENT: Record<Department, ProjectType> = {
  PRE_SALES: 'ONE_TIME',
  ONBOARDING: 'ONE_TIME',
  WEB_DEV: 'ONE_TIME',
  AMC: 'AMC',
  SPEED_AUDIT: 'ONE_TIME',
  SEO: 'RETAINER',
  GOOGLE_ADS: 'RETAINER',
  SOCIAL_MEDIA: 'RETAINER',
  GRAPHIC_DESIGN: 'ONE_TIME',
};

interface Tpl {
  title: string;
  type?: 'DELIVERABLE' | 'REPORT' | 'FIX' | 'INTERNAL' | 'PRESALES_REQUEST';
  estimateH?: number;
  stage?: string;
  dueInDays?: number;
}

export interface PackageSeed {
  department: Department;
  name: string;
  setupTasks: Tpl[];
  cycleTasks: Tpl[];
  monthlyHours?: number;
}

// The SEO setup list follows the ClickUp template task (PRD "SEO delivery checklist").
const SEO_SETUP: Tpl[] = [
  { title: 'Send welcome email', stage: 'Access', estimateH: 0.5, dueInDays: 1 },
  { title: 'Get GA and GSC access', stage: 'Access', estimateH: 1, dueInDays: 3 },
  { title: 'Collect sitemap', stage: 'Access', estimateH: 0.5, dueInDays: 3 },
  { title: 'Set up GA reporting', stage: 'Access', estimateH: 2, dueInDays: 5 },
  { title: 'Keyword suggestions', stage: 'Keyword research', estimateH: 6, dueInDays: 7 },
  { title: 'Get client-approved keywords', stage: 'Keywords approved by client', estimateH: 1, dueInDays: 10 },
  { title: 'Baseline report', type: 'REPORT', stage: 'Baseline report', estimateH: 4, dueInDays: 14 },
  { title: 'On-page creation', stage: 'On-page creation', estimateH: 12, dueInDays: 21 },
  { title: 'Grammar check', stage: 'On-page QA', estimateH: 2, dueInDays: 23 },
  { title: 'On-page implementation', stage: 'On-page implementation', estimateH: 8, dueInDays: 28 },
  { title: 'Implementation check', stage: 'Implementation check', estimateH: 2, dueInDays: 30 },
];

export const PACKAGES: PackageSeed[] = [
  {
    department: 'SEO',
    name: 'SEO Standard (30 keywords, 100 backlinks a month)',
    setupTasks: SEO_SETUP,
    cycleTasks: [
      { title: 'Backlinks: 100 this month', estimateH: 20, dueInDays: 25 },
      { title: 'Ranking report', type: 'REPORT', estimateH: 2, dueInDays: 14 },
      { title: 'Monthly report', type: 'REPORT', estimateH: 3, dueInDays: 28 },
    ],
    monthlyHours: 30,
  },
  {
    department: 'SEO',
    name: 'SEO Advanced (30 keywords, 100 backlinks a month, tech audit)',
    setupTasks: [...SEO_SETUP.slice(0, 7), { title: 'Technical SEO audit', stage: 'Tech audit', estimateH: 8, dueInDays: 18 }, ...SEO_SETUP.slice(7)],
    cycleTasks: [
      { title: 'Backlinks: 100 this month', estimateH: 20, dueInDays: 25 },
      { title: 'Ranking report', type: 'REPORT', estimateH: 2, dueInDays: 14 },
      { title: 'Technical health check', estimateH: 3, dueInDays: 20 },
      { title: 'Monthly report', type: 'REPORT', estimateH: 3, dueInDays: 28 },
    ],
    monthlyHours: 40,
  },
  {
    department: 'GOOGLE_ADS',
    name: 'Google Ads Standard',
    setupTasks: [
      { title: 'Keyword analysis and budget plan', stage: 'Keyword analysis and budgeting', estimateH: 6, dueInDays: 5 },
      { title: 'Strategy call', stage: 'Strategy call', estimateH: 1, dueInDays: 7 },
      { title: 'Ads account setup', stage: 'Account setup', estimateH: 2, dueInDays: 9 },
      { title: 'Landing page and GTM tags', stage: 'Landing page / GTM', estimateH: 6, dueInDays: 12 },
      { title: 'Campaign setup', stage: 'Campaign setup', estimateH: 6, dueInDays: 14 },
    ],
    cycleTasks: [
      { title: 'Live optimisation', estimateH: 8, dueInDays: 25 },
      { title: 'Budget review', estimateH: 1, dueInDays: 15 },
      { title: 'Monthly report', type: 'REPORT', estimateH: 2, dueInDays: 28 },
    ],
    monthlyHours: 12,
  },
  {
    department: 'SOCIAL_MEDIA',
    name: 'Social 12 posts a month',
    setupTasks: [
      { title: 'Collect brand kit and page access', stage: 'Brand kit and access', estimateH: 1, dueInDays: 3 },
      { title: 'Content strategy', stage: 'Content strategy', estimateH: 6, dueInDays: 7 },
    ],
    cycleTasks: [
      { title: 'Content calendar', estimateH: 3, dueInDays: 3 },
      { title: 'Reel (1)', estimateH: 4, dueInDays: 12 },
      { title: 'Static creatives (4)', estimateH: 6, dueInDays: 12 },
      { title: 'Email creatives (2)', estimateH: 3, dueInDays: 12 },
      { title: 'Client approval of creatives', estimateH: 1, dueInDays: 15 },
      { title: 'Schedule and post', estimateH: 2, dueInDays: 28 },
      { title: 'Monthly report', type: 'REPORT', estimateH: 2, dueInDays: 28 },
    ],
    monthlyHours: 21,
  },
  {
    department: 'AMC',
    name: 'AMC 10 hours a month',
    setupTasks: [{ title: 'Confirm hosting and backup access', estimateH: 1, dueInDays: 3 }],
    cycleTasks: [
      { title: 'Updates, uploads and fixes (10 h budget)', type: 'FIX', estimateH: 10, dueInDays: 28 },
      { title: 'Backup and uptime check', estimateH: 1, dueInDays: 7 },
    ],
    monthlyHours: 10,
  },
  {
    department: 'WEB_DEV',
    name: 'Website build',
    setupTasks: [
      { title: 'Requirements and sitemap', stage: 'Requirements and sitemap', estimateH: 4, dueInDays: 5 },
      { title: 'Figma design', stage: 'Design (Figma)', estimateH: 24, dueInDays: 15 },
      { title: 'Development', stage: 'Development', estimateH: 60, dueInDays: 35 },
      { title: 'Internal QA', stage: 'Internal QA', estimateH: 8, dueInDays: 40 },
      { title: 'Go live', stage: 'Go live', estimateH: 4, dueInDays: 45 },
    ],
    cycleTasks: [],
  },
  {
    department: 'SPEED_AUDIT',
    name: 'Speed and responsiveness audit',
    setupTasks: [
      { title: 'Audit report', type: 'REPORT', stage: 'Audit', estimateH: 4, dueInDays: 3 },
      { title: 'Apply fixes', type: 'FIX', stage: 'Fixes', estimateH: 8, dueInDays: 7 },
      { title: 'Verify scores', stage: 'Verification', estimateH: 1, dueInDays: 8 },
    ],
    cycleTasks: [],
  },
  {
    department: 'GRAPHIC_DESIGN',
    name: 'Design request',
    setupTasks: [
      { title: 'Concepts (options)', stage: 'Concepts (options)', estimateH: 6, dueInDays: 3 },
      { title: 'Revisions', stage: 'Revisions', estimateH: 3, dueInDays: 6 },
      { title: 'Final files', stage: 'Final files delivered', estimateH: 1, dueInDays: 7 },
    ],
    cycleTasks: [],
  },
  {
    department: 'ONBOARDING',
    name: 'Client onboarding',
    setupTasks: [
      { title: 'Send welcome email and questionnaire', stage: 'Welcome email sent', estimateH: 0.5, dueInDays: 1 },
      { title: 'Collect questionnaire and access', stage: 'Questionnaire and access received', estimateH: 1, dueInDays: 5 },
      { title: 'Kickoff call', stage: 'Kickoff call done', estimateH: 1, dueInDays: 7 },
    ],
    cycleTasks: [],
  },
  {
    department: 'PRE_SALES',
    name: 'Pre-sales request',
    setupTasks: [{ title: 'Prepare request', type: 'PRESALES_REQUEST', stage: 'In progress', estimateH: 3, dueInDays: 3 }],
    cycleTasks: [],
  },
];
