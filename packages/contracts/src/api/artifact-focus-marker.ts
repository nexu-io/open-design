/**
 * The artifact-focus marker — the agent's say in what this turn *shows*.
 *
 * Two decisions in the chat panel have always been host guesswork:
 *
 *  · **which file the preview opens** when a turn ends (rank HTML over
 *    markdown over media, tie-break on mtime — `auto-open-file.ts`), and
 *  · **which produced files get a card** (everything the turn touched, which
 *    on a website turn means the page plus its stylesheet plus eleven images).
 *
 * The agent knows both answers and the host does not. This marker lets it say
 * so:
 *
 *     <od-focus key="a7f3c91ed2b40561" open="index.html"/>
 *     <od-focus key="a7f3c91ed2b40561" show="index.html, report.md"/>
 *     <od-focus key="a7f3c91ed2b40561" open="index.html" show="index.html"/>
 *
 * **Why one tag with two attributes, and not two tags.** The two answers have
 * different clocks: `open` wants to fire the moment the deliverable has content
 * (the user should not watch a spinner for the ninety seconds the agent spends
 * writing sidecar assets), while `show` is only knowable once the turn's output
 * set is final. A single *block* marker would force the early answer to wait
 * for the late one — precisely the wait this feature exists to remove. A single
 * *self-closing* marker with independent attributes lets the agent emit it
 * twice: early with `open`, late with `show`. Each attribute is last-wins on
 * its own, so a late `show`-only marker cannot retract an early `open`.
 *
 * Self-closing for the same reason `<od-done/>` is (see `done-marker.ts`): a
 * container holds the whole answer back until its closing tag arrives.
 *
 * **Why a key.** Same nonce as `<od-done>` / `<od-next>`, same reason. This
 * marker names a path that the host then reads and renders. An unkeyed form
 * would let any text the agent merely *read* — a cloned page, a quoted
 * document, an instruction hidden inside either — steer the user's preview at
 * a file of its choosing. A model cannot reproduce a nonce it was never shown.
 * Reusing the existing per-turn key costs no second nonce and no second event.
 *
 * **Stripping is unconditional.** A marker with a wrong, malformed, or missing
 * key is still protocol noise and never reaches the reader. That rule is not
 * theoretical: `CRITIQUE_INLINE_TAGS` once spelled `MUST_FIX` as `MUSTFIX`, so
 * the strip list matched nothing in real data and users read raw protocol in
 * their chat for four turns running. Spelling lives here, once, and both the
 * daemon's stream strip and the web's history strip import it.
 *
 * **The marker can only ever narrow.** `show` filters the produced-file list
 * the host already computed; it cannot add a file to it. So the worst a
 * misbehaving marker can do is hide a card — never fabricate one, and never
 * point a card at a file the turn did not produce.
 *
 * **Declaring narrows; silence does not blank.** `show` is how a turn cuts its
 * file list down to the deliverable (`declaredArtifactCards`). A turn that
 * declares nothing does NOT get an empty panel: the host falls back to the main
 * artifacts among the files that turn wrote (`pickPrimaryArtifacts`) — pages
 * and documents over images, never a stylesheet or a script on its own.
 *
 * That fallback replaced the original opt-in rule 「一张都不显示那就不显示呗」
 * for one reason: measurement. Declaration rate came back at 100% on turns that
 * created a file and 22–25% on turns that only edited one, so "no declaration,
 * no cards" meant most edit-only turns showed nothing at all (OPEND-2550). The
 * ruling that replaced it is 方案 C: fall back, but only to the main artifacts —
 * 「一个 html 可能会有 js 或 css 文件或者一堆图片文件, 但最终主要的是这个 html」.
 *
 * `open` was never part of either ruling and keeps its own fallback: a turn
 * without a marker still auto-opens by the host's rank/mtime inference.
 *
 * The fallback is a guess, and a declaration always beats it, so
 * `renderArtifactFocusInstruction` stays load-bearing rather than decorative —
 * it is the only thing that will ever cause a model to emit one. Its wording is
 * also the lever with the most leverage on that 22%: the instruction used to
 * speak only of files "you created this turn", which a model reading literally
 * is right to read as "an edit is not a delivery".
 *
 * This module is the single source of truth for the marker's shape.
 */

/** Opening tag without its attribute list — for streaming hold-back. */
export const OD_FOCUS_OPEN_TAG = '<od-focus';

/**
 * Every `<od-focus …>` occurrence, valid key or not, self-closed or not, plus
 * a stray `</od-focus>` a model may write out of habit.
 *
 * Deliberately permissive about the attribute list, exactly like
 * `OD_DONE_TAG_RE`: what makes a marker protocol is the tag name, not whether
 * the model got the attributes right.
 *
 * Global + case-insensitive; callers that keep state must clone it
 * (`lastIndex` is shared on a module-level regex).
 */
export const OD_FOCUS_TAG_RE = /<\/?od-focus\b[^>]*>/gi;

/**
 * Pull the key out of one `<od-focus …>` tag. Quotes optional, both styles
 * accepted (model formatting drifts); charset restricted so a stray attribute
 * cannot smuggle markup through.
 */
export const OD_FOCUS_KEY_ATTR_RE = /\bkey\s*=\s*["']?([A-Za-z0-9_-]{4,64})["']?/i;

/** `open="…"` — the single file the preview should show. */
export const OD_FOCUS_OPEN_ATTR_RE = /\bopen\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>/]+))/i;

/** `show="…"` — the comma-separated deliverables that deserve a card. */
export const OD_FOCUS_SHOW_ATTR_RE = /\bshow\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>/]+))/i;

/**
 * Ceiling on the `show` list. The whole point is a *shorter* list than the
 * host's inference produces, so a marker naming twenty files has misunderstood
 * the instruction; truncating is friendlier than rejecting and still bounds
 * the work the renderer does.
 */
export const MAX_ARTIFACT_FOCUS_SHOW = 8;

/** Longest path we will consider. Well past any real project layout. */
const MAX_FOCUS_PATH_LENGTH = 1024;
/** Deepest path we will consider, in segments. */
const MAX_FOCUS_PATH_SEGMENTS = 32;

/** Wrapping punctuation models add out of habit: backticks, quotes, brackets. */
const WRAPPING_RE = /^[`"'“”‘’\[(<]+|[`"'“”‘’\])>]+$/g;

/**
 * Normalize one declared path into a project-relative POSIX path, or `null`
 * when it is not one we are willing to act on.
 *
 * This is the **untrusted-input boundary for a path the host will read**, so it
 * rejects rather than repairs:
 *
 *  · anything absolute (`/etc/passwd`, `C:/Windows/…`) — the daemon rebases
 *    absolute paths against the project root *before* calling this, because
 *    only the daemon knows where the root is;
 *  · any `..` segment **anywhere**, not merely a leading one. `a/../b` has no
 *    legitimate reason to appear in a declaration, and refusing it outright
 *    removes the whole class of "my normalizer and your normalizer disagree"
 *    bugs that traversal checks are famous for;
 *  · URL-ish inputs (`file:`, `data:`, `//host/share`), NUL bytes, and paths
 *    past the length/depth ceilings.
 *
 * Backslashes normalize to `/` so a Windows-style declaration still resolves;
 * `./` prefixes and repeated slashes collapse.
 */
export function normalizeArtifactFocusPath(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  let value = raw.trim().replace(WRAPPING_RE, '').trim();
  if (!value) return null;
  if (value.length > MAX_FOCUS_PATH_LENGTH) return null;
  // A NUL truncates the path at the OS boundary — classic poisoned-path trick.
  if (value.includes('\0')) return null;
  value = value.replace(/\\/g, '/');
  // `file:///…`, `data:…`, `http://…`: not filesystem paths at all.
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return null;
  // Absolute POSIX, UNC, and drive-letter forms. The daemon rebases these
  // against the project root before we ever see them; anything still absolute
  // here escaped that check and is refused.
  if (value.startsWith('/') || /^[A-Za-z]:\//.test(value)) return null;

  const segments: string[] = [];
  for (const segment of value.split('/')) {
    if (!segment || segment === '.') continue;
    if (segment === '..') return null;
    segments.push(segment);
  }
  if (segments.length === 0) return null;
  if (segments.length > MAX_FOCUS_PATH_SEGMENTS) return null;
  return segments.join('/');
}

/**
 * Split a `show="…"` attribute into normalized project-relative paths.
 *
 * Commas separate; newlines do too, because the tag body is matched with
 * `[^>]*` and a model that wraps a long list will put one there. Entries that
 * fail `normalizeArtifactFocusPath` are dropped individually — one bad path
 * must not discard the good ones alongside it.
 *
 * A path containing a literal comma cannot be expressed and is simply dropped;
 * the turn then falls back to the host's own inference for that file, which is
 * the same outcome as not writing the marker at all.
 */
export function parseArtifactFocusPathList(raw: unknown): string[] {
  if (typeof raw !== 'string' || !raw.trim()) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const piece of raw.split(/[,\r\n]/)) {
    const normalized = normalizeArtifactFocusPath(piece);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
    if (out.length >= MAX_ARTIFACT_FOCUS_SHOW) break;
  }
  return out;
}

/** One parsed `<od-focus …>` tag. `open`/`show` are absent when unusable. */
export interface ParsedArtifactFocusMarker {
  /** The key as written, or `''`. Callers compare it against the turn nonce. */
  key: string;
  /** Normalized project-relative path, or `null` when absent/unusable. */
  open: string | null;
  /** Normalized project-relative paths; `[]` when absent/unusable. */
  show: string[];
}

/**
 * Parse one complete opening tag. Attribute values are NOT normalized against
 * the project root here — that needs the root, which is daemon-only knowledge.
 * `open` is returned raw when it looks absolute so the daemon can rebase it;
 * see `rawOpen`.
 */
export function parseArtifactFocusMarker(tag: string): ParsedArtifactFocusMarker & { rawOpen: string; rawShow: string } {
  const source = typeof tag === 'string' ? tag : '';
  const keyMatch = OD_FOCUS_KEY_ATTR_RE.exec(source);
  const openMatch = OD_FOCUS_OPEN_ATTR_RE.exec(source);
  const showMatch = OD_FOCUS_SHOW_ATTR_RE.exec(source);
  const rawOpen = (openMatch?.[1] ?? openMatch?.[2] ?? openMatch?.[3] ?? '').trim();
  const rawShow = (showMatch?.[1] ?? showMatch?.[2] ?? showMatch?.[3] ?? '').trim();
  return {
    key: keyMatch?.[1] ?? '',
    open: normalizeArtifactFocusPath(rawOpen),
    show: parseArtifactFocusPathList(rawShow),
    rawOpen,
    rawShow,
  };
}

/**
 * Remove every `<od-focus …>` tag from a string.
 *
 * Used on any text that could reach a reader — the persisted message body,
 * copy-to-clipboard, exports, and the web's render of a conversation recorded
 * before the daemon learned to strip it.
 *
 * Caller beware: this is context-free, matching `stripDoneMarkers` and
 * `stripCritiqueGrammar`. A call site that must preserve a marker an agent
 * deliberately quoted inside a code fence does its own fenced-region check.
 */
export function stripArtifactFocusMarkers(text: string): string {
  if (!text || !text.includes('<')) return text;
  return text.replace(new RegExp(OD_FOCUS_TAG_RE.source, OD_FOCUS_TAG_RE.flags), '');
}

/**
 * Render the marker for a given key — the one place the wire format is
 * written, so the prompt example and the parser can never drift apart.
 */
export function renderArtifactFocusMarkerExample(
  key: string,
  parts: { open?: string; show?: readonly string[] },
): string {
  const attrs = [`key="${key}"`];
  if (parts.open) attrs.push(`open="${parts.open}"`);
  if (parts.show && parts.show.length > 0) {
    attrs.push(`show="${parts.show.slice(0, MAX_ARTIFACT_FOCUS_SHOW).join(', ')}"`);
  }
  return `<od-focus ${attrs.join(' ')}/>`;
}

/**
 * The per-turn instruction that teaches this marker — the ONLY place it is
 * taught, and the reason it lives here rather than in a prompt module.
 *
 * It has to be rendered per turn, because the key is a fresh nonce per run: a
 * marker without this turn's key is stripped and never accepted. That rules out
 * the cached stable prefix (`prompts/system.ts` on either side of the app
 * contract), where a per-turn nonce would move the prefix on every turn of every
 * conversation and miss the upstream prompt cache — the same reason `<od-done>`
 * and `<od-next>` are taught from the per-turn slice. Keeping the body next to
 * the parser and the example renderer means the daemon path and any BYOK path
 * read one string, not two copies that drift.
 *
 * Everything the host can decide for itself is decided for itself, so this stays
 * short. What it cannot decide, and therefore must say:
 *
 *  · **When** `open` fires. 「不要在空的时候打开,不然用户看到空的会感觉是 bug,
 *    能看到产物有内容了再打开? 但也不要等完全写完再打开,不然用户可能会等很久」
 *  · **What `show` is for.** 「一个 html 可能会有 js 或 css 文件或者一堆图片文件,
 *    但最终主要的是这个 html,而不是其他杂七杂八的东西,所以让 agent 只显示这个
 *    html」
 *  · **That an edit is a delivery.** The measured declaration rate is 100% on
 *    turns that created a file and 22–25% on turns that only edited one. That
 *    gap is not disobedience: the instruction used to speak only of "a file you
 *    created this turn", so a model deciding a small edit does not qualify was
 *    reading it correctly. The rule is stated explicitly now.
 *  · **What silence costs.** Not the cards — the host falls back to
 *    `pickPrimaryArtifacts` — but the accuracy: the fallback keeps every page,
 *    document and image the turn wrote, which over-lists whenever the turn had
 *    one real deliverable among several, and lists nothing at all when
 *    everything it wrote was a dependency.
 */
export function renderArtifactFocusInstruction(key: string): string {
  if (typeof key !== 'string' || !key) return '';
  return [
    'Artifact focus:',
    'The moment a file this turn created OR changed has real content in it — not while it is still empty, and not held back until the end of the turn — emit one marker naming it:',
    renderArtifactFocusMarkerExample(key, { open: 'index.html' }),
    'That switches the preview to it right then. Opening a file that is still empty reads as a bug to the user; waiting until the last sidecar asset is written leaves them watching a blank pane for minutes.',
    `Separately, name this turn's deliverables — the files that deserve a result card in the conversation — on the same marker or on a later one: ${renderArtifactFocusMarkerExample(key, { show: ['index.html', 'report.md'] })}`,
    'Only the deliverables. A page plus its stylesheet, its scripts, and a dozen images is ONE deliverable: name the page.',
    'Changing an existing file is delivering it. A turn that only edited `index.html` and created nothing still declares `index.html`. "Did I create this file" is not the question — "what should the user look at now" is.',
    '`show` NARROWS: it cuts this turn\'s file list down to what matters. Declare nothing and the host answers for you — it keeps the pages, documents and images this turn wrote and drops the stylesheets, scripts, icons and data files — which is a worse answer than yours whenever the turn touched more than one real deliverable, and no answer at all on a turn whose every written file was one of those dependencies. Nothing becomes unreachable either way: every file stays in the project file list.',
    'Paths are relative to the project root, and `open` must be a file this turn wrote. Emit the marker again to change your mind: the last value of each attribute wins, and `open` and `show` are independent of each other.',
    `This turn's key is ${key}: copy it verbatim, never reuse an earlier one, and never invent one.`,
    'The marker is protocol, not prose: do not mention it, do not explain it, and do not wrap it in a code fence.',
  ].join('\n');
}

/** The payload the daemon hands the client once a marker is accepted. */
export interface ArtifactFocusSelection {
  /** Project-relative path the preview should open, when the turn declared one. */
  open?: string;
  /** Project-relative paths that deserve a card, when the turn declared them. */
  show?: string[];
}

/**
 * Fold this turn's `artifact_focus` events into one selection, last-wins per
 * field.
 *
 * Per-field rather than per-event: a turn that says `open` early and `show`
 * late must end up with both. Folding whole events would let the late
 * `show`-only event blank the early `open`.
 */
export function foldArtifactFocusSelections(
  events: readonly ArtifactFocusSelection[],
): ArtifactFocusSelection {
  const folded: ArtifactFocusSelection = {};
  for (const event of events) {
    if (typeof event?.open === 'string' && event.open) folded.open = event.open;
    if (Array.isArray(event?.show) && event.show.length > 0) folded.show = [...event.show];
  }
  return folded;
}

/** Minimal shape `narrowProducedFilesToFocus` needs — matches `ProjectFile`. */
export interface FocusCandidateFile {
  readonly name: string;
  readonly path?: string;
}

/**
 * What one written file is to the turn that wrote it.
 *
 *  · `deliverable` — a thing the user opens and reads: a page, a document.
 *  · `media` — an image, a video, a clip. A deliverable on an image turn, a
 *    sidecar next to a page.
 *  · `dependency` — the stylesheet, the script, the icon, the data file. Never
 *    a card on its own.
 */
export type ArtifactDeliveryRole = 'deliverable' | 'media' | 'dependency';

/**
 * The extensions that are never a card by themselves. Product named the class
 * verbatim: 「`.js` `.css` `.svg` `.json` 这类依赖文件不出卡」.
 *
 * `svg` sits here rather than with the images on purpose: in practice it is the
 * logo and the icon set next to a page, not the thing the turn delivered.
 */
const DEPENDENCY_EXTENSIONS = new Set([
  'js', 'mjs', 'cjs', 'jsx', 'ts', 'tsx', 'mts', 'cts',
  'css', 'scss', 'sass', 'less', 'styl',
  'svg', 'json', 'jsonc', 'map', 'lock',
  'woff', 'woff2', 'ttf', 'otf', 'eot',
  'ico',
]);

/** Rendered output that is a deliverable on its own turn and a sidecar next to a page. */
const MEDIA_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'bmp', 'tif', 'tiff',
  'mp4', 'mov', 'webm', 'm4v', 'avi', 'mkv',
  'mp3', 'wav', 'ogg', 'oga', 'm4a', 'flac', 'aac',
]);

function fileExtension(pathLike: string): string {
  const basename = pathLike.replace(/\\/g, '/').split('/').pop() ?? '';
  const dot = basename.lastIndexOf('.');
  if (dot <= 0 || dot === basename.length - 1) return '';
  return basename.slice(dot + 1).toLowerCase();
}

/**
 * Classify one written path by extension alone.
 *
 * **Unrecognized means deliverable, never dependency.** The failure direction
 * of this whole fallback has to be "one card too many", not "we quietly hid
 * what the user just made" — so only the explicitly named dependency and media
 * classes are demoted, and everything else is treated as something worth
 * showing.
 */
export function artifactDeliveryRole(pathLike: string): ArtifactDeliveryRole {
  const ext = fileExtension(typeof pathLike === 'string' ? pathLike : '');
  if (DEPENDENCY_EXTENSIONS.has(ext)) return 'dependency';
  if (MEDIA_EXTENSIONS.has(ext)) return 'media';
  return 'deliverable';
}

/**
 * The main artifacts among the files ONE turn wrote — the host's own answer for
 * a turn that declared no `show`.
 *
 * This is the fallback the product ruled in after the declaration rate came
 * back at 22% on edit-only turns: not "show everything the turn touched" (which
 * is the six-card panel the marker exists to shrink) and not "show nothing"
 * (which is OPEND-2550), but the deliverables inside what the turn already
 * wrote.
 *
 * **Ranked, not filtered.** A page outranks the images beside it, so a website
 * turn yields the page alone; an image-generation turn has no page to outrank
 * its images, so the images are the deliverables. That ranking IS the product's
 * sentence — 「一个 html 可能会有 js 或 css 文件或者一堆图片文件, 但最终主要的是
 * 这个 html」 — expressed once instead of as a chain of `if`s at the call site.
 *
 * **It cannot look outside the turn.** A turn that wrote only `app.js` gets an
 * empty list rather than the `index.html` that includes it: reaching for that
 * page would break this module's own rule that a card never points at a file
 * the turn did not produce. Whether that case is even worth an exception is a
 * measurement, not a guess — `run_finished.wrote_only_dependencies` counts it.
 */
export function pickPrimaryArtifacts<T extends FocusCandidateFile>(
  files: readonly T[],
): readonly T[] {
  const roleOf = (file: T): ArtifactDeliveryRole =>
    artifactDeliveryRole(file.path || file.name || '');
  const deliverables = files.filter((file) => roleOf(file) === 'deliverable');
  if (deliverables.length > 0) return deliverables;
  return files.filter((file) => roleOf(file) === 'media');
}

function focusMatchKeys(file: FocusCandidateFile): string[] {
  const keys: string[] = [];
  for (const value of [file.path, file.name]) {
    const normalized = normalizeArtifactFocusPath(value);
    if (!normalized) continue;
    keys.push(normalized);
    const basename = normalized.split('/').pop();
    if (basename && basename !== normalized) keys.push(basename);
  }
  return keys;
}

/**
 * The declared paths as a match set: full project-relative path AND bare
 * basename for each, because agents write `index.html` about as often as
 * `site/index.html`.
 *
 * Empty when nothing usable was declared — no marker, an empty `show`, or a
 * `show` whose every entry the path boundary refused. Those three are one case
 * on purpose: "the agent told us nothing we can act on".
 */
function declaredMatchKeys(show: readonly string[] | null | undefined): Set<string> {
  const wanted = new Set<string>();
  for (const entry of Array.isArray(show) ? show : []) {
    const normalized = normalizeArtifactFocusPath(entry);
    if (!normalized) continue;
    wanted.add(normalized);
    const basename = normalized.split('/').pop();
    if (basename) wanted.add(basename);
  }
  return wanted;
}

/**
 * The files the conversation lists as this turn's result cards.
 *
 * **This is the narrowing half only.** It answers "the agent declared X — what
 * does the panel list", and it answers `[]` for every input that is not a
 * usable declaration. That includes a declaration naming only files this turn
 * did not produce: a typo must not be the one input that brings back the full
 * six-card panel the marker exists to shrink.
 *
 * The `[]` it returns for "no declaration at all" is NOT the panel's final
 * answer. That case belongs to the caller, which falls back to
 * `pickPrimaryArtifacts` over the files the turn wrote. Keeping the two apart
 * is deliberate: this function must stay a pure filter — it can only ever
 * shrink a list it was handed — while the fallback is a separate judgment made
 * over separate evidence (the turn's own write/edit rows).
 *
 * It still cannot WIDEN: it filters a list the host built from files it saw for
 * itself, so a declared path that is not in that list matches nothing rather
 * than conjuring a card. Original order is preserved — the panel's ordering is
 * not the agent's call.
 *
 * Deliberately NOT the same function as `narrowProducedFilesToFocus` below.
 * That one answers "what did this turn deliver" for the Share / Download /
 * next-step anchor, where an undeclared turn must keep its inferred list or
 * those affordances lose their target. This one answers "what does the
 * conversation list". The two answers now differ for an undeclared turn, which
 * is exactly why they are two functions.
 */
export function declaredArtifactCards<T extends FocusCandidateFile>(
  files: readonly T[],
  show: readonly string[] | null | undefined,
): readonly T[] {
  const wanted = declaredMatchKeys(show);
  /*
   * No `wanted.size === 0` guard, and no `files.length === 0` guard. Both are
   * unreachable-by-observation: an empty `wanted` matches nothing and an empty
   * `files` filters to nothing, so either guard could be deleted with every
   * test still green — the signature of a branch no test is really covering.
   * One mechanism, one line.
   */
  return files.filter((file) => focusMatchKeys(file).some((key) => wanted.has(key)));
}

/**
 * Narrow a turn's produced-file list to the ones the agent declared.
 *
 * This is the DELIVERY list, not the card list: it feeds the Share / Download /
 * next-step anchor and the plugin-folder scan. `declaredArtifactCards` above
 * owns what the conversation actually lists, and the two deliberately disagree
 * about an undeclared turn.
 *
 * Three rules, all of them load-bearing:
 *
 *  1. **No declaration → no change.** A turn without a marker keeps exactly the
 *     list the host inferred, so Share and Download still have something to
 *     point at. (This is NOT the card rule; cards went the other way — see
 *     `declaredArtifactCards`.)
 *  2. **Narrow only, never widen.** A declared path that is not in the list is
 *     ignored rather than added, so the marker cannot conjure an anchor for a
 *     file the turn did not produce.
 *  3. **An empty intersection is a no-op.** If the agent names only files the
 *     host did not attribute to this turn, we keep the inferred list rather
 *     than leaving those affordances with no target at all.
 *
 * Matching accepts a full project-relative path or a bare basename on either
 * side, because agents write `index.html` about as often as `site/index.html`.
 * Original order is preserved.
 */
export function narrowProducedFilesToFocus<T extends FocusCandidateFile>(
  files: readonly T[],
  show: readonly string[] | null | undefined,
): readonly T[] {
  if (files.length === 0) return files;
  const wanted = declaredMatchKeys(show);
  /*
   * Rules 1 and 3 are the SAME line, deliberately.
   *
   * Earlier drafts guarded "no declaration" and "nothing usable in the
   * declaration" with their own early returns. Both are unreachable-by-
   * observation: an absent, empty, or entirely-unusable `show` yields an empty
   * `wanted`, so the filter keeps nothing and the fallback below returns
   * `files` regardless. Ablating either guard left every test green — the
   * signature of a branch that no test is really covering.
   *
   * One mechanism, one line, one ablation that actually goes red.
   */
  const kept = files.filter((file) => focusMatchKeys(file).some((key) => wanted.has(key)));
  return kept.length > 0 ? kept : files;
}
