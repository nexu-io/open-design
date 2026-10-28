// Move one conversation from its project into another local project.
//
// A conversation's transcript references files by project-relative path
// (`produced_files_json`, `attachments_json`), and those files live in the
// source project's directory. Re-pointing `conversations.project_id` alone
// would leave every file card in the moved transcript dangling, so the move
// copies the referenced files (plus the assets an HTML artifact pulls in)
// into the target project first, then re-parents the rows in one
// transaction. The source project keeps its copies: other conversations
// there may reference the same files.
import { createHash } from 'node:crypto';
import path from 'node:path';
import type Database from 'better-sqlite3';
import type { MoveConversationResponse } from '@open-design/contracts';
import { buildDeployFilePlan } from './deploy.js';
import { readProjectFile, resolveProjectDir, writeProjectFile } from './projects.js';

type SqliteDb = Database.Database;

interface MoveProject {
  id: string;
  metadata?: unknown;
}

interface MessageFileRow {
  id: string;
  producedFilesJson: string | null;
  attachmentsJson: string | null;
}

type FileRef = Record<string, unknown> & { path?: unknown; name?: unknown };

function parseRefs(json: string | null): FileRef[] {
  if (!json) return [];
  try {
    const value = JSON.parse(json);
    return Array.isArray(value) ? value.filter((entry) => entry && typeof entry === 'object') : [];
  } catch {
    return [];
  }
}

function refPath(ref: FileRef): string | null {
  const value = typeof ref.path === 'string' && ref.path ? ref.path : ref.name;
  return typeof value === 'string' && value ? value : null;
}

function digest(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

/** `report.html` → `report (2).html`, keeping any directory prefix. */
function suffixedName(name: string, n: number): string {
  const dir = path.posix.dirname(name);
  const base = path.posix.basename(name);
  const dot = base.lastIndexOf('.');
  const stem = dot > 0 ? base.slice(0, dot) : base;
  const ext = dot > 0 ? base.slice(dot) : '';
  const next = `${stem} (${n})${ext}`;
  return dir === '.' ? next : `${dir}/${next}`;
}

async function readTargetDigest(projectsRoot: string, project: MoveProject, name: string): Promise<string | null> {
  try {
    const file = await readProjectFile(projectsRoot, project.id, name, project.metadata);
    return digest(file.buffer);
  } catch {
    return null;
  }
}

/**
 * Copy every file the conversation's transcript references into the target
 * project, then re-parent the conversation. Referenced entry files that clash
 * with a different file of the same name in the target are copied under a
 * numbered name and the transcript is rewritten to match; supporting assets
 * that clash keep the target's version (renaming them would break the
 * relative URLs inside the HTML that loads them) and are reported as skipped.
 */
export async function moveConversationToProject(
  db: SqliteDb,
  projectsRoot: string,
  conversationId: string,
  source: MoveProject,
  target: MoveProject,
): Promise<Omit<MoveConversationResponse, 'conversation'>> {
  const rows = db
    .prepare(
      `SELECT id, produced_files_json AS producedFilesJson, attachments_json AS attachmentsJson
         FROM messages WHERE conversation_id = ?`,
    )
    .all(conversationId) as MessageFileRow[];

  const entryFiles = new Set<string>();
  for (const row of rows) {
    for (const ref of [...parseRefs(row.producedFilesJson), ...parseRefs(row.attachmentsJson)]) {
      const name = refPath(ref);
      if (name) entryFiles.add(name);
    }
  }

  const supportingFiles = new Set<string>();
  for (const name of entryFiles) {
    if (!/\.html?$/i.test(name)) continue;
    try {
      const plan = await buildDeployFilePlan(projectsRoot, source.id, name, { metadata: source.metadata } as never);
      for (const file of plan.files) {
        if (file.sourcePath && !entryFiles.has(file.sourcePath)) supportingFiles.add(file.sourcePath);
      }
    } catch {
      // Unreadable entry: the copy loop below reports it as skipped.
    }
  }

  const copiedFiles: string[] = [];
  const renamedFiles: { from: string; to: string }[] = [];
  const skippedFiles: string[] = [];
  const renames = new Map<string, string>();

  for (const name of [...entryFiles, ...supportingFiles]) {
    const isEntry = entryFiles.has(name);
    let sourceFile;
    try {
      sourceFile = await readProjectFile(projectsRoot, source.id, name, source.metadata);
    } catch {
      skippedFiles.push(name);
      continue;
    }
    const sourceDigest = digest(sourceFile.buffer);
    let destination = sourceFile.name;
    let existing = await readTargetDigest(projectsRoot, target, destination);
    if (existing === sourceDigest) continue;
    if (existing !== null) {
      if (!isEntry) {
        skippedFiles.push(name);
        continue;
      }
      for (let n = 2; existing !== null && existing !== sourceDigest; n++) {
        destination = suffixedName(sourceFile.name, n);
        existing = await readTargetDigest(projectsRoot, target, destination);
      }
      renames.set(name, destination);
      renamedFiles.push({ from: name, to: destination });
      if (existing === sourceDigest) continue;
    }
    const manifest = sourceFile.artifactManifest
      ? { ...sourceFile.artifactManifest, ...(destination !== sourceFile.name ? { entry: destination } : {}) }
      : null;
    try {
      await writeProjectFile(
        projectsRoot,
        target.id,
        destination,
        sourceFile.buffer,
        { overwrite: false, ...(manifest ? { artifactManifest: manifest } : {}) } as never,
        target.metadata,
      );
      copiedFiles.push(destination);
    } catch {
      skippedFiles.push(name);
      renames.delete(name);
    }
  }

  const targetDir = resolveProjectDir(projectsRoot, target.id, target.metadata);
  const rewrite = (json: string | null, withLocalPath: boolean): string | null => {
    if (!json) return json;
    const refs = parseRefs(json);
    if (refs.length === 0) return json;
    return JSON.stringify(refs.map((ref) => {
      const name = refPath(ref);
      if (!name) return ref;
      const next = renames.get(name) ?? name;
      const out: FileRef = { ...ref };
      if (typeof ref.path === 'string') out.path = next;
      if (typeof ref.name === 'string' && ref.name === name) out.name = next;
      if (withLocalPath && typeof ref.localPath === 'string') out.localPath = path.join(targetDir, next);
      const manifest = ref.artifactManifest as Record<string, unknown> | undefined;
      if (manifest && typeof manifest === 'object' && manifest.entry === name && next !== name) {
        out.artifactManifest = { ...manifest, entry: next };
      }
      return out;
    }));
  };

  const updateMessage = db.prepare(
    `UPDATE messages SET produced_files_json = ?, attachments_json = ? WHERE id = ?`,
  );
  db.transaction(() => {
    for (const row of rows) {
      updateMessage.run(rewrite(row.producedFilesJson, true), rewrite(row.attachmentsJson, false), row.id);
    }
    db.prepare(`UPDATE conversations SET project_id = ?, updated_at = ? WHERE id = ?`)
      .run(target.id, Date.now(), conversationId);
    db.prepare(`UPDATE preview_comments SET project_id = ? WHERE project_id = ? AND conversation_id = ?`)
      .run(target.id, source.id, conversationId);
    const renameComment = db.prepare(
      `UPDATE preview_comments SET file_path = ? WHERE project_id = ? AND conversation_id = ? AND file_path = ?`,
    );
    for (const [from, to] of renames) renameComment.run(to, target.id, conversationId, from);
    // Upstream agent sessions were opened with the source project as cwd;
    // drop them so the next turn reseeds from the transcript in the new home.
    db.prepare(`DELETE FROM agent_sessions WHERE conversation_id = ?`).run(conversationId);
  })();

  return { targetProjectId: target.id, copiedFiles, renamedFiles, skippedFiles };
}
