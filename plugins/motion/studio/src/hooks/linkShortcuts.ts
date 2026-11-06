import { usePlayerStore } from "../player";
import type { TimelineEditCallbacks } from "../player/components/timelineCallbacks";
import { resolveLinkMenuItems } from "../player/components/clipMenuLinkItems";
import { isTypingTarget } from "../utils/typingTarget";
import { keyHint, matchesKey } from "../player/components/studioShortcuts";

export interface LinkShortcutCallbacks {
  handleLinkEdit?: TimelineEditCallbacks["onLinkEdit"];
  handleTimelineElementDeleteOnly?: TimelineEditCallbacks["onDeleteElementOnly"];
}

const ACTIONS = [
  ["linkToggle", "linkToggle"],
  ["detachAudio", "detachAudio"],
  ["deleteLinked", "deleteLinked"],
  ["deleteLinkedAlt", "deleteLinked"],
] as const;

const shortcutOf = (event: KeyboardEvent): string | null => {
  const hit = ACTIONS.find(([action]) => matchesKey(event, action));
  return hit ? keyHint(hit[1]) : null;
};

/** ⌘L unlink/link, ⌥⇧D detach audio, ⌥⌫ delete one linked clip — the clip menu's shortcuts. */
export function dispatchLinkShortcut(event: KeyboardEvent, cb: LinkShortcutCallbacks): boolean {
  if (isTypingTarget(event.target)) return false;
  const shortcut = shortcutOf(event);
  if (!shortcut) return false;
  const { elements, selectedElementId, selectedElementIds } = usePlayerStore.getState();
  const element = elements.find((el) => (el.key ?? el.id) === selectedElementId);
  if (!element) return false;
  const item = resolveLinkMenuItems({
    element,
    elements,
    selectedKeys: selectedElementIds,
    onLinkEdit: cb.handleLinkEdit,
    onDeleteElementOnly: cb.handleTimelineElementDeleteOnly,
  }).find((candidate) => candidate.shortcut === shortcut);
  if (!item) return false;
  event.preventDefault();
  item.run();
  return true;
}
