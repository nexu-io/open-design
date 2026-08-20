import {
  isScene3dSelectionMessage,
  type Scene3dSelectionMessage,
  type Scene3dSelectionPart,
} from '@open-design/contracts';

/**
 * What the scene3d viewer currently has open, and what is selected in it.
 *
 * The viewer broadcasts this whenever an asset loads or the selection
 * changes. Until now nothing listened: the message was posted into the void,
 * so the editor and the chat sat next to each other knowing nothing about
 * each other. Picking up that broadcast is what lets someone click a part
 * and then talk about it — selection becomes the noun, and the prompt only
 * has to supply the verb.
 *
 * Held in a module-level store rather than React context on purpose. The
 * producer is a `window` message from an iframe that can mount anywhere in
 * the tree, and the consumer is the composer, which is nowhere near it.
 * Threading a provider between them would couple two features that have no
 * structural relationship; a store subscribed through `useSyncExternalStore`
 * couples them only at the two points that actually care.
 */
export interface Scene3dSelectionState {
  /** Display name of the open asset, or null when none is open. */
  asset: string | null;
  /** Project-relative scene directory, when the asset came from one. */
  scenePath: string | null;
  /** Every part in the open asset. */
  parts: Scene3dSelectionPart[];
  /** Names of the currently selected parts, in selection order. */
  selected: string[];
}

const EMPTY: Scene3dSelectionState = {
  asset: null,
  scenePath: null,
  parts: [],
  selected: [],
};

let state: Scene3dSelectionState = EMPTY;
const listeners = new Set<() => void>();
let attached = false;

function emit(): void {
  for (const listener of listeners) listener();
}

function applyMessage(message: Scene3dSelectionMessage): void {
  state = {
    asset: message.asset,
    scenePath: message.scenePath,
    parts: message.parts,
    selected: message.partIds,
  };
  emit();
}

function onWindowMessage(event: MessageEvent): void {
  // Shape-checked, not cast. The viewer runs in an iframe, so anything on
  // the page can post a lookalike — and these strings end up in a prompt.
  if (!isScene3dSelectionMessage(event.data)) return;
  applyMessage(event.data);
}

function onDomEvent(event: Event): void {
  // The viewer also dispatches a CustomEvent, which is how it reaches a host
  // that renders it inline rather than in an iframe.
  const detail = (event as CustomEvent<unknown>).detail;
  if (!isScene3dSelectionMessage(detail)) return;
  applyMessage(detail);
}

function attach(): void {
  if (attached || typeof window === 'undefined') return;
  attached = true;
  window.addEventListener('message', onWindowMessage);
  document.addEventListener('od:scene3d-select', onDomEvent);
}

/**
 * Subscribe to viewer selection changes.
 *
 * The listener is installed on first subscribe and never removed: it is one
 * passive `message` handler for the lifetime of the tab, and tearing it down
 * when the last subscriber unmounts would lose the selection a user made
 * while the composer happened to be unmounted.
 */
export function subscribeScene3dSelection(listener: () => void): () => void {
  attach();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getScene3dSelection(): Scene3dSelectionState {
  return state;
}

/** Server render has no viewer and therefore no selection. */
export function getScene3dSelectionServerSnapshot(): Scene3dSelectionState {
  return EMPTY;
}

/** Test seam: drop everything, as if no asset were open. */
export function resetScene3dSelection(): void {
  state = EMPTY;
  emit();
}

/**
 * Order parts for completion: selected first, then meshes, then the rest.
 *
 * What someone has just clicked is overwhelmingly what they are about to
 * talk about, so it belongs at the top of the list rather than wherever the
 * alphabet puts it. Cameras and lights sort last because they are the
 * compiler's own rig — real prims worth addressing, but never the thing a
 * person means by "this part".
 */
export function orderPartsForMention(
  parts: readonly Scene3dSelectionPart[],
  selected: readonly string[],
): Scene3dSelectionPart[] {
  const rank = (part: Scene3dSelectionPart): number => {
    if (selected.includes(part.name)) return 0;
    if (part.type === 'MESH') return 1;
    return 2;
  };
  return [...parts].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
}
