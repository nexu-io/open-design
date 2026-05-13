import type { SVGProps } from 'react';
import {
  ArrowLeft,
  ArrowUp,
  Bell,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  File,
  FileCode,
  Folder,
  History,
  Image as ImageIcon,
  Import,
  KanbanSquare,
  Languages,
  Link,
  Loader2,
  type LucideIcon,
  MessageSquare,
  Mic,
  Minus,
  MoreHorizontal,
  Orbit,
  Paperclip,
  PawPrint,
  PenLine,
  Pencil,
  Play,
  Plus,
  Presentation,
  RefreshCw,
  RotateCw,
  Search,
  Send,
  Settings,
  Share,
  SlidersHorizontal,
  SlidersVertical,
  Sparkles,
  Square,
  SquarePen,
  SunMoon,
  ThumbsDown,
  ThumbsUp,
  Trash,
  Upload,
  X as CloseX,
  LayoutGrid,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';

type IconName =
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
  | 'grid'
  | 'history'
  | 'image'
  | 'import'
  | 'kanban'
  | 'languages'
  | 'link'
  | 'mic'
  | 'minus'
  | 'more-horizontal'
  | 'orbit'
  | 'paw'
  | 'pencil'
  | 'plus'
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
  | 'sun-moon'
  | 'thumbs-down'
  | 'thumbs-up'
  | 'tweaks'
  | 'upload'
  | 'trash'
  | 'x-brand'
  | 'zoom-in'
  | 'zoom-out';

interface Props extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: IconName;
  size?: number | string;
}

// Dispatch table: each of our internal names → the lucide-react component
// that renders it. `null` means the name is handled specially below
// (brand marks that lucide does not carry, or the spinner that wants its
// own animation className).
const ICON_MAP: Record<IconName, LucideIcon | null> = {
  'arrow-left': ArrowLeft,
  'arrow-up': ArrowUp,
  attach: Paperclip,
  bell: Bell,
  check: Check,
  'chevron-down': ChevronDown,
  'chevron-left': ChevronLeft,
  'chevron-right': ChevronRight,
  close: CloseX,
  copy: Copy,
  comment: MessageSquare,
  discord: null,
  download: Download,
  draw: PenLine,
  edit: SquarePen,
  'external-link': ExternalLink,
  eye: Eye,
  'eye-off': EyeOff,
  file: File,
  'file-code': FileCode,
  folder: Folder,
  grid: LayoutGrid,
  history: History,
  image: ImageIcon,
  import: Import,
  kanban: KanbanSquare,
  languages: Languages,
  link: Link,
  mic: Mic,
  minus: Minus,
  'more-horizontal': MoreHorizontal,
  orbit: Orbit,
  paw: PawPrint,
  pencil: Pencil,
  plus: Plus,
  play: Play,
  present: Presentation,
  refresh: RefreshCw,
  reload: RotateCw,
  search: Search,
  send: Send,
  settings: Settings,
  share: Share,
  sliders: SlidersVertical,
  spinner: null,
  sparkles: Sparkles,
  stop: Square,
  'sun-moon': SunMoon,
  'thumbs-down': ThumbsDown,
  'thumbs-up': ThumbsUp,
  tweaks: SlidersHorizontal,
  upload: Upload,
  trash: Trash,
  'x-brand': null,
  'zoom-in': ZoomIn,
  'zoom-out': ZoomOut,
};

/**
 * Inline icon — dispatches to lucide-react under a stable internal name so
 * call sites stay decoupled from the icon library. Brand marks (Discord, X)
 * are kept as bespoke inline SVG because lucide intentionally does not ship
 * brand artwork. The spinner is the only icon that animates; it keeps the
 * `icon-spin` className the rest of the app already styles.
 *
 * Defaults: `size: 14`, `strokeWidth: 1.6` — a touch finer than lucide's
 * stock 2px stroke, matching the refined typography in this app.
 */
export function Icon({ name, size = 14, strokeWidth = 1.6, ...rest }: Props) {
  if (name === 'discord') {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="currentColor"
        stroke="none"
        aria-hidden
        focusable="false"
        {...rest}
      >
        <path d="M19.27 5.33C17.94 4.71 16.5 4.26 15 4a.09.09 0 0 0-.07.03c-.18.33-.39.76-.53 1.09a16.09 16.09 0 0 0-4.8 0c-.14-.34-.35-.76-.54-1.09a.07.07 0 0 0-.07-.03c-1.5.26-2.93.71-4.27 1.33a.06.06 0 0 0-.03.03C2.31 9.39 1.84 13.34 2.07 17.24c0 .03.02.05.04.06a16.18 16.18 0 0 0 4.85 2.43.08.08 0 0 0 .07-.03c.37-.51.7-1.05.99-1.62a.08.08 0 0 0-.04-.11c-.53-.2-1.03-.45-1.51-.73a.08.08 0 0 1-.01-.13c.1-.08.21-.16.3-.24a.08.08 0 0 1 .08-.01c3.21 1.46 6.69 1.46 9.86 0a.08.08 0 0 1 .08.01c.1.08.2.16.3.24a.08.08 0 0 1-.01.13c-.48.28-.98.53-1.51.73a.08.08 0 0 0-.04.11c.3.57.62 1.11 1 1.62a.08.08 0 0 0 .07.03 16.13 16.13 0 0 0 4.86-2.43.07.07 0 0 0 .04-.06c.27-4.5-.45-8.42-2.83-11.88a.06.06 0 0 0-.03-.03zM8.52 14.91c-.95 0-1.74-.87-1.74-1.94s.77-1.94 1.74-1.94c.97 0 1.76.88 1.74 1.94 0 1.07-.78 1.94-1.74 1.94zm6.42 0c-.95 0-1.74-.87-1.74-1.94s.77-1.94 1.74-1.94c.98 0 1.76.88 1.74 1.94 0 1.07-.77 1.94-1.74 1.94z" />
      </svg>
    );
  }
  if (name === 'x-brand') {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="currentColor"
        stroke="none"
        aria-hidden
        focusable="false"
        {...rest}
      >
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
    );
  }
  if (name === 'spinner') {
    const className = `icon-spin ${rest.className ?? ''}`.trim();
    return (
      <Loader2
        size={size}
        strokeWidth={strokeWidth}
        aria-hidden
        focusable={false}
        {...rest}
        className={className}
      />
    );
  }

  const Component = ICON_MAP[name];
  if (!Component) return null;
  return (
    <Component
      size={size}
      strokeWidth={strokeWidth}
      aria-hidden
      focusable={false}
      {...rest}
    />
  );
}
