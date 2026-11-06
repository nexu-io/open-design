export interface Combo {
  mod: boolean;
  meta: boolean;
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
  key: string;
  named: boolean;
}

const NAMED = new Set([
  "Space",
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
  "Home",
  "End",
  "PageUp",
  "PageDown",
  "Delete",
  "Backspace",
  "Escape",
  "Enter",
  "Tab",
]);
const SYMBOL: Record<string, string> = {
  ArrowLeft: "←",
  ArrowRight: "→",
  ArrowUp: "↑",
  ArrowDown: "↓",
  Delete: "Del",
  Backspace: "⌫",
  Escape: "Esc",
};
const MODIFIERS = new Set(["mod", "cmd", "ctrl", "shift", "alt"]);

/** "mod+shift+z", "Space", "b": mod is Cmd or Ctrl; Ctrl+Alt is refused because Windows sends AltGr as Ctrl+Alt. */
export function parseCombo(text: string): Combo | null {
  const split = text.length > 1 ? text.slice(0, -1).lastIndexOf("+") : -1;
  const tokens =
    split < 0
      ? []
      : text
          .slice(0, split)
          .split("+")
          .map((t) => t.toLowerCase());
  const key = text.slice(split + 1);
  const named = NAMED.has(key);
  const symbol = !named && !/^[A-Za-z]$/.test(key);
  if (tokens.some((t) => !MODIFIERS.has(t)) || (!named && [...key].length !== 1)) return null;
  if (symbol && tokens.includes("shift")) return null;
  const combo = {
    mod: tokens.includes("mod"),
    meta: tokens.includes("cmd"),
    ctrl: tokens.includes("ctrl"),
    shift: tokens.includes("shift"),
    alt: tokens.includes("alt"),
    key: named ? key : key.toLowerCase(),
    named,
  };
  return combo.alt && (combo.ctrl || combo.mod) ? null : combo;
}

/** The one string a combo is stored and compared as. */
export function comboText(c: Combo): string {
  const mods = [
    c.mod && "mod",
    c.meta && "cmd",
    c.ctrl && "ctrl",
    c.alt && "alt",
    c.shift && "shift",
  ];
  return [...mods.filter(Boolean), c.key].join("+");
}

const namedMatches = (e: ComboEvent, name: string) =>
  e.code === name || e.key === (name === "Space" ? " " : name);

function charMatches(e: ComboEvent, c: Combo): boolean {
  if (e.key.toLowerCase() === c.key) return true;
  // Option rewrites e.key on macOS (Option+D is "∂"), so fall back to the physical key.
  const code = /^[0-9]$/.test(c.key) ? `Digit${c.key}` : `Key${c.key.toUpperCase()}`;
  return e.altKey && /^[a-z0-9]$/.test(c.key) && e.code === code;
}

export type ComboEvent = Pick<
  KeyboardEvent,
  "key" | "altKey" | "ctrlKey" | "metaKey" | "shiftKey"
> & {
  code?: string;
};

export function matchCombo(e: ComboEvent, c: Combo): boolean {
  const symbol = !c.named && !/^[a-z]$/.test(c.key);
  if ((!symbol && !!e.shiftKey !== c.shift) || !!e.altKey !== c.alt) return false;
  const modsOk = c.mod ? e.metaKey || e.ctrlKey : !!e.metaKey === c.meta && !!e.ctrlKey === c.ctrl;
  return modsOk && (c.named ? namedMatches(e, c.key) : charMatches(e, c));
}

export function formatCombo(c: Combo): string {
  const mods = `${c.ctrl ? "⌃" : ""}${c.alt ? "⌥" : ""}${c.mod || c.meta ? "⌘" : ""}${c.shift ? "⇧" : ""}`;
  return mods + (SYMBOL[c.key] ?? (c.named ? c.key : c.key.toUpperCase()));
}

/** Two combos clash when one press could satisfy both; Cmd and Ctrl both count as mod. */
export const comboClashKey = (c: Combo) =>
  [c.mod || c.meta || c.ctrl, c.alt, c.shift, c.key].join("|");
