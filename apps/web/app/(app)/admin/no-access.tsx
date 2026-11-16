import { Card, PageHeader } from '@opshub/ui';

export function NoAccess({ title }: { title: string }) {
  return (
    <>
      <PageHeader title={title} />
      <Card>
        <p className="font-semibold">You do not have access to this page.</p>
        <p className="mt-1 text-[15px] text-muted">
          Your roles do not include this, and the API refuses these actions for your role (403). Ask the Admin if you need it.
        </p>
      </Card>
    </>
  );
}
