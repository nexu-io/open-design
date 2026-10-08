/**
 * `run_finished`'s artifact-focus fields — how often a turn actually declares
 * what it delivered, and what the host had to guess when it did not.
 *
 * **Why this exists at all.** `<od-focus show="…">` is the only mechanism that
 * puts a result card in the conversation, and until now nothing recorded
 * whether a turn used it. The only declaration-rate number anyone has ever had
 * came out of a single diagnostics zip that happened to be attached to a bug
 * report: 100% on turns that created a file, 25% on turns that only edited one,
 * 22% across both machines' edit-only turns. A mechanism that load-bearing
 * cannot keep being measured by accident.
 *
 * The four fields answer four separate questions, and each of them changes a
 * decision:
 *
 *  · `declared_artifact_focus` — did the instruction work? This is the number
 *    the prompt fix is judged by.
 *  · `declared_count` — when it works, is the model naming ONE deliverable or
 *    dumping its whole file list back?
 *  · `fallback_picked_count` — when it does not, how many cards is the host
 *    inventing on the model's behalf? A `0` here on a turn that wrote files is
 *    a turn with no cards at all, which is the OPEND-2550 symptom.
 *  · `wrote_only_dependencies` — the turn wrote nothing but `.js` / `.css` /
 *    `.svg` / `.json`, so the fallback has nothing legitimate to show. This is
 *    the field product asked for by name: it is the frequency of the ONE case
 *    that would justify letting a card point at a file the turn did not write
 *    ("changed `app.js`, show `index.html`"). If it stays at zero, that
 *    exception never gets built.
 */

import { pickPrimaryArtifacts, parseArtifactFocusPathList } from '../api/artifact-focus-marker.js';

/** The `run_finished` subset this module owns. Shapes match `RunFinishedProps`. */
export interface ArtifactFocusTelemetry {
  /** The turn emitted a `show` the host could act on. */
  declared_artifact_focus: boolean;
  /** How many usable paths that declaration carried; `0` when there was none. */
  declared_count: number;
  /** Main artifacts the host picked for an undeclared turn; `0` when declared. */
  fallback_picked_count: number;
  /** Every file this turn wrote was a dependency — no deliverable to show. */
  wrote_only_dependencies: boolean;
}

export interface ArtifactFocusTelemetryInput {
  /** The folded `show` list for the turn, if any. */
  declared?: readonly string[] | null | undefined;
  /** Project-relative paths this turn created or modified. */
  writtenPaths?: readonly string[] | null | undefined;
}

/**
 * Derive the four fields from one turn's declaration and its written files.
 *
 * **"Declared" means usable, not merely emitted.** A `show="../../etc/passwd"`
 * is refused by the path boundary, so that turn rendered through the fallback
 * exactly like a turn that wrote no marker at all — and the analytics has to
 * say so, or the declaration rate reads higher than the behaviour it explains.
 * Reusing `parseArtifactFocusPathList` rather than counting the raw array is
 * what keeps that true: it is the same normalizer, dedupe and cap the renderer
 * applies.
 *
 * `fallback_picked_count` is zero whenever the turn declared, because the
 * fallback did not run. Reporting the count it *would* have picked would make
 * the two columns impossible to sum.
 */
export function buildArtifactFocusTelemetry(
  input: ArtifactFocusTelemetryInput,
): ArtifactFocusTelemetry {
  const written = (Array.isArray(input?.writtenPaths) ? input.writtenPaths : [])
    .filter((path): path is string => typeof path === 'string' && path.length > 0)
    .map((path) => ({ name: path, path }));
  const declared = parseArtifactFocusPathList(
    (Array.isArray(input?.declared) ? input.declared : []).join(','),
  );
  const primary = pickPrimaryArtifacts(written);
  return {
    declared_artifact_focus: declared.length > 0,
    declared_count: declared.length,
    fallback_picked_count: declared.length > 0 ? 0 : primary.length,
    wrote_only_dependencies: written.length > 0 && primary.length === 0,
  };
}
