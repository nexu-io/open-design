import type { ChatMessage, ProjectFile } from '../types';

// Completion half of the onboarding funnel (spec section 11.1).
//
// `onboarding_first_generation_completed` must line up with the first-artifact
// experience the user actually sees: the first-artifact hint is gated on a
// previewable artifact appearing, so the completion event must use the same
// condition. A run can finish `succeeded` while producing only assistant text
// or a clarifying question; counting that as a completed generation overstates
// the funnel and diverges from the hint. This predicate answers "did this turn
// produce a previewable artifact?" from the files produced during the turn.

// Loosened structural shape so callers can pass their richer `ProjectFile`
// objects without importing this module's type.
export interface ProducedFileLike {
  name: string;
  kind?: ProjectFile['kind'];
  mtime?: ProjectFile['mtime'];
}

export interface AssistantProducedFilesLike {
  role: ChatMessage['role'];
  runStatus?: ChatMessage['runStatus'];
  producedFiles?: ReadonlyArray<ProducedFileLike>;
}

// HTML keeps its extension fallback for legacy file records. Images use the
// daemon's canonical kind so uploaded sketches and SVG files remain outside
// this completion gate.
export function producedPreviewableArtifact(
  producedFiles: ReadonlyArray<ProducedFileLike>,
): boolean {
  return producedFiles.some(
    (file) => file.kind === 'image' || file.name.toLowerCase().endsWith('.html'),
  );
}

// Existing HTML keeps the historical reload fallback. Images need both a
// successful assistant turn and a matching file still present in the project,
// so uploaded references and deleted outputs cannot trigger onboarding.
export function hasPreviewableArtifactForOnboarding(
  projectFiles: ReadonlyArray<ProducedFileLike>,
  messages: ReadonlyArray<AssistantProducedFilesLike>,
): boolean {
  if (projectFiles.some((file) => file.name.toLowerCase().endsWith('.html'))) return true;

  const currentFilesByName = new Map(projectFiles.map((file) => [file.name, file]));
  return messages.some(
    (message) =>
      message.role === 'assistant' &&
      message.runStatus === 'succeeded' &&
      (message.producedFiles ?? []).some((producedFile) => {
        const currentFile = currentFilesByName.get(producedFile.name);
        if (producedFile.kind !== 'image' || currentFile?.kind !== 'image') return false;
        if (
          typeof producedFile.mtime === 'number' &&
          Number.isFinite(producedFile.mtime) &&
          typeof currentFile.mtime === 'number' &&
          Number.isFinite(currentFile.mtime)
        ) {
          return producedFile.mtime === currentFile.mtime;
        }
        return true;
      }),
  );
}
