/**
 * Keeping the player store's automation attributes true.
 *
 * The store is what a lane draws from, and it is populated by element discovery — a
 * message from the preview runtime, which only arrives on load. Anything that edits
 * an envelope afterwards writes to the preview document and the source file, and the
 * store would go on holding the value it was born with until a reload.
 *
 * One reader, called where a change lands: the resync every dom-edit attribute
 * commit runs, and an undo or redo's soft restore (timeline saves record their own
 * value through syncStoredElementAttribute below). It
 * reads the preview rather than being told, because those callers know a file
 * changed, not which attribute — and because three separate writers shipped without
 * remembering to sync, which is what a single sink prevents.
 */

import { HF_AUDIO_AUTOMATION_ATTR } from "@hyperframes/core/audio-automation";
import { HF_AUDIO_FX_ATTR } from "@hyperframes/core/audio-fx";
import {
  HF_AUDIO_FADE_IN_ATTR,
  HF_AUDIO_FADE_OUT_ATTR,
  readElementFades,
  readFadeSeconds,
} from "@hyperframes/core/audio-fade";
import { usePlayerStore, type TimelineElement } from "../store/playerStore";
import { groupInfoFor } from "./timelineGroupInfo";
import {
  getTimelineElementIdentity,
  previewElementFinder,
  resolveMediaElement,
} from "./timelineElementHelpers";
import { elementVolume, parseStoredVolume } from "./storedVolume";

/**
 * Re-read every element's automation, FX-chain, fade and volume attributes from the preview
 * document, for a change that reached the DOM without going through this store.
 *
 * That is undo and redo. A soft restore patches the reverted attributes onto the
 * live preview and re-runs the timeline — deliberately, so the frame does not blank
 * — but the store it does not touch is the one the lanes read, so an undone delete
 * stayed invisible until a reload. A full restore already clears the store and waits
 * for discovery, so it needs nothing from here.
 *
 * Reads rather than being told: an undo restores whole files, so the attribute it
 * reverted is only known by looking.
 */
/**
 * What an element's seven synced fields SHOULD read, given the preview.
 *
 * Its own five come off its node; the other two are its copy of what its group
 * carries. The timeline derives a group's lanes and chain from these mirrors,
 * never from the group element, and automating a group writes `data-automation`
 * on the group node through the ordinary element path, so both halves are re-read.
 */
function syncedFields(doc: Document, element: TimelineElement, node: Element) {
  const group = element.audioGroup ? groupInfoFor(doc, element.audioGroup) : null;
  const fades = readElementFades(node);
  return {
    automation: node.getAttribute(HF_AUDIO_AUTOMATION_ATTR) ?? undefined,
    fxChain: node.getAttribute(HF_AUDIO_FX_ATTR) ?? undefined,
    fadeIn: storedFade(fades.fadeIn),
    fadeOut: storedFade(fades.fadeOut),
    volume: elementVolume(node, resolveMediaElement(node) ?? node),
    audioGroupAutomation: group?.automation,
    audioGroupFxChain: group?.fxChain,
  };
}

export function syncStoredAutomationFromPreview(doc: Document | null | undefined): void {
  if (!doc) return;
  const findNode = previewElementFinder(doc);
  usePlayerStore.setState((state) => {
    let changed = false;
    const elements = state.elements.map((element) => {
      const node = findNode(element);
      if (!node) return element;
      const fields = syncedFields(doc, element, node);
      // Same array back when nothing moved: `elements` keys memos all over the
      // timeline, and a fresh object per sync would re-render every one.
      const keys = Object.keys(fields) as (keyof typeof fields)[];
      if (keys.every((key) => fields[key] === element[key])) return element;
      changed = true;
      return { ...element, ...fields };
    });
    return changed ? { elements } : {};
  });
}

/** Discovery's rule (applyFadeMetadataFromElement): a fade of 0 is no fade. */
const storedFade = (seconds: number) => (seconds > 0 ? seconds : undefined);

const STORED_FIELD: Record<string, (value: string | null) => Partial<TimelineElement>> = {
  [HF_AUDIO_AUTOMATION_ATTR]: (value) => ({ automation: value ?? undefined }),
  [HF_AUDIO_FX_ATTR]: (value) => ({ fxChain: value ?? undefined }),
  [HF_AUDIO_FADE_IN_ATTR]: (value) => ({ fadeIn: storedFade(readFadeSeconds(value)) }),
  [HF_AUDIO_FADE_OUT_ATTR]: (value) => ({ fadeOut: storedFade(readFadeSeconds(value)) }),
  // A quick volume save writes no other field the store keeps: without this, a clip read its last load's volume.
  "data-volume": (value) => ({ volume: parseStoredVolume(value) }),
};

/** Record a saved automation, FX-chain, fade or volume value on one element's stored copy. */
export function syncStoredElementAttribute(
  target: TimelineElement,
  attr: string,
  value: string | null,
): void {
  const fields = STORED_FIELD[attr]?.(value);
  if (!fields) return;
  const key = getTimelineElementIdentity(target);
  const same = (element: TimelineElement) =>
    (Object.keys(fields) as (keyof TimelineElement)[]).every((k) => element[k] === fields[k]);
  usePlayerStore.setState((state) => {
    let changed = false;
    const elements = state.elements.map((element) => {
      if (getTimelineElementIdentity(element) !== key || same(element)) return element;
      changed = true;
      return { ...element, ...fields };
    });
    return changed ? { elements } : {};
  });
}
