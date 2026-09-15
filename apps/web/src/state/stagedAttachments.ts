// Modalities currently staged in the composer, shared across components.
//
// The BYOK model picker and the composer that owns the staged attachments are
// siblings, not parent and child: `EntryShell` renders the switcher and hands
// it to `HomeView`, which owns the file list. The picker still has to narrow
// its options to models that can actually receive those attachments.
//
// Rather than lift the file state up through two shells, this module holds just
// the derived answer — which non-text modalities are in play — behind a
// subscribable store, mirroring how `providerModelsCache` already shares the
// live catalogue between the same two surfaces.
//
// Only the derived modality list is shared. The files themselves never leave
// HomeView.

import { useSyncExternalStore } from 'react';

export type AttachmentModality = 'image' | 'audio' | 'video';

const EMPTY: readonly AttachmentModality[] = [];

let current: readonly AttachmentModality[] = EMPTY;
const listeners = new Set<() => void>();

function sameModalities(a: readonly AttachmentModality[], b: readonly AttachmentModality[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

/**
 * Map a staged file list to the modalities that constrain model choice.
 *
 * Only image/audio/video narrow the list. Any other file type rides the
 * ordinary text path, which is why an unrecognised type contributes nothing
 * rather than being treated as a constraint.
 */
export function modalitiesForFiles(
  files: readonly { type?: string }[],
): AttachmentModality[] {
  const out = new Set<AttachmentModality>();
  for (const file of files) {
    const type = (file?.type ?? '').toLowerCase();
    if (type.startsWith('image/')) out.add('image');
    else if (type.startsWith('audio/')) out.add('audio');
    else if (type.startsWith('video/')) out.add('video');
  }
  // Stable order so the identity check below can be a shallow comparison.
  return (['image', 'audio', 'video'] as const).filter((m) => out.has(m));
}

/** Publish the staged modalities. No-ops when nothing changed. */
export function setStagedModalities(next: readonly AttachmentModality[]): void {
  if (sameModalities(current, next)) return;
  current = next.length ? [...next] : EMPTY;
  for (const listener of listeners) listener();
}

/** Test seam: drop back to "no attachments staged". */
export function resetStagedModalities(): void {
  setStagedModalities(EMPTY);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function getSnapshot(): readonly AttachmentModality[] {
  return current;
}

/** The modalities staged right now, re-rendering the caller when they change. */
export function useStagedModalities(): readonly AttachmentModality[] {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
