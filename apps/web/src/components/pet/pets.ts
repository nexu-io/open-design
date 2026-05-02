import type { PetAtlasLayout, PetAtlasRowDef, PetCustom, PetConfig } from '../../types';

// Built-in pet catalog. Each pet is a simple emoji glyph plus an accent
// color that drives the overlay halo, the "speech bubble" border, and
// the settings card highlight. We deliberately keep these to native
// emoji (no spritesheet binaries) so the feature ships without any
// extra asset pipeline and respects the project ban on long binaries.
export interface BuiltInPet {
  id: string;
  name: string;
  glyph: string;
  accent: string;
  greeting: string;
  // Free-form one-liner shown under the pet name in the catalog card
  // — flavor text, not a tooltip. Keep it short.
  flavor: string;
  // CSS animation name applied to the sprite when the overlay is awake.
  // All four are defined in `index.css` under `@keyframes pet-…`.
  animation: 'bounce' | 'sway' | 'float' | 'wiggle';
}

export const BUILT_IN_PETS: BuiltInPet[] = [
  {
    id: 'mochi',
    name: 'Mochi',
    glyph: '🐱',
    accent: '#c96442',
    greeting: 'Mrrrp! Ready to design something nice?',
    flavor: 'A cozy cat that purrs while you ship.',
    animation: 'sway',
  },
  {
    id: 'pixel',
    name: 'Pixel',
    glyph: '🐶',
    accent: '#2348b8',
    greeting: 'Woof! What are we building today?',
    flavor: 'An eager pup that fetches your prototypes.',
    animation: 'bounce',
  },
  {
    id: 'foxy',
    name: 'Foxy',
    glyph: '🦊',
    accent: '#d97a26',
    greeting: 'Sniffing around for clever ideas…',
    flavor: 'A clever fox that loves a sharp brief.',
    animation: 'wiggle',
  },
  {
    id: 'tux',
    name: 'Tux',
    glyph: '🐧',
    accent: '#1f7a3a',
    greeting: 'Brrr — this draft is looking crisp!',
    flavor: 'A penguin in a perpetual production-ready mood.',
    animation: 'sway',
  },
  {
    id: 'bolt',
    name: 'Bolt',
    glyph: '🤖',
    accent: '#6c3aa6',
    greeting: 'Beep boop — let us iterate.',
    flavor: 'A mini robot that loves loops and tweaks.',
    animation: 'float',
  },
  {
    id: 'boo',
    name: 'Boo',
    glyph: '👻',
    accent: '#74716b',
    greeting: 'Boo! Just hovering nearby.',
    flavor: 'A friendly ghost — silent but supportive.',
    animation: 'float',
  },
  {
    id: 'sprout',
    name: 'Sprout',
    glyph: '🌱',
    accent: '#1f7a3a',
    greeting: 'Growing this idea with you.',
    flavor: 'A tiny sprout for early-stage ideas.',
    animation: 'sway',
  },
  {
    id: 'comet',
    name: 'Comet',
    glyph: '☄️',
    accent: '#2348b8',
    greeting: 'Streaking across your viewport.',
    flavor: 'A comet for fast-moving sprints.',
    animation: 'float',
  },
];

export const CUSTOM_PET_ID = 'custom';

export interface ResolvedPet {
  id: string;
  name: string;
  glyph: string;
  accent: string;
  greeting: string;
  animation: BuiltInPet['animation'];
  // Optional uploaded image data URL. Present only for custom pets that
  // have an image; built-ins fall back to their emoji glyph.
  imageUrl?: string;
  // Legacy single-row spritesheet config (used when `atlas` is missing).
  // Number of horizontal frames in the imageUrl (1 = static).
  frames?: number;
  // Frames-per-second for the spritesheet step animation.
  fps?: number;
  // Optional sprite atlas layout. When present, `imageUrl` is the full
  // grid and `PetSpriteFace` picks one row to play based on the
  // overlay's interaction state.
  atlas?: PetAtlasLayout;
}

// Resolve the pet definition currently in use. Returns `null` only when
// the user has not adopted yet — call sites use that to decide whether
// to render the floating overlay at all.
export function resolveActivePet(pet: PetConfig | undefined): ResolvedPet | null {
  if (!pet?.adopted) return null;
  if (pet.petId === CUSTOM_PET_ID) {
    const c = pet.custom;
    return {
      id: CUSTOM_PET_ID,
      name: c.name?.trim() || 'Buddy',
      glyph: c.glyph?.trim() || '🦄',
      accent: c.accent?.trim() || '#c96442',
      greeting:
        c.greeting?.trim() || 'Hi! I am here whenever you need me.',
      // Custom pets get the gentle float animation by default. We could
      // expose this in the editor later; today's UX keeps the picker
      // focused on glyph + name + color.
      animation: 'float',
      imageUrl: c.imageUrl,
      frames: clampFrames(c.frames),
      fps: clampFps(c.fps),
      atlas: sanitizeAtlas(c.atlas),
    };
  }
  const found = BUILT_IN_PETS.find((p) => p.id === pet.petId)
    ?? BUILT_IN_PETS[0]!;
  return {
    id: found.id,
    name: found.name,
    glyph: found.glyph,
    accent: found.accent,
    greeting: found.greeting,
    animation: found.animation,
  };
}

export const FRAMES_MIN = 1;
export const FRAMES_MAX = 24;
export const FPS_MIN = 1;
export const FPS_MAX = 30;

function clampFrames(value: number | undefined): number {
  if (!Number.isFinite(value as number)) return 1;
  return Math.max(FRAMES_MIN, Math.min(FRAMES_MAX, Math.round(value as number)));
}

function clampFps(value: number | undefined): number {
  if (!Number.isFinite(value as number)) return 6;
  return Math.max(FPS_MIN, Math.min(FPS_MAX, Math.round(value as number)));
}

// Atlas hardening — strips out malformed entries so the renderer never
// has to defensively check for NaN cell sizes / negative indices. We
// keep rows we can validate even if the layout omits a few; missing
// rows just fall back to `idle` at lookup time.
function sanitizeAtlas(input: PetAtlasLayout | undefined): PetAtlasLayout | undefined {
  if (!input) return undefined;
  const cols = Math.max(1, Math.floor(input.cols));
  const rows = Math.max(1, Math.floor(input.rows));
  if (!Number.isFinite(cols) || !Number.isFinite(rows)) return undefined;
  const seen = new Set<number>();
  const rowsDef: PetAtlasRowDef[] = [];
  for (const row of input.rowsDef ?? []) {
    if (!row || typeof row.id !== 'string' || !row.id.trim()) continue;
    const index = Math.floor(row.index);
    if (!Number.isFinite(index) || index < 0 || index >= rows) continue;
    if (seen.has(index)) continue;
    seen.add(index);
    rowsDef.push({
      index,
      id: row.id.trim(),
      frames: Math.max(1, Math.min(cols, Math.floor(row.frames) || 1)),
      fps: Math.max(FPS_MIN, Math.min(FPS_MAX, Math.floor(row.fps) || 6)),
    });
  }
  if (rowsDef.length === 0) return undefined;
  rowsDef.sort((a, b) => a.index - b.index);
  return { cols, rows, rowsDef };
}

// Logical interaction states that drive the overlay's animation
// switching. Kept narrow on purpose so the mapping below stays a
// declarative table rather than a tangle of conditionals.
export type PetInteraction =
  | 'idle'
  | 'hover'
  | 'drag-right'
  | 'drag-left'
  | 'drag-up'
  | 'drag-down'
  | 'waiting';

// Preferred Codex atlas row id for each interaction state. When the
// pet's atlas does not include the preferred row, `pickAtlasRow` walks
// the fallback chain starting from `idle` so something always plays.
const INTERACTION_ROW_ID: Record<PetInteraction, string> = {
  idle: 'idle',
  hover: 'waving',
  'drag-right': 'running-right',
  'drag-left': 'running-left',
  'drag-up': 'jumping',
  'drag-down': 'waving',
  waiting: 'waiting',
};

const ROW_FALLBACK_ORDER: readonly string[] = [
  'idle',
  'waiting',
  'waving',
  'running',
  'running-right',
];

export function preferredRowId(state: PetInteraction): string {
  return INTERACTION_ROW_ID[state];
}

// Resolve the atlas row to play given the desired animation id. We try
// the requested id first, then walk a sensible fallback chain, then
// return whichever row the atlas does have so playback never blanks
// out for a partially-populated pet.
export function pickAtlasRow(
  layout: PetAtlasLayout | undefined,
  preferred: string,
): PetAtlasRowDef | undefined {
  if (!layout || layout.rowsDef.length === 0) return undefined;
  const direct = layout.rowsDef.find((r) => r.id === preferred);
  if (direct) return direct;
  for (const id of ROW_FALLBACK_ORDER) {
    const fallback = layout.rowsDef.find((r) => r.id === id);
    if (fallback) return fallback;
  }
  return layout.rowsDef[0];
}

// A short pool of "ambient" prompts that the overlay rotates through on
// hover so the speech bubble feels alive after the initial greeting.
// Keep these brand-neutral and product-relevant to Open Design.
export function ambientLines(name: string): string[] {
  return [
    `${name}: nudge me when you want a fresh idea.`,
    `${name}: I will keep you company while it builds.`,
    `${name}: take a breath — the prototype will wait.`,
    `${name}: small tweaks compound. Keep going!`,
  ];
}

export function defaultCustomPet(): PetCustom {
  return {
    name: 'Buddy',
    glyph: '🦄',
    accent: '#c96442',
    greeting: 'Hi! I am here whenever you need me.',
  };
}
