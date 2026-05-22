// Per-editor icon for the hand-off menu. Renders a small rounded-square
// badge with a brand-tinted background and a distinctive glyph — mirrors
// the macOS dock affordance where each app has its own colored tile,
// rather than a single abstract folder/handoff glyph that hides which
// target the user is about to launch.
//
// Glyphs are stylized (Feather/Lucide-style) representations — not the
// official trademarked logos — so we keep visual identification without
// shipping brand assets we don't have a license for.

import type { JSX } from 'react';
import type { HostEditorId } from '@open-design/contracts';

interface Props {
  editorId: HostEditorId | string;
  size?: number;
}

interface EditorVisual {
  // Tile background — chosen to match the editor's primary brand color
  // closely enough to read at a glance in the hand-off menu.
  bg: string;
  // Foreground stroke / glyph color. White on dark tiles, dark on light.
  fg: string;
  glyph: (size: number) => JSX.Element;
}

function angleBrackets(size: number) {
  const s = size * 0.62;
  return (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.4}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m9 7-5 5 5 5" />
      <path d="m15 7 5 5-5 5" />
    </svg>
  );
}

function cursorPointer(size: number) {
  const s = size * 0.6;
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor">
      <path d="M5 3l5 15 3-6 6-3z" />
    </svg>
  );
}

function lightningZ(size: number) {
  const s = size * 0.62;
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor">
      <path d="M6 4h12L9 13h9l-13 7 5-9H4z" />
    </svg>
  );
}

function wave(size: number) {
  const s = size * 0.66;
  return (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
    >
      <path d="M3 12c2 -3 4 -3 6 0s4 3 6 0 4 -3 6 0" />
      <path d="M3 17c2 -3 4 -3 6 0s4 3 6 0 4 -3 6 0" />
    </svg>
  );
}

function macFace(size: number) {
  const s = size * 0.7;
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" fill="currentColor" opacity="0.95" />
      <circle cx="9" cy="10" r="1.2" fill="#fff" />
      <circle cx="15" cy="10" r="1.2" fill="#fff" />
      <path
        d="M8.5 14.5c1 1 2.2 1.5 3.5 1.5s2.5 -.5 3.5 -1.5"
        stroke="#fff"
        strokeWidth={1.4}
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

function terminalPrompt(size: number) {
  const s = size * 0.62;
  return (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.4}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m6 9 4 3 -4 3" />
      <path d="M12 17h6" />
    </svg>
  );
}

function warpTriangle(size: number) {
  const s = size * 0.66;
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 4 22 20H2z" />
    </svg>
  );
}

function hammer(size: number) {
  const s = size * 0.66;
  return (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m15 12-8.5 8.5a2.12 2.12 0 0 1-3-3L12 9" />
      <path d="m17.64 15 3.36-3.36a2.83 2.83 0 0 0 0-4l-2.64-2.64a2.83 2.83 0 0 0-4 0L11 8.36" />
    </svg>
  );
}

function diamond(size: number) {
  const s = size * 0.66;
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 3 22 12l-10 9L2 12z" />
    </svg>
  );
}

function orbit(size: number) {
  const s = size * 0.7;
  return (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
    >
      <circle cx="12" cy="12" r="3" fill="currentColor" />
      <ellipse cx="12" cy="12" rx="9" ry="4" transform="rotate(-30 12 12)" />
    </svg>
  );
}

function letter(ch: string, size: number) {
  const s = size * 0.7;
  return (
    <svg width={s} height={s} viewBox="0 0 24 24">
      <text
        x="12"
        y="17"
        textAnchor="middle"
        fontSize="15"
        fontWeight="800"
        fontFamily="'Inter', system-ui, -apple-system, sans-serif"
        fill="currentColor"
      >
        {ch}
      </text>
    </svg>
  );
}

const EDITORS: Record<string, EditorVisual> = {
  vscode: { bg: '#0078d4', fg: '#ffffff', glyph: angleBrackets },
  cursor: { bg: '#0a0a0a', fg: '#ffffff', glyph: cursorPointer },
  windsurf: { bg: '#0c8a55', fg: '#ffffff', glyph: wave },
  zed: { bg: '#1a1a1a', fg: '#d0d0d0', glyph: lightningZ },
  qoder: { bg: '#f5a623', fg: '#1a1a1a', glyph: diamond },
  antigravity: { bg: '#7c4dff', fg: '#ffffff', glyph: orbit },
  webstorm: { bg: '#f97316', fg: '#ffffff', glyph: (s) => letter('W', s) },
  idea: { bg: '#e91e63', fg: '#ffffff', glyph: (s) => letter('I', s) },
  xcode: { bg: '#1d76d6', fg: '#ffffff', glyph: hammer },
  finder: { bg: '#3097f6', fg: '#ffffff', glyph: macFace },
  explorer: { bg: '#fbbf24', fg: '#1a1a1a', glyph: (s) => letter('E', s) },
  'file-manager': { bg: '#6b7280', fg: '#ffffff', glyph: (s) => letter('F', s) },
  terminal: { bg: '#111111', fg: '#9be37a', glyph: terminalPrompt },
  warp: { bg: '#ff5c1c', fg: '#ffffff', glyph: warpTriangle },
};

export function EditorIcon({ editorId, size = 16 }: Props) {
  const visual = EDITORS[editorId];
  if (!visual) {
    // Fallback — match a neutral folder tile rather than the abstract
    // global handoff glyph the previous design used.
    return (
      <span
        className="editor-icon"
        style={{
          width: size,
          height: size,
          background: '#9ca3af',
          color: '#ffffff',
        }}
      >
        <svg
          width={size * 0.6}
          height={size * 0.6}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
        </svg>
      </span>
    );
  }
  return (
    <span
      className="editor-icon"
      style={{ width: size, height: size, background: visual.bg, color: visual.fg }}
    >
      {visual.glyph(size)}
    </span>
  );
}
