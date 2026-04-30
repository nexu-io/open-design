import { useMemo, useState } from 'react';
import type { ProjectMetadata } from '../types';
import { Icon } from './Icon';

interface Props {
  metadata?: ProjectMetadata;
}

export function WorkflowBlueprint({ metadata }: Props) {
  const [copied, setCopied] = useState(false);
  const reusablePrompt = useMemo(
    () => (metadata ? buildReusableBlueprintPrompt(metadata) : ''),
    [metadata],
  );

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
      <button
        type="button"
        className="project-blueprint-copy"
        onClick={() => {
          if (!reusablePrompt) return;
          void navigator.clipboard?.writeText(reusablePrompt).then(() => {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1400);
          });
        }}
      >
        <Icon name="copy" size={12} />
        {copied ? 'Copied' : 'Copy prompt'}
      </button>
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

export function buildReusableBlueprintPrompt(metadata: ProjectMetadata): string {
  const lines: string[] = [];
  lines.push(`Use the OneShot workflow blueprint: ${metadata.workflowTitle ?? 'Untitled workflow'}.`);
  if (metadata.workflowCategory || metadata.workflowOutcome) {
    lines.push(
      `Workflow context: ${[metadata.workflowCategory, metadata.workflowOutcome].filter(Boolean).join(' - ')}.`,
    );
  }
  appendList(lines, 'Production gates', metadata.workflowCheckpoints);
  appendList(lines, 'Export package', metadata.workflowExportPackage?.map(
    (item) => `${item.format}: ${item.artifact} - ${item.instructions}`,
  ) ?? metadata.workflowExports);
  appendList(lines, 'Critique scorecard', metadata.workflowScorecard);
  if (metadata.workflowHandoff) {
    lines.push(`Handoff system: ${metadata.workflowHandoff.system}.`);
    appendList(lines, 'Handoff stages', metadata.workflowHandoff.stages);
    appendList(lines, 'Handoff artifacts', metadata.workflowHandoff.artifacts);
    appendList(lines, 'Handoff commands', metadata.workflowHandoff.commands);
  }
  lines.push('Start by locking the brief, then produce the artifact, critique it against the scorecard, and prepare the requested handoff/export content.');
  return lines.join('\n');
}

function appendList(lines: string[], label: string, items?: string[]) {
  if (!items || items.length === 0) return;
  lines.push(`${label}:`);
  for (const item of items) {
    lines.push(`- ${item}`);
  }
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
