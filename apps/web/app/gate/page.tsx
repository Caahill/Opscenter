import { Button, Card, Label, inputClass } from '@opshub/ui';
import { notFound } from 'next/navigation';
import { isStaging, safeNext } from '@/lib/staging-gate';

export default async function GatePage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  if (!isStaging()) notFound();
  const { next, error } = await searchParams;
  return (
    <main className="mx-auto flex min-h-[80vh] max-w-xl flex-col justify-center px-4 py-12">
      <p className="font-mono text-[13px] text-muted">SySpree Digital</p>
      <h1 className="mt-1 font-display text-[34px] font-[650] leading-tight tracking-[-0.035em]">Ops Hub staging</h1>
      <p className="mt-2 text-muted">This is the test site with demo data. Enter the staging password to continue.</p>
      {error ? (
        <p role="alert" className="mt-6 rounded-lg border border-error/40 bg-[#fdecec] px-4 py-3 text-[15px] text-[#9b1c20]">
          That password is not right. Try again.
        </p>
      ) : null}
      <Card className="mt-8">
        <form method="post" action="/gate/unlock">
          <input type="hidden" name="next" value={safeNext(next)} />
          <label htmlFor="staging-password">
            <Label>Staging password</Label>
          </label>
          <input id="staging-password" name="password" type="password" autoComplete="current-password" required autoFocus className={`${inputClass} mt-2`} />
          <Button type="submit" className="mt-4 w-full rounded-xl px-[18px]">
            Continue
          </Button>
        </form>
      </Card>
    </main>
  );
}
