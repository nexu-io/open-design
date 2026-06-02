/**
 * "Files this turn" disclosure for one assistant message.
 *
 * While the run streams, the row appears as a compact summary with live
 * counters. Once the run finishes, it expands to a full file list with
 * per-file operation rows. Openable paths are the click target, lifting
 * the basename to ProjectView so FileWorkspace focuses the matching tab.
 *
 * The component is read-only over `events` — derivation lives in
 * `runtime/file-ops.ts` so the same logic is reachable from tests and
 * future surfaces (sidebar, log export, etc.) without coupling to
 * AssistantMessage's render shape.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { useT } from '../i18n';
import type { Dict } from '../i18n/types';
import {
  countFileOps,
  type FileOpEntry,
  type FileOpKind,
} from '../runtime/file-ops';
import { projectFileUrl } from '../providers/registry';
import type { ProjectFile } from '../types';
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
  generatedFiles?: ProjectFile[] | undefined;
  projectId?: string | null | undefined;
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
  generatedFiles = [],
  projectId = null,
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

  if (entries.length === 0 && generatedFiles.length === 0) return null;

  const counts = countFileOps(entries);
  const summaryParts: string[] = [];
  summaryParts.push(
    t('designFiles.folderCount', { n: entries.length + generatedFiles.length }),
  );
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
        {generatedFiles.map((file) => (
          <GeneratedFileRow
            key={file.name}
            file={file}
            projectId={projectId}
            onRequestOpenFile={onRequestOpenFile}
          />
        ))}
      </ul>
    </ChatDisclosure>
  );
}

function GeneratedFileRow({
  file,
  projectId,
  onRequestOpenFile,
}: {
  file: ProjectFile;
  projectId?: string | null | undefined;
  onRequestOpenFile?: ((name: string) => void) | undefined;
}) {
  const t = useT();
  return (
    <FileOpsRowFrame
      className="file-ops-row--done file-ops-row--generated"
      testId={`file-ops-row-${file.name}`}
      icon={projectFileIconName(file.kind)}
      iconLabel={t('assistant.producedFiles')}
      path={file.name}
      pathTitle={file.path ?? file.name}
      pathTestId={`file-ops-row-path-${file.name}`}
      onOpen={onRequestOpenFile ? () => onRequestOpenFile(file.name) : undefined}
      openTitle={t('tool.openInTab', { name: file.name })}
      meta={humanBytes(file.size)}
      action={projectId ? (
        <a
          className="file-ops-row-action"
          href={projectFileUrl(projectId, file.name)}
          download={file.name}
          aria-label={`${t('assistant.downloadFile')} ${file.name}`}
          title={`${t('assistant.downloadFile')} ${file.name}`}
        >
          <Icon name="download" size={12} />
        </a>
      ) : null}
    />
  );
}

interface FileOpsRowFrameProps {
  className: string;
  testId: string;
  icon: IconName;
  iconLabel: string;
  path: string;
  pathTitle: string;
  pathTestId?: string | undefined;
  onOpen?: (() => void) | undefined;
  openTitle?: string | undefined;
  count?: number | undefined;
  meta?: string | undefined;
  status?: { label: string; tone: 'running' | 'error' } | undefined;
  action?: ReactNode;
}

function FileOpsRowFrame({
  className,
  testId,
  icon,
  iconLabel,
  path,
  pathTitle,
  pathTestId,
  onOpen,
  openTitle,
  count,
  meta,
  status,
  action,
}: FileOpsRowFrameProps) {
  return (
    <li
      className={`file-ops-row ${className}`}
      data-testid={testId}
      aria-label={`${iconLabel} ${path}`}
    >
      <span className="file-ops-row-icon" title={iconLabel} aria-label={iconLabel}>
        <Icon name={icon} size={12} />
      </span>
      {onOpen ? (
        <button
          type="button"
          className="file-ops-row-path file-ops-row-path-button"
          onClick={onOpen}
          title={openTitle}
          data-testid={pathTestId}
        >
          {path}
        </button>
      ) : (
        <code className="file-ops-row-path" title={pathTitle}>
          {path}
        </code>
      )}
      <span className="file-ops-row-count" aria-hidden={count && count > 1 ? undefined : true}>
        {count && count > 1 ? `×${count}` : ''}
      </span>
      <span className="file-ops-row-meta" aria-hidden={meta ? undefined : true}>
        {meta ?? ''}
      </span>
      <span
        className={`file-ops-row-status${status ? ` file-ops-row-status--${status.tone}` : ''}`}
        aria-hidden={status ? undefined : true}
      >
        {status?.label ?? ''}
      </span>
      <span className="file-ops-row-action-slot" aria-hidden={action ? undefined : true}>
        {action}
      </span>
    </li>
  );
}

function projectFileIconName(kind: ProjectFile['kind']): IconName {
  if (kind === 'html' || kind === 'code') return 'file-code';
  if (kind === 'image') return 'image';
  if (kind === 'sketch') return 'pencil';
  return 'file';
}

function humanBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
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
  const opLabels = entry.ops.map((op) => t(OP_LABEL_KEY[op]));
  const iconLabel = opLabels.join(' · ');
  const meta = entry.ops.length > 1 ? iconLabel : undefined;
  const status = entry.status === 'running'
    ? { label: t('tool.running'), tone: 'running' as const }
    : entry.status === 'error'
      ? { label: t('tool.error'), tone: 'error' as const }
      : undefined;
  return (
    <FileOpsRowFrame
      className={`file-ops-row--${entry.status}`}
      testId={`file-ops-row-${entry.path}`}
      icon={OP_BADGE_ICON[entry.ops[0] ?? 'read']}
      iconLabel={iconLabel}
      path={entry.path}
      pathTitle={entry.fullPath}
      pathTestId={canOpen ? `file-ops-row-path-${entry.path}` : undefined}
      onOpen={canOpen ? () => onRequestOpenFile?.(entry.path) : undefined}
      openTitle={t('tool.openInTab', { name: entry.path })}
      count={entry.total}
      meta={meta}
      status={status}
    />
  );
}
