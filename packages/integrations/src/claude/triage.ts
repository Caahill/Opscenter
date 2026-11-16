// AI triage (TechSpec 7.3, PRD 2.4). Input is masked text only (AGENTS.md rule 7); output is a
// suggestion a person confirms, edits or dismisses. Routing: the triage model first, the fallback
// model once if the answer is invalid or below 0.6 confidence, else an empty suggestion.
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
// zodOutputFormat takes Zod 4 schemas; zod 3.25 ships them under zod/v4.
import { z } from 'zod/v4';

export const TRIAGE_CATEGORIES = ['CHANGE_REQUEST', 'ASSET_SHARED', 'APPROVAL', 'QUESTION', 'COMPLAINT', 'BILLING', 'OTHER'] as const;
export const TRIAGE_ACTIONS = ['ATTACH_TO_TASK', 'CREATE_TASK', 'LOG_APPROVAL', 'NONE'] as const;
export const TRIAGE_PRIORITIES = ['URGENT', 'HIGH', 'NORMAL', 'LOW'] as const;
export type TriageCategory = (typeof TRIAGE_CATEGORIES)[number];
export type TriageAction = (typeof TRIAGE_ACTIONS)[number];

/** What the model returns. Kept to types structured outputs support; limits are applied after. */
export const TriageOutput = z.object({
  category: z.enum(TRIAGE_CATEGORIES),
  projectId: z.string().nullable(),
  action: z.enum(TRIAGE_ACTIONS),
  taskId: z.string().nullable(),
  suggestedTitle: z.string(),
  suggestedPriority: z.enum(TRIAGE_PRIORITIES),
  summary: z.string(),
  confidence: z.number(),
});
export type TriageOutput = z.infer<typeof TriageOutput>;

export interface TriageProject {
  id: string;
  department: string;
  stage: string;
  packageName: string | null;
  openTasks: Array<{ id: string; title: string; type: string }>;
}

export interface TriageInput {
  channel: 'EMAIL' | 'WHATSAPP';
  /** Masked subject and body only. Never the original. */
  subject: string | null;
  bodyMasked: string;
  clientName: string;
  projects: TriageProject[];
}

export interface TriageResult {
  suggestion: TriageOutput | null;
  model: string;
  attempts: Array<{ model: string; outcome: 'ok' | 'low_confidence' | 'invalid' | 'error' }>;
}

export const MIN_CONFIDENCE = 0.6;

/** Ids must point at the client's own projects and tasks; anything else is dropped. */
export function sanitize(out: TriageOutput, input: TriageInput): TriageOutput {
  const project = input.projects.find((p) => p.id === out.projectId) ?? null;
  const task = project?.openTasks.find((t) => t.id === out.taskId) ?? null;
  let action = out.action;
  if (action === 'ATTACH_TO_TASK' && !task) action = project ? 'CREATE_TASK' : 'NONE';
  if ((action === 'CREATE_TASK' || action === 'LOG_APPROVAL') && !project) action = 'NONE';
  return {
    ...out,
    projectId: project?.id ?? null,
    taskId: action === 'ATTACH_TO_TASK' ? task!.id : null,
    action,
    suggestedTitle: out.suggestedTitle.trim().slice(0, 120),
    summary: out.summary.trim().slice(0, 200),
    confidence: Math.min(1, Math.max(0, out.confidence)),
  };
}

export interface Classifier {
  readonly mode: 'live' | 'fake';
  classify(input: TriageInput): Promise<TriageResult>;
}

export const TRIAGE_SYSTEM = `You triage client messages for SySpree, a digital marketing agency (SEO, Google Ads, social media, web development, website maintenance).

Read one client message and suggest what the agency team should do with it. A person reviews every suggestion before anything happens.

Fields:
- category: CHANGE_REQUEST (asks for work to change), ASSET_SHARED (sends files, content or access), APPROVAL (approves or signs off), QUESTION, COMPLAINT, BILLING (invoices, payments, renewals), or OTHER.
- projectId: the id of the client's project the message is about, from the list given, or null if unclear.
- action: ATTACH_TO_TASK when it belongs to one of the listed open tasks (set taskId), CREATE_TASK when it needs new work, LOG_APPROVAL for an approval, NONE when nothing needs doing.
- taskId: an open task id from the chosen project, only with ATTACH_TO_TASK; otherwise null.
- suggestedTitle: a short task title in the imperative, under 80 characters, no client contact details.
- suggestedPriority: URGENT only for outages or hard deadlines within a day; HIGH for this week; NORMAL otherwise; LOW for nice-to-haves.
- summary: one or two plain sentences, under 200 characters.
- confidence: 0 to 1, how sure you are of category, project and action together.

The message text has client email addresses, phone numbers and logins replaced with tokens such as [email hidden]. Never try to recover them.`;

export function triagePrompt(input: TriageInput): string {
  return JSON.stringify(
    {
      client: input.clientName,
      channel: input.channel,
      subject: input.subject,
      message: input.bodyMasked.slice(0, 8000),
      projects: input.projects.map((p) => ({ id: p.id, department: p.department, stage: p.stage, package: p.packageName, openTasks: p.openTasks.slice(0, 10) })),
    },
    null,
    2,
  );
}

export class LiveClassifier implements Classifier {
  readonly mode = 'live' as const;
  private readonly client: Anthropic;

  constructor(
    apiKey: string,
    private readonly models: { triage: string; fallback: string },
  ) {
    this.client = new Anthropic({ apiKey, timeout: 30_000, maxRetries: 2 });
  }

  private async attempt(model: string, input: TriageInput): Promise<{ out: TriageOutput | null; outcome: TriageResult['attempts'][number]['outcome'] }> {
    try {
      const response = await this.client.messages.parse({
        model,
        max_tokens: 2048,
        system: TRIAGE_SYSTEM,
        messages: [{ role: 'user', content: triagePrompt(input) }],
        output_config: { effort: 'low', format: zodOutputFormat(TriageOutput) },
      });
      if (response.stop_reason === 'refusal' || !response.parsed_output) return { out: null, outcome: 'invalid' };
      const out = sanitize(response.parsed_output, input);
      return { out, outcome: out.confidence < MIN_CONFIDENCE ? 'low_confidence' : 'ok' };
    } catch (err) {
      // Typed SDK errors: a malformed answer is "invalid" (worth the fallback); API failures are "error".
      if (err instanceof Anthropic.APIError) return { out: null, outcome: 'error' };
      return { out: null, outcome: 'invalid' };
    }
  }

  async classify(input: TriageInput): Promise<TriageResult> {
    const attempts: TriageResult['attempts'] = [];
    const first = await this.attempt(this.models.triage, input);
    attempts.push({ model: this.models.triage, outcome: first.outcome });
    if (first.outcome === 'ok') return { suggestion: first.out, model: this.models.triage, attempts };
    const second = await this.attempt(this.models.fallback, input);
    attempts.push({ model: this.models.fallback, outcome: second.outcome });
    if (second.out && second.outcome === 'ok') return { suggestion: second.out, model: this.models.fallback, attempts };
    // Below threshold twice: keep the better low-confidence answer rather than nothing.
    const best = [second.out, first.out].filter((o): o is TriageOutput => o !== null).sort((x, y) => y.confidence - x.confidence)[0] ?? null;
    return { suggestion: best, model: best === second.out ? this.models.fallback : this.models.triage, attempts };
  }
}

// ---- Fake: deterministic keyword rules for local runs and tests (AI_MODE=fake) ----

const RULES: Array<{ re: RegExp; category: TriageCategory; action: TriageAction; priority: TriageOutput['suggestedPriority'] }> = [
  { re: /\b(invoice|payment|paid|bill|billing|renewal|renew)\b/i, category: 'BILLING', action: 'NONE', priority: 'NORMAL' },
  { re: /\b(approved?|approval|looks good|go ahead|sign(ed)? off)\b/i, category: 'APPROVAL', action: 'LOG_APPROVAL', priority: 'NORMAL' },
  { re: /\b(unhappy|disappointed|complain|not acceptable|frustrated)\b/i, category: 'COMPLAINT', action: 'CREATE_TASK', priority: 'HIGH' },
  { re: /\b(change|swap|replace|update|fix|add|remove|edit|broken|down)\b/i, category: 'CHANGE_REQUEST', action: 'CREATE_TASK', priority: 'NORMAL' },
  { re: /\b(attached|attaching|please find|sharing|here (is|are))\b/i, category: 'ASSET_SHARED', action: 'ATTACH_TO_TASK', priority: 'NORMAL' },
  { re: /\?/, category: 'QUESTION', action: 'NONE', priority: 'NORMAL' },
];

const DEPARTMENT_HINTS: Array<[RegExp, string]> = [
  [/\b(seo|keywords?|backlinks?|ranking|blog)\b/i, 'SEO'],
  [/\b(ads?|campaign|ppc|google ads|cpc)\b/i, 'GOOGLE_ADS'],
  [/\b(post|reel|instagram|facebook|social|creative)\b/i, 'SOCIAL_MEDIA'],
  [/\b(website|homepage|banner|page|site|hosting|plugin)\b/i, 'AMC'],
  [/\b(website|homepage|banner|page|design|figma)\b/i, 'WEB_DEV'],
];

const words = (s: string) => new Set(s.toLowerCase().match(/[a-z]{4,}/g) ?? []);

function titleFrom(body: string): string {
  const lines = body
    .split('\n')
    .map((l) => l.trim().replace(/^(hi|hello|dear|hey)\b[^,.!]{0,30}[,.!]\s*/i, ''))
    .filter((l) => l && !/\[(email|phone|credential) hidden\]/.test(l));
  const first = (lines[0] ?? 'Client request').split(/(?<=[.!?])\s/)[0]!.replace(/^(please|kindly|can you|could you)\s+/i, '');
  const t = first.replace(/[.!?]+$/, '').trim();
  return (t.charAt(0).toUpperCase() + t.slice(1)).slice(0, 80) || 'Client request';
}

export class FakeClassifier implements Classifier {
  readonly mode = 'fake' as const;

  async classify(input: TriageInput): Promise<TriageResult> {
    const text = `${input.subject ?? ''}\n${input.bodyMasked}`;
    const rule = RULES.find((r) => r.re.test(text)) ?? { category: 'OTHER' as const, action: 'NONE' as const, priority: 'NORMAL' as const };
    const hinted = DEPARTMENT_HINTS.filter(([re]) => re.test(text)).map(([, d]) => d);
    const project = input.projects.find((p) => hinted.includes(p.department)) ?? input.projects[0] ?? null;
    const msgWords = words(text);
    const task = project?.openTasks
      .map((t) => ({ t, score: [...words(t.title)].filter((w) => msgWords.has(w)).length }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)[0]?.t;
    const raw: TriageOutput = {
      category: rule.category,
      projectId: project?.id ?? null,
      action: rule.action === 'ATTACH_TO_TASK' && !task ? 'CREATE_TASK' : rule.action,
      taskId: task?.id ?? null,
      suggestedTitle: titleFrom(input.bodyMasked),
      suggestedPriority: /\b(urgent|asap|today|immediately)\b/i.test(text) ? 'URGENT' : rule.priority,
      summary: input.bodyMasked.replace(/\s+/g, ' ').trim().slice(0, 200),
      confidence: rule.category === 'OTHER' ? 0.4 : 0.8,
    };
    return { suggestion: sanitize(raw, input), model: 'fake', attempts: [{ model: 'fake', outcome: 'ok' }] };
  }
}
