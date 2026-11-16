import { DEPARTMENT_LABELS, type MeView, type PackageView, type PipelineView } from '@opshub/shared';
import { PageHeader } from '@opshub/ui';
import { api } from '@/lib/api';
import { NoAccess } from '../no-access';
import { NewPackage, PackageEditor } from './package-editor';

export default async function PackagesPage() {
  const me = await api<MeView>('/me');
  if (!me.permissions.includes('pipeline.manage')) return <NoAccess title="Packages" />;
  const [packages, pipelines] = await Promise.all([api<PackageView[]>('/packages?all=true'), api<PipelineView[]>('/pipelines')]);
  const stagesByDept = Object.fromEntries(pipelines.map((p) => [p.department, p.stages.map((s) => s.name)]));

  return (
    <>
      <PageHeader
        title="Packages"
        description="Setup tasks are created when a project starts from the package. Monthly tasks are created on each retainer's cycle day. Changes apply from the next project or cycle."
      />
      <NewPackage />
      <div className="space-y-4">
        {packages.map((p) => (
          <PackageEditor key={p.id} pkg={p} department={DEPARTMENT_LABELS[p.department]} stages={stagesByDept[p.department] ?? []} />
        ))}
      </div>
    </>
  );
}
