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

// Extensions the daemon's `kindFor` (apps/daemon/src/projects.ts) files under
// its image, video, and audio buckets. `.svg` is deliberately absent: the
// daemon files it — and any root-level `sketch-*` raster — as 'sketch', which
// is a surface the USER draws on, not a turn deliverable.
const MEDIA_EXTENSION = /\.(png|jpe?g|gif|webp|avif|mp4|mov|webm|mp3|wav|m4a)$/i;
const DAEMON_SKETCH_NAME_PREFIX = 'sketch-';

// Media candidates do not always carry a `kind`. ProjectView's
// `provenTraceTouchedFiles()` builds them from the agent's own Write/Edit tool
// paths, which yield a name, a path, and an ordering mtime — nothing else — so
// keying only off `kind` scored every image on that path as rank 0 and
// silently declined it. Fall back to the extension the way the html and
// markdown predicates above do, mirroring `kindFor`'s buckets so the fallback
// and the field it stands in for cannot reach different verdicts.
function isMediaPreviewFile(file: CandidateFile): boolean {
  if (file.kind === 'image' || file.kind === 'video' || file.kind === 'audio') return true;
  const path = file.path ?? file.name;
  return MEDIA_EXTENSION.test(path) && !path.startsWith(DAEMON_SKETCH_NAME_PREFIX);
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
  // Optional turn-start snapshot. When two previewable files have the same
  // rank, prefer one the turn created over an older file it rewrote later.
  // Callers recovering legacy turns may not have this snapshot; omitting it
  // preserves the historical newest-mtime tie-break.
  readonly preTurnFileNames?: ReadonlySet<string> | null;
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
  return selectAutoOpenProducedArtifact(
    collectTurnCandidates(producedFiles, allFiles, options),
    options,
  );
}

/**
 * Every artifact a finished turn should open, and which of them takes focus.
 *
 * Same candidate set and same criterion as `selectAutoOpenTurnArtifact` — this
 * only removes that function's last step. See `selectAutoOpenProducedArtifacts`
 * for the ruling and for what "primary" means here.
 */
export function selectAutoOpenTurnArtifacts(
  producedFiles: ReadonlyArray<CandidateFile>,
  allFiles: ReadonlyArray<CandidateFile>,
  options: SelectAutoOpenTurnOptions = {},
): TurnAutoOpenSelection {
  return selectAutoOpenProducedArtifacts(
    collectTurnCandidates(producedFiles, allFiles, options),
    options,
  );
}

// The files a turn is allowed to auto-open from: everything it produced, plus
// any pre-existing project file it rewrote inside the turn's mtime window.
function collectTurnCandidates(
  producedFiles: ReadonlyArray<CandidateFile>,
  allFiles: ReadonlyArray<CandidateFile>,
  options: SelectAutoOpenTurnOptions,
): CandidateFile[] {
  const startedAt = options.turnStartedAt;
  if (typeof startedAt !== 'number' || !Number.isFinite(startedAt) || startedAt <= 0) {
    return [...producedFiles];
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
  return candidates;
}

export interface AgentFocusOpenInput {
  // Project-relative path the agent declared via `<od-focus open="…">`, already
  // key-checked, root-resolved, and proven non-empty by the daemon. `null` when
  // this turn declared nothing — which must leave the host's own choice alone.
  readonly declaredPath: string | null | undefined;
  // The project's current file list, used only to map the declared path onto a
  // real project file NAME. A path with no matching file is declined: the
  // daemon proved the file exists on disk, but the workspace opens tabs by
  // name, and a name we cannot resolve would spawn a placeholder tab.
  readonly projectFiles: ReadonlyArray<CandidateFile>;
  // File names that already existed when this turn started. The product ruling
  // is that the agent may only auto-open files it CREATED this turn, so a
  // declared path that was already there is declined — the agent is pointing at
  // something the user may already have open and reasoned about.
  readonly preTurnFileNames: ReadonlySet<string> | null | undefined;
  // True once the user has taken the preview over themselves during this turn.
  // See `decideAgentFocusOpen` for why that wins.
  readonly userTookOverPreview: boolean;
  // Same module-file guard `decideAutoOpenAfterWrite` applies: a .jsx/.tsx
  // loaded by a sibling HTML entry has no standalone preview.
  readonly moduleFileNames?: ReadonlySet<string>;
}

/**
 * Decide whether the agent's declared `open` path should take the preview.
 *
 * Four gates, in order of how much they cost to get wrong:
 *
 *  1. **No declaration, no change.** Returns "don't open" so the caller's
 *     existing inference runs untouched. "The agent said nothing" must never
 *     collapse the preview to nothing — that is the fallback the product owner
 *     ruled on explicitly, and it is also every conversation recorded before
 *     this marker existed.
 *
 *  2. **The user wins.** If the user has opened a file themselves during this
 *     turn, the agent does not get to yank it away. The asymmetry is the whole
 *     argument: being wrong in this direction costs one click (the file is
 *     still a chip away in the produced-files panel), while being wrong in the
 *     other direction throws away someone's place in a document they were
 *     mid-read on, with no undo and no explanation. Auto-open features earn
 *     their "focus theft" reputation precisely here.
 *
 *  3. **Created this turn.** A path that existed before the turn started is
 *     declined even when the agent names it. The agent is allowed to say which
 *     of ITS OWN outputs matters, not to navigate the workspace at will.
 *
 *  4. **Resolvable and previewable.** The name must exist in the file list and
 *     must not be a module of a multi-file HTML entry.
 *
 * Everything the daemon already proved — path is inside the project root, file
 * is non-empty — is deliberately NOT re-checked here. Re-deriving a security
 * property on the client would be the wrong side of the trust boundary and
 * would invite the two copies to disagree.
 */
export function decideAgentFocusOpen(
  input: AgentFocusOpenInput,
): { shouldOpen: boolean; fileName: string | null } {
  const declined = { shouldOpen: false, fileName: null } as const;
  const declaredPath = input.declaredPath;
  if (typeof declaredPath !== 'string' || !declaredPath) return declined;
  if (input.userTookOverPreview) return declined;

  const wanted = declaredPath.replace(/\\/g, '/').replace(/^\.\//, '');
  const wantedBase = basenameOf(wanted);
  const matches = input.projectFiles.filter((file) => {
    if (file.type === 'dir') return false;
    const rel = (file.path ?? file.name)?.replace(/\\/g, '/');
    if (!rel) return false;
    return rel === wanted || (wanted.indexOf('/') === -1 && basenameOf(rel) === wantedBase);
  });
  // Ambiguity is declined rather than guessed, exactly as in
  // decideAutoOpenAfterWrite: opening the wrong file is worse than opening none.
  if (matches.length !== 1) return declined;
  const file = matches[0]!;

  const preTurn = input.preTurnFileNames;
  // Without a pre-turn snapshot we cannot prove the file is new. Decline rather
  // than assume: a legacy/recovered path that has no snapshot is exactly the
  // case where "the agent named an old file" is most likely.
  if (!preTurn || preTurn.has(file.name)) return declined;

  if ((input.moduleFileNames ?? NO_MODULES).has(file.name)) return declined;
  return { shouldOpen: true, fileName: file.name };
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
    const entry = selectSiteEntryFile(producedFiles, options);
    if (entry) return entry.name;
  }
  return selectBestRankedFile(producedFiles, options)?.name ?? null;
}

export interface TurnAutoOpenSelection {
  // The tab that ends up SELECTED. Identical to what
  // `selectAutoOpenProducedArtifact` returns for the same input: the ruling
  // below changed how many tabs open, not which one the user lands on.
  readonly focused: string | null;
  // Every artifact to open, in file-list order, `focused` included. Deduped by
  // name, so a file already opened mid-turn through `<od-focus open="…">` is
  // named once and the workspace's tab list stays idempotent.
  readonly open: readonly string[];
}

const NOTHING_TO_OPEN: TurnAutoOpenSelection = { focused: null, open: [] };

/**
 * Every PRIMARY artifact of a turn, plus which one takes focus.
 *
 * Product ruling 2026-09-04 (OPEND-2588), verbatim:
 * 「就让 agent 生成完,把那些产物在右侧全打开呗」, clarified the same day as
 * 「是全部的**主要**产物,记得」. A batch that generated four images opened four
 * artifact cards in the chat and two tabs on the right; the turn's deliverables
 * should all be on screen.
 *
 * This overturns exactly one of `selectAutoOpenProducedArtifact`'s three jobs.
 * Its `autoOpenPreviewRank` does:
 *
 *   1. **Is this an artifact at all?** rank 0 (decks, raw text, `.txt`,
 *      `sketch-*`, user sketches) never opens. UNCHANGED — the ruling is about
 *      the count, not the criterion, so scripts, configs and intermediate
 *      outputs stay out exactly as before.
 *   2. **Which KIND is this turn's deliverable?** HTML outranks markdown
 *      outranks media, because "image, video and audio are the fallback for
 *      media-ONLY turns" — a page's screenshots are incidental to the page.
 *      UNCHANGED, and it is what keeps "all the primary artifacts" from
 *      quietly becoming "every previewable file the turn wrote".
 *   3. **Which ONE of the equally-ranked winners?** newest mtime. OVERTURNED:
 *      that tie-break was arbitrary, and picking one of four sibling images is
 *      precisely the bug. All of them open; the tie-break now only decides
 *      which is focused.
 *
 * The `preferSiteEntry` carve-out survives for the same reason rank 2 does: a
 * website clone's deliverable is the SITE, and its entry is the door. Opening
 * every produced page would be one tab per route.
 *
 * No cap is applied here. A turn that legitimately produces N primary artifacts
 * opens N tabs (see OPEND-2571, where a 16-image turn is already reported as
 * flooding the conversation) — capping that is a product decision, not one to
 * take in a selection helper.
 */
export function selectAutoOpenProducedArtifacts(
  producedFiles: ReadonlyArray<CandidateFile>,
  options: SelectAutoOpenOptions = {},
): TurnAutoOpenSelection {
  if (options.preferSiteEntry) {
    const entry = selectSiteEntryFile(producedFiles, options);
    if (entry) return { focused: entry.name, open: [entry.name] };
  }
  const best = selectBestRankedFile(producedFiles, options);
  if (!best) return NOTHING_TO_OPEN;
  const primaryRank = autoOpenPreviewRank(best);
  const open: string[] = [];
  const seen = new Set<string>();
  for (const file of producedFiles) {
    if (!file.name || seen.has(file.name)) continue;
    if (autoOpenPreviewRank(file) !== primaryRank) continue;
    seen.add(file.name);
    open.push(file.name);
  }
  return { focused: best.name, open };
}

// The shallowest produced `index.html`, ties to newest. Extracted verbatim from
// selectAutoOpenProducedArtifact so the single-open and open-all paths cannot
// drift into different answers.
function selectSiteEntryFile(
  producedFiles: ReadonlyArray<CandidateFile>,
  options: SelectAutoOpenOptions,
): CandidateFile | null {
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
    const createdThisTurnOrder = compareCreatedThisTurn(file, entry, options.preTurnFileNames);
    if (createdThisTurnOrder !== 0) {
      if (createdThisTurnOrder > 0) entry = file;
      continue;
    }
    const nextMtime = typeof file.mtime === 'number' && Number.isFinite(file.mtime) ? file.mtime : 0;
    const entryMtime =
      typeof entry.mtime === 'number' && Number.isFinite(entry.mtime) ? entry.mtime : 0;
    if (nextMtime >= entryMtime) entry = file;
  }
  return entry;
}

// Highest preview rank wins; ties to created-this-turn, then newest mtime.
// Extracted verbatim from selectAutoOpenProducedArtifact.
function selectBestRankedFile(
  producedFiles: ReadonlyArray<CandidateFile>,
  options: SelectAutoOpenOptions,
): CandidateFile | null {
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
    const createdThisTurnOrder = compareCreatedThisTurn(file, selected, options.preTurnFileNames);
    if (createdThisTurnOrder !== 0) {
      if (createdThisTurnOrder > 0) selected = file;
      continue;
    }
    const nextMtime = typeof file.mtime === 'number' && Number.isFinite(file.mtime) ? file.mtime : 0;
    const selectedMtime =
      typeof selected.mtime === 'number' && Number.isFinite(selected.mtime) ? selected.mtime : 0;
    if (nextMtime >= selectedMtime) selected = file;
  }
  return selected;
}

function compareCreatedThisTurn(
  candidate: CandidateFile,
  current: CandidateFile,
  preTurnFileNames: ReadonlySet<string> | null | undefined,
): number {
  if (!preTurnFileNames) return 0;
  return Number(!preTurnFileNames.has(candidate.name)) - Number(!preTurnFileNames.has(current.name));
}
