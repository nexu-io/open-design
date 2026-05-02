import { useMemo, useState } from 'react';
import type { ProjectMetadata } from '../types';
import { saveWorkflowBlueprint } from '../state/blueprints';
import { Icon } from './Icon';

interface Props {
  metadata?: ProjectMetadata;
  skillId?: string | null;
  designSystemId?: string | null;
}

export function WorkflowBlueprint({ metadata, skillId = null, designSystemId = null }: Props) {
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  const reusablePrompt = useMemo(
    () => (metadata ? buildReusableBlueprintPrompt(metadata) : ''),
    [metadata],
  );

  if (!metadata?.workflowTitle) return null;

  const exportItems = summarizeExportItems(metadata);
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
      <button
        type="button"
        className="project-blueprint-copy"
        onClick={() => {
          if (!metadata || !reusablePrompt) return;
          saveWorkflowBlueprint({
            metadata,
            prompt: reusablePrompt,
            skillId,
            designSystemId,
          });
          setSaved(true);
          window.setTimeout(() => setSaved(false), 1400);
        }}
      >
        <Icon name="plus" size={12} />
        {saved ? 'Saved' : 'Save blueprint'}
      </button>
      <BlueprintGroup label="Gates" items={metadata.workflowCheckpoints} />
      <BlueprintGroup label="Exports" items={exportItems} />
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

function summarizeExportItems(metadata: ProjectMetadata): string[] {
  if (!metadata.workflowExportPackage || metadata.workflowExportPackage.length === 0) {
    return metadata.workflowExports ?? [];
  }
  const formatCounts = new Map<string, number>();
  for (const item of metadata.workflowExportPackage) {
    formatCounts.set(item.format, (formatCounts.get(item.format) ?? 0) + 1);
  }
  return metadata.workflowExportPackage.map((item) => (
    (formatCounts.get(item.format) ?? 0) > 1
      ? `${item.format}: ${item.artifact}`
      : item.format
  ));
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
        {items.slice(0, 4).map((item, index) => (
          <small key={`${label}-${index}-${item}`}>{item}</small>
        ))}
        {items.length > 4 ? <small>+{items.length - 4}</small> : null}
      </div>
    </div>
  );
}
