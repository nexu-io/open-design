// The Home -> project attachment hand-off, while the files are still going up.
//
// A batch picked on Home is uploaded AFTER the project row is persisted, which
// used to mean the project frame could not open until the last byte landed:
// ProjectView reads the uploaded server paths out of sessionStorage on its
// first render, and that key is only written once every upload has answered.
// Six photos held the hand-off screen for nineteen seconds.
//
// The server paths are genuinely needed — the first message cannot carry a
// local `File` — but they are needed by the SEND, not by the FIRST PAINT. This
// module is that separation. The producer (App's create flow) parks the picked
// files here before the uploads start and releases the hand-off gate straight
// away; the project frame opens immediately, draws these cards from local
// object URLs, and the auto-send waits for the entry to empty out.
//
// Nothing here is persisted. A reload drops the whole registry, which is the
// behaviour we want: the object URLs die with the document, and a reloaded
// project reads its attachments from the server paths instead of from a blob
// URL that no longer resolves.

import { looksLikeImageName, type PendingUpload } from '../runtime/chat/staged-attachment';

/** Stable empty snapshot — `useSyncExternalStore` compares by identity. */
const NO_UPLOADS: readonly PendingUpload[] = Object.freeze([]);

interface HandoffEntry {
  /** The cards still in flight, in the order the user picked the files. */
  cards: readonly PendingUpload[];
  /** `URL.createObjectURL` results owned by this entry, keyed by card id. */
  previewUrls: Map<string, string>;
  /** Orders the user removed from the tray while their upload was in flight. */
  dismissedOrders: Set<number>;
}

const entries = new Map<string, HandoffEntry>();
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of [...listeners]) listener();
}

function revoke(url: string | undefined): void {
  if (!url) return;
  if (typeof URL === 'undefined' || typeof URL.revokeObjectURL !== 'function') return;
  try {
    URL.revokeObjectURL(url);
  } catch {
    // Already revoked, or a hardened context that never handed one out.
  }
}

function previewUrlFor(file: File, kind: 'image' | 'file'): string | null {
  if (kind !== 'image') return null;
  if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') return null;
  try {
    return URL.createObjectURL(file);
  } catch {
    // Hardened/older contexts: the card falls back to the grey plate.
    return null;
  }
}

/** The id a card keeps for its whole life, so React never re-keys it. */
function cardId(projectId: string, order: number): string {
  return `home-upload:${projectId}:${order}`;
}

/**
 * Park a picked batch for `projectId` and start showing it.
 *
 * Call this BEFORE releasing the creation hand-off gate: the cards must exist
 * by the time ProjectView first renders, otherwise the frame opens with an
 * empty tray and the attachments appear to have been dropped.
 */
export function beginHomeAttachmentUploads(
  projectId: string,
  files: readonly File[],
): void {
  if (files.length === 0) return;
  endHomeAttachmentUploads(projectId);
  const previewUrls = new Map<string, string>();
  const cards = files.map((file, order) => {
    const id = cardId(projectId, order);
    const kind = looksLikeImageName(file.name, file.type) ? 'image' as const : 'file' as const;
    const previewUrl = previewUrlFor(file, kind);
    if (previewUrl) previewUrls.set(id, previewUrl);
    return {
      id,
      name: file.name,
      kind,
      ...(Number.isFinite(file.size) ? { size: file.size } : {}),
      order,
      state: 'uploading' as const,
      ...(previewUrl ? { previewUrl } : {}),
    };
  });
  entries.set(projectId, { cards, previewUrls, dismissedOrders: new Set() });
  notify();
}

/**
 * One file answered. Its card leaves the tray and its object URL is revoked
 * here, at the exact moment the server path exists — so the local placeholder
 * never outlives the real thing, and a batch cannot leak a blob per file.
 */
export function settleHomeAttachmentUpload(projectId: string, order: number): void {
  const entry = entries.get(projectId);
  if (!entry) return;
  const card = entry.cards.find((candidate) => candidate.order === order);
  if (!card) return;
  revoke(entry.previewUrls.get(card.id));
  entry.previewUrls.delete(card.id);
  entry.cards = entry.cards.filter((candidate) => candidate !== card);
  notify();
}

/**
 * The user pulled a card out of the tray while it was still going up. Same
 * semantics the in-project composer already gives that gesture: the file still
 * lands in the project, it just does not ride the first message.
 */
export function dismissHomeAttachmentUpload(projectId: string, cardIdToDrop: string): void {
  const entry = entries.get(projectId);
  if (!entry) return;
  const card = entry.cards.find((candidate) => candidate.id === cardIdToDrop);
  if (!card) return;
  entry.dismissedOrders.add(card.order);
  settleHomeAttachmentUpload(projectId, card.order);
}

/** Orders the user removed from the tray. Read before ending the hand-off. */
export function dismissedHomeAttachmentOrders(projectId: string): ReadonlySet<number> {
  return entries.get(projectId)?.dismissedOrders ?? new Set<number>();
}

/**
 * Tear the hand-off down. Safe to call more than once, and safe to call with
 * cards still in it — a failed or thrown upload leaves its card behind, and
 * this is what stops that card's object URL from outliving the batch.
 */
export function endHomeAttachmentUploads(projectId: string): void {
  const entry = entries.get(projectId);
  if (!entry) return;
  for (const url of entry.previewUrls.values()) revoke(url);
  entry.previewUrls.clear();
  entries.delete(projectId);
  notify();
}

/** The cards still in flight for `projectId`. Identity is stable between changes. */
export function homeAttachmentUploadsFor(projectId: string): readonly PendingUpload[] {
  return entries.get(projectId)?.cards ?? NO_UPLOADS;
}

/** True while any picked file for `projectId` is still on its way up. */
export function homeAttachmentUploadsPending(projectId: string): boolean {
  return homeAttachmentUploadsFor(projectId).length > 0;
}

export function subscribeHomeAttachmentUploads(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Test seam: drop every parked hand-off, revoking whatever it still owns. */
export function resetHomeAttachmentUploads(): void {
  for (const projectId of [...entries.keys()]) endHomeAttachmentUploads(projectId);
}
