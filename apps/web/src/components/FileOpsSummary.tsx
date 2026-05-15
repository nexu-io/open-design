/**
 * "Files this turn" disclosure pinned to the top of an assistant message.
 *
 * While the run streams, the row appears as a compact pill with live
 * counters (Write 1 · Edit 2 · Read 3). Once the run finishes, the row
 * expands to a full file list with per-file op badges and an "Open"
 * button that lifts the basename up to ProjectView so FileWorkspace
 * focuses the matching tab.
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
import { Icon } from './Icon';

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

const OP_BADGE_GLYPH: Record<FileOpKind, string> = {
  read: 'R',
  write: 'W',
  edit: 'E',
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
  if (counts.write > 0) summaryParts.push(`${t('tool.write')} ${counts.write}`);
  if (counts.edit > 0) summaryParts.push(`${t('tool.edit')} ${counts.edit}`);
  if (counts.read > 0) summaryParts.push(`${t('tool.read')} ${counts.read}`);

  return (
    <div
      className={`file-ops${streaming ? ' is-streaming' : ''}`}
      data-testid="file-ops-summary"
    >
      <button
        type="button"
        className="file-ops-toggle"
        onClick={() => {
          setUserToggled(true);
          setOpen((value) => !value);
        }}
        aria-expanded={open}
        data-testid="file-ops-toggle"
      >
        <span className="file-ops-icon" aria-hidden>
          <Icon name="file" size={13} />
        </span>
        <span className="file-ops-label">{t('assistant.producedFiles')}</span>
        <span className="file-ops-summary-line">{summaryParts.join(' · ')}</span>
        <span className="file-ops-count">{entries.length}</span>
        <span className="file-ops-chev" aria-hidden>
          <Icon name={open ? 'chevron-down' : 'chevron-right'} size={11} />
        </span>
      </button>
      {open ? (
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
      ) : null}
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
    (projectFileNames ? projectFileNames.has(entry.path) : true);
  return (
    <li
      className={`file-ops-row file-ops-row--${entry.status}`}
      data-testid={`file-ops-row-${entry.path}`}
    >
      <div className="file-ops-row-badges" aria-hidden>
        {entry.ops.map((op) => {
          const count = entry.opCounts[op];
          return (
            <span
              key={op}
              className={`file-ops-badge file-ops-badge--${op}`}
              title={
                count > 1
                  ? `${t(OP_LABEL_KEY[op])} ×${count}`
                  : t(OP_LABEL_KEY[op])
              }
            >
              {OP_BADGE_GLYPH[op]}
              {count > 1 ? (
                <span className="file-ops-badge-count">×{count}</span>
              ) : null}
            </span>
          );
        })}
      </div>
      <code className="file-ops-row-path" title={entry.fullPath}>
        {entry.path}
      </code>
      {entry.status === 'running' ? (
        <span className="file-ops-row-status file-ops-row-status--running">
          {t('tool.running')}
        </span>
      ) : entry.status === 'error' ? (
        <span className="file-ops-row-status file-ops-row-status--error">
          {t('tool.error')}
        </span>
      ) : null}
      {canOpen ? (
        <button
          type="button"
          className="file-ops-row-open"
          onClick={() => onRequestOpenFile?.(entry.path)}
          title={t('tool.openInTab', { name: entry.path })}
          data-testid={`file-ops-row-open-${entry.path}`}
        >
          {t('assistant.openFile')}
        </button>
      ) : null}
    </li>
  );
}
