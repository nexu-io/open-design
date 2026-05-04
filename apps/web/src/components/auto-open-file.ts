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
}

function basenameOf(p: string): string {
  return p.split('/').pop() ?? p;
}

export function decideAutoOpenAfterWrite(
  filePath: string,
  nextFiles: ReadonlyArray<CandidateFile>,
): { shouldOpen: boolean; fileName: string | null } {
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
    return { shouldOpen: true, fileName: suffixMatches[0]!.name };
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
    return { shouldOpen: true, fileName: basenameMatches[0]!.name };
  }
  return { shouldOpen: false, fileName: null };
}
