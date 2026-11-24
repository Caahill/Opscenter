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
      <div className="flex items-center gap-3">
        <span aria-hidden className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary font-display text-[16px] font-bold text-on-primary">
          OH
        </span>
        <div>
          <h1 className="font-display text-[30px] font-[650] leading-tight tracking-[-0.035em]">Ops Hub</h1>
          <p className="text-[13px] text-muted">SySpree Digital</p>
        </div>
      </div>
      <p className="mt-4 text-muted">Projects, client messages, team capacity and billing, all in one place.</p>

      {error ? (
        <p role="alert" className="mt-6 rounded-lg border border-error/40 bg-[#fdecec] px-4 py-3 text-[15px] text-[#9b1c20]">
          {ERRORS[error] ?? 'Sign-in failed. Please try again.'}
        </p>
      ) : null}

      <Card className="mt-8">
        {dev ? (
          <>
            <div className="flex items-center justify-between">
              <Label>Choose your name to sign in</Label>
              <Chip tone="warning">Demo</Chip>
            </div>
            <p className="mt-2 text-[15px] text-muted">
              This is the demo version with practice data. Please pick only the name you were given, and don’t enter real client details.
            </p>
            {users.length > 0 ? (
              <DevLogin users={users} />
            ) : (
              <p className="mt-4 text-[15px]">
                No users are available right now. Please try again in a minute, or tell the Ops Hub admin.
                <span className="mt-1 block text-[13px] text-muted">
                  (For developers: is the API running on {API_URL}, and has <code className="font-mono">pnpm db:seed</code> run?)
                </span>
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
