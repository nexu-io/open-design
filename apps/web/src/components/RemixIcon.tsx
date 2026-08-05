import type { CSSProperties } from 'react';

import { REMIX_ICON_PATHS } from './remix-icon-paths';

interface RemixIconProps {
  name: string;
  size?: number;
  className?: string;
  style?: CSSProperties;
}

/**
 * Remix Icon glyphs rendered as inline SVG. This deliberately does NOT use
 * the remixicon icon font: the packaged od:// protocol cannot load url()
 * fonts at all (Chromium's font loader rejects them on custom-scheme
 * documents), which turned every glyph into a tofu square. Inline vector
 * data has no load step to fail. Unknown names render an empty placeholder
 * of the same footprint — add the glyph to remix-icon-paths.ts (extracted
 * from remixicon@4.9.1) when introducing a new icon.
 */
export function RemixIcon({ name, size = 14, className, style }: RemixIconProps) {
  const d = REMIX_ICON_PATHS[name];
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
      className={className}
      style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0, ...style }}
    >
      {d ? <path d={d} /> : null}
    </svg>
  );
}
