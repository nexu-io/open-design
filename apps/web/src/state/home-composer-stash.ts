/**
 * Hand-off slot for Home composer attachments across the optimistic project
 * surface.
 *
 * Sending from Home unmounts `HomeView` the moment the optimistic project
 * route takes over, so the staged `File` objects (which cannot live in the
 * persisted prompt draft) would be lost if the create later fails. App
 * stashes them here while rolling back to Home. Two consumers exist because
 * Home may or may not be mounted at that moment:
 *
 * - a `HomeView` that mounts afterwards seeds its staged band from the
 *   snapshot (the stay-on-pending-until-failure path);
 * - a `HomeView` that is already mounted — the user pressed Back on the
 *   pending frame while the create was still in flight — hears
 *   `HOME_COMPOSER_ATTACHMENTS_EVENT` and appends the snapshot right away.
 *
 * Reading is side-effect free (`peek`): React StrictMode double-invokes state
 * initializers, so a consume-on-read slot would hand the files to the
 * discarded call and leave the kept one empty. The consumer clears the slot
 * explicitly once the files are in state, and App clears it when a create
 * succeeds or a new optimistic create starts, so a later Home visit never
 * revives attachments that already belong to a project.
 */
export const HOME_COMPOSER_ATTACHMENTS_EVENT = 'open-design:home-composer:attachments';

let stashedAttachments: File[] | null = null;

export function stashHomeComposerAttachments(files: readonly File[]): void {
  stashedAttachments = files.length > 0 ? [...files] : null;
  if (stashedAttachments && typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(HOME_COMPOSER_ATTACHMENTS_EVENT));
  }
}

/** The current snapshot; never mutates the slot. */
export function peekHomeComposerAttachments(): File[] {
  return stashedAttachments ? [...stashedAttachments] : [];
}

export function clearHomeComposerAttachments(): void {
  stashedAttachments = null;
}
