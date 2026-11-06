import { useSyncExternalStore } from "react";
import {
  type ComboEvent,
  comboClashKey,
  comboText,
  formatCombo,
  matchCombo,
  parseCombo,
} from "./studioCombo";

/** Every single-character bare key Studio answers, by action. */
export const DEFAULT_STUDIO_KEYS = {
  fullscreen: "f",
  split: "s",
  record: "r",
  addKeyframe: "k",
  audioGain: "g",
  zoomSelection: "z",
  mute: "m",
  pause: "k",
  shuttleBack: "j",
  shuttleForward: "l",
  inPoint: "i",
  outPoint: "o",
  seekToIn: "a",
  seekToOut: "e",
  selectTool: "v",
  razorTool: "b",
  selectLeftward: "[",
  selectRightward: "]",
  exitRazor: "a",
  snap: "s",
  grid: "g",
  timelineSnap: "n",
  playPause: "Space",
  frameBack: "ArrowLeft",
  frameForward: "ArrowRight",
  frameBackTen: "shift+ArrowLeft",
  frameForwardTen: "shift+ArrowRight",
  loop: "shift+l",
  clearInPoint: "shift+i",
  clearOutPoint: "shift+o",
  undo: "mod+z",
  redo: "mod+shift+z",
  redoAlt: "ctrl+y",
  tabCompositions: "mod+1",
  tabAssets: "mod+2",
  group: "mod+g",
  ungroup: "mod+shift+g",
  copy: "mod+c",
  paste: "mod+v",
  cut: "mod+x",
  duplicate: "mod+d",
  linkToggle: "mod+l",
  detachAudio: "alt+shift+d",
  deleteLinked: "alt+Backspace",
  deleteLinkedAlt: "alt+Delete",
  deleteSelected: "Delete",
  deleteSelectedAlt: "Backspace",
  resetKeyframes: "Backspace",
  nudgeLeft: "ArrowLeft",
  nudgeRight: "ArrowRight",
  nudgeUp: "ArrowUp",
  nudgeDown: "ArrowDown",
  nudgeLeftTen: "shift+ArrowLeft",
  nudgeRightTen: "shift+ArrowRight",
  nudgeUpTen: "shift+ArrowUp",
  nudgeDownTen: "shift+ArrowDown",
  captionSelectAll: "mod+a",
  pickupClip: "Space",
  pickupUp: "ArrowUp",
  pickupDown: "ArrowDown",
  pickupDrop: "Enter",
  cancel: "Escape",
};

export type StudioKeyAction = keyof typeof DEFAULT_STUDIO_KEYS;
export type StudioKeys = Readonly<Record<StudioKeyAction, string>>;

const SHARED_BY_DESIGN: ReadonlyArray<readonly [StudioKeyAction, StudioKeyAction]> = [
  ["pause", "addKeyframe"],
  ["seekToIn", "exitRazor"],
  ["split", "snap"],
  ["audioGain", "grid"],
  ["playPause", "pickupClip"],
  ["frameBack", "nudgeLeft"],
  ["frameForward", "nudgeRight"],
  ["frameBackTen", "nudgeLeftTen"],
  ["frameForwardTen", "nudgeRightTen"],
  ["nudgeUp", "pickupUp"],
  ["nudgeDown", "pickupDown"],
  ["deleteSelectedAlt", "resetKeyframes"],
];

let current: StudioKeys = DEFAULT_STUDIO_KEYS;
const listeners = new Set<() => void>();

const sharedByDesign = (a: StudioKeyAction, b: StudioKeyAction) =>
  SHARED_BY_DESIGN.some(([x, y]) => (x === a && y === b) || (x === b && y === a));

function findClash(keys: StudioKeys): string | null {
  const actions = Object.keys(keys) as StudioKeyAction[];
  const clashKey = (action: StudioKeyAction) => comboClashKey(parseCombo(keys[action])!);
  for (const [i, a] of actions.entries()) {
    for (const b of actions.slice(i + 1)) {
      if (clashKey(a) === clashKey(b) && !sharedByDesign(a, b))
        return `${a} and ${b} both on "${keys[a]}"`;
    }
  }
  return null;
}

export function studioKeyClash(
  action: StudioKeyAction,
  text: string,
  keys: StudioKeys = current,
): StudioKeyAction | null {
  const wanted = parseCombo(text);
  const holds = (other: StudioKeyAction) => {
    const held = parseCombo(keys[other]);
    return !!held && !!wanted && comboClashKey(held) === comboClashKey(wanted);
  };
  const keyed = Object.keys(keys) as StudioKeyAction[];
  return keyed.find((o) => o !== action && !sharedByDesign(action, o) && holds(o)) ?? null;
}

function resolve(overrides: Partial<Record<StudioKeyAction, string>>): StudioKeys {
  const next: Record<string, string> = { ...DEFAULT_STUDIO_KEYS };
  for (const [action, text] of Object.entries(overrides)) {
    const combo = typeof text === "string" ? parseCombo(text) : null;
    if (!Object.hasOwn(DEFAULT_STUDIO_KEYS, action) || !combo) {
      console.warn(
        `Studio keys: using defaults, "${action}" is not a known action with a valid combo`,
      );
      return DEFAULT_STUDIO_KEYS;
    }
    next[action] = comboText(combo);
  }
  const clash = findClash(next as StudioKeys);
  if (!clash) return next as StudioKeys;
  console.warn(`Studio keys: using defaults, ${clash}`);
  return DEFAULT_STUDIO_KEYS;
}

/** Replaces the host key map; a bad map is refused whole. null restores the defaults. */
export function setStudioKeys(overrides: Partial<Record<StudioKeyAction, string>> | null) {
  current = overrides ? resolve(overrides) : DEFAULT_STUDIO_KEYS;
  for (const listener of listeners) listener();
}

export const getStudioKeys = (): StudioKeys => current;
export const getStudioKey = (action: StudioKeyAction): string => current[action];

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export const useStudioKeys = (): StudioKeys => useSyncExternalStore(subscribe, getStudioKeys);

export function useShortcutSections(host?: readonly ShortcutSection[]): readonly ShortcutSection[] {
  const keys = useStudioKeys();
  return host ?? buildShortcutSections(keys);
}

export interface ShortcutHint {
  key: string;
  label: string;
}

export interface ShortcutSection {
  title: string;
  hints: readonly ShortcutHint[];
}

export const keyHint = (action: StudioKeyAction, keys: StudioKeys = current) =>
  formatCombo(parseCombo(keys[action])!);

export const matchesKey = (e: ComboEvent, action: StudioKeyAction) =>
  matchCombo(e, parseCombo(current[action])!);

export function buildShortcutSections(keys: StudioKeys): readonly ShortcutSection[] {
  const k = (action: StudioKeyAction) => keyHint(action, keys);
  return [
    {
      title: "Playback",
      hints: [
        { key: k("playPause"), label: "Play / Pause" },
        { key: k("shuttleBack"), label: "Play backward" },
        { key: k("pause"), label: "Stop" },
        { key: k("shuttleForward"), label: "Play forward" },
        { key: k("mute"), label: "Toggle mute" },
        { key: k("loop"), label: "Toggle loop" },
        { key: `${k("frameBack")}/${k("frameForward")}`, label: "Step 1 frame" },
        { key: `${k("frameBackTen")}/${k("frameForwardTen")}`, label: "Step 10 frames" },
        { key: k("fullscreen"), label: "Toggle fullscreen" },
      ],
    },
    {
      title: "Keyframes (when an element is selected)",
      hints: [
        { key: k("addKeyframe"), label: "Add / remove keyframe at playhead" },
        { key: k("deleteSelected"), label: "Delete selected keyframe" },
        { key: k("record"), label: "Record gesture" },
      ],
    },
    {
      title: "Editing",
      hints: [
        { key: k("undo"), label: "Undo" },
        { key: k("redo"), label: "Redo" },
        { key: k("copy"), label: "Copy element" },
        { key: k("paste"), label: "Paste element" },
        { key: k("cut"), label: "Cut element" },
        { key: k("split"), label: "Split clip at playhead" },
        { key: k("zoomSelection"), label: "Zoom timeline to selected clips" },
        { key: k("audioGain"), label: "Audio Gain for clips with sound" },
        { key: "⇧Click", label: "Razor tool: split all tracks" },
        { key: k("selectLeftward"), label: "Select clips starting before the playhead" },
        { key: k("selectRightward"), label: "Select clips running at or after the playhead" },
        { key: k("group"), label: "Group elements" },
        { key: k("ungroup"), label: "Ungroup" },
        { key: k("deleteSelected"), label: "Delete selected element (no keyframe selected)" },
      ],
    },
    {
      title: "Gesture recording modifiers",
      hints: [
        { key: "Drag", label: "Record x / y position" },
        { key: "Scroll", label: "Record z depth" },
        { key: "⇧ Drag", label: "Record rotationX / rotationY" },
        { key: "⌥ Drag", label: "Record rotation" },
        { key: "⌘ Drag↕", label: "Record opacity" },
        { key: "⌘ Scroll", label: "Record scale" },
      ],
    },
    {
      title: "Canvas",
      hints: [
        { key: "Drag", label: "Move element / add keyframe" },
        { key: "⌥ Drag", label: "Move entire animation path" },
        { key: "⇧ Drag", label: "Uniform resize" },
      ],
    },
    {
      title: "Crop",
      hints: [
        { key: "Drag edge", label: "Crop a side" },
        { key: "Drag center", label: "Reposition the crop" },
      ],
    },
    {
      title: "Panels",
      hints: [
        { key: k("tabCompositions"), label: "Compositions tab" },
        { key: k("tabAssets"), label: "Assets tab" },
      ],
    },
    {
      title: "Work area",
      hints: [
        { key: k("inPoint"), label: "Set in-point" },
        { key: k("clearInPoint"), label: "Clear in-point" },
        { key: k("outPoint"), label: "Set out-point" },
        { key: k("clearOutPoint"), label: "Clear out-point" },
        { key: k("seekToIn"), label: "Jump to in-point" },
        { key: k("seekToOut"), label: "Jump to out-point" },
      ],
    },
  ];
}

export const getShortcutSections = () => buildShortcutSections(current);

export const DEFAULT_SHORTCUT_SECTIONS: readonly ShortcutSection[] =
  buildShortcutSections(DEFAULT_STUDIO_KEYS);
