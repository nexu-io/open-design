// The one place an uploaded file's type becomes a glyph.
//
// Supplied artwork (per product), inlined for the same reason the rail's marks
// are: every one of these is MULTI-COLOUR — brand fills, two of them
// gradients — and the shared `Icon` / `RemixIcon` components emit a single
// `currentColor` path, which would flatten a Figma logo into a grey blob.
//
// What does NOT live here, deliberately: raster images, vectors and videos.
// Those three families lead with a real thumbnail the user can click to open
// (per product: 视频类、图像类位图、矢量图 默认展示可打开预览), so a chip only
// falls back to `previewFallbackIcon()` for them when no thumbnail can be made
// (an unreadable file, a codec the browser won't decode). `fileTypePreviewKind`
// is what a surface asks to decide between the two paths.
import { useId } from 'react';

export type FileTypeIconName =
  | 'audio'
  | 'code'
  | 'ebook'
  | 'excel'
  | 'figma'
  | 'font'
  | 'gif'
  | 'markdown'
  | 'model3d'
  | 'pdf'
  | 'ppt'
  | 'unknown'
  | 'word'
  | 'zip';

/** The families that show a thumbnail instead of a glyph. */
export type FilePreviewKind = 'image' | 'vector' | 'video';

function extensionOf(name: string): string {
  return /\.([a-z0-9_]{1,10})$/i.exec(name)?.[1]?.toLowerCase() ?? '';
}

const VIDEO_EXTENSIONS = new Set([
  '3gp', 'avi', 'flv', 'm4v', 'mkv', 'mov', 'mp4', 'mpeg', 'mpg', 'ogv', 'webm', 'wmv',
]);

/** Raster only — `svg` is a vector and answers `'vector'` below. */
const IMAGE_EXTENSIONS = new Set([
  'avif', 'bmp', 'gif', 'heic', 'heif', 'ico', 'jpeg', 'jpg', 'png', 'tif', 'tiff', 'webp',
]);

/** Browser-renderable vectors. `.ai` / `.eps` are vectors too, but nothing can
 *  draw them here, so they take a glyph like any other opaque document. */
const VECTOR_EXTENSIONS = new Set(['svg']);

const ICON_BY_EXTENSION = new Map<string, FileTypeIconName>([
  // Figma (per product: Figma 使用 figma 的 icon)
  ...(['fig', 'figma', 'jam'] as const).map((ext) => [ext, 'figma'] as const),
  // 3D / CAD / 工程 (per product: 使用 3d 的 icon)
  ...([
    '3dm', '3ds', '3mf', 'blend', 'catpart', 'dae', 'dwg', 'dxf', 'fbx', 'glb', 'gltf',
    'iam', 'iges', 'igs', 'ipt', 'obj', 'ply', 'prt', 'skp', 'sldasm', 'sldprt', 'step',
    'stl', 'stp', 'usd', 'usda', 'usdc', 'usdz', 'x_t',
  ] as const).map((ext) => [ext, 'model3d'] as const),
  ...(['csv', 'numbers', 'tsv', 'xls', 'xlsm', 'xlsx'] as const)
    .map((ext) => [ext, 'excel'] as const),
  ...(['doc', 'docx', 'odt', 'pages', 'rtf'] as const).map((ext) => [ext, 'word'] as const),
  ...(['key', 'odp', 'ppt', 'pptx'] as const).map((ext) => [ext, 'ppt'] as const),
  ...(['pdf'] as const).map((ext) => [ext, 'pdf'] as const),
  ...(['markdown', 'md', 'mdx'] as const).map((ext) => [ext, 'markdown'] as const),
  ...([
    'astro', 'bash', 'c', 'cc', 'cjs', 'cpp', 'cs', 'css', 'dart', 'fish', 'go', 'gradle',
    'h', 'hpp', 'htm', 'html', 'ini', 'ipynb', 'java', 'js', 'json', 'json5', 'jsx', 'kt',
    'kts', 'less', 'lua', 'mjs', 'php', 'pl', 'ps1', 'py', 'r', 'rb', 'rs', 'sass', 'scala',
    'scss', 'sh', 'sql', 'svelte', 'swift', 'toml', 'ts', 'tsx', 'vue', 'xml', 'yaml', 'yml',
    'zsh',
  ] as const).map((ext) => [ext, 'code'] as const),
  ...(['7z', 'bz2', 'gz', 'rar', 'tar', 'tgz', 'xz', 'zip', 'zst'] as const)
    .map((ext) => [ext, 'zip'] as const),
  ...([
    'aac', 'aif', 'aiff', 'flac', 'm4a', 'mid', 'midi', 'mp3', 'oga', 'ogg', 'opus', 'wav',
    'wma',
  ] as const).map((ext) => [ext, 'audio'] as const),
  ...(['eot', 'otf', 'ttc', 'ttf', 'woff', 'woff2'] as const)
    .map((ext) => [ext, 'font'] as const),
  ...(['azw', 'azw3', 'djvu', 'epub', 'fb2', 'mobi'] as const)
    .map((ext) => [ext, 'ebook'] as const),
  ...(['gif'] as const).map((ext) => [ext, 'gif'] as const),
]);

/**
 * Which of the three thumbnail families this file belongs to, or `null` when it
 * is a document that leads with a glyph.
 *
 * The name decides it; the MIME type is only consulted when there is no usable
 * extension (a pasted screenshot, a drag from an app that names its payload
 * `image`), because a browser's guess at a type is far less reliable than the
 * name the user is looking at.
 */
export function fileTypePreviewKind(name: string, mime?: string): FilePreviewKind | null {
  const ext = extensionOf(name);
  if (ext) {
    if (VECTOR_EXTENSIONS.has(ext)) return 'vector';
    if (IMAGE_EXTENSIONS.has(ext)) return 'image';
    if (VIDEO_EXTENSIONS.has(ext)) return 'video';
    // A known document extension is the answer even if the MIME disagrees.
    if (ICON_BY_EXTENSION.has(ext)) return null;
  }
  const type = (mime ?? '').toLowerCase();
  if (type === 'image/svg+xml') return 'vector';
  if (type.startsWith('image/')) return 'image';
  if (type.startsWith('video/')) return 'video';
  return null;
}

/** The glyph a chip leads with when it is NOT showing a thumbnail. */
export function resolveFileTypeIcon(name: string, mime?: string): FileTypeIconName {
  const ext = extensionOf(name);
  const byExtension = ext ? ICON_BY_EXTENSION.get(ext) : undefined;
  if (byExtension) return byExtension;

  const type = (mime ?? '').toLowerCase();
  if (type.startsWith('audio/')) return 'audio';
  if (type === 'application/pdf') return 'pdf';
  if (type === 'text/markdown') return 'markdown';
  if (type.startsWith('font/')) return 'font';
  if (type === 'application/zip' || type === 'application/x-tar' || type === 'application/gzip') {
    return 'zip';
  }
  if (type === 'application/json' || type === 'application/xml' || type.startsWith('text/x-')) {
    return 'code';
  }
  return 'unknown';
}

/**
 * The glyph a thumbnail family falls back to when its thumbnail cannot be
 * produced — a GIF whose object URL failed, a video the browser won't decode.
 * Raster and vector have no artwork of their own in the supplied set (they are
 * never meant to be seen as a glyph), so they take the neutral one.
 */
export function previewFallbackIcon(kind: FilePreviewKind, name: string): FileTypeIconName {
  if (kind === 'image' && extensionOf(name) === 'gif') return 'gif';
  return 'unknown';
}

interface Props {
  name: FileTypeIconName;
  /** Rendered edge length in px. The artwork is drawn on a 24 grid. */
  size?: number;
}

export function FileTypeIcon({ name, size = 16 }: Props) {
  // Both gradient marks below need document-unique ids: two chips showing the
  // same type would otherwise emit the same `<linearGradient id>` twice, and a
  // `url(#…)` reference resolves to whichever one is still in the DOM — so
  // removing the first chip blanked the second one's fill.
  const gradientId = useId();
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none' as const,
    xmlns: 'http://www.w3.org/2000/svg',
    'aria-hidden': true,
    focusable: 'false' as const,
  };

  switch (name) {
    case 'figma':
      // The export's mask + clipPath are dropped: both crop to the artwork's
      // own bounds, so they change nothing visually and would have been two
      // more ids to keep unique.
      return (
        <svg {...common}>
          <path d="M8.65803 21.9987C10.4978 21.9987 11.9911 20.5056 11.9911 18.6658V15.333H8.65803C6.81826 15.333 5.3252 16.8261 5.3252 18.6658C5.3252 20.5056 6.81826 21.9987 8.65803 21.9987Z" fill="#0ACF83" />
          <path d="M5.3252 11.9998C5.3252 10.1601 6.81826 8.66699 8.65803 8.66699H11.9911V15.3327H8.65803C6.81826 15.3327 5.3252 13.8396 5.3252 11.9998Z" fill="#A259FF" />
          <path d="M5.3252 5.33381C5.3252 3.49404 6.81826 2.00098 8.65803 2.00098H11.9911V8.66689H8.65803C6.81826 8.66689 5.3252 7.17358 5.3252 5.33381Z" fill="#F24E1E" />
          <path d="M11.991 2.00098H15.3238C17.1636 2.00098 18.6566 3.49404 18.6566 5.33381C18.6566 7.17358 17.1636 8.66689 15.3238 8.66689H11.991V2.00098Z" fill="#FF7262" />
          <path d="M18.6566 11.9998C18.6566 13.8396 17.1636 15.3327 15.3238 15.3327C13.484 15.3327 11.991 13.8396 11.991 11.9998C11.991 10.1601 13.484 8.66699 15.3238 8.66699C17.1636 8.66699 18.6566 10.1601 18.6566 11.9998Z" fill="#1ABCFE" />
        </svg>
      );
    case 'model3d':
      return (
        <svg {...common}>
          <path d="M19.0073 6.78768C19.6726 6.40251 19.6726 5.44199 19.0073 5.05682L12.501 1.29007C12.1911 1.11064 11.8089 1.11064 11.499 1.29007L4.99276 5.05682C4.32747 5.44199 4.32747 6.40251 4.99276 6.78768L11.499 10.5544C11.8089 10.7339 12.1911 10.7339 12.501 10.5544L19.0073 6.78768ZM4.00103 8.52451C3.33437 8.13855 2.5 8.61961 2.5 9.38994V16.9235C2.5 17.2803 2.69015 17.6101 2.99896 17.7889L9.49896 21.5521C10.1656 21.938 11 21.457 11 20.6866V13.1531C11 12.7962 10.8099 12.4664 10.501 12.2876L4.00103 8.52451ZM13 20.6866C13 21.457 13.8344 21.938 14.501 21.5521L21.001 17.7889C21.3099 17.6101 21.5 17.2803 21.5 16.9235V9.38994C21.5 8.61961 20.6656 8.13855 19.999 8.52451L13.499 12.2876C13.1901 12.4664 13 12.7962 13 13.1531V20.6866Z" fill="#00E3AE" />
        </svg>
      );
    case 'excel':
      return (
        <svg {...common}>
          <path d="M2.85858 2.87708L15.4293 1.08126C15.7027 1.04221 15.9559 1.23216 15.995 1.50553C15.9983 1.52895 16 1.55258 16 1.57624V22.4233C16 22.6994 15.7761 22.9233 15.5 22.9233C15.4763 22.9233 15.4527 22.9216 15.4293 22.9182L2.85858 21.1224C2.36593 21.052 2 20.6301 2 20.1325V3.86703C2 3.36938 2.36593 2.94746 2.85858 2.87708ZM17 2.99973H21C21.5523 2.99973 22 3.44745 22 3.99973V19.9998C22 20.5521 21.5523 20.9998 21 20.9998H17V2.99973ZM10.2 11.9998L13 7.99973H10.6L9 10.2855L7.39999 7.99973H5L7.8 11.9998L5 15.9998H7.39999L9 13.7141L10.6 15.9998H13L10.2 11.9998Z" fill="#F34801" />
        </svg>
      );
    case 'word':
      return (
        <svg {...common}>
          <path d="M17 2.99973H21C21.5523 2.99973 22 3.44745 22 3.99973V19.9998C22 20.5521 21.5523 20.9998 21 20.9998H17V2.99973ZM2.85858 2.87708L15.4293 1.08126C15.7027 1.04221 15.9559 1.23216 15.995 1.50553C15.9983 1.52895 16 1.55258 16 1.57624V22.4233C16 22.6994 15.7761 22.9233 15.5 22.9233C15.4763 22.9233 15.4527 22.9216 15.4293 22.9182L2.85858 21.1224C2.36593 21.052 2 20.6301 2 20.1325V3.86703C2 3.36938 2.36593 2.94746 2.85858 2.87708ZM11 7.99973V12.9888L9 10.9998L7.01083 12.9998L7 7.99973H5V15.9998H7L9 13.9998L11 15.9998H13V7.99973H11Z" fill="#00A365" />
        </svg>
      );
    case 'ppt':
      return (
        <svg {...common}>
          <path d="M17 2.99973H21C21.5523 2.99973 22 3.44745 22 3.99973V19.9998C22 20.5521 21.5523 20.9998 21 20.9998H17V2.99973ZM2.85858 2.87708L15.4293 1.08126C15.7027 1.04221 15.9559 1.23216 15.995 1.50553C15.9983 1.52895 16 1.55258 16 1.57624V22.4233C16 22.6994 15.7761 22.9233 15.5 22.9233C15.4763 22.9233 15.4527 22.9216 15.4293 22.9182L2.85858 21.1224C2.36593 21.052 2 20.6301 2 20.1325V3.86703C2 3.36938 2.36593 2.94746 2.85858 2.87708ZM5 7.99973V15.9998H7V13.9998H13V7.99973H5ZM7 9.99974H11V11.9998H7V9.99974Z" fill="#1F68FE" />
        </svg>
      );
    case 'pdf':
      return (
        <svg {...common}>
          <path d="M3.9985 2C3.44749 2 3 2.44405 3 2.9918V21.0082C3 21.5447 3.44476 22 3.9934 22H20.0066C20.5551 22 21 21.5489 21 20.9925L20.9997 7L16 2H3.9985ZM10.5 7.5H12.5C12.5 9.98994 14.6436 12.6604 17.3162 13.5513L16.8586 15.49C13.7234 15.0421 10.4821 16.3804 7.5547 18.3321L6.3753 16.7191C7.46149 15.8502 8.50293 14.3757 9.27499 12.6534C10.0443 10.9373 10.5 9.07749 10.5 7.5ZM11.1 13.4716C11.3673 12.8752 11.6043 12.2563 11.8037 11.6285C12.2754 12.3531 12.8553 13.0182 13.5102 13.5953C12.5284 13.7711 11.5666 14.0596 10.6353 14.4276C10.8 14.1143 10.9551 13.7948 11.1 13.4716Z" fill="#FF0044" />
        </svg>
      );
    case 'markdown':
      return (
        <svg {...common}>
          <path d="M3 3H21C21.5523 3 22 3.44772 22 4V20C22 20.5523 21.5523 21 21 21H3C2.44772 21 2 20.5523 2 20V4C2 3.44772 2.44772 3 3 3ZM7 15.5V11.5L9 13.5L11 11.5V15.5H13V8.5H11L9 10.5L7 8.5H5V15.5H7ZM18 12.5V8.5H16V12.5H14L17 15.5L20 12.5H18Z" fill="black" />
        </svg>
      );
    case 'code':
      return (
        <svg {...common}>
          <path d="M3 3H21C21.5523 3 22 3.44772 22 4V20C22 20.5523 21.5523 21 21 21H3C2.44772 21 2 20.5523 2 20V4C2 3.44772 2.44772 3 3 3ZM16.4645 15.5355L20 12L16.4645 8.46447L15.0503 9.87868L17.1716 12L15.0503 14.1213L16.4645 15.5355ZM6.82843 12L8.94975 9.87868L7.53553 8.46447L4 12L7.53553 15.5355L8.94975 14.1213L6.82843 12ZM11.2443 17L14.884 7H12.7557L9.11597 17H11.2443Z" fill="#00CCFF" />
        </svg>
      );
    case 'zip':
      return (
        <svg {...common}>
          <path d="M10 2V4H12V2H20.0066C20.5551 2 21 2.44405 21 2.9918V21.0082C21 21.5447 20.5552 22 20.0066 22H3.9934C3.44495 22 3 21.556 3 21.0082V2.9918C3 2.45531 3.44476 2 3.9934 2H10ZM12 4V6H14V4H12ZM10 6V8H12V6H10ZM12 8V10H14V8H12ZM10 10V12H12V10H10ZM12 12V14H10V17H14V12H12Z" fill="#0B06FE" />
        </svg>
      );
    case 'gif':
      return (
        <svg {...common}>
          <path d="M16 2L20.9997 7L21 20.9925C21 21.5489 20.5551 22 20.0066 22H3.9934C3.44476 22 3 21.5447 3 21.0082V2.9918C3 2.44405 3.44749 2 3.9985 2H16ZM13 10H12V15H13V10ZM11 10H9C7.89543 10 7 10.8954 7 12V13C7 14.1046 7.89543 15 9 15H10C10.5523 15 11 14.5523 11 14V12H9V13H10V14H9C8.44772 14 8 13.5523 8 13V12C8 11.4477 8.44772 11 9 11H11V10ZM17 10H14V15H15V13H17V12H15V11H17V10Z" fill="#F49624" />
        </svg>
      );
    case 'audio':
      return (
        <svg {...common}>
          <path d="M2 3.9934C2 3.44476 2.45531 3 2.9918 3H21.0082C21.556 3 22 3.44495 22 3.9934V20.0066C22 20.5552 21.5447 21 21.0082 21H2.9918C2.44405 21 2 20.5551 2 20.0066V3.9934ZM12 12.1707C11.6872 12.0602 11.3506 12 11 12C9.34315 12 8 13.3431 8 15C8 16.6569 9.34315 18 11 18C12.6569 18 14 16.6569 14 15V8H17V6H12V12.1707Z" fill="#9500FF" />
        </svg>
      );
    case 'ebook':
      return (
        <svg {...common}>
          <path d="M20 22H6.5C4.567 22 3 20.433 3 18.5V5C3 3.34315 4.34315 2 6 2H20C20.5523 2 21 2.44772 21 3V21C21 21.5523 20.5523 22 20 22ZM19 20V17H6.5C5.67157 17 5 17.6716 5 18.5C5 19.3284 5.67157 20 6.5 20H19Z" fill="#006FE5" />
        </svg>
      );
    case 'font':
      return (
        <svg {...common}>
          <path d="M17 8H7V10H11V17H13V10H17V8ZM4 3H20C20.5523 3 21 3.44772 21 4V20C21 20.5523 20.5523 21 20 21H4C3.44772 21 3 20.5523 3 20V4C3 3.44772 3.44772 3 4 3Z" fill={`url(#${gradientId})`} />
          <defs>
            <linearGradient id={gradientId} x1="12" y1="3" x2="12" y2="21" gradientUnits="userSpaceOnUse">
              <stop />
              <stop offset="1" stopColor="#029F27" />
            </linearGradient>
          </defs>
        </svg>
      );
    case 'unknown':
    default:
      return (
        <svg {...common}>
          <path d="M16 2L21 7V21.0082C21 21.556 20.5551 22 20.0066 22H3.9934C3.44476 22 3 21.5447 3 21.0082V2.9918C3 2.44405 3.44495 2 3.9934 2H16ZM11 15V17H13V15H11ZM13 13.3551C14.4457 12.9248 15.5 11.5855 15.5 10C15.5 8.067 13.933 6.5 12 6.5C10.302 6.5 8.88637 7.70919 8.56731 9.31346L10.5288 9.70577C10.6656 9.01823 11.2723 8.5 12 8.5C12.8284 8.5 13.5 9.17157 13.5 10C13.5 10.8284 12.8284 11.5 12 11.5C11.4477 11.5 11 11.9477 11 12.5V14H13V13.3551Z" fill={`url(#${gradientId})`} />
          <defs>
            <radialGradient
              id={gradientId}
              cx="0"
              cy="0"
              r="1"
              gradientUnits="userSpaceOnUse"
              gradientTransform="translate(4.5 3.5) rotate(50.1944) scale(19.5256 17.5731)"
            >
              <stop stopColor="#00FF08" />
              <stop offset="0.509615" stopColor="#00FFEA" />
              <stop offset="1" stopColor="#121212" />
            </radialGradient>
          </defs>
        </svg>
      );
  }
}
