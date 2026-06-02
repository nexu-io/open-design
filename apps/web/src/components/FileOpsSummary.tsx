/**
 * "Files this turn" disclosure for one assistant message.
 *
 * While the run streams, the row appears as a compact summary with live
 * counters. Once the run finishes, it expands to a full file list with
 * per-file operation badges. Openable paths are the click target, lifting
 * the basename to ProjectView so FileWorkspace focuses the matching tab.
 *
 * The component is read-only over `events` — derivation lives in
 * `runtime/file-ops.ts` so the same logic is reachable from tests and
 * future surfaces (sidebar, log export, etc.) without coupling to
 * AssistantMessage's render shape.
 */
import { useEffect, useState } from 'react';
import { useT } from '../i18n';
import type { Dict } from '../i18n/types';
import {
  countFileOps,
  type FileOpEntry,
  type FileOpKind,
} from '../runtime/file-ops';
import { Icon, type IconName } from './Icon';
import { ChatDisclosure } from './chat/ChatSurface';

interface Props {
  entries: FileOpEntry[];
  /** True while the parent run is still streaming. Drives default-open
   *  state (collapsed when active, expanded once done) and the live-pulse
   *  styling. */
  streaming: boolean;
  /** Names that exist in the project folder. When set, the open button
   *  only shows for entries whose basename is in the set. Pass undefined
   *  to opt out of the existence check (button always shown). */
  projectFileNames?: Set<string> | undefined;
  onRequestOpenFile?: ((name: string) => void) | undefined;
}

const OP_LABEL_KEY: Record<FileOpKind, keyof Dict> = {
  read: 'tool.read',
  write: 'tool.write',
  edit: 'tool.edit',
};

const OP_BADGE_ICON: Record<FileOpKind, IconName> = {
  read: 'file',
  write: 'plus',
  edit: 'pencil',
};

export function FileOpsSummary({
  entries,
  streaming,
  projectFileNames,
  onRequestOpenFile,
}: Props) {
  const t = useT();
  // Collapsed while streaming so the running pill stays compact; once
  // the run finishes we open it so the user lands on the full file list
  // without an extra click. Manual toggles win after that.
  const [open, setOpen] = useState<boolean>(!streaming);
  const [userToggled, setUserToggled] = useState(false);
  useEffect(() => {
    if (!userToggled && !streaming) setOpen(true);
  }, [streaming, userToggled]);

  if (entries.length === 0) return null;

  const counts = countFileOps(entries);
  const summaryParts: string[] = [];
  summaryParts.push(t('designFiles.folderCount', { n: entries.length }));
  if (counts.write > 0) summaryParts.push(`${t('tool.write')} ${counts.write}`);
  if (counts.edit > 0) summaryParts.push(`${t('tool.edit')} ${counts.edit}`);
  if (counts.read > 0) summaryParts.push(`${t('tool.read')} ${counts.read}`);

  return (
    <ChatDisclosure
      className={`file-ops${streaming ? ' is-streaming' : ''}`}
      testId="file-ops-summary"
      toggleTestId="file-ops-toggle"
      icon="folder"
      title={t('assistant.producedFiles')}
      meta={summaryParts.join(' · ')}
      tone={streaming ? 'running' : 'neutral'}
      open={open}
      onOpenChange={(nextOpen) => {
        setUserToggled(true);
        setOpen(nextOpen);
      }}
    >
        <ul className="file-ops-list" role="list">
          {entries.map((entry) => (
            <FileOpRow
              key={entry.fullPath}
              entry={entry}
              projectFileNames={projectFileNames}
              onRequestOpenFile={onRequestOpenFile}
            />
          ))}
        </ul>
    </ChatDisclosure>
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
    (projectFileNames ? projectFileNames.has(entry.path) : true);
  return (
    <li
      className={`file-ops-row file-ops-row--${entry.status}`}
      data-testid={`file-ops-row-${entry.path}`}
    >
      <div className="file-ops-row-badges">
        {entry.ops.map((op) => {
          const count = entry.opCounts[op];
          const label = count > 1
            ? `${t(OP_LABEL_KEY[op])} ×${count}`
            : t(OP_LABEL_KEY[op]);
          return (
            <span
              key={op}
              className={`file-ops-badge file-ops-badge--${op}`}
              title={label}
              aria-label={label}
            >
              <Icon name={OP_BADGE_ICON[op]} size={10} />
              {count > 1 ? (
                <span className="file-ops-badge-count">×{count}</span>
              ) : null}
            </span>
          );
        })}
      </div>
      {canOpen ? (
        <button
          type="button"
          className="file-ops-row-path file-ops-row-path-button"
          onClick={() => onRequestOpenFile?.(entry.path)}
          title={t('tool.openInTab', { name: entry.path })}
          data-testid={`file-ops-row-path-${entry.path}`}
        >
          {entry.path}
        </button>
      ) : (
        <code className="file-ops-row-path" title={entry.fullPath}>
          {entry.path}
        </code>
      )}
      {entry.status === 'running' ? (
        <span className="file-ops-row-status file-ops-row-status--running">
          {t('tool.running')}
        </span>
      ) : entry.status === 'error' ? (
        <span className="file-ops-row-status file-ops-row-status--error">
          {t('tool.error')}
        </span>
      ) : null}
    </li>
  );
}
