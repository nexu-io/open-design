// Card covers: freeze what the card will show at the chokepoint (spec §4.1 +
// §6.3).
//
// TWO COVER PATHS LIVE HERE, and they differ only in what "freeze" can mean:
//
//   * HTML gets its RENDERER INPUT frozen now and rendered later, because a
//     self-contained document is portable evidence — see the four steps below.
//   * VIDEO gets its FIRST FRAME decoded now, inside a verified window, because
//     there is no portable freeze for a video short of copying it, and the
//     capacity ruling forbids that. The mechanics live in `video-cover.ts`;
//     this file owns the per-ref bookkeeping both paths share.
//
// WHY A FREEZE AND NOT A JOB. The obvious implementation — "queue a screenshot
// of this file, take it when the renderer is free" — is a version race, not an
// optimization. Between the queue and the render the agent's next turn can
// overwrite the file, and the cover then shows a version that message never
// produced. Worse, it does so silently: a screenshot of the wrong bytes looks
// exactly like a screenshot of the right ones.
//
// So the input is frozen while the daemon still owns the moment, and the freeze
// is STRUCTURAL rather than advisory:
//
//   1. The entry HTML and every local dependency it references are read inside
//      one window, and every file read is fingerprinted (size + mtime).
//   2. The whole graph is inlined into ONE self-contained document. The result
//      carries no relative URL that could resolve to a project file.
//   3. The window is re-verified at the end. Any drift — a write that landed
//      while we were reading — voids the freeze instead of producing a document
//      torn across two versions.
//   4. The renderer is handed that document with NO `baseHref`. It loads from a
//      `data:` URL, so even a render that starts minutes later has no address
//      for the live workspace. It cannot read latest; there is nothing to read.
//
// Step 4 is what makes the async render safe. Steps 1-3 are what make step 4
// honest — a self-contained document assembled from a moving target would still
// be a lie, just an unfalsifiable one.
//
// WHY FAILURE IS SILENT. Product ruling 2026-09-02: a cover that cannot be
// rendered falls back to the card's live preview, with no placeholder and no
// error copy ("不允许退回不就一个错误文案显示在上面了?这感觉更奇怪呢"). That is
// coherent with the click ruling of the same day — clicking a card always opens
// the workspace's LATEST file, for HTML and images alike — so a card that falls
// back to live is showing the same thing the click would open. There is no
// "cover says one thing, click shows another" state to explain away.

import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

import {
  DESKTOP_ARTIFACT_CAPTURE_ERROR_CODES,
  DESKTOP_ARTIFACT_CAPTURE_MODES,
  type DesktopExportArtifactInput,
  type DesktopExportArtifactResult,
} from '@open-design/sidecar-proto';

import {
  bundleStandaloneHtml,
  type StandaloneAssetHandle,
} from '../artifacts/standalone-html.js';
import type { ChatArtifactCaptureDeps } from './capture.js';
import { mimeForArtifactPath } from './mime.js';
import { chatArtifactPolicyForKind } from './policy.js';
import { attachChatArtifactThumbnail } from './run-capture.js';
import { insertSnapshotIntent, markSnapshotFailed, type MessageArtifactRow } from './store.js';
import type { ChatArtifactFailureCode } from './types.js';
import {
  CHAT_ARTIFACT_VIDEO_FRAME_MAX_PER_RUN,
  freezeVideoFirstFrame,
  type ChatArtifactVideoFrameExtractor,
} from './video-cover.js';

export type ChatArtifactCoverRenderer = (
  input: DesktopExportArtifactInput,
) => Promise<DesktopExportArtifactResult>;

/**
 * Wall clock the daemon gives one cover. The desktop renderer enforces its own
 * 8s budget; this is the outer guard for the case where the desktop process is
 * wedged and the IPC call (600s) never comes back at all.
 */
export const CHAT_ARTIFACT_COVER_BUDGET_MS = 20_000;

/**
 * Per-turn ceiling. A run that rewrote forty pages is not worth forty renders —
 * the renderer is a shared, single-window resource and the next turn's covers
 * matter more than the tail of this one's.
 */
export const CHAT_ARTIFACT_COVER_MAX_PER_RUN = 8;

export interface FreezeChatArtifactCoversInput {
  /** Absolute project directory the run wrote into. */
  projectRoot: string;
  /** The refs the terminal capture just wrote for this message. */
  rows: readonly MessageArtifactRow[];
  /** Absent in a web-only daemon; no renderer means no cover, and no failure. */
  renderer: ChatArtifactCoverRenderer | null | undefined;
  /**
   * Seam for the video first-frame decoder. Defaults to the bundled ffmpeg;
   * only tests that want a deterministic failure pass anything else.
   */
  videoFrameExtractor?: ChatArtifactVideoFrameExtractor;
  /**
   * Announce that this ref's projection changed after the turn already ended.
   *
   * The render outlives the turn on purpose, so by the time a cover exists the
   * client has already done its one post-run re-read and is showing the
   * live-iframe degrade branch. Something has to tell it to look again — spec
   * line 505, "后台 ready 后消息投影更新".
   *
   * A callback rather than an import: this module has no business knowing what
   * an SSE sink is, and the same indifference is what lets the tests observe
   * the render without standing up a transport. Fired only for a cover that
   * actually landed — a failure changes no projection, so announcing one would
   * buy the client a pointless fetch.
   */
  onRefsChanged?: (row: MessageArtifactRow) => void;
}

export interface FreezeChatArtifactCoversReport {
  /** Refs whose renderer input was frozen and handed to a render. */
  frozen: number;
  /** Refs this build cannot cover at all (no renderer, wrong kind, over cap). */
  skipped: number;
  /** Refs whose freeze failed and were recorded as a failed snapshot. */
  failed: number;
}

/**
 * Freeze every coverable ref on this message, then render them in the
 * background.
 *
 * The AWAITED half is the freeze — it must complete before the terminal SSE
 * frame goes out, because after that the next turn may start writing. For HTML
 * the render is deliberately NOT awaited: it costs seconds, the frozen document
 * makes it race-free, and a chat turn should not sit open waiting for a
 * thumbnail. A card with no cover yet simply keeps its live preview.
 *
 * A video's frame extraction IS awaited, because for video the extraction is
 * the freeze — there is nothing to hand a later worker that is still guaranteed
 * to be this turn's bytes. `video-cover.ts` keeps that cost bounded (one frame,
 * a 10s budget, a handful per turn).
 */
export async function freezeAndRenderChatArtifactCovers(
  deps: ChatArtifactCaptureDeps,
  input: FreezeChatArtifactCoversInput,
): Promise<FreezeChatArtifactCoversReport> {
  const report: FreezeChatArtifactCoversReport = { frozen: 0, skipped: 0, failed: 0 };
  const projectRoot = path.resolve(input.projectRoot);
  const pending: Array<{ row: MessageArtifactRow; render: DesktopExportArtifactInput }> = [];
  let videoFrames = 0;

  for (const row of input.rows) {
    if (wantsFrozenVideoFrame(row)) {
      if (videoFrames >= CHAT_ARTIFACT_VIDEO_FRAME_MAX_PER_RUN) {
        report.skipped += 1;
        continue;
      }
      videoFrames += 1;
      const outcome = await freezeVideoFrameCover(deps, projectRoot, row, input.videoFrameExtractor);
      if (outcome === 'frozen') report.frozen += 1;
      else report.failed += 1;
      continue;
    }
    if (!wantsRenderedCover(row)) {
      report.skipped += 1;
      continue;
    }
    // No renderer at all is not a failure of THIS turn — recording one would
    // mark every HTML card in a web-only daemon as failed forever, which buries
    // the real render failures the state is there to surface.
    if (typeof input.renderer !== 'function' || pending.length >= CHAT_ARTIFACT_COVER_MAX_PER_RUN) {
      report.skipped += 1;
      continue;
    }

    const frozen = await freezeCoverDocument(projectRoot, row.labelAtCapture);
    if (!frozen.ok) {
      recordCoverFailure(deps, row, frozen.failureCode);
      report.failed += 1;
      continue;
    }
    pending.push({ row, render: frozen.render });
    report.frozen += 1;
  }

  if (pending.length > 0 && typeof input.renderer === 'function') {
    // Serial: the desktop renderer is one Electron window behind one IPC
    // socket, so firing these in parallel would only queue them somewhere less
    // observable.
    void renderCoversSequentially(deps, input.renderer, pending, input.onRefsChanged);
  }
  return report;
}

/**
 * Which refs today's BROWSER renderer can actually serve.
 *
 * `wantsStaticCover` is the POLICY answer (every non-immutable kind wants one).
 * `kind === 'html'` is the CAPABILITY answer: this renderer is a browser, so a
 * .pdf or .docx ref has to keep waiting for a document renderer that does not
 * exist yet. Keeping the two separate means adding that renderer later is a
 * change here, not a change to the product policy — which is exactly how video
 * arrived: a second capability answer below, with the policy untouched.
 */
function wantsRenderedCover(row: MessageArtifactRow): boolean {
  if (row.kind !== 'html') return false;
  return coverable(row);
}

/**
 * Which refs get a decoded first frame.
 *
 * Video only. Audio shares video's policy row but has no frames, and its card
 * is a waveform pill rather than a thumbnail, so there is nothing for a cover
 * to occupy — asking ffmpeg for a frame of an mp3 would spend a subprocess to
 * learn that.
 */
function wantsFrozenVideoFrame(row: MessageArtifactRow): boolean {
  if (row.kind !== 'video') return false;
  return coverable(row);
}

/**
 * The part both paths share: the policy says this kind wants a static cover,
 * and the ref does not already own a snapshot. An immutable-original ref
 * carries its own bytes; a cover would be a second identity on a row that is
 * supposed to have exactly one.
 */
function coverable(row: MessageArtifactRow): boolean {
  if (!chatArtifactPolicyForKind(row.kind).wantsStaticCover) return false;
  return row.snapshotId == null && row.workspaceArtifactId != null;
}

/**
 * Decode this turn's first frame and attach it as the card's cover.
 *
 * Returns which bucket the ref landed in; the caller owns the counters. A
 * failure is recorded the same way a failed HTML render is — as an honest miss
 * on the ref, never as a substituted frame from the current file.
 */
async function freezeVideoFrameCover(
  deps: ChatArtifactCaptureDeps,
  projectRoot: string,
  row: MessageArtifactRow,
  extractor: ChatArtifactVideoFrameExtractor | undefined,
): Promise<'frozen' | 'failed'> {
  const absolute = resolveInsideProject(projectRoot, row.labelAtCapture);
  if (!absolute) {
    recordCoverFailure(deps, row, 'source_missing');
    return 'failed';
  }
  const frozen = extractor
    ? await freezeVideoFirstFrame(absolute, extractor)
    : await freezeVideoFirstFrame(absolute);
  if (!frozen.ok) {
    recordCoverFailure(deps, row, frozen.failureCode);
    return 'failed';
  }
  try {
    await attachChatArtifactThumbnail(deps, {
      messageArtifactId: row.id,
      bytes: frozen.bytes,
      mime: frozen.mime,
    });
  } catch (err) {
    logCoverFailure(row.labelAtCapture, err);
    try {
      recordCoverFailure(deps, row, 'internal_error');
    } catch {
      // best effort
    }
    return 'failed';
  }
  return 'frozen';
}

type FreezeOutcome =
  | { ok: true; render: DesktopExportArtifactInput }
  | { ok: false; failureCode: ChatArtifactFailureCode };

/**
 * Read the entry and its local dependency graph inside one verified window, and
 * return a self-contained document.
 *
 * The witness map is the freeze: every file the bundler touched is fingerprinted
 * when it is read and re-checked when the bundle is done. A single drift means
 * the assembled document may mix two versions, and a mixed document is worse
 * than no cover — it is a screenshot of something that never existed.
 */
async function freezeCoverDocument(
  projectRoot: string,
  relativePath: string,
): Promise<FreezeOutcome> {
  const entryAbsolute = resolveInsideProject(projectRoot, relativePath);
  if (!entryAbsolute) return { ok: false, failureCode: 'source_missing' };

  const witnesses = new Map<string, { size: number; mtimeMs: number }>();
  let html: string;
  try {
    const stat = await fs.promises.stat(entryAbsolute);
    witnesses.set(entryAbsolute, { size: stat.size, mtimeMs: stat.mtimeMs });
    html = await fs.promises.readFile(entryAbsolute, 'utf8');
  } catch {
    return { ok: false, failureCode: 'source_missing' };
  }

  const readAsset = async (projectPath: string): Promise<StandaloneAssetHandle | null> => {
    const absolute = resolveInsideProject(projectRoot, projectPath);
    if (!absolute) return null;
    let stat: fs.Stats;
    try {
      stat = await fs.promises.stat(absolute);
    } catch {
      return null;
    }
    if (!stat.isFile()) return null;
    const buffer = await fs.promises.readFile(absolute);
    witnesses.set(absolute, { size: stat.size, mtimeMs: stat.mtimeMs });
    return {
      buffer,
      mime: mimeForArtifactPath(projectPath) ?? 'application/octet-stream',
      size: buffer.byteLength,
    };
  };

  let bundled: { html: string };
  try {
    bundled = await bundleStandaloneHtml({
      entryPath: toProjectPath(relativePath),
      html,
      readAsset,
    });
  } catch (err) {
    // A graph that cannot be closed (a missing local dependency, a document
    // past the bundler's limits) has no dependency-complete freeze available.
    // Spec §6.3's fallback — render the live file immediately while its
    // fingerprint still matches — is deliberately NOT taken here: it would put
    // the daemon's live raw endpoint back in the renderer's hands, which only
    // fingerprints the entry and leaves every dependency free to move.
    logCoverFailure(relativePath, err);
    return { ok: false, failureCode: 'dependencies_incomplete' };
  }

  for (const [absolute, expected] of witnesses) {
    try {
      const stat = await fs.promises.stat(absolute);
      if (stat.size !== expected.size || stat.mtimeMs !== expected.mtimeMs) {
        return { ok: false, failureCode: 'source_changed' };
      }
    } catch {
      return { ok: false, failureCode: 'source_changed' };
    }
  }

  return {
    ok: true,
    render: {
      captureMode: DESKTOP_ARTIFACT_CAPTURE_MODES.FIRST_VIEWPORT_THUMBNAIL,
      deck: false,
      format: 'image',
      html: bundled.html,
      imageFormat: 'png',
      title: path.posix.basename(toProjectPath(relativePath)) || 'artifact',
      // No baseHref, on purpose. See the module header: this is the last thing
      // standing between an async render and the live workspace.
    },
  };
}

async function renderCoversSequentially(
  deps: ChatArtifactCaptureDeps,
  renderer: ChatArtifactCoverRenderer,
  pending: ReadonlyArray<{ row: MessageArtifactRow; render: DesktopExportArtifactInput }>,
  onRefsChanged: ((row: MessageArtifactRow) => void) | undefined,
): Promise<void> {
  for (const item of pending) {
    try {
      await renderOneCover(deps, renderer, item.row, item.render, onRefsChanged);
    } catch (err) {
      // A cover is never allowed to take anything else down with it: the turn
      // has already been reported as finished by the time this runs.
      logCoverFailure(item.row.labelAtCapture, err);
      try {
        recordCoverFailure(deps, item.row, 'internal_error');
      } catch {
        // best effort
      }
    }
  }
}

async function renderOneCover(
  deps: ChatArtifactCaptureDeps,
  renderer: ChatArtifactCoverRenderer,
  row: MessageArtifactRow,
  render: DesktopExportArtifactInput,
  onRefsChanged: ((row: MessageArtifactRow) => void) | undefined,
): Promise<void> {
  let result: DesktopExportArtifactResult;
  try {
    result = await withBudget(renderer(render), CHAT_ARTIFACT_COVER_BUDGET_MS);
  } catch (err) {
    logCoverFailure(row.labelAtCapture, err);
    recordCoverFailure(deps, row, 'renderer_unavailable');
    return;
  }

  if (!result?.ok || typeof result.path !== 'string' || result.path.length === 0) {
    recordCoverFailure(deps, row, coverFailureCodeFor(result));
    return;
  }

  try {
    const bytes = await fs.promises.readFile(result.path);
    await attachChatArtifactThumbnail(deps, {
      messageArtifactId: row.id,
      bytes,
      mime: result.mime || 'image/png',
    });
    // The cover is durable now, so the client's re-read is guaranteed to find
    // it. Announcing before the attach would race the very fetch it invites.
    // Never allowed to fail the render it is reporting on.
    try {
      onRefsChanged?.(row);
    } catch (err) {
      logCoverFailure(row.labelAtCapture, err);
    }
  } finally {
    // The renderer's temp file is the daemon's to clean up — the same contract
    // the `od export` route follows.
    await fs.promises.rm(result.path, { force: true }).catch(() => {});
  }
}

function coverFailureCodeFor(result: DesktopExportArtifactResult | undefined): ChatArtifactFailureCode {
  if (result?.code === DESKTOP_ARTIFACT_CAPTURE_ERROR_CODES.RENDER_TIMEOUT) return 'timeout';
  return 'renderer_unavailable';
}

/**
 * Record an honest miss.
 *
 * The ref keeps its `workspace_artifact_id`, so the card still opens the latest
 * file; it just has no cover and the web falls back to a live preview. The row
 * exists so a real render failure is distinguishable from a card that was never
 * a cover candidate in the first place — otherwise every legacy message would
 * look like a failure and the failures would look like nothing.
 */
function recordCoverFailure(
  deps: ChatArtifactCaptureDeps,
  row: MessageArtifactRow,
  failureCode: ChatArtifactFailureCode,
): void {
  const projectId = projectIdForWorkspaceArtifact(deps, row.workspaceArtifactId);
  if (!projectId) return;
  const snapshotId = randomUUID();
  const now = deps.now ? deps.now() : Date.now();
  insertSnapshotIntent(deps.db, {
    id: snapshotId,
    projectId,
    workspaceArtifactId: row.workspaceArtifactId,
    sourcePathAtCapture: row.labelAtCapture,
    kind: row.kind,
    mime: mimeForArtifactPath(row.labelAtCapture) ?? null,
    runId: null,
    mediaTaskId: null,
    expectedSize: null,
    expectedMtime: null,
    expectedDigest: null,
    // Nothing was ever staged, so the reconciler has no temp to sweep.
    tempKey: null,
    now,
  });
  markSnapshotFailed(deps.db, snapshotId, failureCode);
  deps.db
    .prepare(`UPDATE message_artifacts SET snapshot_id = ? WHERE id = ? AND snapshot_id IS NULL`)
    .run(snapshotId, row.id);
}

function projectIdForWorkspaceArtifact(
  deps: ChatArtifactCaptureDeps,
  workspaceArtifactId: string | null,
): string | null {
  if (!workspaceArtifactId) return null;
  const row = deps.db
    .prepare(`SELECT project_id AS projectId FROM workspace_artifacts WHERE id = ?`)
    .get(workspaceArtifactId) as { projectId: string } | undefined;
  return row?.projectId ?? null;
}

async function withBudget<T>(work: Promise<T>, budgetMs: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`chat artifact cover exceeded ${budgetMs}ms`)),
          budgetMs,
        );
        timer.unref?.();
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Forward-slash, project-relative. The bundler speaks project paths only. */
function toProjectPath(relativePath: string): string {
  return relativePath.split(path.sep).join('/').replace(/^\/+/, '');
}

/**
 * Containment-checked absolute path, or null. A dependency reference is agent
 * output: it must never be able to pull a file from outside the project into a
 * document the daemon is about to render.
 */
function resolveInsideProject(projectRoot: string, projectPath: string): string | null {
  const cleaned = toProjectPath(projectPath);
  if (!cleaned) return null;
  const absolute = path.resolve(projectRoot, cleaned);
  const relative = path.relative(projectRoot, absolute);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`)) return null;
  if (path.isAbsolute(relative)) return null;
  return absolute;
}

function logCoverFailure(label: string, err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  try {
    // Project-relative label only — never bytes, never an absolute path.
    console.warn(`[chat-artifacts] cover failed for ${label}: ${message}`);
  } catch {
    // logging is best effort
  }
}
