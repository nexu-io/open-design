// ── Design Panel Tokens (for inline style={{}} usage) ──────────────────
// Tailwind classes use `panel-*` from tailwind.config.js theme.extend.colors.
// This file provides the same values for inline styles where Tailwind can't reach.

export const P = {
  accent: "#3CE6AC",
  borderInput: "#27272A",
  textMuted: "#52525B",
  white: "#FAFAFA",
} as const;
