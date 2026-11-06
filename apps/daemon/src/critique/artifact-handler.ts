import { promises as fs, constants as fsConstants } from 'node:fs';
import * as path from 'node:path';
import type { Request, Response } from 'express';
import type Database from 'better-sqlite3';
import { getCritiqueRun } from './persistence.js';
import { mimeForExtension } from './artifact-writer.js';

/** HTTP status codes used by the artifact endpoint. */
const HTTP_BAD_REQUEST = 400;
const HTTP_NOT_FOUND = 404;
const HTTP_OK = 200;

/**
 * Default response size cap when the caller doesn't pass one. Used as the
 * floor: an instance with `OD_CRITIQUE_PARSER_MAX_BLOCK_BYTES` raised above
 * this value gets the larger cap so every artifact the orchestrator + writer
 * accepted is retrievable. Codex P2 on PR #1085: hard-coding 4 MiB here
 * while the writer accepted up to `cfg.parserMaxBlockBytes` made accepted
 * rows unretrievable in raised-limit deployments.
 */
const DEFAULT_RESPONSE_SIZE_CAP_BYTES = 4 * 1024 * 1024;

/**
 * GET /api/projects/:projectId/critique/:runId/artifact
 *
 * Streams the bytes the orchestrator wrote for the run's SHIP `<ARTIFACT>`
 * block, with the mime type derived from the file extension on disk. This
 * is the daemon-resolved logical handle the web layer fetches; clients
 * never receive a raw filesystem path. Cross-project leak guard mirrors
 * the interrupt handler: a request against project p1 must not surface a
 * runId that belongs to p2.
 *
 * Status semantics:
 *   200 — happy path; body is the artifact bytes with the right mime.
 *   400 — projectId/runId missing or whitespace-only.
 *   404 — run not found, cross-project leak, no artifact persisted, or
 *         the on-disk file disappeared (bytes never made it to the row).
 *
 * @see specs/current/critique-theater.md § rerun endpoint (Task 6.2)
 */
export function handleCritiqueArtifact(
  db: Database.Database,
  options: { artifactsRoot: string; responseCapBytes?: number },
): (req: Request, res: Response) => Promise<void> {
  const artifactsRoot = path.resolve(options.artifactsRoot);
  // Honor the configured cap as-is when it's a positive finite number.
  // The earlier `Math.max(DEFAULT, configured)` shape made the read-time
  // size guard diverge from the writer's policy: a deployment that lowered
  // OD_CRITIQUE_PARSER_MAX_BLOCK_BYTES below 4 MiB would still stream
  // tampered files up to 4 MiB even though writeShipArtifact would have
  // refused them. Mirror the writer's policy exactly so what the writer
  // accepts is what the endpoint serves, and only fall back to the
  // default when the option is absent or invalid (mrcfps follow-up on
  // PR #1085).
  const responseCapBytes =
    Number.isFinite(options.responseCapBytes) && options.responseCapBytes! > 0
      ? options.responseCapBytes!
      : DEFAULT_RESPONSE_SIZE_CAP_BYTES;

  return async function critiqueArtifactHandler(req: Request, res: Response): Promise<void> {
    const projectId =
      typeof req.params['projectId'] === 'string'
        ? req.params['projectId'].trim()
        : '';
    const runId =
      typeof req.params['runId'] === 'string'
        ? req.params['runId'].trim()
        : '';

    if (!projectId || !runId) {
      res
        .status(HTTP_BAD_REQUEST)
        .json({ error: { code: 'BAD_REQUEST', message: 'projectId and runId are required' } });
      return;
    }

    const row = getCritiqueRun(db, runId);

    // Cross-project leak guard: a request against project p1 must not
    // reveal that runId actually lives in p2. 404 (not 403) so the
    // existence of other projects' runs is not leaked.
    if (row === null || row.projectId !== projectId) {
      res
        .status(HTTP_NOT_FOUND)
        .json({ error: { code: 'NOT_FOUND', message: 'critique run not found' } });
      return;
    }

    if (row.artifactPath === null) {
      // Either the run is still running, the orchestrator failed to write
      // the artifact (size, fs error, agent shipped no body), or the row
      // pre-dates artifact persistence and hasn't been backfilled. All
      // three are observable as 404 from the client's perspective.
      res
        .status(HTTP_NOT_FOUND)
        .json({
          error: {
            code: 'NOT_FOUND',
            message: 'critique run has no persisted artifact',
            currentStatus: row.status,
          },
        });
      return;
    }

    // Path-traversal guard: the row's artifactPath must resolve INSIDE
    // the configured artifacts root. Refusing anything else means a
    // tampered DB row cannot leak arbitrary files off disk through this
    // endpoint. Symlinks are not followed: the orchestrator writes
    // through the writer module which never produces symlinks, so any
    // symlink found here is suspicious.
    const resolvedArtifactPath = path.resolve(row.artifactPath);
    const relToRoot = path.relative(artifactsRoot, resolvedArtifactPath);
    if (
      relToRoot.startsWith('..')
      || path.isAbsolute(relToRoot)
      || relToRoot === ''
    ) {
      res
        .status(HTTP_NOT_FOUND)
        .json({ error: { code: 'NOT_FOUND', message: 'critique artifact not found' } });
      return;
    }

    // Open the file once and stream from the resulting fd. The earlier
    // shape did `lstat(path) → validate → createReadStream(path)`, which
    // left a time-of-check / time-of-use window where a local actor with
    // write access to the critique-artifacts directory could swap in a
    // symlink or a larger file between the validation and the reopen.
    // Opening once with O_NOFOLLOW (where the platform supports it) and
    // stat'ing the open fd via fileHandle.stat() means the size and
    // file-type checks describe the exact bytes we are about to stream
    // (mrcfps follow-up on PR #1085).
    //
    // O_NOFOLLOW is a POSIX flag; on Windows the constant resolves to
    // undefined and the open fall-through behaves like a normal read.
    // The path-traversal guard above plus the orchestrator never writing
    // through symlinks make Windows still safe in practice.
    const noFollowFlag =
      typeof fsConstants.O_NOFOLLOW === 'number' ? fsConstants.O_NOFOLLOW : 0;
    const openFlags = fsConstants.O_RDONLY | noFollowFlag;
    let fileHandle: Awaited<ReturnType<typeof fs.open>>;
    try {
      fileHandle = await fs.open(resolvedArtifactPath, openFlags);
    } catch {
      // ELOOP from O_NOFOLLOW (symlink), ENOENT (vanished), EACCES, etc.
      res
        .status(HTTP_NOT_FOUND)
        .json({ error: { code: 'NOT_FOUND', message: 'critique artifact not found' } });
      return;
    }

    try {
      const stat = await fileHandle.stat();
      if (!stat.isFile()) {
        await fileHandle.close();
        res
          .status(HTTP_NOT_FOUND)
          .json({ error: { code: 'NOT_FOUND', message: 'critique artifact not found' } });
        return;
      }
      if (stat.size > responseCapBytes) {
        await fileHandle.close();
        res
          .status(HTTP_NOT_FOUND)
          .json({
            error: { code: 'NOT_FOUND', message: 'critique artifact exceeds response cap' },
          });
        return;
      }

      const ext = path.extname(resolvedArtifactPath);
      const contentType = mimeForExtension(ext);

      res.status(HTTP_OK);
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Length', String(stat.size));
      res.setHeader('X-Content-Type-Options', 'nosniff');
      // Prevent SVG / HTML artifacts from running scripts when fetched
      // directly. The web layer renders the bytes inside a sandboxed iframe
      // for HTML; this CSP is a defense-in-depth header for clients that
      // dereference the URL outside that sandbox.
      if (contentType === 'image/svg+xml' || contentType === 'text/html') {
        res.setHeader(
          'Content-Security-Policy',
          "default-src 'none'; img-src data:; style-src 'unsafe-inline'",
        );
      }
      // Artifacts are content-addressed by runId; the row never re-points
      // to a different file once written, so a long cache lifetime is safe.
      res.setHeader('Cache-Control', 'private, max-age=3600');

      // createReadStream({ autoClose: true }) is the FileHandle method that
      // closes the underlying fd when the stream ends or errors, so we do
      // not double-close after handing the fd to the stream.
      const stream = fileHandle.createReadStream({ autoClose: true });
      stream.on('error', () => {
        if (!res.headersSent) {
          res.status(HTTP_NOT_FOUND).end();
        } else {
          res.destroy();
        }
      });
      stream.pipe(res);
    } catch (err) {
      // Anything thrown after the open succeeded but before the stream is
      // wired up: close the fd so it does not leak, then surface 404.
      await fileHandle.close().catch(() => {});
      if (!res.headersSent) {
        res
          .status(HTTP_NOT_FOUND)
          .json({ error: { code: 'NOT_FOUND', message: 'critique artifact not found' } });
      } else {
        res.destroy(err instanceof Error ? err : undefined);
      }
    }
  };
}
