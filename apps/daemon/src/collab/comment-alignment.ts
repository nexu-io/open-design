import type Database from 'better-sqlite3';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { COMMENT_ALIGN_REASONS, type CommentAlignProjection, type CommentAlignRequest, type CommentAlignResult, type WorkspaceCollabContext } from '@open-design/contracts';
import { getProject, getWorkspaceProjectByProjectId, listProjectPreviewComments } from '../db.js';
import { personalCommentRelayFilePaths } from './comment-relay-scope.js';
import { createSqlitePublicFilePublicationStore } from './public-file-publication-store.js';
import { parseCommentFileState } from './comment-file-facts.js';
import type { VelaControlApiContext } from '../integrations/vela.js';
import { runPinnedVelaCommand } from './vela-pinned-command.js';
import type { CommentSyncScope } from './comment-sync-state.js';

const unavailable = (): CommentAlignResult => ({ state: 'unknown', reason: 'unavailable' });

/** Capture the same principal/file boundary used by personal relay. The
 * witness also changes for stop/resume and same-path lifetime replacement,
 * even when the projected comment body and project cursor remain identical. */
function captureCommentAlignment(db: Database.Database, projectId: string, context: WorkspaceCollabContext) {
  const binding = getWorkspaceProjectByProjectId(db, projectId);
  if (!binding || binding.workspaceId !== context.workspaceId
    || binding.createdByWorkspaceMemberId !== context.workspaceMemberId
    || binding.resourceState === 'deleted' || binding.cloudTombstonedAt != null
    || context.memberStatus !== 'active' || context.lifecycleState === 'deleted') {
    throw new Error('Comment alignment scope unavailable');
  }
  const publications = createSqlitePublicFilePublicationStore(db);
  const personal = binding.visibility === 'personal';
  if (!personal && (binding.visibility !== 'team' || context.workspaceType !== 'team')) {
    throw new Error('Comment alignment scope unavailable');
  }
  const paths = personal ? personalCommentRelayFilePaths({ binding, context, projectId, publications }) : null;
  if (paths?.size === 0) throw new Error('Comment alignment scope unavailable');
  const facts = parseCommentFileState(getProject(db, projectId)?.metadata?._commentFiles);
  const selected = listProjectPreviewComments(db, projectId).filter(comment => !paths || (
    paths.has(comment.filePath) && (!comment.sourceFileId || facts?.files.some(fact =>
      !fact.retired && fact.sourceFileId === comment.sourceFileId && fact.sourceFilePath === comment.filePath))
  ));
  const selectedIds = new Set(selected.map(comment => comment.id));
  // The display DTO deliberately strips cloud attachment ids; read persisted
  // attachment identities, not its path/name rendering projection.
  const rows = db.prepare('SELECT id, attachments_json AS attachmentsJson FROM preview_comments WHERE project_id=?').all(projectId) as Array<{ id: string; attachmentsJson: string | null }>;
  const attachments = new Map<string, Array<{ id: string; name: string }>>();
  for (const row of rows) {
    if (!selectedIds.has(row.id)) continue;
    let items: unknown = [];
    try { items = row.attachmentsJson ? JSON.parse(row.attachmentsJson) : []; }
    catch { throw new Error('Invalid persisted attachment JSON'); }
    if (!Array.isArray(items)) throw new Error('Invalid persisted attachments');
    attachments.set(row.id, items.map((item: unknown) => {
      if (!item || typeof item !== 'object' || !('id' in item) || typeof item.id !== 'string' || !item.id) {
        // A legacy path is not a cloud identity. Do not fabricate agreement.
        throw new Error('Attachment comparison identity unavailable');
      }
      return { id: item.id, name: '' };
    }));
  }
  const comments: CommentAlignProjection[] = selected.map(comment => ({
    id: comment.id, filePath: comment.filePath, elementId: comment.elementId,
    selector: comment.selector, selectionKind: comment.selectionKind ?? 'element',
    label: comment.label ?? '', text: comment.text ?? '', htmlHint: comment.htmlHint ?? '',
    note: comment.note ?? '', status: comment.status ?? 'open',
    position: { x: Math.round(comment.position.x), y: Math.round(comment.position.y),
      width: Math.round(comment.position.width), height: Math.round(comment.position.height) },
    style: comment.style ?? null, memberCount: comment.memberCount ?? 0,
    slideIndex: comment.slideIndex ?? 0,
    // The frozen transport requires name; comparison deliberately ignores it.
    attachments: attachments.get(comment.id) ?? [],
    authorKind: comment.authorKind ?? 'member',
  })).sort((a, b) => a.id.localeCompare(b.id));
  return { comments, witness: {
    workspaceId: binding.workspaceId, ownerMemberId: binding.createdByWorkspaceMemberId,
    visibility: binding.visibility, resourceState: binding.resourceState,
    files: paths ? [...paths].sort().map(filePath => ({ filePath,
      revision: publications.getRevision({ resourceTeamId: context.workspaceId,
        ownerMemberId: context.workspaceMemberId, projectId, filePath }),
      facts: facts?.files.filter(fact => fact.sourceFilePath === filePath) ?? [],
    })) : facts,
    identities: selected.map(comment => [comment.id, comment.sourceFileId ?? null]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
  } };
}

/** Only scoped, persisted rows can enter the outbound alignment projection. */
export function exportCommentAlignment(db: Database.Database, projectId: string, context: WorkspaceCollabContext): CommentAlignProjection[] {
  return captureCommentAlignment(db, projectId, context).comments;
}

/** Exit zero is only successful execution, never proof of alignment. */
export function parseCommentAlignmentResult(stdout: string): CommentAlignResult {
  try {
    const value: unknown = JSON.parse(stdout);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return unavailable();
    const row = value as Record<string, unknown>;
    if (row.latestSeq !== undefined && (!Number.isSafeInteger(row.latestSeq) || Number(row.latestSeq) < 0)) return unavailable();
    const latestSeq = typeof row.latestSeq === 'number' ? row.latestSeq : undefined;
    if (row.state === 'unknown') {
      const reason = COMMENT_ALIGN_REASONS.find(item => item === row.reason);
      return reason ? { state: 'unknown', reason, ...(latestSeq === undefined ? {} : { latestSeq }) } : unavailable();
    }
    if ((row.state === 'aligned' || row.state === 'diverged') && latestSeq !== undefined) return { state: row.state, latestSeq };
  } catch { /* Do not expose raw transport output. */ }
  return unavailable();
}

export async function runVelaCommentAlignment(input: {
  projectId: string; workspaceId: string; request: CommentAlignRequest;
  session: VelaControlApiContext; dataRoot: string;
  isCurrent?: () => boolean;
}, run: typeof runPinnedVelaCommand = runPinnedVelaCommand): Promise<CommentAlignResult> {
  let directory: string | undefined;
  try {
    if (!path.isAbsolute(input.dataRoot) || !input.projectId.trim() || !input.workspaceId.trim()) return unavailable();
    directory = await mkdtemp(path.join(input.dataRoot, 'comment-align-'));
    const file = path.join(directory, 'comments.json');
    await writeFile(file, JSON.stringify(input.request), { mode: 0o600, flag: 'wx' });
    // File preparation yields; a stopped/replaced scope must not reach the CLI.
    if (input.isCurrent && !input.isCurrent()) return { state: 'unknown', reason: 'snapshot_changed' };
    return parseCommentAlignmentResult(await run({
      args: ['collab', 'comment', 'align', input.projectId, '--comment-file', file, '--json'],
      workspaceId: input.workspaceId, session: input.session, dataRoot: input.dataRoot,
      ...(input.isCurrent ? { isCurrent: input.isCurrent } : {}),
    }));
  } catch { return unavailable(); }
  finally { if (directory) await rm(directory, { recursive: true, force: true }); }
}

export function createCommentAlignmentService(deps: {
  db: Database.Database;
  readCursor: (projectId: string, context: WorkspaceCollabContext) => number | null;
  compare: (projectId: string, context: WorkspaceCollabContext, request: CommentAlignRequest, isCurrent: () => boolean) => Promise<CommentAlignResult>;
}) {
  const key = (scope: CommentSyncScope) => JSON.stringify([scope.projectId, scope.workspaceId, scope.workspaceMemberId]);
  const results = new Map<string, { result: CommentAlignResult; snapshot: string | null; cursor: number | null; context: WorkspaceCollabContext }>();
  const snapshot = (projectId: string, context: WorkspaceCollabContext): string | null => {
    try { return JSON.stringify(captureCommentAlignment(deps.db, projectId, context)); } catch { return null; }
  };
  return {
    read(scope: CommentSyncScope): CommentAlignResult | undefined {
      const last = results.get(key(scope));
      if (!last) return undefined;
      if (last.cursor !== deps.readCursor(scope.projectId, last.context) || last.snapshot !== snapshot(scope.projectId, last.context)) return { state: 'unknown', reason: 'snapshot_changed' };
      return { ...last.result };
    },
    async check(projectId: string, context: WorkspaceCollabContext): Promise<CommentAlignResult> {
      const scope = { projectId, workspaceId: context.workspaceId, workspaceMemberId: context.workspaceMemberId };
      const cursor = deps.readCursor(projectId, context);
      const captured = snapshot(projectId, context);
      let result = unavailable();
      if (captured !== null && cursor !== null && Number.isSafeInteger(cursor) && cursor >= 0) {
        try {
          const { comments }: { comments: CommentAlignProjection[] } = JSON.parse(captured);
          result = await deps.compare(projectId, context, { comments, expectedLatestSeq: cursor },
            () => deps.readCursor(projectId, context) === cursor && snapshot(projectId, context) === captured);
        }
        catch { result = unavailable(); }
        if (deps.readCursor(projectId, context) !== cursor || snapshot(projectId, context) !== captured
          || (result.state !== 'unknown' && result.latestSeq !== cursor)) result = { state: 'unknown', reason: 'snapshot_changed' };
      }
      results.set(key(scope), { result, snapshot: captured, cursor, context: { ...context } });
      return result;
    },
  };
}
