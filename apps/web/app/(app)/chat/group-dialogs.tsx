'use client';
// Group chats: create one with a name and colleagues, then rename it, add people or leave it.
// Access is membership only (chat.service); this file is just the shadcn UI around those calls.
import type { ChatChannelView } from '@opshub/shared';
import {
  Button,
  buttonVariants,
  Checkbox,
  ConfirmButton,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  FieldLabel,
  Input,
} from '@opshub/ui';
import { useRouter } from 'next/navigation';
import { useMemo, useState, type FormEvent } from 'react';
import { send, useAction } from '@/lib/client';

export interface Colleague {
  id: string;
  name: string;
  hint?: string;
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('');

function Avatar({ name }: { name: string }) {
  return (
    <span aria-hidden className="flex size-7 shrink-0 items-center justify-center rounded-full bg-surface-alt text-[11px] font-semibold">
      {initials(name)}
    </span>
  );
}

/** A searchable list of colleagues with checkboxes. */
function PeoplePicker({ people, chosen, onToggle }: { people: Colleague[]; chosen: string[]; onToggle: (id: string, on: boolean) => void }) {
  const [q, setQ] = useState('');
  const shown = useMemo(() => people.filter((p) => p.name.toLowerCase().includes(q.trim().toLowerCase())), [people, q]);
  return (
    <div className="grid gap-2">
      <Input placeholder="Search people" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search people" />
      <ul className="max-h-60 overflow-y-auto rounded-md border border-border" aria-label="People">
        {shown.map((p) => (
          <li key={p.id}>
            <label className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-surface">
              <Checkbox checked={chosen.includes(p.id)} onCheckedChange={(v) => onToggle(p.id, v === true)} aria-label={p.name} />
              <Avatar name={p.name} />
              <span className="min-w-0 flex-1 truncate text-sm">{p.name}</span>
              {p.hint ? <span className="text-xs text-muted">{p.hint}</span> : null}
            </label>
          </li>
        ))}
        {shown.length === 0 ? <li className="px-3 py-4 text-center text-sm text-muted">Nobody matches “{q}”.</li> : null}
      </ul>
    </div>
  );
}

const toggle = (list: string[], id: string, on: boolean) => (on ? [...new Set([...list, id])] : list.filter((x) => x !== id));

export function NewGroupDialog({ colleagues }: { colleagues: Colleague[] }) {
  const router = useRouter();
  const { run, error, busy, setError } = useAction();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [chosen, setChosen] = useState<string[]>([]);

  async function create(e: FormEvent) {
    e.preventDefault();
    const group = await run(() => send<ChatChannelView>('POST', '/chat/groups', { name: name.trim(), memberIds: chosen }));
    if (group) {
      setOpen(false);
      setName('');
      setChosen([]);
      router.push(`/chat/${group.id}`);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) setError(null);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            <path d="M12 5v14M5 12h14" />
          </svg>
          New group
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New group</DialogTitle>
          <DialogDescription>Only the people you add can see the group. Client numbers, emails and logins are hidden when sent.</DialogDescription>
        </DialogHeader>
        <form onSubmit={create} className="grid gap-4" aria-label="New group">
          <div className="grid gap-2">
            <FieldLabel htmlFor="group-name">Group name</FieldLabel>
            <Input id="group-name" required maxLength={60} placeholder="e.g. Diwali campaign" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <FieldLabel>
              Members <span className="font-normal text-muted">· {chosen.length} chosen</span>
            </FieldLabel>
            <PeoplePicker people={colleagues} chosen={chosen} onToggle={(id, on) => setChosen((c) => toggle(c, id, on))} />
          </div>
          {error ? <p className="text-sm text-error">{error}</p> : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !name.trim() || chosen.length === 0}>
              {busy ? 'Creating…' : 'Create group'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Rename, see members, add people and leave: everything a group member can do. */
export function GroupSettings({ channel, colleagues, meId }: { channel: ChatChannelView; colleagues: Colleague[]; meId: string }) {
  const router = useRouter();
  const { run, error, busy, setError } = useAction();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(channel.name);
  const [adding, setAdding] = useState<string[]>([]);
  const memberIds = channel.memberIds ?? [];
  const byId = new Map(colleagues.map((c) => [c.id, c.name]));
  const members = memberIds.map((id) => ({ id, name: id === meId ? 'You' : (byId.get(id) ?? 'Former colleague') })).sort((a, b) => (a.id === meId ? -1 : b.id === meId ? 1 : a.name.localeCompare(b.name)));
  const others = colleagues.filter((c) => !memberIds.includes(c.id) && c.id !== meId);

  async function rename(e: FormEvent) {
    e.preventDefault();
    if (name.trim() && name.trim() !== channel.name) await run(() => send('PATCH', `/chat/channels/${channel.id}`, { name: name.trim() }));
  }

  async function add() {
    if (adding.length && (await run(() => send('POST', `/chat/channels/${channel.id}/members`, { userIds: adding })))) setAdding([]);
  }

  async function leave() {
    if (await run(() => send('DELETE', `/chat/channels/${channel.id}/members/me`))) router.push('/chat');
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) setError(null);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
            <circle cx="9" cy="9" r="3.2" />
            <path d="M3.5 19c.6-3 2.8-4.5 5.5-4.5s4.9 1.5 5.5 4.5M15.5 6.2a3 3 0 0 1 0 5.6M17.5 14.8c1.6.6 2.6 2 3 4.2" />
          </svg>
          Members ({memberIds.length})
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Group settings</DialogTitle>
          <DialogDescription>Everyone in the group can rename it and add people.</DialogDescription>
        </DialogHeader>

        <form onSubmit={rename} className="grid gap-2" aria-label="Rename group">
          <FieldLabel htmlFor="group-rename">Group name</FieldLabel>
          <div className="flex gap-2">
            <Input id="group-rename" required maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
            <Button type="submit" variant="outline" disabled={busy || !name.trim() || name.trim() === channel.name}>
              Save
            </Button>
          </div>
        </form>

        <div className="grid gap-2">
          <FieldLabel>Members · {memberIds.length}</FieldLabel>
          <ul className="max-h-44 overflow-y-auto rounded-md border border-border">
            {members.map((m) => (
              <li key={m.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                <Avatar name={m.name === 'You' ? (byId.get(meId) ?? 'You') : m.name} />
                <span className="flex-1">{m.name}</span>
              </li>
            ))}
          </ul>
        </div>

        {others.length ? (
          <div className="grid gap-2">
            <FieldLabel>
              Add people <span className="font-normal text-muted">· {adding.length} chosen</span>
            </FieldLabel>
            <PeoplePicker people={others} chosen={adding} onToggle={(id, on) => setAdding((c) => toggle(c, id, on))} />
            <Button type="button" variant="secondary" onClick={add} disabled={busy || adding.length === 0}>
              {adding.length ? `Add ${adding.length} ${adding.length === 1 ? 'person' : 'people'}` : 'Add people'}
            </Button>
          </div>
        ) : null}

        {error ? <p className="text-sm text-error">{error}</p> : null}

        <DialogFooter className="sm:justify-between">
          <ConfirmButton
            className={buttonVariants({ variant: 'danger' })}
            trigger="Leave group"
            title={`Leave "${channel.name}"?`}
            description="You will stop seeing this group and its messages. Someone in it can add you back."
            confirmLabel="Leave group"
            destructive
            onConfirm={leave}
          />
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
