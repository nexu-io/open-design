// Decide whether to auto-open a file after an agent Write/Edit tool result.
// Only files that exist in the project's refreshed file list should open as
// tabs — out-of-project paths (upstream repo edits, system files) would
// otherwise create permanent placeholder tabs.

export function decideAutoOpenAfterWrite(
  base: string,
  nextFiles: ReadonlyArray<{ name: string }>,
): { shouldOpen: boolean; fileName: string | null } {
  if (!base) return { shouldOpen: false, fileName: null };
  const exists = nextFiles.some((f) => f.name === base);
  return { shouldOpen: exists, fileName: exists ? base : null };
}
