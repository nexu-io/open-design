// Daemon-side helper that counts how many distinct `.html` files this
// run produced or modified. Fed into v2 `run_finished.artifact_count`.
//
// Semantics (per product spec, 2026-05-21):
//   - Count is incremental for THIS run only, not cumulative across the
//     project. If the run touched no `.html` files, the count is 0.
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

// Tool names cover Claude-style, Codex-style, and the ACP/MCP shapes
// the daemon proxies. Keep aligned with the web-side `WRITE_NAMES` /
// `EDIT_NAMES` sets in `apps/web/src/runtime/file-ops.ts`.
const WRITE_OR_EDIT_TOOL_NAMES: ReadonlySet<string> = new Set([
  'Write',
  'create_file',
  'Edit',
  'str_replace_edit',
  'MultiEdit',
  'multi_edit',
]);

// Tool names the daemon recognizes as an intent-clarification card. Claude
// emits `AskUserQuestion`; the ACP/MCP snake_case proxy shape emits
// `ask_user_question`. Keep aligned with the AskUserQuestion detection in
// `apps/daemon/src/server.ts` and the card rendering in
// `apps/web/src/components/ToolCard.tsx`.
const ASK_USER_QUESTION_TOOL_NAMES: ReadonlySet<string> = new Set([
  'AskUserQuestion',
  'ask_user_question',
]);

function extractToolFilePath(input: unknown): string | null {
  if (!input || typeof input !== 'object') return null;
  const obj = input as { file_path?: unknown; path?: unknown };
  if (typeof obj.file_path === 'string' && obj.file_path) return obj.file_path;
  if (typeof obj.path === 'string' && obj.path) return obj.path;
  return null;
}

function isHtmlPath(path: string): boolean {
  return path.toLowerCase().endsWith('.html');
}

function isDesignSystemFile(path: string): boolean {
  const lower = path.toLowerCase();
  return lower.endsWith('/design.md') || lower === 'design.md';
}

function isPreviewModulePath(path: string): boolean {
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
function readToolUseId(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const obj = data as { id?: unknown };
  return typeof obj.id === 'string' && obj.id ? obj.id : null;
}

function readToolResultId(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const obj = data as { toolUseId?: unknown };
  return typeof obj.toolUseId === 'string' && obj.toolUseId
    ? obj.toolUseId
    : null;
}

function readToolResultIsError(data: unknown): boolean {
  if (!data || typeof data !== 'object') return false;
  return (data as { isError?: unknown }).isError === true;
}

// Generic write counter shared by all three predicates. Returns the
// set of distinct paths the run successfully wrote / edited that
// match `predicate`. Failure-pairing semantics match
// `countNewHtmlArtifacts` so the three counters stay aligned.
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
// path-distinct semantics match countNewHtmlArtifacts).
export function countDesignSystemPreviewModules(
  events: readonly RunEventLike[],
): number {
  return collectWrittenPathsMatching(events, isPreviewModulePath).size;
}

export function countNewHtmlArtifacts(events: readonly RunEventLike[]): number {
  if (!events || events.length === 0) return 0;

  // First pass: collect tool_result records keyed by toolUseId so the
  // second pass can resolve each tool_use's outcome without quadratic
  // scanning. Default outcome for a tool_use with no matching result
  // (run still streaming when this is called, or adapter swallowed
  // the result) is "still in flight" — we treat that as NOT counting,
  // since we can't confirm the artifact actually landed. The web-side
  // `deriveFileOps` makes the same choice (status='running' for
  // unmatched tool_use); aligning here keeps both pipelines in sync.
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
    if (!isHtmlPath(path)) continue;
    const toolUseId = readToolUseId(rec.data);
    // No id: legacy / synthetic stream shapes that don't pair. Be
    // conservative and skip; the dashboard would rather under-count
    // than count attempts that may have failed silently.
    if (!toolUseId) continue;
    const outcome = resultByToolUseId.get(toolUseId);
    // No matching result: tool still in flight at snapshot time, OR
    // adapter never emitted one. Don't count either way.
    if (!outcome) continue;
    if (outcome.isError) continue;
    writtenPaths.add(path);
  }
  return writtenPaths.size;
}

// True iff the run raised an AskUserQuestion clarification card. Fed into
// `run_finished.asked_user_question`. A clarification turn is the agent
// stopping to ask the user a finite-choice question; it inherently produces
// no artifact, so the dashboard uses this flag to exclude such runs from the
// "run finished -> has artifact" funnel rather than scoring them as
// artifact-generation failures.
export function runAskedUserQuestion(
  events: readonly RunEventLike[],
): boolean {
  if (!events || events.length === 0) return false;
  for (const rec of events) {
    if (rec?.event !== 'agent') continue;
    const data = rec.data as
      | { type?: string; name?: unknown }
      | null
      | undefined;
    if (data?.type !== 'tool_use') continue;
    if (typeof data.name !== 'string') continue;
    if (ASK_USER_QUESTION_TOOL_NAMES.has(data.name)) return true;
  }
  return false;
}
