'use client';
import { CONTACT_ROLE_LABELS, CONTACT_ROLES, DEPARTMENT_LABELS, DEPARTMENTS, type Department, type PackageView, type ProjectDetailView, type TeamView } from '@opshub/shared';
import { Button, inputClass, Label } from '@opshub/ui';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { send, useAction } from '@/lib/client';

export function AddContactForm({ clientId }: { clientId: string }) {
  const { run, error, busy } = useAction();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ role: 'MARKETING', name: '', email: '', phone: '' });

  async function submit(e: FormEvent) {
    e.preventDefault();
    const ok = await run(() =>
      send('POST', `/clients/${clientId}/contacts`, {
        role: form.role,
        name: form.name,
        email: form.email || null,
        phone: form.phone || null,
      }),
    );
    if (ok) {
      setForm({ role: 'MARKETING', name: '', email: '', phone: '' });
      setOpen(false);
    }
  }

  if (!open) {
    return (
      <Button variant="tertiary" className="mt-4" onClick={() => setOpen(true)}>
        Add contact
      </Button>
    );
  }
  return (
    <form onSubmit={submit} className="mt-4 grid gap-2">
      <select className={inputClass} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} aria-label="Contact role">
        {CONTACT_ROLES.map((r) => (
          <option key={r} value={r}>
            {CONTACT_ROLE_LABELS[r]}
          </option>
        ))}
      </select>
      <input className={inputClass} placeholder="Name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      <input className={inputClass} placeholder="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
      <input className={inputClass} placeholder="Phone with country code" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
      <p className="text-[12px] text-muted">Stored encrypted. Only you and the Admin see these details; everyone else sees the role label.</p>
      <div className="flex gap-2">
        <Button type="submit" disabled={busy}>
          Save contact
        </Button>
        <Button type="button" variant="tertiary" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
      {error ? <p className="text-[14px] text-error">{error}</p> : null}
    </form>
  );
}

export function StartProjectForm({ clientId, packages, teams }: { clientId: string; packages: PackageView[]; teams: TeamView[] }) {
  const router = useRouter();
  const { run, error, busy } = useAction();
  const [open, setOpen] = useState(false);
  const [department, setDepartment] = useState<Department>('SEO');
  const [packageId, setPackageId] = useState('');
  const [teamId, setTeamId] = useState('');
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState('');
  const [value, setValue] = useState('');
  const deptPackages = packages.filter((p) => p.department === department);
  const deptTeams = teams.filter((t) => t.department === department);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const created = await run(() =>
      send<ProjectDetailView>('POST', '/projects', {
        clientId,
        department,
        packageId: packageId || null,
        teamId: teamId || undefined,
        startDate,
        endDate: endDate || null,
        renewalDate: endDate || null,
        value: value || null,
      }),
    );
    if (created) router.push(`/projects/${created.id}`);
  }

  if (!open) {
    return (
      <Button className="mt-4" onClick={() => setOpen(true)}>
        Start a project
      </Button>
    );
  }
  return (
    <form onSubmit={submit} className="mt-4 grid gap-3 rounded-lg border border-border p-3 md:grid-cols-2">
      <Label className="md:col-span-2">Start a project</Label>
      <select
        className={inputClass}
        value={department}
        onChange={(e) => {
          setDepartment(e.target.value as Department);
          setPackageId('');
          setTeamId('');
        }}
        aria-label="Department"
      >
        {DEPARTMENTS.map((d) => (
          <option key={d} value={d}>
            {DEPARTMENT_LABELS[d]}
          </option>
        ))}
      </select>
      <select className={inputClass} value={packageId} onChange={(e) => setPackageId(e.target.value)} aria-label="Package">
        <option value="">No package</option>
        {deptPackages.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      <select className={inputClass} value={teamId} onChange={(e) => setTeamId(e.target.value)} aria-label="Team">
        <option value="">Default team</option>
        {deptTeams.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
      <label className="text-[13px] text-muted">
        Start date
        <input className={inputClass} type="date" required value={startDate} onChange={(e) => setStartDate(e.target.value)} />
      </label>
      <label className="text-[13px] text-muted">
        End or renewal date (retainers and AMC)
        <input className={inputClass} type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
      </label>
      <label className="text-[13px] text-muted">
        Project value (INR, PM and Admin only)
        <input className={inputClass} inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} />
      </label>
      <div className="flex items-center gap-2 md:col-span-2">
        <Button type="submit" disabled={busy}>
          Create project
        </Button>
        <Button type="button" variant="tertiary" onClick={() => setOpen(false)}>
          Cancel
        </Button>
        {error ? <p className="text-[14px] text-error">{error}</p> : null}
      </div>
    </form>
  );
}
