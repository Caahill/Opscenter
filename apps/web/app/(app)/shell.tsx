'use client';
import { ROLE_LABELS, type MeView, type NotificationView } from '@opshub/shared';
import { Chip } from '@opshub/ui';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { send } from '@/lib/client';
import { LiveRefresh, useRealtime } from '@/lib/realtime';

interface NavItem {
  href: string;
  label: string;
  /** Shown only if /me lists this permission. Navigation only; the API still enforces access. */
  needs?: string;
}

const LIVE: NavItem[] = [
  { href: '/', label: 'Home' },
  { href: '/my-tasks', label: 'My tasks', needs: 'task.read' },
  { href: '/chat', label: 'Chat' },
  { href: '/boards', label: 'Boards', needs: 'project.read' },
  { href: '/inbox', label: 'Inbox', needs: 'inbox.read' },
  { href: '/clients', label: 'Clients', needs: 'client.read' },
  { href: '/billing', label: 'Billing', needs: 'renewal.read' },
  { href: '/planner', label: 'Planner', needs: 'planner.read' },
  { href: '/capacity', label: 'Capacity', needs: 'capacity.read' },
  { href: '/leave', label: 'Leave', needs: 'leave.read' },
  { href: '/search', label: 'Search', needs: 'client.read' },
];
const ADMIN: NavItem[] = [
  { href: '/admin/users', label: 'Users', needs: 'user.manage' },
  { href: '/admin/teams', label: 'Teams', needs: 'team.manage' },
  { href: '/admin/pipelines', label: 'Pipelines', needs: 'pipeline.manage' },
  { href: '/admin/packages', label: 'Packages', needs: 'pipeline.manage' },
  { href: '/admin/mailboxes', label: 'Mailboxes', needs: 'mailbox.manage' },
  { href: '/admin/audit', label: 'Audit log', needs: 'audit.read' },
];

export function Shell({ me, devAuth, unread, chatUnread, children }: { me: MeView; devAuth: boolean; unread: number; chatUnread: number; children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState<NotificationView | null>(null);
  // A new alert shows briefly in the corner; the counts refresh through LiveRefresh below.
  useRealtime('notification.new', (n) => setToast(n as NotificationView));
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(t);
  }, [toast]);
  const allowed = (i: NavItem) => !i.needs || me.permissions.includes(i.needs);
  const admin = ADMIN.filter(allowed);

  async function logout() {
    await send('POST', '/auth/logout').catch(() => null);
    router.push('/login');
    router.refresh();
  }

  const link = (i: NavItem) => {
    const active = i.href === '/' ? pathname === '/' : pathname.startsWith(i.href);
    const count = i.href === '/chat' ? chatUnread : 0;
    return (
      <Link
        key={i.href}
        href={i.href}
        onClick={() => setOpen(false)}
        className={`flex min-h-10 items-center gap-2 rounded-md px-3 text-[15px] ${
          active ? 'bg-surface-alt font-semibold text-body' : 'text-muted hover:text-body'
        }`}
      >
        <span className="flex-1">{i.label}</span>
        {count ? (
          <span className="rounded-full bg-accent px-2 font-mono text-[12px] text-on-primary" aria-label={`${count} unread`}>
            {count}
          </span>
        ) : null}
      </Link>
    );
  };

  const nav = (
    <nav className="flex flex-col gap-1">
      {LIVE.filter(allowed).map(link)}
      {devAuth ? link({ href: '/preview', label: 'Policy preview' }) : null}
      {admin.length > 0 ? (
        <>
          <p className="mt-5 mb-1 px-3 font-mono text-[12px] uppercase text-muted">Admin</p>
          {admin.map(link)}
        </>
      ) : null}
      <p className="mt-5 mb-1 px-3 font-mono text-[12px] uppercase text-muted">You</p>
      {link({ href: '/settings/notifications', label: 'Notification settings' })}
    </nav>
  );

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[248px_1fr]">
      <aside className="hidden border-r border-border bg-canvas px-3 py-5 lg:block">
        <p className="px-3 font-display text-[20px] font-[650] tracking-[-0.035em]">Ops Hub</p>
        <div className="mt-6">{nav}</div>
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-border bg-canvas/95 px-4 py-3 backdrop-blur lg:px-8">
          <button
            type="button"
            className="min-h-10 rounded-md border border-border px-3 text-[14px] lg:hidden"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
          >
            Menu
          </button>
          <div className="hidden lg:block" />
          <div className="flex min-w-0 items-center gap-3">
            <div className="min-w-0 text-right">
              <p className="truncate text-[15px] font-semibold">{me.name}</p>
              <p className="truncate font-mono text-[12px] text-muted">
                {me.roles.map((r) => ROLE_LABELS[r]).join(' + ')}
                {me.teamName ? ` · ${me.teamName}` : ''}
              </p>
            </div>
            {devAuth ? <Chip tone="warning">dev</Chip> : null}
            <Link
              href="/notifications"
              aria-label={unread ? `Alerts, ${unread} unread` : 'Alerts'}
              className="inline-flex min-h-10 items-center gap-2 rounded-md border border-border px-3 text-[14px] hover:border-border-strong"
            >
              Alerts
              {unread ? <span className="rounded-full bg-accent px-2 font-mono text-[12px] text-on-primary">{unread}</span> : null}
            </Link>
            <button type="button" onClick={logout} className="min-h-10 rounded-md border border-border px-3 text-[14px] hover:border-border-strong">
              Sign out
            </button>
          </div>
        </header>
        {open ? <div className="border-b border-border bg-canvas px-3 py-4 lg:hidden">{nav}</div> : null}
        <main className="mx-auto max-w-[1160px] px-4 py-8 lg:px-8">{children}</main>
      </div>
      <LiveRefresh events={['notification.new', 'chat.message_new']} />
      {toast ? (
        <div role="status" className="fixed right-4 bottom-4 z-20 w-[min(360px,calc(100vw-32px))] rounded-lg border border-border bg-canvas p-4 shadow-lg" data-testid="toast">
          <Link href={toast.link ?? '/notifications'} onClick={() => setToast(null)} className="block font-semibold hover:text-link">
            {toast.title}
          </Link>
          {toast.body ? <p className="mt-1 text-[14px] text-muted">{toast.body}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
