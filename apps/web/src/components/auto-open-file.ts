// Decide whether to auto-open a file after an agent Write/Edit tool result.
// Only files that exist in the project's refreshed file list should open as
// tabs — out-of-project paths (upstream repo edits, system files) would
// otherwise create permanent placeholder tabs.
//
// Resolution order:
//   1) Path-suffix match. If the agent's `filePath` equals or ends with
//      `/${file.path}` (full segment alignment), treat it as a positive
//      identification of that project file. If exactly one file matches,
//      open it. If multiple files share a path-suffix with `filePath`,
//      decline as ambiguous rather than open the wrong one.
//   2) Basename fallback — only when `filePath` has no slash (it's already
//      a basename) and exactly one project file has that basename. This
//      preserves the golden path for short filePath inputs while still
//      rejecting external edits that happen to share a basename with a
//      project file (those will have a slash in `filePath` and reach this
//      step with zero suffix matches → declined).

interface CandidateFile {
  readonly name: string;
  readonly path?: string;
  readonly kind?: string;
  readonly mtime?: number;
  readonly type?: string;
}

interface AutoOpenOptions {
  // Names of files that are React modules loaded by a sibling HTML entry (via
  // `<script type="text/babel" src>`). These have no standalone preview, so
  // auto-opening one strands the user on a dead-end tab. When a resolved
  // candidate is in this set we decline to open it. See
  // `apps/web/src/runtime/jsx-module-refs.ts` for how the set is derived.
  readonly moduleFileNames?: ReadonlySet<string>;
}

const NO_MODULES: ReadonlySet<string> = new Set();

function basenameOf(p: string): string {
  return p.split('/').pop() ?? p;
}

export function decideAutoOpenAfterWrite(
  filePath: string,
  nextFiles: ReadonlyArray<CandidateFile>,
  options: AutoOpenOptions = {},
): { shouldOpen: boolean; fileName: string | null } {
  const moduleFileNames = options.moduleFileNames ?? NO_MODULES;
  // Resolve a positive identification into an open decision, declining files
  // that are modules of a multi-file HTML entry rather than standalone pages.
  const resolve = (fileName: string): { shouldOpen: boolean; fileName: string | null } =>
    moduleFileNames.has(fileName)
      ? { shouldOpen: false, fileName: null }
      : { shouldOpen: true, fileName };

  if (!filePath) return { shouldOpen: false, fileName: null };

  // 1) Path-suffix match against full project-relative paths.
  const suffixMatches: CandidateFile[] = [];
  for (const f of nextFiles) {
    const rel = f.path ?? f.name;
    if (!rel) continue;
    if (filePath === rel) {
      suffixMatches.push(f);
      continue;
    }
    // Require segment alignment: filePath ends with "/${rel}" so that
    // "subdir/App.jsx" matches ".../subdir/App.jsx" but not
    // ".../notsubdir/App.jsx".
    if (filePath.length > rel.length && filePath.endsWith('/' + rel)) {
      suffixMatches.push(f);
    }
  }
  if (suffixMatches.length === 1) {
    return resolve(suffixMatches[0]!.name);
  }
  if (suffixMatches.length > 1) {
    // Multiple project files plausibly correspond to this path — refuse
    // rather than open the wrong one.
    return { shouldOpen: false, fileName: null };
  }

  // 2) Basename fallback only when filePath itself is just a basename.
  // If filePath contains a slash but didn't path-suffix-match anything,
  // it's an external edit that happens to share a basename — declining
  // is the whole point of the guard.
  if (filePath.includes('/')) {
    return { shouldOpen: false, fileName: null };
  }

  const basenameMatches = nextFiles.filter((f) => {
    const rel = f.path ?? f.name;
    return rel ? basenameOf(rel) === filePath : false;
  });
  if (basenameMatches.length === 1) {
    return resolve(basenameMatches[0]!.name);
  }
  return { shouldOpen: false, fileName: null };
}

function isHtmlPreviewFile(file: CandidateFile): boolean {
  const path = file.path ?? file.name;
  return file.kind === 'html' || /\.html?$/i.test(path);
}

// Markdown documents (plan.md, report.md, DESIGN.md, …) render inline in the
// viewer, so a turn that produces one should surface it just like an HTML
// page. The daemon maps `.md`/`.txt` to the same `kind: 'text'`, so the
// extension — not `kind` — is the only reliable discriminator: we open
// markdown but deliberately leave plain `.txt` alone.
function isMarkdownPreviewFile(file: CandidateFile): boolean {
  const path = file.path ?? file.name;
  return /\.(md|markdown)$/i.test(path);
}

function isMediaPreviewFile(file: CandidateFile): boolean {
  return file.kind === 'image' || file.kind === 'video' || file.kind === 'audio';
}

// Auto-open priority for a turn's produced files. Higher wins. HTML is the
// primary visual deliverable, so when a turn writes both an HTML page and a
// markdown note (e.g. index.html + README.md) the page takes focus; markdown
// is the next-best previewable artifact. Image, video, and audio files are the
// fallback for media-only turns; non-previewable outputs such as decks and raw
// text are left for the user to open from the produced-files chips.
function autoOpenPreviewRank(file: CandidateFile): number {
  if (isHtmlPreviewFile(file)) return 3;
  if (isMarkdownPreviewFile(file)) return 2;
  if (isMediaPreviewFile(file)) return 1;
  return 0;
}

// `zh/index.html` → depth 2, root `index.html` → depth 1; null for non-entry
// files. Depth orders competing entries so the site root wins over a locale
// or section subtree's own index.
function siteEntryDepth(file: CandidateFile): number | null {
  const path = file.path ?? file.name;
  if (!/(^|\/)index\.html?$/i.test(path)) return null;
  return path.split('/').length;
}

export interface SelectAutoOpenOptions {
  // Prefer the site entry (`index.html`) among the turn's produced HTML
  // files. Website-clone turns reproduce a whole multi-page site in one run —
  // subpages, assets, and reports keep landing after the entry page, so the
  // newest-mtime tie-break below would open whatever page happened to be
  // written last. With this flag the shallowest produced `index.html` wins
  // (ties to newest mtime); turns that produce no index.html keep the
  // standard rank/mtime behavior.
  readonly preferSiteEntry?: boolean;
}

export interface SelectAutoOpenTurnOptions extends SelectAutoOpenOptions {
  // Epoch ms when the turn started. When set, files whose mtime lands at or
  // after this instant (minus a filesystem-precision grace) count as touched
  // by the turn even though their NAME already existed before it. A
  // regeneration that rewrites index.html in place produces no new file name,
  // so a pure pre/post name diff misses it — the Plan-mode
  // plan → generate → edit plan → regenerate loop hits this on every second
  // generation. Window bounds match AssistantMessage's
  // inferProducedFilesFromTurn: [startedAt - 1s, endedAt + 60s].
  readonly turnStartedAt?: number | null;
  // Epoch ms when the turn ended. Bounds the attribution window on the right
  // (plus a grace for writes that settle just after the terminal status), so
  // a file the USER edits after the turn — reviewing the plan before the next
  // reload/reattach recovery pass — is not attributed to the agent. Without
  // it the window stays open-ended, preserving prior behavior for callers
  // that cannot know the end time.
  readonly turnEndedAt?: number | null;
  // Project file NAMES the agent's Write/Edit tool events actually touched
  // this turn. When non-empty, mtime-window candidates are restricted to this
  // set: in Plan mode the user edits plan.md in the split editor with
  // autosave on, so its mtime lands inside the turn window from the user's
  // own keystrokes — without this restriction a text-only turn would yank
  // focus back to it. Protocols that emit no write events (codex, gemini,
  // opencode, ACP agents) supply an empty set and keep the pure time window;
  // that window exists precisely because they have no per-write signal.
  readonly agentTouchedFileNames?: ReadonlySet<string> | null;
}

const TURN_MTIME_GRACE_MS = 1_000;
// Mirrors inferProducedFilesFromTurn's trailing margin: daemon terminal
// status and the last file write are stamped by different clocks.
const TURN_END_MTIME_GRACE_MS = 60_000;

// Mirrors isImplicitProducedFileCandidate in src/produced-files.ts: sketches
// change during a run because the USER draws, not because the agent wrote.
function isUserSketchFile(file: CandidateFile): boolean {
  return (file.path ?? file.name).toLowerCase().endsWith('.sketch.json');
}

// Turn-end auto-open selection: the produced (newly created) files plus any
// pre-existing project file the turn rewrote in place, ranked by the same
// preview priority as selectAutoOpenProducedArtifact. Without turnStartedAt
// (legacy messages with no start stamp) this degrades to the produced-only
// behavior rather than guessing from unrelated mtimes.
export function selectAutoOpenTurnArtifact(
  producedFiles: ReadonlyArray<CandidateFile>,
  allFiles: ReadonlyArray<CandidateFile>,
  options: SelectAutoOpenTurnOptions = {},
): string | null {
  const startedAt = options.turnStartedAt;
  if (typeof startedAt !== 'number' || !Number.isFinite(startedAt) || startedAt <= 0) {
    return selectAutoOpenProducedArtifact(producedFiles, options);
  }
  const endedAt = options.turnEndedAt;
  const windowEnd =
    typeof endedAt === 'number' && Number.isFinite(endedAt) && endedAt > 0
      ? endedAt + TURN_END_MTIME_GRACE_MS
      : null;
  const touched = options.agentTouchedFileNames;
  const restrictToTouched = touched != null && touched.size > 0;
  const seen = new Set(producedFiles.map((f) => f.name));
  const candidates = [...producedFiles];
  for (const file of allFiles) {
    if (!file.name || seen.has(file.name)) continue;
    if (file.type === 'dir') continue;
    if (file.name.startsWith('.') || file.name.includes('/.')) continue;
    if (isUserSketchFile(file)) continue;
    if (restrictToTouched && !touched.has(file.name)) continue;
    const mtime = typeof file.mtime === 'number' && Number.isFinite(file.mtime) ? file.mtime : null;
    if (mtime === null || mtime < startedAt - TURN_MTIME_GRACE_MS) continue;
    if (windowEnd !== null && mtime > windowEnd) continue;
    candidates.push(file);
  }
  return selectAutoOpenProducedArtifact(candidates, options);
}

// Generic over the caller's file record (ProjectView passes `ProjectFile`) so
// the stored resolver keeps its own parameter type instead of being widened to
// `CandidateFile` at the call site.
export interface AutoOpenSettleRequest<F extends CandidateFile = CandidateFile> {
  // The turn's produced (name-diffed) files, as computed at turn end.
  readonly producedFiles: ReadonlyArray<CandidateFile>;
  // Rebuilt against each settled list rather than captured once: the touched
  // NAME set is resolved from the file list itself
  // (`resolveAgentTouchedFileNames`), so a list that was still missing
  // `index.html` at turn end also fails to resolve the write event that
  // produced it — and `selectAutoOpenTurnArtifact` would then exclude the file
  // as "not touched" even after it lands.
  readonly resolveTurnOptions: (allFiles: ReadonlyArray<F>) => SelectAutoOpenTurnOptions;
  // What the turn-end pass asked the workspace to open, or null when that pass
  // found nothing openable.
  readonly requestedFileName: string | null;
  // Active workspace tab as of the turn-end pass, before its own open request
  // landed. Together with `requestedFileName` this distinguishes "auto-open
  // never landed" from "the user has since chosen a different tab".
  //
  // MUST be sampled at terminal handoff, before the post-run file refresh and
  // artifact persistence are awaited. Sampling it after those awaits lets a tab
  // the USER selected while they ran become this turn's baseline, which turns
  // the focus-move guard below into its own opposite: the user's choice reads
  // as "where the turn put focus", and the watcher yanks them out of it.
  readonly activeFileNameAtTurnEnd: string | null;
  // Every file the RUN's own auto-open moved focus to. Those activations are
  // the run's, not the user's, so they must not read as "the user moved on" —
  // but they cannot be known at the moment `activeFileNameAtTurnEnd` is
  // sampled, because they happen after it.
  //
  // A live set rather than a snapshot: the run's per-write refreshes are
  // fire-and-forget and can open their file after this watch is armed. A copy
  // taken at arming time would miss exactly those, and the guard would then
  // read the run's own late activation as the user moving on.
  readonly turnOwnedFileNames?: ReadonlySet<string>;
  // Epoch ms after which the turn stops being re-evaluated.
  readonly deadline: number;
}

export interface AutoOpenSettleDecision {
  // File to (re)open now, or null when there is nothing to do this round.
  readonly openFileName: string | null;
  // Whether later settled lists should still be re-evaluated for this turn.
  readonly keepWatching: boolean;
}

// Post-turn re-evaluation (issue #5352). The turn-end pass selects from one
// `fresh: true` file-list read taken right after the daemon reports terminal
// status; when the generated file has not surfaced in that read yet, the pass
// selects nothing (or a lower-ranked artifact) and nothing ever revisits the
// decision. Both observed failure modes come from that single-shot handoff:
// `index.html` never becomes an openable tab, or a different tab keeps focus.
//
// So instead of making the turn-end path await a settled list — which would
// touch the turn-end sequencing #5602 deliberately centralised — each later
// settled file list re-runs the same selection with the same turn inputs and
// opens the artifact once it is actually openable.
//
// It stays silent unless the answer is unambiguous: the artifact must exist in
// the settled list (an entry the workspace can render as a tab), the turn must
// still be inside its window, and focus must not have moved anywhere the
// turn-end pass did not put it.
export function reevaluateAutoOpenOnFilesSettled<F extends CandidateFile>(
  request: AutoOpenSettleRequest<F>,
  allFiles: ReadonlyArray<F>,
  context: { now: number; activeFileName: string | null },
): AutoOpenSettleDecision {
  if (context.now > request.deadline) return { openFileName: null, keepWatching: false };

  const resolved = selectAutoOpenTurnArtifact(
    request.producedFiles,
    allFiles,
    request.resolveTurnOptions(allFiles),
  );
  // Nothing selectable yet — the list may still be catching up.
  if (!resolved) return { openFileName: null, keepWatching: true };
  // Selected, but the workspace cannot render it as a tab yet: a produced-file
  // name the settled list has not caught up with. Keep waiting rather than
  // asking for a tab that would be filtered straight back out.
  const openable = allFiles.some((file) => file.name === resolved && file.type !== 'dir');
  if (!openable) return { openFileName: null, keepWatching: true };
  // Already focused — nothing to correct right now. Keep watching rather than
  // finishing here: the current best may still be a support file the turn-end
  // pass settled for, and the deliverable can land in a later list. The
  // deadline, not this round, ends the watch.
  if (context.activeFileName === resolved) return { openFileName: null, keepWatching: true };
  // Focus is somewhere the turn did not put it: the user (or another flow)
  // moved on. Re-opening now would yank them out of what they chose.
  //
  // "The turn put it there" is the union of where focus sat at terminal handoff
  // and every file the turn's own auto-open opened afterwards — the completion
  // continuation can open a recovered same-turn write before this watcher is
  // ever armed, and that is an auto activation, not the user's.
  const turnOwnsFocus =
    context.activeFileName === request.activeFileNameAtTurnEnd
    || context.activeFileName === request.requestedFileName
    || (
      context.activeFileName !== null
      && (request.turnOwnedFileNames?.has(context.activeFileName) ?? false)
    );
  if (!turnOwnsFocus) return { openFileName: null, keepWatching: false };
  return { openFileName: resolved, keepWatching: false };
}

// Pick which of a turn's produced files to auto-open in the viewer. Among
// previewable files, a higher-priority kind always beats a lower one; ties
// break to the most recently written file (newest mtime). Returns null when
// the turn produced nothing previewable.
export function selectAutoOpenProducedArtifact(
  producedFiles: ReadonlyArray<CandidateFile>,
  options: SelectAutoOpenOptions = {},
): string | null {
  if (options.preferSiteEntry) {
    let entry: CandidateFile | null = null;
    let entryDepth = Number.POSITIVE_INFINITY;
    for (const file of producedFiles) {
      if (!isHtmlPreviewFile(file)) continue;
      const depth = siteEntryDepth(file);
      if (depth === null) continue;
      if (depth < entryDepth) {
        entry = file;
        entryDepth = depth;
        continue;
      }
      if (depth > entryDepth || !entry) continue;
      const nextMtime = typeof file.mtime === 'number' && Number.isFinite(file.mtime) ? file.mtime : 0;
      const entryMtime =
        typeof entry.mtime === 'number' && Number.isFinite(entry.mtime) ? entry.mtime : 0;
      if (nextMtime >= entryMtime) entry = file;
    }
    if (entry) return entry.name;
  }
  let selected: CandidateFile | null = null;
  let selectedRank = 0;
  for (const file of producedFiles) {
    const rank = autoOpenPreviewRank(file);
    if (rank === 0) continue;
    if (!selected || rank > selectedRank) {
      selected = file;
      selectedRank = rank;
      continue;
    }
    if (rank < selectedRank) continue;
    const nextMtime = typeof file.mtime === 'number' && Number.isFinite(file.mtime) ? file.mtime : 0;
    const selectedMtime =
      typeof selected.mtime === 'number' && Number.isFinite(selected.mtime) ? selected.mtime : 0;
    if (nextMtime >= selectedMtime) selected = file;
  }
  return selected?.name ?? null;
}
