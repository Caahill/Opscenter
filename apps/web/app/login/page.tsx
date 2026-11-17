import { Card, Chip, Label } from '@opshub/ui';
import type { DevUserView } from '@opshub/shared';
import { isDevAuth } from '@/lib/api';
import { gateHeaders } from '@/lib/staging-gate';
import { DevLogin } from './dev-login';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

const ERRORS: Record<string, string> = {
  not_invited: 'Your Google account is not on the Ops Hub user list. Ask the Admin to invite you.',
  domain_not_allowed: 'Sign in with your SySpree Google Workspace account.',
  email_unverified: 'Your Google email address is not verified.',
  state_mismatch: 'The sign-in link expired. Please try again.',
  token_invalid: 'Google sign-in failed. Please try again.',
};

async function devUsers(): Promise<DevUserView[]> {
  const res = await fetch(`${API_URL}/api/v1/auth/dev/users`, { cache: 'no-store', headers: gateHeaders() }).catch(() => null);
  return res?.ok ? ((await res.json()) as DevUserView[]) : [];
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const dev = isDevAuth();
  const users = dev ? await devUsers() : [];

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-4 py-12">
      <p className="font-mono text-[13px] text-muted">SySpree Digital</p>
      <h1 className="mt-1 font-display text-[34px] font-[650] leading-tight tracking-[-0.035em]">Ops Hub</h1>
      <p className="mt-2 text-muted">Client delivery, inbox, capacity and billing in one place.</p>

      {error ? (
        <p role="alert" className="mt-6 rounded-lg border border-error/40 bg-[#fdecec] px-4 py-3 text-[15px] text-[#9b1c20]">
          {ERRORS[error] ?? 'Sign-in failed. Please try again.'}
        </p>
      ) : null}

      <Card className="mt-8">
        {dev ? (
          <>
            <div className="flex items-center justify-between">
              <Label>Developer sign-in</Label>
              <Chip tone="warning">AUTH_MODE=dev</Chip>
            </div>
            <p className="mt-2 text-[15px] text-muted">
              Pick a seed user to see Ops Hub as that role. Only available on local, test and staging setups.
            </p>
            {users.length > 0 ? (
              <DevLogin users={users} />
            ) : (
              <p className="mt-4 text-[15px]">
                No users found. Is the API running on {API_URL}, and have you run <code className="font-mono">pnpm db:seed</code>?
              </p>
            )}
          </>
        ) : (
          <a
            href="/api/v1/auth/google"
            className="flex min-h-11 items-center justify-center rounded-xl bg-primary px-[18px] py-3 text-button font-extrabold text-on-primary hover:bg-deep-panel"
          >
            Sign in with Google
          </a>
        )}
      </Card>
    </main>
  );
}
