import type { AppConfig, PetAtlasLayout, PetAtlasRowDef, PetCustom, PetConfig } from '../../types';
import {
  codexPetSpritesheetUrl,
  fetchCodexPets,
} from '../../providers/registry';
import { prepareCodexAtlas } from './codexAtlas';

// Built-in pet catalog. Historically this listed a handful of emoji-only
// pets (Mochi, Pixel, Foxy…), but those felt boring next to the rich
// hatch-pet sprite atlases bundled under `assets/community-pets/`. The
// "Built-in" tab now sources its pets from those bundled spritesheets at
// runtime via `/api/codex-pets` (filtered by `bundled: true`), and the
// emoji-based catalog has been retired.
//
// We keep the type and an empty array for backwards compatibility with
// rail / composer code paths and saved configs whose `petId` still
// points at a legacy emoji id — those configs fall back to the user's
// custom slot in `resolveActivePet` so the overlay never renders blank.
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

export const BUILT_IN_PETS: BuiltInPet[] = [];

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
  // Bundled "Built-in" pets adopt into the custom slot (the spritesheet
  // and atlas layout are copied there by `adoptCodexPet`), so the
  // custom branch is the rendering path for both user-authored pets
  // and bundled adoptions.
  if (pet.petId === CUSTOM_PET_ID) {
    return resolveCustomPet(pet.custom);
  }
  const found = BUILT_IN_PETS.find((p) => p.id === pet.petId);
  if (found) {
    return {
      id: found.id,
      name: found.name,
      glyph: found.glyph,
      accent: found.accent,
      greeting: found.greeting,
      animation: found.animation,
    };
  }
  // Legacy fallback — older configs may still carry an emoji built-in
  // id (e.g. `mochi`) from before the catalog migrated to bundled
  // spritesheets. Render the user's custom slot instead of crashing or
  // blanking the overlay; the user can re-adopt from Settings to pick
  // a bundled pet.
  return resolveCustomPet(pet.custom);
}

function resolveCustomPet(c: PetCustom): ResolvedPet {
  return {
    id: CUSTOM_PET_ID,
    name: c.name?.trim() || 'Buddy',
    glyph: c.glyph?.trim() || '🦄',
    accent: c.accent?.trim() || '#c96442',
    greeting: c.greeting?.trim() || 'Hi! I am here whenever you need me.',
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

// Preferred Codex atlas row id for each interaction state. Hover and
// drag each map to a dedicated action row so the pet visibly reacts to
// the user — hover plays a wave, drag swaps to a directional run (or
// hop when the gesture is vertical). Autonomous ambient variety below
// only fires when the pet is otherwise at rest so rest ↔ interaction
// reads as two cleanly separated behaviours.
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

// Ambient row pool — the overlay dips into these between `idle` cycles
// so a parked pet doesn't look frozen. Ordered by "quietness": waving
// and review feel calm enough to interject without startling the user,
// jumping / running* are more energetic and round out the variety when
// the atlas ships them. `idle`, `waiting`, and `failed` are excluded
// intentionally: idle is the resting baseline, waiting is reserved for
// the long-idle cue, and failed reads as a negative micro-narrative.
const AMBIENT_ROW_POOL: readonly string[] = [
  'waving',
  'review',
  'jumping',
  'running',
  'running-right',
  'running-left',
];

// Pick a random ambient row from the atlas, preferring ids in
// AMBIENT_ROW_POOL and avoiding `avoidId` when possible so the overlay
// doesn't replay the same micro-animation twice in a row. Returns null
// when the atlas ships only `idle` / `waiting` rows so the caller can
// no-op cleanly.
export function pickAmbientRow(
  layout: PetAtlasLayout | undefined,
  avoidId?: string,
): PetAtlasRowDef | null {
  if (!layout || layout.rowsDef.length === 0) return null;
  const pool = layout.rowsDef.filter((r) => AMBIENT_ROW_POOL.includes(r.id));
  if (pool.length === 0) return null;
  const candidates =
    pool.length > 1 && avoidId ? pool.filter((r) => r.id !== avoidId) : pool;
  const choices = candidates.length > 0 ? candidates : pool;
  return choices[Math.floor(Math.random() * choices.length)] ?? null;
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

// One-shot self-healing migration for pets adopted before the overlay
// learned how to switch atlas rows.
//
// Older versions of `adoptCodexPet` cropped the Codex spritesheet down
// to the idle row and stored just that horizontal strip on
// `PetCustom.imageUrl` (strip mode, single row). The overlay is now an
// atlas-aware renderer that can swap rows per interaction (hover ↔
// waving, drag ↔ running-*, idle ↔ ambient rotation), but it needs the
// full 8×9 grid in `PetCustom.atlas` + `imageUrl` to do so.
//
// When the persisted config points at a custom pet that has an
// imageUrl but no atlas, we look up the Codex pet registry, match by
// the name we stamped on adoption, and silently re-download the
// full spritesheet. The user sees nothing except their pet going from
// "one-state statue" to fully animated on next launch. The migration
// bails on any failure — this is best-effort and the strip sprite
// stays as-is if, say, the daemon is offline.
export async function migrateCustomPetAtlas(
  cfg: AppConfig,
): Promise<PetCustom | null> {
  const pet = cfg.pet;
  if (!pet || !pet.adopted || pet.petId !== CUSTOM_PET_ID) return null;
  const custom = pet.custom;
  if (!custom?.imageUrl || custom.atlas) return null;

  const name = custom.name?.trim();
  if (!name) return null;

  let registry;
  try {
    registry = await fetchCodexPets();
  } catch {
    return null;
  }
  if (!registry?.pets?.length) return null;

  const needle = name.toLowerCase();
  const match = registry.pets.find(
    (p) =>
      (p.displayName?.trim().toLowerCase() ?? '') === needle ||
      p.id.trim().toLowerCase() === needle,
  );
  if (!match) return null;

  try {
    const resp = await fetch(codexPetSpritesheetUrl(match));
    if (!resp.ok) return null;
    const blob = await resp.blob();
    const dataUrl = await blobToDataUrl(blob);
    const prepared = await prepareCodexAtlas(dataUrl);
    return {
      ...custom,
      imageUrl: prepared.dataUrl,
      frames: 1,
      fps: prepared.layout.rowsDef[0]?.fps ?? custom.fps ?? 6,
      atlas: prepared.layout,
    };
  } catch {
    return null;
  }
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('Read failed'));
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error('Could not read sprite blob.'));
        return;
      }
      resolve(result);
    };
    reader.readAsDataURL(blob);
  });
}
