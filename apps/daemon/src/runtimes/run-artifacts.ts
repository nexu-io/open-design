// Daemon-side helper that counts how many distinct artifact files this
// run produced or modified. Fed into v2 `run_finished.artifact_count`.
//
// "Artifact" = a user-facing output file: HTML (prototypes / live artifacts /
// slide decks all render from `.html`), plus generated media — images, video,
// and audio — so media-kind projects no longer report a false zero. Supporting
// assets an HTML run happens to write (e.g. `assets/*.png`) are also counted;
// the metric's primary use is the boolean "did this run produce any artifact?"
// funnel, where over-counting the exact number is harmless and under-counting
// (the old HTML-only behaviour) was not.
//
// Semantics (per product spec, 2026-05-21; widened beyond HTML 2026-06-15):
//   - Count is incremental for THIS run only, not cumulative across the
//     project. If the run touched no artifact files, the count is 0.
//   - A file written multiple times within the same run counts once
//     (dedup by path) so a Write-then-Edit cycle on the same file
//     reports one artifact, not two.
//   - Both Write (create_file) and Edit / MultiEdit count, because the
//     agent often writes a skeleton then edits to fill it in; both end
//     in a new file state at run end.
//   - Read-only ops never count.
//   - Failed ops never count. A `tool_use` whose matching `tool_result`
//     reports `isError: true` (permission denied, path outside cwd,
//     parent missing, etc.) does NOT produce an artifact even though
//     the tool name and path were correct. Earlier the helper skipped
//     this join, so a "Write index.html" that errored still bumped
//     `artifact_count` to 1 and corrupted the
//     "generation_success → artifact_produced" funnel (mrcfps review
//     on PR #2590).
//
// Earlier `server.ts` hard-coded `artifact_count: 0`, which produced
// uniform zero on PostHog and made the same funnel useless from the
// other direction.

import type { TrackingRunResult } from '@open-design/contracts/analytics';
import { emittedRenderableQuestionForm } from '../question-form-detect.js';

// Tool names cover Claude-style, Codex-style, and the ACP/MCP shapes
// the daemon proxies. Keep aligned with the web-side `WRITE_NAMES` /
// `EDIT_NAMES` sets in `apps/web/src/runtime/file-ops.ts`.
// Exported so the incremental side-effect ledger
// (`run-lifecycle-analytics.ts`) pairs write/edit tool calls by the same
// tool-name set the batch counter uses, keeping the two in lock-step.
export const WRITE_OR_EDIT_TOOL_NAMES: ReadonlySet<string> = new Set([
  'Write',
  'create_file',
  'Edit',
  'str_replace_edit',
  'MultiEdit',
  'multi_edit',
]);

// Exported so the incremental ledger extracts the written path identically.
export function extractToolFilePath(input: unknown): string | null {
  if (!input || typeof input !== 'object') return null;
  const obj = input as { file_path?: unknown; path?: unknown };
  if (typeof obj.file_path === 'string' && obj.file_path) return obj.file_path;
  if (typeof obj.path === 'string' && obj.path) return obj.path;
  return null;
}

// Artifact-output file extensions. HTML covers prototypes / live artifacts /
// slide decks; the media sets mirror the canonical kind classifier in
// `projects.ts` (`.image` / `.video` / `.audio` buckets) so the counter agrees
// with how the rest of the app classifies generated files.
const ARTIFACT_EXTENSIONS: ReadonlySet<string> = new Set([
  '.html',
  '.htm',
  // image
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.avif',
  // SVG renders as a user-facing artifact (`kindFor` buckets it as `sketch`,
  // and the daemon / web artifact manifests treat `image/svg+xml` as a
  // renderable output), so a run that writes only `logo.svg` must not report
  // artifact_count: 0.
  '.svg',
  // video
  '.mp4',
  '.mov',
  '.webm',
  // audio
  '.mp3',
  '.wav',
  '.m4a',
]);

// Exported so the agent-agnostic filesystem artifact counter
// (`run-artifact-fs.ts`) classifies files by the exact same extension set the
// tool-stream counter uses, keeping the two definitions of "artifact" aligned.
export function isArtifactPath(path: string): boolean {
  const lower = path.toLowerCase();
  const dot = lower.lastIndexOf('.');
  if (dot < 0) return false;
  return ARTIFACT_EXTENSIONS.has(lower.slice(dot));
}

// Exported so the filesystem counter (`run-artifact-fs.ts`) classifies a
// touched `DESIGN.md` the same way the tool-stream counter does.
export function isDesignSystemFile(path: string): boolean {
  const lower = path.toLowerCase();
  return lower.endsWith('/design.md') || lower === 'design.md';
}

// Exported so the filesystem counter (`run-artifact-fs.ts`) recognizes the same
// `preview/*.html` modules as the tool-stream counter.
export function isPreviewModulePath(path: string): boolean {
  const lower = path.toLowerCase();
  // Preview modules live under `preview/*.html` in DS workspaces.
  // `preview/index.html` is the shell, others are per-module previews
  // (colors, typography, components, brand-assets, ...).
  return /(^|\/)preview\/[^/]+\.html$/i.test(lower);
}

export interface RunEventLike {
  event?: string;
  data?: unknown;
}

// Join key the daemon-stream uses for tool_use → tool_result pairing.
// Claude / Codex / ACP all stamp the same `id` onto the `tool_use`
// event and reference it via `toolUseId` on the subsequent
// `tool_result`; see `apps/daemon/src/langfuse-bridge.ts#collectToolCalls`
// for the canonical implementation.
export function readToolUseId(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const obj = data as { id?: unknown };
  return typeof obj.id === 'string' && obj.id ? obj.id : null;
}

export function readToolResultId(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const obj = data as { toolUseId?: unknown };
  return typeof obj.toolUseId === 'string' && obj.toolUseId
    ? obj.toolUseId
    : null;
}

export function readToolResultIsError(data: unknown): boolean {
  if (!data || typeof data !== 'object') return false;
  return (data as { isError?: unknown }).isError === true;
}

// Generic write counter shared by all three predicates. Returns the
// set of distinct paths the run successfully wrote / edited that
// match `predicate`. Failure-pairing semantics match
// `countNewArtifacts` so the counters stay aligned.
function collectWrittenPathsMatching(
  events: readonly RunEventLike[],
  predicate: (path: string) => boolean,
): Set<string> {
  if (!events || events.length === 0) return new Set();
  const resultByToolUseId = new Map<string, { isError: boolean }>();
  for (const rec of events) {
    if (rec?.event !== 'agent') continue;
    const data = rec.data as { type?: string } | null | undefined;
    if (data?.type !== 'tool_result') continue;
    const id = readToolResultId(rec.data);
    if (!id) continue;
    resultByToolUseId.set(id, { isError: readToolResultIsError(rec.data) });
  }
  const writtenPaths = new Set<string>();
  for (const rec of events) {
    if (rec?.event !== 'agent') continue;
    const data = rec.data as
      | { type?: string; name?: unknown; input?: unknown }
      | null
      | undefined;
    if (data?.type !== 'tool_use') continue;
    if (typeof data.name !== 'string') continue;
    if (!WRITE_OR_EDIT_TOOL_NAMES.has(data.name)) continue;
    const path = extractToolFilePath(data.input);
    if (!path) continue;
    if (!predicate(path)) continue;
    const toolUseId = readToolUseId(rec.data);
    if (!toolUseId) continue;
    const outcome = resultByToolUseId.get(toolUseId);
    if (!outcome) continue;
    if (outcome.isError) continue;
    writtenPaths.add(path);
  }
  return writtenPaths;
}

// True iff the run successfully wrote or edited a `DESIGN.md` file.
// Fed into `run_finished.design_system_created` for the DS variant.
export function didRunCreateDesignSystemFile(
  events: readonly RunEventLike[],
): boolean {
  return collectWrittenPathsMatching(events, isDesignSystemFile).size > 0;
}

// Count of distinct preview modules the run wrote under `preview/`.
// Fed into `run_finished.preview_module_count`. A run that wrote
// `preview/index.html` only counts as 1 module preview (the
// path-distinct semantics match countNewArtifacts).
export function countDesignSystemPreviewModules(
  events: readonly RunEventLike[],
): number {
  return collectWrittenPathsMatching(events, isPreviewModulePath).size;
}

// Count of distinct artifact files (HTML + image/video/audio) the run
// successfully wrote or edited. Fed into `run_finished.artifact_count`.
// Failure-pairing + path-dedup semantics come from the shared
// `collectWrittenPathsMatching` helper (a tool_use whose tool_result reports
// `isError` does not count; a file written then edited counts once).
export function countNewArtifacts(events: readonly RunEventLike[]): number {
  return collectWrittenPathsMatching(events, isArtifactPath).size;
}

// True iff the run raised an intent-clarification question. Fed into
// `run_finished.asked_user_question`. A clarification turn is the agent
// stopping to ask the user a finite-choice question; it inherently produces
// no artifact, so the dashboard uses this flag to exclude such runs from the
// "run finished -> has artifact" funnel rather than scoring them as
// artifact-generation failures.
//
// Clarification now surfaces as a `<question-form>` artifact in the
// assistant's streamed text (the AskUserQuestion tool was retired in favor of
// the unified question-form flow; see `apps/web/src/artifacts/question-form.ts`
// and the `awaiting_input` detection in `apps/daemon/src/db.ts`). Assistant
// text arrives as `text_delta` chunks, so the marker can straddle a chunk
// boundary — concatenate the run's text before testing for it.
//
// Two correctness points enforced here:
//   1. Persisted `text_delta` events carry the chunk on `delta`
//      (`{ type: 'text_delta'; delta }`, see packages/contracts/src/sse/chat.ts),
//      NOT `text`. Reading `text` appended nothing for real runs, leaving the
//      signal permanently false. We read `delta` first, and still accept a
//      `text` field for any runtime that emits a whole-text event.
//   2. We require a *renderable* closed `<question-form>`/`<ask-question>`
//      block (shared `emittedRenderableQuestionForm`), not a raw open-tag
//      match — so a run that merely shows the literal markup inside a generated
//      doc, code sample, or HTML artifact is not misclassified as a
//      clarification turn and wrongly excluded from the artifact funnel. The
//      `<ask-question>` alias is covered by that shared matcher.
export function runAskedUserQuestion(
  events: readonly RunEventLike[],
): boolean {
  if (!events || events.length === 0) return false;
  return emittedRenderableQuestionForm(reconstructAssistantText(events));
}

// Reassemble the assistant's streamed text from a run's event log. Text
// arrives as `text_delta` chunks (carried on `delta`; some runtimes emit a
// whole-text `text` event instead), so markers like `<od-card>` can straddle
// a chunk boundary — callers must concatenate before scanning. Used by the
// POST self-verify enforcement (memory-verify) to find the scorecard card.
export function reconstructAssistantText(
  events: readonly RunEventLike[],
): string {
  if (!events || events.length === 0) return '';
  let text = '';
  for (const rec of events) {
    if (rec?.event !== 'agent') continue;
    const data = rec.data as
      | { type?: unknown; text?: unknown; delta?: unknown }
      | null
      | undefined;
    if (!data) continue;
    if (data.type !== 'text_delta' && data.type !== 'text') continue;
    if (typeof data.delta === 'string') text += data.delta;
    else if (typeof data.text === 'string') text += data.text;
  }
  return text;
}

// First-touch activation milestones, written to the PostHog person record via
// `$set_once` on `run_finished` (the authoritative daemon-side run-outcome
// event that already carries `artifact_count` and `design_system_created`).
// Two milestones the growth funnel needs to segment a user without replaying
// their whole event history:
//
//   - `first_artifact_at`        — first run, observed since this stamp shipped,
//                                  in which the user produced an artifact
//   - `first_design_system_at`   — first run, observed since this stamp shipped,
//                                  in which the user generated a design system
//
// IMPORTANT — "first observed since rollout", NOT "first ever". `$set_once`
// only writes a key that does not already exist on the person, and this is the
// only writer, so the timestamp is pinned to the user's first qualifying run
// AFTER this code ships. For users who onboard after rollout that equals their
// true first-ever milestone (and a faithful time-to-first-value signal). For
// the pre-existing installed base it does NOT: a user who already produced an
// artifact before rollout gets the timestamp of their next qualifying run
// instead. There is no historical backfill in this path, so cohorts and
// time-to-first-value built on these keys are only sound for post-rollout
// users — segment older accounts by first-seen date before relying on them
// (nettee review on PR #4362).
//
// The two are independent: a single design-system run that also emits HTML
// artifacts legitimately crosses both at once.
//
// Only a SUCCESSFUL run counts — a failed/cancelled run that happened to touch
// a file is not a milestone (mirrors the `artifact_count` funnel's "generation
// success → artifact produced" framing).
//
// The design-system milestone must mirror the EXACT condition under which
// `run_finished` emits `design_system_created`, which is gated on
// `isDesignSystemRun` (server.ts only includes the field for DS runs). A plain
// chat run can also write a `DESIGN.md` — `finalize-design.ts` lands one under
// the project dir, and a user can edit an existing `DESIGN.md` from the chat
// composer — so `designSystemCreated` alone (the raw "a DESIGN.md was written"
// signal) would stamp `first_design_system_at` on runs whose `run_finished`
// reports no `design_system_created`, drifting the person property away from
// the metric and overstating DS activation. Gating on `isDesignSystemRun`
// keeps the milestone and the event field in lockstep (nettee review on
// PR #4362).
//
// Returns undefined when the run crossed no milestone so the caller omits the
// `$set_once` key entirely rather than shipping an empty object.
export function deriveActivationMilestones(args: {
  result: TrackingRunResult;
  artifactCount: number;
  designSystemCreated: boolean;
  // Whether this run is a design-system generation run. The DS milestone is
  // gated on it so it tracks `run_finished.design_system_created` exactly.
  isDesignSystemRun: boolean;
  capturedAtIso: string;
}): { first_artifact_at?: string; first_design_system_at?: string } | undefined {
  if (args.result !== 'success') return undefined;
  const milestones: {
    first_artifact_at?: string;
    first_design_system_at?: string;
  } = {};
  if (args.artifactCount > 0) milestones.first_artifact_at = args.capturedAtIso;
  if (args.isDesignSystemRun && args.designSystemCreated) {
    milestones.first_design_system_at = args.capturedAtIso;
  }
  return Object.keys(milestones).length > 0 ? milestones : undefined;
}
