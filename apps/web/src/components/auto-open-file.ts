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

// Auto-open priority for a turn's produced files. Higher wins. HTML is the
// primary visual deliverable, so when a turn writes both an HTML page and a
// markdown note (e.g. index.html + README.md) the page takes focus; markdown
// is the next-best previewable artifact; everything else (decks, images, raw
// text) has no in-place reshape preview worth stealing focus for and is left
// for the user to open from the produced-files chips.
function autoOpenPreviewRank(file: CandidateFile): number {
  if (isHtmlPreviewFile(file)) return 2;
  if (isMarkdownPreviewFile(file)) return 1;
  return 0;
}

// Pick which of a turn's produced files to auto-open in the viewer. Among
// previewable files, a higher-priority kind always beats a lower one; ties
// break to the most recently written file (newest mtime). Returns null when
// the turn produced nothing previewable.
export function selectAutoOpenProducedArtifact(
  producedFiles: ReadonlyArray<CandidateFile>,
): string | null {
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
