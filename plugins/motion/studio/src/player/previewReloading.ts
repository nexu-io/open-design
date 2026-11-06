import { thumbnailScheduler } from "./lib/thumbnailScheduler";

let reloading = false;
let reloadRequested = false;
let scriptWrites = 0;
// A press gave up on the change in progress (a save that never returns); later ones do not wait on it again.
let givenUp = false;

const changing = () => reloading || reloadRequested || scriptWrites > 0;
const noteIdle = () => {
  if (!changing()) givenUp = false;
  globalThis.document?.documentElement.toggleAttribute(
    "data-preview-changing",
    isPreviewChanging(),
  );
};

export function giveUpOnPreviewChange(): void {
  givenUp = changing();
  noteIdle();
}

export function setPreviewReloading(next: boolean): void {
  reloading = next;
  thumbnailScheduler.setPreviewReloading(next);
  noteIdle();
}

/** Studio asked for a reload that has not begun yet; `previewReloadBegun` closes that gap. */
export function requestPreviewReload(): void {
  reloadRequested = true;
  noteIdle();
}

export function previewReloadBegun(): void {
  reloadRequested = false;
  noteIdle();
}

/** A script write, scene swap or history step counts from its send until its preview update is applied, or it fails. */
export async function whileScriptWrites<T>(write: () => Promise<T>): Promise<T> {
  scriptWrites += 1;
  noteIdle();
  try {
    return await write();
  } finally {
    scriptWrites -= 1;
    noteIdle();
  }
}

/** The one owner of "the preview is about to change": a canvas press waits for it. */
export function isPreviewChanging(): boolean {
  return changing() && !givenUp;
}
