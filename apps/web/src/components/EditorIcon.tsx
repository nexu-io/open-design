// Per-editor icon for the hand-off menu. Real product marks are bundled as
// PNGs under `apps/web/public/editor-icons/` (downscaled from official 512px
// app icons) and rendered as plain <img> so each brand's own tile shape,
// colors, and rounding are preserved. Only generic destinations without brand
// artwork (Explorer / File Manager) keep a drawn glyph.

import type { HostEditorId } from '@open-design/contracts';

interface Props {
  editorId: HostEditorId | string;
  size?: number;
}

// Editors with a bundled brand asset. `mono: true` marks bare single-color
// glyphs (no baked tile) that must follow the theme's text color — rendered
// as a CSS-masked span, same pattern as AgentIcon's MONO_ICONS, so the mark
// stays legible on dark panels.
const IMAGE_ICONS: Record<string, { mono?: boolean }> = {
  cursor: {},
  vscode: {},
  qoder: {},
  xcode: {},
  finder: {},
  terminal: {},
  zed: {},
  antigravity: {},
  webstorm: {},
  idea: {},
  warp: {},
  windsurf: { mono: true },
};

function folderLogo(size: number) {
  const s = size * 0.76;
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M2.75 5.75A2.75 2.75 0 0 1 5.5 3h4.32c.74 0 1.43.36 1.86.96l1.1 1.54h5.72a2.75 2.75 0 0 1 2.75 2.75v9.5a2.75 2.75 0 0 1-2.75 2.75h-13A2.75 2.75 0 0 1 2.75 17.75z"
        fill="currentColor"
      />
      <path d="M3.7 8.1h16.6" stroke="#ffffff" strokeWidth="1.25" strokeLinecap="round" opacity=".7" />
    </svg>
  );
}

interface EditorVisual {
  bg: string;
  fg: string;
  glyph: (size: number) => JSX.Element;
}

const EDITORS: Record<string, EditorVisual> = {
  explorer: { bg: '#fbbf24', fg: '#1a1a1a', glyph: folderLogo },
  'file-manager': { bg: '#6b7280', fg: '#ffffff', glyph: folderLogo },
};

export function EditorIcon({ editorId, size = 16 }: Props) {
  const image = IMAGE_ICONS[editorId];
  if (image) {
    const src = `/editor-icons/${editorId}.png`;
    if (image.mono) {
      return (
        <span
          className="editor-icon editor-icon-mask"
          style={{
            width: size,
            height: size,
            WebkitMaskImage: `url("${src}")`,
            maskImage: `url("${src}")`,
          }}
          aria-hidden="true"
        />
      );
    }
    return (
      <img
        className="editor-icon editor-icon-img"
        src={src}
        alt=""
        width={size}
        height={size}
        aria-hidden="true"
        draggable={false}
      />
    );
  }
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
