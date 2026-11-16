import { BILLING_REASON_LABELS, BILLING_STATUS_LABELS, CONTACT_ROLE_LABELS, DEPARTMENT_LABELS, type Client360View, type ContactRole, type MeView, type PackageView, type TeamView, type UserView } from '@opshub/shared';
import { Card, Chip, Field, Label, Masked, PageHeader } from '@opshub/ui';
import Link from 'next/link';
import { api } from '@/lib/api';
import { HealthChip, PriorityChip, StatusChip } from '@/lib/chips';
import { formatDate, formatMoney } from '@/lib/format';
import { AddContactForm, StartProjectForm } from './client-forms';
import { CredentialsPanel } from './credentials-panel';
import { ThreadRow } from '../../inbox/thread-row';

export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [me, data] = await Promise.all([api<MeView>('/me'), api<Client360View>(`/clients/${id}/overview`)]);
  const { client } = data;
  // Which forms to show; the API enforces the same rule (PM of this client, or Admin).
  const canManage = me.permissions.includes('client.manage') && (me.roles.includes('ADMIN') || client.pmId === me.id);
  const [packages, teams, users] = canManage
    ? await Promise.all([api<PackageView[]>('/packages'), api<TeamView[]>('/teams'), api<UserView[]>('/users')])
    : [[], [], []];

  return (
    <>
      <PageHeader
        title={client.companyName ?? 'Client'}
        description={
          <span className="flex flex-wrap items-center gap-2">
            {client.website ? <span className="font-mono text-[13px]">{client.website}</span> : null}
            {client.market ? <Chip>{client.market}</Chip> : null}
            <span>PM: {client.pmName}</span>
          </span>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="flex items-center justify-between">
            <Label>Projects</Label>
            <span className="font-mono text-[12px] text-muted">{data.projects.length}</span>
          </div>
          <ul className="mt-3 divide-y divide-surface-alt">
            {data.projects.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <div>
                  <Link href={`/projects/${p.id}`} className="font-semibold hover:text-link" data-testid="client-project">
                    {p.department ? DEPARTMENT_LABELS[p.department] : ''}
                  </Link>
                  <p className="text-[13px] text-muted">
                    {p.stageName} · {p.packageName ?? 'No package'}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-1">
                  <StatusChip status={p.statusType} />
                  <HealthChip health={p.health} />
                  {p.value ? <Chip tone="muted">INR {p.value}</Chip> : null}
                </div>
              </li>
            ))}
            {data.projects.length === 0 ? <li className="py-3 text-muted">No projects yet.</li> : null}
          </ul>
          {canManage ? <StartProjectForm clientId={client.id} packages={packages} teams={teams} /> : null}
        </Card>

        <Card>
          <Label>Client details</Label>
          <dl className="mt-3">
            <Field label="Contract value">
              <Masked value={client.contractValue === undefined ? undefined : client.contractValue ? `INR ${client.contractValue}` : null} />
            </Field>
            <Field label="GSTIN / tax id">
              <Masked value={client.taxId} />
            </Field>
            <Field label="Email domains">
              <Masked value={client.emailDomains === undefined ? undefined : client.emailDomains.join(', ')} />
            </Field>
          </dl>
          <div className="mt-4">
            <Label>Renewals in the next 90 days</Label>
            <ul className="mt-2 text-[14px]">
              {data.renewals.map((p) => (
                <li key={p.id}>
                  {p.department ? DEPARTMENT_LABELS[p.department] : ''}: {formatDate((p.renewalDate ?? p.endDate)!)}
                </li>
              ))}
              {data.renewals.length === 0 ? <li className="text-muted">None</li> : null}
            </ul>
          </div>
        </Card>

        <Card>
          <Label>Contacts</Label>
          <ul className="mt-3 space-y-3">
            {data.contacts.map((c) => (
              <li key={c.id} className="text-[14px]">
                <p className="font-semibold">
                  <Masked value={c.name} />
                </p>
                <p className="text-muted">{c.role ? CONTACT_ROLE_LABELS[c.role as ContactRole] : ''}</p>
                <p>
                  <Masked value={c.email} />
                </p>
                <p>
                  <Masked value={c.phone} />
                </p>
              </li>
            ))}
            {data.contacts.length === 0 ? <li className="text-muted">No contacts yet.</li> : null}
          </ul>
          {canManage ? <AddContactForm clientId={client.id} /> : null}
        </Card>

        <Card className="lg:col-span-2">
          <Label>Open tasks you can see</Label>
          <ul className="mt-3 divide-y divide-surface-alt">
            {data.openTasks.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-[14px]">
                <Link href={`/tasks/${t.id}`} className="hover:text-link">
                  {t.title}
                </Link>
                <span className="flex items-center gap-2 text-muted">
                  <PriorityChip priority={t.priority} />
                  {t.assigneeName ?? 'Unassigned'}
                  {t.dueDate ? ` · ${formatDate(t.dueDate)}` : ''}
                </span>
              </li>
            ))}
            {data.openTasks.length === 0 ? <li className="py-3 text-muted">No open tasks.</li> : null}
          </ul>
        </Card>

        <CredentialsPanel
          clientId={client.id}
          credentials={data.credentials}
          canManage={canManage}
          users={users}
          tasks={data.openTasks}
        />

        <Card className="lg:col-span-2">
          <div className="flex items-center justify-between">
            <Label>Recent communications</Label>
            {me.permissions.includes('inbox.send') ? (
              <Link href={`/inbox/compose?clientId=${client.id}`} className="text-[14px] text-link">
                New message
              </Link>
            ) : null}
          </div>
          {data.communications.length ? (
            <ul className="mt-2 divide-y divide-surface-alt">
              {data.communications.map((t) => (
                <ThreadRow key={t.threadKey} t={t} timezone={me.timezone} />
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-[14px] text-muted">No messages you can see yet.</p>
          )}
          {data.billingRequests ? (
            <>
              <Label className="mt-4">Billing requests</Label>
              <ul className="mt-2 space-y-1 text-[14px]">
                {data.billingRequests.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center justify-between gap-2">
                    <Link href={`/billing/${r.id}`} className="text-link">
                      {DEPARTMENT_LABELS[r.department]} · {BILLING_REASON_LABELS[r.reason]} · {formatDate(r.createdAt)}
                    </Link>
                    <span className="font-mono text-[13px]">
                      <Masked value={r.amount === undefined ? undefined : formatMoney(r.amount, r.currency)} /> · {BILLING_STATUS_LABELS[r.status]}
                    </span>
                  </li>
                ))}
                {data.billingRequests.length === 0 ? <li className="text-muted">None yet.</li> : null}
              </ul>
            </>
          ) : null}
        </Card>
      </div>
    </>
  );
}
