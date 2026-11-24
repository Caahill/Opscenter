'use client';
import { ROLE_LABELS, type MeView, type NotificationView } from '@opshub/shared';
import {
  Button,
  buttonVariants,
  Chip,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Tooltip,
  TooltipProvider,
} from '@opshub/ui';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { send } from '@/lib/client';
import { Icon, type IconName } from '@/lib/icons';
import { LiveRefresh, useRealtime } from '@/lib/realtime';

interface NavItem {
  href: string;
  label: string;
  icon: IconName;
  /** Shown only if /me lists this permission. Navigation only; the API still enforces access. */
  needs?: string;
}

interface NavGroup {
  title?: string;
  items: NavItem[];
}

/** Grouped by what people do: their own day, delivery work, then clients and money. */
const GROUPS: NavGroup[] = [
  {
    items: [
      { href: '/', label: 'Home', icon: 'home' },
      { href: '/my-tasks', label: 'My tasks', icon: 'tasks', needs: 'task.read' },
      { href: '/chat', label: 'Chat', icon: 'chat' },
    ],
  },
  {
    title: 'Work',
    items: [
      { href: '/boards', label: 'Boards', icon: 'boards', needs: 'project.read' },
      { href: '/planner', label: 'Planner', icon: 'planner', needs: 'planner.read' },
      { href: '/capacity', label: 'Capacity', icon: 'capacity', needs: 'capacity.read' },
      { href: '/leave', label: 'Leave', icon: 'leave', needs: 'leave.read' },
    ],
  },
  {
    title: 'Clients',
    items: [
      { href: '/clients', label: 'Clients', icon: 'clients', needs: 'client.read' },
      { href: '/inbox', label: 'Inbox', icon: 'inbox', needs: 'inbox.read' },
      { href: '/billing', label: 'Billing', icon: 'billing', needs: 'renewal.read' },
      { href: '/search', label: 'Search', icon: 'search', needs: 'client.read' },
    ],
  },
];
const ADMIN: NavItem[] = [
  { href: '/admin/users', label: 'Users', icon: 'users', needs: 'user.manage' },
  { href: '/admin/teams', label: 'Teams', icon: 'teams', needs: 'team.manage' },
  { href: '/admin/pipelines', label: 'Pipelines', icon: 'pipelines', needs: 'pipeline.manage' },
  { href: '/admin/packages', label: 'Packages', icon: 'packages', needs: 'pipeline.manage' },
  { href: '/admin/mailboxes', label: 'Mailboxes', icon: 'mail', needs: 'mailbox.manage' },
  { href: '/admin/audit', label: 'Audit log', icon: 'audit', needs: 'audit.read' },
];

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('');

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
        aria-current={active ? 'page' : undefined}
        className={`flex min-h-9 items-center gap-2.5 rounded-md px-3 text-[14.5px] transition-colors ${
          active ? 'bg-surface-alt font-semibold text-body' : 'text-muted hover:bg-surface hover:text-body'
        }`}
      >
        <Icon name={i.icon} className={active ? 'text-accent' : undefined} />
        <span className="flex-1">{i.label}</span>
        {count ? (
          <span className="rounded-full bg-accent px-2 text-[12px] font-semibold text-on-primary" aria-label={`${count} unread`}>
            {count}
          </span>
        ) : null}
      </Link>
    );
  };

  const heading = (title: string) => <p className="mt-5 mb-1 px-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">{title}</p>;

  const nav = (
    <nav className="flex flex-col gap-0.5" aria-label="Main">
      {GROUPS.map((g, gi) => {
        const items = g.items.filter(allowed);
        if (items.length === 0) return null;
        return (
          <div key={g.title ?? gi} className="flex flex-col gap-0.5">
            {g.title ? heading(g.title) : null}
            {items.map(link)}
          </div>
        );
      })}
      {admin.length > 0 ? (
        <>
          {heading('Admin')}
          {admin.map(link)}
        </>
      ) : null}
      {heading('You')}
      {link({ href: '/settings/notifications', label: 'Notification settings', icon: 'settings' })}
      {link({ href: '/help', label: 'Help and tips', icon: 'help' })}
      {devAuth ? link({ href: '/preview', label: 'Privacy preview', icon: 'eye' }) : null}
    </nav>
  );

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[248px_1fr]">
      <aside className="hidden border-r border-border bg-canvas px-3 py-5 lg:sticky lg:top-0 lg:block lg:h-screen lg:overflow-y-auto">
        <Link href="/" className="flex items-center gap-2.5 px-3">
          <span aria-hidden className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary font-display text-[13px] font-bold text-on-primary">
            OH
          </span>
          <span>
            <span className="block font-display text-[17px] font-[650] leading-tight tracking-[-0.03em]">Ops Hub</span>
            <span className="block text-[11.5px] text-muted">SySpree Digital</span>
          </span>
        </Link>
        <div className="mt-6">{nav}</div>
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-border bg-canvas/95 px-4 py-3 backdrop-blur lg:px-8">
          <Button
            variant="ghost"
            size="icon"
            type="button"
            className="rounded-full lg:hidden"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label={open ? 'Close menu' : 'Open menu'}
          >
            <Icon name="menu" size={19} />
          </Button>
          <div className="hidden lg:block" />
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            {devAuth ? (
              <Chip tone="warning" title="Demo sign-in: anyone with the site password can pick any user">
                Demo
              </Chip>
            ) : null}
            <TooltipProvider>
              <Tooltip label={unread ? `Alerts (${unread} unread)` : 'Alerts'}>
                <Link
                  href="/notifications"
                  aria-label={unread ? `Alerts, ${unread} unread` : 'Alerts'}
                  className={cn(buttonVariants({ variant: 'ghost', size: 'icon' }), 'relative rounded-full')}
                >
                  <Icon name="bell" size={19} />
                  {unread ? (
                    <span className="absolute -top-0.5 -right-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-error px-1 text-[10.5px] font-semibold text-white ring-2 ring-canvas">
                      {unread > 99 ? '99+' : unread}
                    </span>
                  ) : null}
                </Link>
              </Tooltip>

              <DropdownMenu>
                <Tooltip label={me.name}>
                  <DropdownMenuTrigger
                    aria-label={`Your profile: ${me.name}`}
                    className="flex size-9 items-center justify-center rounded-full bg-primary text-[13px] font-semibold text-on-primary outline-none ring-offset-2 ring-offset-canvas hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:ring-2 data-[state=open]:ring-ring"
                  >
                    {initials(me.name)}
                  </DropdownMenuTrigger>
                </Tooltip>
                <DropdownMenuContent align="end" className="w-60">
                  <DropdownMenuLabel className="flex items-center gap-3">
                    <span aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-full bg-surface-alt text-[13px] font-semibold">
                      {initials(me.name)}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">{me.name}</span>
                      <span className="block truncate text-xs font-normal text-muted">
                        {me.roles.map((r) => ROLE_LABELS[r]).join(' + ')}
                        {me.teamName ? ` · ${me.teamName}` : ''}
                      </span>
                    </span>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => router.push('/settings/notifications')}>
                    <Icon name="settings" size={16} />
                    Notification settings
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => router.push('/help')}>
                    <Icon name="help" size={16} />
                    Help and tips
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem destructive onSelect={() => void logout()}>
                    <Icon name="logout" size={16} />
                    Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <Tooltip label="Sign out">
                <Button variant="ghost" size="icon" type="button" onClick={logout} aria-label="Sign out" className="rounded-full">
                  <Icon name="logout" size={19} />
                </Button>
              </Tooltip>
            </TooltipProvider>
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
