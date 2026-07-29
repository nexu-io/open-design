/**
 * "Files this turn" disclosure pinned to the top of an assistant message.
 *
 * The first four files stay visible so artifacts are presented as results,
 * not hidden inside execution history. Every result set keeps the same framed
 * surface so even a single artifact reads as a primary deliverable. A single
 * artifact is still rendered as one direct row without a redundant group
 * header; larger batches collapse only the rows after the fourth. Openable
 * artifacts use the whole row as the target instead of repeating an Open
 * button on every line.
 *
 * The component is read-only over `events` — derivation lives in
 * `runtime/file-ops.ts` so the same logic is reachable from tests and
 * future surfaces (sidebar, log export, etc.) without coupling to
 * AssistantMessage's render shape.
 */
import { useState } from 'react';
import { useT } from '../i18n';
import type { Dict } from '../i18n/types';
import {
  countFileOps,
  type FileOpEntry,
  type FileOpKind,
} from '../runtime/file-ops';
import { Icon, type IconName } from './Icon';

interface Props {
  entries: FileOpEntry[];
  /** Names that exist in the project folder. When set, the open button
   *  only shows for entries whose basename is in the set. Pass undefined
   *  to opt out of the existence check (button always shown). */
  projectFileNames?: Set<string> | undefined;
  onRequestOpenFile?: ((name: string) => void) | undefined;
}

type ArtifactOpKind = Extract<FileOpKind, 'write' | 'edit'>;

const OP_LABEL_KEY: Record<ArtifactOpKind, keyof Dict> = {
  write: 'tool.write',
  edit: 'tool.edit',
};

const ARTIFACT_OP_ICON: Record<ArtifactOpKind, IconName> = {
  write: 'file-code',
  edit: 'pencil',
};

const COLLAPSE_AFTER_ENTRY_COUNT = 4;

export function FileOpsSummary({
  entries,
  projectFileNames,
  onRequestOpenFile,
}: Props) {
  const t = useT();
  const [expanded, setExpanded] = useState(false);

  if (entries.length === 0) return null;

  // Keep the first four results immediately legible. Once a run touches more
  // files, only rows after the fourth start hidden; expanding reveals the
  // remainder without making the entire result set disappear by default.
  const isCollapsible = entries.length > COLLAPSE_AFTER_ENTRY_COUNT;
  const hiddenEntryCount = Math.max(0, entries.length - COLLAPSE_AFTER_ENTRY_COUNT);
  const visibleEntries = isCollapsible && !expanded
    ? entries.slice(0, COLLAPSE_AFTER_ENTRY_COUNT)
    : entries;

  const counts = countFileOps(entries);
  const summaryParts: string[] = [];
  if (counts.write > 0) summaryParts.push(`${t('tool.write')} ${counts.write}`);
  if (counts.edit > 0) summaryParts.push(`${t('tool.edit')} ${counts.edit}`);

  const header = (
    <>
      <span className="file-ops-icon" aria-hidden>
        <Icon name="file" size={13} />
      </span>
      <span className="file-ops-label">{t('assistant.producedFiles')}</span>
      <span className="file-ops-summary-line">{summaryParts.join(' · ')}</span>
      {isCollapsible ? (
        <>
          <span className="file-ops-more">
            {expanded
              ? entries.length
              : t('assistant.unfinishedMore', { n: hiddenEntryCount })}
          </span>
          <span className={`file-ops-chev${expanded ? ' is-expanded' : ''}`} aria-hidden>
            <Icon name="chevron-down" size={11} />
          </span>
        </>
      ) : null}
    </>
  );

  if (entries.length === 1) {
    const onlyEntry = entries[0];
    if (!onlyEntry) return null;
    return (
      <div
        className="file-ops"
        data-testid="file-ops-summary"
      >
        <ul className="file-ops-list file-ops-list--single" role="list">
          <FileOpRow
            entry={onlyEntry}
            projectFileNames={projectFileNames}
            onRequestOpenFile={onRequestOpenFile}
          />
        </ul>
      </div>
    );
  }

  return (
    <div
      className="file-ops"
      data-testid="file-ops-summary"
    >
      <div className="file-ops-head">
        {isCollapsible ? (
          <button
            type="button"
            className="file-ops-toggle"
            onClick={() => setExpanded((value) => !value)}
            aria-expanded={expanded}
            data-testid="file-ops-toggle"
          >
            {header}
          </button>
        ) : (
          <div
            className="file-ops-toggle file-ops-toggle--static"
            data-testid="file-ops-toggle"
          >
            {header}
          </div>
        )}
      </div>
      <ul className="file-ops-list" role="list">
        {visibleEntries.map((entry) => (
          <FileOpRow
            key={entry.fullPath}
            entry={entry}
            projectFileNames={projectFileNames}
            onRequestOpenFile={onRequestOpenFile}
          />
        ))}
      </ul>
    </div>
  );
}

function FileOpRow({
  entry,
  projectFileNames,
  onRequestOpenFile,
}: {
  entry: FileOpEntry;
  projectFileNames?: Set<string> | undefined;
  onRequestOpenFile?: ((name: string) => void) | undefined;
}) {
  const t = useT();
  const canOpen =
    !!onRequestOpenFile &&
    !entry.ops.includes('delete') &&
    (projectFileNames ? projectFileNames.has(entry.path) : true);
  // Artifact rows describe the delivered file, not the execution history.
  // A file that was read and then edited therefore gets one Edit category;
  // read/run/error detail stays in the execution disclosure above.
  const artifactOp: ArtifactOpKind | null = entry.ops.includes('edit')
    ? 'edit'
    : entry.ops.includes('write')
      ? 'write'
      : null;
  const content = (
    <>
      {artifactOp ? (
        <span
          className={`file-ops-badge file-ops-badge--${artifactOp}`}
          title={t(OP_LABEL_KEY[artifactOp])}
          aria-hidden
        >
          <Icon name={ARTIFACT_OP_ICON[artifactOp]} size={13} />
        </span>
      ) : null}
      <code className="file-ops-row-path" title={entry.fullPath}>
        {entry.path}
      </code>
      {canOpen ? (
        <span className="file-ops-row-open-icon" aria-hidden>
          <Icon name="chevron-right" size={12} />
        </span>
      ) : null}
    </>
  );

  return (
    <li
      className="file-ops-row"
      data-testid={`file-ops-row-${entry.path}`}
    >
      {canOpen ? (
        <button
          type="button"
          className="file-ops-row-main file-ops-row-main--action"
          onClick={() => onRequestOpenFile?.(entry.path)}
          title={t('tool.openInTab', { name: entry.path })}
          data-testid={`file-ops-row-open-${entry.path}`}
        >
          {content}
        </button>
      ) : (
        <div className="file-ops-row-main">{content}</div>
      )}
    </li>
  );
}
