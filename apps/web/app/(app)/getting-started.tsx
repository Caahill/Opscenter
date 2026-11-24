'use client';
import { Button, Card, Label } from '@opshub/ui';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { Tip } from '@/lib/guide';

const KEY = 'opshub.gettingStarted.hidden';

/**
 * First steps on Home, per role. Hiding it is remembered in this browser only; Help and tips
 * (in the sidebar) always shows the full list again.
 */
export function GettingStarted({ name, tips }: { name: string; tips: Tip[] }) {
  // Start hidden until we have read the browser setting, so it never flashes for people who closed it.
  const [hidden, setHidden] = useState(true);
  useEffect(() => {
    try {
      setHidden(window.localStorage.getItem(KEY) === '1');
    } catch {
      setHidden(false);
    }
  }, []);

  if (hidden || tips.length === 0) return null;

  function hide() {
    setHidden(true);
    try {
      window.localStorage.setItem(KEY, '1');
    } catch {
      // Private windows may block storage; it simply shows again next time.
    }
  }

  return (
    <Card className="mb-8 border-pale-purple bg-gradient-to-br from-canvas to-pale-purple/40" aria-labelledby="getting-started">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Label>Getting started</Label>
          <h2 id="getting-started" className="mt-1 font-display text-[19px] font-[650] tracking-[-0.02em]">
            {name}, here’s how to get the most out of Ops Hub
          </h2>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={hide} className="text-muted">
          Hide tips
        </Button>
      </div>
      <ol className="mt-4 grid gap-2 sm:grid-cols-2">
        {tips.slice(0, 6).map((t, i) => (
          <li key={t.text}>
            <Link href={t.href} className="flex h-full gap-3 rounded-lg border border-border bg-canvas p-3 text-[14.5px] hover:border-accent">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-pale-purple text-[12px] font-bold text-accent-pressed">{i + 1}</span>
              <span>{t.text}</span>
            </Link>
          </li>
        ))}
      </ol>
      <p className="mt-4 text-[13px] text-muted">
        You can find these again any time under{' '}
        <Link href="/help" className="text-link hover:underline">
          Help and tips
        </Link>
        .
      </p>
    </Card>
  );
}
