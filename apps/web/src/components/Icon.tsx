import type { SVGProps } from 'react';

export type IconName =
  | 'arrow-left'
  | 'arrow-up'
  | 'attach'
  | 'bell'
  | 'check'
  | 'chevron-down'
  | 'chevron-left'
  | 'chevron-right'
  | 'close'
  | 'copy'
  | 'comment'
  | 'discord'
  | 'download'
  | 'draw'
  | 'edit'
  | 'external-link'
  | 'eye'
  | 'eye-off'
  | 'file'
  | 'file-code'
  | 'folder'
  | 'github'
  | 'grid'
  | 'hammer'
  | 'help-circle'
  | 'history'
  | 'home'
  | 'image'
  | 'import'
  | 'info'
  | 'kanban'
  | 'languages'
  | 'link'
  | 'mic'
  | 'minus'
  | 'more-horizontal'
  | 'orbit'
  | 'palette'
  | 'pencil'
  | 'plus'
  | 'star'
  | 'play'
  | 'present'
  | 'refresh'
  | 'reload'
  | 'search'
  | 'send'
  | 'settings'
  | 'share'
  | 'sliders'
  | 'spinner'
  | 'sparkles'
  | 'stop'
  | 'sun'
  | 'moon'
  | 'sun-moon'
  | 'thumbs-down'
  | 'thumbs-up'
  | 'tweaks'
  | 'upload'
  | 'trash'
  | 'zoom-in'
  | 'zoom-out';

interface Props extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: IconName;
  size?: number | string;
}

/**
 * Lightweight inline-SVG icon set tuned to the design system. Stroke-based
 * (Feather/Lucide style) so they pair cleanly with `currentColor` and adopt
 * the local text color. Use sparingly inside buttons that already have
 * accessible labels — set `aria-hidden` by default.
 */
export function Icon({ name, size = 14, strokeWidth = 1.6, ...rest }: Props) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
    focusable: 'false' as const,
    ...rest,
  };
  switch (name) {
    case 'arrow-left':
      return (
        <svg {...common}>
          <path d="M19 12H5" />
          <path d="m12 19-7-7 7-7" />
        </svg>
      );
    case 'arrow-up':
      return (
        <svg {...common}>
          <path d="M12 19V5" />
          <path d="m5 12 7-7 7 7" />
        </svg>
      );
    case 'attach':
      return (
        <svg {...common}>
          <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
        </svg>
      );
    case 'bell':
      return (
        <svg {...common}>
          <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
      );
    case 'check':
      return (
        <svg {...common}>
          <path d="M20 6 9 17l-5-5" />
        </svg>
      );
    case 'chevron-down':
      return (
        <svg {...common}>
          <path d="m6 9 6 6 6-6" />
        </svg>
      );
    case 'chevron-left':
      return (
        <svg {...common}>
          <path d="m15 18-6-6 6-6" />
        </svg>
      );
    case 'chevron-right':
      return (
        <svg {...common}>
          <path d="m9 18 6-6-6-6" />
        </svg>
      );
    case 'close':
      // Tighter X than the Lucide default (which uses coords 6→18 inside a
      // 24-unit viewBox, so the visible glyph is only 50% of the icon box).
      // Close buttons read as a small dot inside their container at typical
      // 14-18px icon sizes. Extending the strokes to 4→20 lifts the visible
      // extent to ~67% so the X feels balanced inside compact modal close
      // buttons (PluginMediaDetail / NewProjectModal / PreviewModal) without
      // overpowering chip-sized close icons (ChatComposer / SettingsDialog).
      return (
        <svg {...common}>
          <path d="M20 4 4 20" />
          <path d="m4 4 16 16" />
        </svg>
      );
    case 'copy':
      return (
        <svg {...common}>
          <rect x="9" y="9" width="13" height="13" rx="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      );
    case 'comment':
      return (
        <svg {...common}>
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      );
    case 'discord':
      return (
        <svg {...common} fill="currentColor" stroke="none">
          <path d="M19.27 5.33C17.94 4.71 16.5 4.26 15 4a.09.09 0 0 0-.07.03c-.18.33-.39.76-.53 1.09a16.09 16.09 0 0 0-4.8 0c-.14-.34-.35-.76-.54-1.09a.07.07 0 0 0-.07-.03c-1.5.26-2.93.71-4.27 1.33a.06.06 0 0 0-.03.03C2.31 9.39 1.84 13.34 2.07 17.24c0 .03.02.05.04.06a16.18 16.18 0 0 0 4.85 2.43.08.08 0 0 0 .07-.03c.37-.51.7-1.05.99-1.62a.08.08 0 0 0-.04-.11c-.53-.2-1.03-.45-1.51-.73a.08.08 0 0 1-.01-.13c.1-.08.21-.16.3-.24a.08.08 0 0 1 .08-.01c3.21 1.46 6.69 1.46 9.86 0a.08.08 0 0 1 .08.01c.1.08.2.16.3.24a.08.08 0 0 1-.01.13c-.48.28-.98.53-1.51.73a.08.08 0 0 0-.04.11c.3.57.62 1.11 1 1.62a.08.08 0 0 0 .07.03 16.13 16.13 0 0 0 4.86-2.43.07.07 0 0 0 .04-.06c.27-4.5-.45-8.42-2.83-11.88a.06.06 0 0 0-.03-.03zM8.52 14.91c-.95 0-1.74-.87-1.74-1.94s.77-1.94 1.74-1.94c.97 0 1.76.88 1.74 1.94 0 1.07-.78 1.94-1.74 1.94zm6.42 0c-.95 0-1.74-.87-1.74-1.94s.77-1.94 1.74-1.94c.98 0 1.76.88 1.74 1.94 0 1.07-.77 1.94-1.74 1.94z" />
        </svg>
      );
    case 'download':
      return (
        <svg {...common}>
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <path d="m7 10 5 5 5-5" />
          <path d="M12 15V3" />
        </svg>
      );
    case 'draw':
      return (
        <svg {...common}>
          <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25z" />
          <path d="m14.06 6.19 3.75 3.75" />
        </svg>
      );
    case 'edit':
      return (
        <svg {...common}>
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
        </svg>
      );
    case 'eye':
      return (
        <svg {...common}>
          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      );
    case 'eye-off':
      return (
        <svg {...common}>
          <path d="m3 3 18 18" />
          <path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" />
          <path d="M9.9 4.2A9.9 9.9 0 0 1 12 4c6.5 0 10 8 10 8a17.8 17.8 0 0 1-2.1 3.1" />
          <path d="M6.1 6.1C3.5 7.9 2 12 2 12s3.5 8 10 8a9.9 9.9 0 0 0 4.2-.9" />
        </svg>
      );
    case 'external-link':
      return (
        <svg {...common}>
          <path d="M15 3h6v6" />
          <path d="M10 14 21 3" />
          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
        </svg>
      );
    case 'file':
      return (
        <svg {...common}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <path d="M14 2v6h6" />
        </svg>
      );
    case 'file-code':
      return (
        <svg {...common}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <path d="M14 2v6h6" />
          <path d="m10 13-2 2 2 2" />
          <path d="m14 17 2-2-2-2" />
        </svg>
      );
    case 'folder':
      return (
        <svg {...common}>
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
        </svg>
      );
    case 'github':
      return (
        <svg {...common}>
          <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.4 5.4 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
          <path d="M9 18c-4.51 2-5-2-7-2" />
        </svg>
      );
    case 'grid':
      return (
        <svg {...common}>
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
          <rect x="14" y="14" width="7" height="7" rx="1" />
        </svg>
      );
    case 'hammer':
      // Lucide-style hammer — a slanted head plus diagonal handle, used
      // to signal "tool / functionality" affordances. Pairs with the
      // entry topbar's Use everywhere chip where a chain link would
      // misleadingly read as a hyperlink instead of a callable tool.
      return (
        <svg {...common}>
          <path d="m15 12-8.373 8.373a1 1 0 1 1-3-3L12 9" />
          <path d="m18 15 4-4" />
          <path d="m21.5 11.5-1.914-1.914A2 2 0 0 1 19 8.172V7l-2.26-2.26a6 6 0 0 0-4.202-1.756L9 2.96l.92.82A6.18 6.18 0 0 1 12 8.4V10l2 2h1.172a2 2 0 0 1 1.414.586L18.5 14.5" />
        </svg>
      );
    case 'help-circle':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="10" />
          <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
          <path d="M12 17h.01" />
        </svg>
      );
    case 'history':
      return (
        <svg {...common}>
          <path d="M3 12a9 9 0 1 0 3-6.7" />
          <path d="M3 4v5h5" />
          <path d="M12 7v5l3 2" />
        </svg>
      );
    case 'home':
      return (
        <svg {...common}>
          <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2h-4v-7h-6v7H5a2 2 0 0 1-2-2z" />
        </svg>
      );
    case 'image':
      return (
        <svg {...common}>
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <circle cx="9" cy="9" r="2" />
          <path d="m21 15-4.5-4.5L7 20" />
        </svg>
      );
    case 'import':
      return (
        <svg {...common}>
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <path d="m17 8-5-5-5 5" />
          <path d="M12 3v12" />
        </svg>
      );
    case 'info':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="16" x2="12" y2="12" />
          <line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
      );
    case 'kanban':
      return (
        <svg {...common}>
          <rect x="3" y="4" width="5" height="16" rx="1" />
          <rect x="10" y="4" width="5" height="10" rx="1" />
          <rect x="17" y="4" width="4" height="13" rx="1" />
        </svg>
      );
    case 'languages':
      return (
        <svg {...common}>
          <path d="m5 8 6 6" />
          <path d="m4 14 6-6 2-3" />
          <path d="M2 5h12" />
          <path d="M7 2h1" />
          <path d="m22 22-5-10-5 10" />
          <path d="M14 18h6" />
        </svg>
      );
    case 'link':
      return (
        <svg {...common}>
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 1 0-7.07-7.07L11.75 5.18" />
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 1 0 7.07 7.07l1.71-1.71" />
        </svg>
      );
    case 'mic':
      return (
        <svg {...common}>
          <rect x="9" y="2" width="6" height="11" rx="3" />
          <path d="M19 10v1a7 7 0 0 1-14 0v-1" />
          <path d="M12 18v3" />
        </svg>
      );
    case 'minus':
      return (
        <svg {...common}>
          <path d="M5 12h14" />
        </svg>
      );
    case 'more-horizontal':
      return (
        <svg {...common}>
          <circle cx="5" cy="12" r="1.4" />
          <circle cx="12" cy="12" r="1.4" />
          <circle cx="19" cy="12" r="1.4" />
        </svg>
      );
    case 'orbit':
      // Tilted elliptical orbit + central body + a small satellite riding the
      // path. Reads unmistakably as "orbit/automation" rather than the
      // generic refresh loop, and the rotated ellipse keeps the silhouette
      // distinct from `refresh` and `reload` at small sizes.
      return (
        <svg {...common}>
          <ellipse
            cx="12"
            cy="12"
            rx="9"
            ry="3.5"
            transform="rotate(-25 12 12)"
          />
          <circle cx="12" cy="12" r="2.25" fill="currentColor" stroke="none" />
          <circle cx="16" cy="6.8" r="1.5" fill="currentColor" stroke="none" />
        </svg>
      );
    case 'palette':
      return (
        <svg {...common}>
          <path d="M12 2a10 10 0 1 0 0 20 2 2 0 0 0 0-4 1.5 1.5 0 0 1-1.06-2.56l.78-.78A2 2 0 0 1 13.13 14H17a5 5 0 0 0 5-5c0-3.87-4.48-7-10-7Z" />
          <circle cx="7.5" cy="10.5" r="1" fill="currentColor" stroke="none" />
          <circle cx="9.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
          <circle cx="14" cy="6" r="1" fill="currentColor" stroke="none" />
          <circle cx="17.5" cy="9" r="1" fill="currentColor" stroke="none" />
        </svg>
      );
    case 'pencil':
      return (
        <svg {...common}>
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4z" />
        </svg>
      );
    case 'plus':
      return (
        <svg {...common}>
          <path d="M12 5v14" />
          <path d="M5 12h14" />
        </svg>
      );
    case 'play':
      return (
        <svg {...common}>
          <path d="M6 4v16l14-8z" />
        </svg>
      );
    case 'present':
      return (
        <svg {...common}>
          <rect x="2" y="3" width="20" height="14" rx="2" />
          <path d="M8 21h8" />
          <path d="M12 17v4" />
        </svg>
      );
    case 'refresh':
      return (
        <svg {...common}>
          <path d="M3 12a9 9 0 0 1 15.9-5.7L21 8" />
          <path d="M21 3v5h-5" />
          <path d="M21 12a9 9 0 0 1-15.9 5.7L3 16" />
          <path d="M3 21v-5h5" />
        </svg>
      );
    case 'reload':
      return (
        <svg {...common}>
          <path d="M21 12a9 9 0 1 1-3-6.7" />
          <path d="M21 4v5h-5" />
        </svg>
      );
    case 'search':
      return (
        <svg {...common}>
          <circle cx="11" cy="11" r="7" />
          <path d="m21 21-4.3-4.3" />
        </svg>
      );
    case 'send':
      return (
        <svg {...common}>
          <path d="M22 2 11 13" />
          <path d="m22 2-7 20-4-9-9-4z" />
        </svg>
      );
    case 'settings':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 0 1-2.82 2.83l-.06-.07a1.7 1.7 0 0 0-1.88-.33 1.7 1.7 0 0 0-1.04 1.56V21a2 2 0 0 1-4 0v-.1A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.82l.07-.06a1.7 1.7 0 0 0 .33-1.88 1.7 1.7 0 0 0-1.56-1.04H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.56-1.04 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.07A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1.04-1.56V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1.04 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.07.06a1.7 1.7 0 0 0-.33 1.87V9a1.7 1.7 0 0 0 1.56 1.04H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.56 1.04Z" />
        </svg>
      );
    case 'share':
      return (
        <svg {...common}>
          <path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7" />
          <path d="m16 6-4-4-4 4" />
          <path d="M12 2v13" />
        </svg>
      );
    case 'sliders':
      return (
        <svg {...common}>
          <path d="M4 21v-7" />
          <path d="M4 10V3" />
          <path d="M12 21v-9" />
          <path d="M12 8V3" />
          <path d="M20 21v-5" />
          <path d="M20 12V3" />
          <path d="M1 14h6" />
          <path d="M9 8h6" />
          <path d="M17 16h6" />
        </svg>
      );
    case 'spinner':
      return (
        <svg {...common} className={`icon-spin ${rest.className ?? ''}`.trim()}>
          <path d="M21 12a9 9 0 1 1-6.22-8.56" />
        </svg>
      );
    case 'sparkles':
      return (
        <svg {...common}>
          <path d="m12 3 1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5z" />
          <path d="M19 14v3" />
          <path d="M19 21v-1" />
          <path d="M22 17h-3" />
          <path d="M16 17h-1" />
        </svg>
      );
    case 'star':
      return (
        <svg {...common}>
          <path d="M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
        </svg>
      );
    case 'stop':
      return (
        <svg {...common}>
          <rect x="6" y="6" width="12" height="12" rx="1.5" />
        </svg>
      );
    case 'sun':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
        </svg>
      );
    case 'moon':
      return (
        <svg {...common}>
          <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
        </svg>
      );
    case 'sun-moon':
      return (
        <svg {...common}>
          <path d="M12 8a2.83 2.83 0 0 0 4 4 4 4 0 1 1-4-4" />
          <path d="M12 2v2" />
          <path d="M12 20v2" />
          <path d="m4.9 4.9 1.4 1.4" />
          <path d="m17.7 17.7 1.4 1.4" />
          <path d="M2 12h2" />
          <path d="M20 12h2" />
          <path d="m6.3 17.7-1.4 1.4" />
          <path d="m19.1 4.9-1.4 1.4" />
        </svg>
      );
    case 'thumbs-up':
      return (
        <svg {...common}>
          <path d="M7 10v11" />
          <path d="M15 6.8 14 10h4.5a2 2 0 0 1 2 2.3l-1.1 6.6A2.5 2.5 0 0 1 17 21H6a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h2.8L12 4a2 2 0 0 1 3 2.8Z" />
        </svg>
      );
    case 'thumbs-down':
      return (
        <svg {...common}>
          <path d="M7 14V3" />
          <path d="m15 17.2-1-3.2h4.5a2 2 0 0 0 2-2.3L19.4 5A2.5 2.5 0 0 0 17 3H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h2.8L12 20a2 2 0 0 0 3-2.8Z" />
        </svg>
      );
    case 'tweaks':
      return (
        <svg {...common}>
          <path d="M4 6h13" />
          <circle cx="19" cy="6" r="2" />
          <path d="M4 18h7" />
          <circle cx="13" cy="18" r="2" />
          <path d="M17 12H4" />
          <circle cx="19" cy="12" r="2" />
        </svg>
      );
    case 'upload':
      return (
        <svg {...common}>
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <path d="m17 8-5-5-5 5" />
          <path d="M12 3v12" />
        </svg>
      );
    case 'zoom-in':
      return (
        <svg {...common}>
          <circle cx="11" cy="11" r="7" />
          <path d="M11 8v6" />
          <path d="M8 11h6" />
          <path d="m21 21-4.3-4.3" />
        </svg>
      );
    case 'zoom-out':
      return (
        <svg {...common}>
          <circle cx="11" cy="11" r="7" />
          <path d="M8 11h6" />
          <path d="m21 21-4.3-4.3" />
        </svg>
      );
    case 'trash':
      return (
        <svg {...common}>
          <path d="M3 6h18" />
          <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
          <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
        </svg>
      );
    default:
      return null;
  }
}
