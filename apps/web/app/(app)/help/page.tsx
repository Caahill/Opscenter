import { ROLE_LABELS, type Role } from '@opshub/shared';
import { Card, Chip, Label, PageHeader } from '@opshub/ui';
import Link from 'next/link';
import { getMe } from '@/lib/api';
import { EVERYONE, ROLE_GUIDES, type Tip } from '@/lib/guide';

const GLOSSARY: Array<{ term: string; meaning: string }> = [
  { term: 'Board', meaning: 'All projects of one department, in columns by stage.' },
  { term: 'Pipeline', meaning: 'The list of stages a department’s projects move through, e.g. Access → Keyword research → Baseline report.' },
  { term: 'Package', meaning: 'What the client bought, e.g. “SEO Standard”. Starting a project from a package creates its setup tasks; retainers also get monthly tasks.' },
  { term: 'Capacity', meaning: 'Estimated hours of open tasks against hours available after leave and holidays. Over 100% means overloaded.' },
  { term: 'Triage', meaning: 'Deciding what a client message needs: a task, a reply, or nothing. Ops Hub suggests one; a person confirms.' },
  { term: 'Hidden for your role', meaning: 'Client phone numbers, emails, passwords and amounts are only shown to people who need them. This is on purpose, not an error.' },
];

function TipList({ tips, permissions }: { tips: Tip[]; permissions: string[] }) {
  const shown = tips.filter((t) => !t.needs || permissions.includes(t.needs));
  if (shown.length === 0) return <p className="mt-3 text-[14px] text-muted">These pages aren’t part of your role.</p>;
  return (
    <ul className="mt-3 space-y-2">
      {shown.map((t) => (
        <li key={t.text} className="flex gap-2 text-[15px]">
          <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
          <Link href={t.href} className="hover:text-link">
            {t.text}
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default async function HelpPage() {
  const me = await getMe();
  const mine = new Set<Role>(me.roles);
  const roles = Object.keys(ROLE_GUIDES) as Role[];
  const ordered = [...roles.filter((r) => mine.has(r)), ...roles.filter((r) => !mine.has(r))];

  return (
    <>
      <PageHeader title="Help and tips" description="How Ops Hub fits your day, what each role does in it, and what the words mean." />

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <Label>Every day</Label>
          <TipList tips={EVERYONE} permissions={me.permissions} />
        </Card>

        <Card>
          <Label>Something wrong or confusing?</Label>
          <ul className="mt-3 space-y-2 text-[15px]">
            <li>Take a screenshot and note which page you were on and what you clicked.</li>
            <li>Send it to the Ops Hub admin, or add it to the team’s testing sheet.</li>
            <li>
              Seeing <span className="rounded-sm bg-surface-alt px-1.5 py-0.5 text-[13px] text-muted">Hidden for your role</span> is normal: it
              protects client details.
            </li>
          </ul>
        </Card>

        {ordered.map((r) => (
          <Card key={r} className={mine.has(r) ? 'border-accent/40' : undefined}>
            <div className="flex items-center justify-between gap-2">
              <Label>{ROLE_LABELS[r]}</Label>
              {mine.has(r) ? <Chip tone="accent">Your role</Chip> : null}
            </div>
            <p className="mt-2 text-[15px] text-muted">{ROLE_GUIDES[r].summary}</p>
            {mine.has(r) ? <TipList tips={ROLE_GUIDES[r].tips} permissions={me.permissions} /> : null}
          </Card>
        ))}

        <Card className="lg:col-span-2">
          <Label>Words you’ll see</Label>
          <dl className="mt-3 grid gap-x-8 gap-y-3 sm:grid-cols-2">
            {GLOSSARY.map((g) => (
              <div key={g.term}>
                <dt className="font-semibold">{g.term}</dt>
                <dd className="text-[14.5px] text-muted">{g.meaning}</dd>
              </div>
            ))}
          </dl>
        </Card>
      </div>
    </>
  );
}
