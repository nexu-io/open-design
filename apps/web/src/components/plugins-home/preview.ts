// Preview-kind classifier for the plugins-home gallery.
//
// Each card variant in the home gallery wants different content
// in its hero region:
//   - `media`  → poster image (image-template plugins) or video
//                poster with optional hover-play (video-template)
//   - `html`   → sandboxed iframe rendering the plugin's example
//                output / preview entry (examples + scenarios that
//                ship a `od.preview.entry` or `exampleOutputs[]`)
//   - `design` → design-system showcase thumbnail, falling back to
//                a stylized brand patch when no showcase ref exists
//   - `text`   → fallback layout (other scenario plugins, atoms
//                that slip through the visiblePlugins filter, …)
//
// Keeping the classifier in its own pure module lets the renderer
// branch on a single discriminator and lets the unit tests assert
// classification without touching React.

import type { InstalledPluginRecord } from '@open-design/contracts';

export type PluginPreviewKind = 'media' | 'html' | 'design' | 'text';

export interface MediaPreviewSpec {
  kind: 'media';
  /**
   * Asset family the card / detail surface should render:
   *   - 'image' → poster only (image-template plugins)
   *   - 'video' → poster + optional autoplay clip on hover
   *   - 'audio' → optional cover poster + native audio player
   */
  mediaType: 'image' | 'video' | 'audio';
  poster: string | null;
  videoUrl: string | null;
  audioUrl: string | null;
  /** True when the plugin only ships a still image, no video stream. */
  imageOnly: boolean;
  /**
   * For baked hover-pan clips: the leading `[0, loopHoldMs]` span is the page's
   * in-place animation (no scroll), which the gallery loops while idle; hover
   * plays on past it (the pan). Null for plain video-template plugins, which
   * just loop the whole clip.
   */
  loopHoldMs?: number | null;
}

export interface HtmlPreviewSpec {
  kind: 'html';
  /** URL the iframe should load — daemon-served sandboxed HTML. */
  src: string;
  /** Display label used in the chrome strip of the preview frame. */
  label: string;
  /**
   * Discriminates which daemon endpoint the preview comes from so
   * the detail modal can rebuild the same fetch via fetchPlugin*Html
   * helpers without re-parsing the URL.
   */
  source: 'preview' | 'example';
  /** Example stem when `source === 'example'`, otherwise undefined. */
  exampleStem?: string;
}

export interface DesignPreviewSpec {
  kind: 'design';
  brand: string;
  designSystemId: string | null;
  swatches: string[];
}

export interface TextPreviewSpec {
  kind: 'text';
}

export type PluginPreviewSpec =
  | MediaPreviewSpec
  | HtmlPreviewSpec
  | DesignPreviewSpec
  | TextPreviewSpec;

interface PreviewBlock {
  type?: unknown;
  poster?: unknown;
  video?: unknown;
  gif?: unknown;
  entry?: unknown;
  audio?: unknown;
  holdMs?: unknown;
}

interface ExampleOutputEntry {
  path?: unknown;
  title?: unknown;
}

interface ContextRef {
  ref?: unknown;
}

function readPreview(record: InstalledPluginRecord): PreviewBlock | null {
  const od = record.manifest?.od as { preview?: unknown } | undefined;
  if (!od || typeof od.preview !== 'object' || od.preview === null) return null;
  return od.preview as PreviewBlock;
}

// Pre-baked hover-pan clip attached by the daemon (scripts/bake-plugin-previews.mjs),
// kept separate from `od.preview` so only gallery tiles use it.
function readBakedPreview(
  record: InstalledPluginRecord,
): { poster: string; video: string; holdMs: number | null } | null {
  const od = record.manifest?.od as { bakedPreview?: unknown } | undefined;
  const b = od?.bakedPreview;
  if (!b || typeof b !== 'object') return null;
  const { poster, video, holdMs } = b as Record<string, unknown>;
  if (typeof poster !== 'string' || typeof video !== 'string') return null;
  return { poster, video, holdMs: typeof holdMs === 'number' ? holdMs : null };
}

function readExamples(record: InstalledPluginRecord): ExampleOutputEntry[] {
  const od = record.manifest?.od as
    | { useCase?: { exampleOutputs?: unknown } }
    | undefined;
  const list = od?.useCase?.exampleOutputs;
  if (!Array.isArray(list)) return [];
  return list as ExampleOutputEntry[];
}

function exampleStem(entry: ExampleOutputEntry): string | null {
  if (typeof entry.path !== 'string') return null;
  const segments = entry.path.split(/[\\/]/).filter(Boolean);
  const base = segments[segments.length - 1] ?? '';
  const stem = base.replace(/\.[^.]+$/, '');
  return stem || null;
}

function isDesignSystemPlugin(record: InstalledPluginRecord): boolean {
  const od = record.manifest?.od as { mode?: unknown } | undefined;
  if (typeof od?.mode === 'string' && od.mode.toLowerCase() === 'design-system') {
    return true;
  }
  const tags = record.manifest?.tags ?? [];
  return tags.some((t) => t.toLowerCase() === 'design-system');
}

function designSystemRef(record: InstalledPluginRecord): string | null {
  const od = record.manifest?.od as
    | { context?: { designSystem?: ContextRef } }
    | undefined;
  const ref = od?.context?.designSystem?.ref;
  return typeof ref === 'string' && ref.length > 0 ? ref : null;
}

// Synthetic colour swatches derived from the plugin id so cards stay
// visually distinct without dragging in the real DESIGN.md content.
// Hue is pinned per-plugin (stable across renders) but lightness /
// saturation rotate so each design-system tile reads as a brand
// patch rather than a random gradient.
function deriveSwatches(record: InstalledPluginRecord): string[] {
  const seed = hashString(record.id);
  const hue = seed % 360;
  return [
    `hsl(${hue}, 78%, 56%)`,
    `hsl(${(hue + 32) % 360}, 64%, 48%)`,
    `hsl(${(hue + 200) % 360}, 36%, 22%)`,
  ];
}

function hashString(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

function brandLabel(record: InstalledPluginRecord): string {
  const title = record.title ?? record.manifest?.title ?? record.id;
  // Strip the tooling prefix so design-system plugin titles ("Airbnb",
  // "Cursor", "Apple") read as bare brand names on the tile. Falls back
  // to the raw title when there's no decoration.
  return title.replace(/^design[\s-]?system[:\s-]*/i, '').trim() || title;
}

export function inferPluginPreview(
  record: InstalledPluginRecord,
  opts?: { preferBaked?: boolean },
): PluginPreviewSpec {
  // Gallery tiles opt in to a pre-baked hover-pan clip (cheap thumbnail) when
  // the daemon has attached one. Everything else — crucially the detail modal —
  // falls through to the real `od.preview`, so opening a plugin still shows the
  // live, interactive page rather than the baked video.
  if (opts?.preferBaked) {
    const baked = readBakedPreview(record);
    if (baked) {
      return {
        kind: 'media',
        mediaType: 'video',
        poster: baked.poster,
        videoUrl: baked.video,
        audioUrl: null,
        imageOnly: false,
        loopHoldMs: baked.holdMs,
      };
    }
  }
  const preview = readPreview(record);
  const examples = readExamples(record);

  if (preview) {
    const t = typeof preview.type === 'string' ? preview.type.toLowerCase() : '';
    const poster = typeof preview.poster === 'string' ? preview.poster : null;
    const video = typeof preview.video === 'string' ? preview.video : null;
    const gif = typeof preview.gif === 'string' ? preview.gif : null;
    const audio = typeof preview.audio === 'string' ? preview.audio : null;
    const entry = typeof preview.entry === 'string' ? preview.entry : null;

    if (t === 'video' || video) {
      const holdMs = typeof preview.holdMs === 'number' ? preview.holdMs : null;
      return {
        kind: 'media',
        mediaType: 'video',
        poster: poster ?? gif ?? null,
        videoUrl: video,
        audioUrl: null,
        imageOnly: !video,
        loopHoldMs: holdMs,
      };
    }
    if (t === 'audio' || audio) {
      return {
        kind: 'media',
        mediaType: 'audio',
        poster: poster ?? gif ?? null,
        videoUrl: null,
        audioUrl: audio,
        imageOnly: false,
      };
    }
    if (t === 'image' || poster || gif) {
      return {
        kind: 'media',
        mediaType: 'image',
        poster: poster ?? gif ?? null,
        videoUrl: null,
        audioUrl: null,
        imageOnly: true,
      };
    }
    if (t === 'html' && entry) {
      return {
        kind: 'html',
        src: `/api/plugins/${encodeURIComponent(record.id)}/preview`,
        label: entry.replace(/^\.\//, '').split(/[\\/]/).pop() ?? entry,
        source: 'preview',
      };
    }
  }

  if (examples.length > 0) {
    const stem = exampleStem(examples[0]!);
    if (stem) {
      const title =
        typeof examples[0]!.title === 'string' ? (examples[0]!.title as string) : stem;
      return {
        kind: 'html',
        src: `/api/plugins/${encodeURIComponent(record.id)}/example/${encodeURIComponent(stem)}`,
        label: title,
        source: 'example',
        exampleStem: stem,
      };
    }
  }

  if (isDesignSystemPlugin(record)) {
    return {
      kind: 'design',
      brand: brandLabel(record),
      designSystemId: designSystemRef(record),
      swatches: deriveSwatches(record),
    };
  }

  return { kind: 'text' };
}
