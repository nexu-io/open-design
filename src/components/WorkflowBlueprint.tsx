import type { ProjectMetadata } from '../types';
import { Icon } from './Icon';

interface Props {
  metadata?: ProjectMetadata;
}

export function WorkflowBlueprint({ metadata }: Props) {
  if (!metadata?.workflowTitle) return null;

  const exportFormats =
    metadata.workflowExportPackage?.map((item) => item.format)
    ?? metadata.workflowExports
    ?? [];
  const primaryHandoff = metadata.workflowHandoff;

  return (
    <section className="project-blueprint" aria-label="Reusable workflow blueprint">
      <div className="project-blueprint-title">
        <Icon name="history" size={13} />
        <span>Reusable blueprint</span>
        <strong>{metadata.workflowTitle}</strong>
      </div>
      <BlueprintGroup label="Gates" items={metadata.workflowCheckpoints} />
      <BlueprintGroup label="Exports" items={exportFormats} />
      <BlueprintGroup label="Scorecard" items={metadata.workflowScorecard} />
      {primaryHandoff ? (
        <BlueprintGroup
          label={primaryHandoff.system}
          items={[
            ...primaryHandoff.stages.slice(0, 3),
            ...(primaryHandoff.commands ?? []).slice(0, 2),
          ]}
        />
      ) : null}
    </section>
  );
}

function BlueprintGroup({
  label,
  items,
}: {
  label: string;
  items?: string[];
}) {
  if (!items || items.length === 0) return null;
  return (
    <div className="project-blueprint-group">
      <span>{label}</span>
      <div>
        {items.slice(0, 4).map((item) => (
          <small key={item}>{item}</small>
        ))}
        {items.length > 4 ? <small>+{items.length - 4}</small> : null}
      </div>
    </div>
  );
}
