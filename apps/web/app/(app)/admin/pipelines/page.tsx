import { DEPARTMENT_LABELS, type MeView, type PipelineView } from '@opshub/shared';
import { PageHeader } from '@opshub/ui';
import { api } from '@/lib/api';
import { NoAccess } from '../no-access';
import { PipelineEditor } from './pipeline-editor';

export default async function PipelinesPage() {
  const me = await api<MeView>('/me');
  if (!me.permissions.includes('pipeline.manage')) return <NoAccess title="Pipelines" />;
  const pipelines = await api<PipelineView[]>('/pipelines');
  return (
    <>
      <PageHeader
        title="Pipelines"
        description="One pipeline per department. Saving creates a new version: new projects use it, live projects keep the version they started on. Stage names must not contain a person's name; assign people to tasks instead."
      />
      <div className="space-y-4">
        {pipelines.map((p) => (
          <PipelineEditor key={p.id} pipeline={p} title={DEPARTMENT_LABELS[p.department]} />
        ))}
      </div>
    </>
  );
}
