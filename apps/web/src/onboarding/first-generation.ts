// Completion half of the onboarding funnel (spec §11.1).
//
// `onboarding_first_generation_completed` must line up with the first-artifact
// experience the user actually sees: the first-artifact hint is gated on a
// previewable artifact appearing (any `.html` file — see `hasPreviewableArtifact`
// in ProjectView), so the completion event must be gated on the SAME condition.
// A run can finish `succeeded` while producing only assistant text or a
// clarifying question; counting that as a completed generation overstates the
// funnel and diverges from the hint. This predicate answers "did this turn
// produce a previewable artifact?" from the files produced during the turn.

// Loosened structural shape so callers can pass their richer `ProjectFile`
// objects (which carry `name`) without importing this module's type.
export interface ProducedFileLike {
  name: string;
}

// True when the files produced this turn include a previewable artifact. Kept
// in lockstep with `hasPreviewableArtifact` (a produced `.html` file); if that
// definition widens, widen this too.
export function producedPreviewableArtifact(
  producedFiles: ReadonlyArray<ProducedFileLike>,
): boolean {
  return producedFiles.some((file) => file.name.toLowerCase().endsWith('.html'));
}
