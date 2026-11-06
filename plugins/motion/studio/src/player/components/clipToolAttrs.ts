/**
 * The attribute each clip-menu tool writes, and what a clip's attributes say is applied.
 * Pure over strings so the menu, the badges and an agent's hand edits all agree.
 */

import {
  getAudioFxDef,
  parseAudioFxChain,
  serializeAudioFxChain,
  type HfAudioFxChain,
  type HfAudioFxNode,
} from "@hyperframes/core/audio-fx";
import { activeAudioFxPresetIds, getAudioFxPreset } from "@hyperframes/core/audio-fx-presets";
import { normalizeHfColorGrading } from "@hyperframes/core/color-grading";
import { parseRateLane } from "@hyperframes/core/speed-ramp";
import { applyPresetToChain } from "../../components/editor/useApplyAudioFxPreset";

export interface ClipToolChoice {
  id: string;
  label: string;
}

export const VOICE_CHOICES: readonly ClipToolChoice[] = [
  { id: "voice-clean", label: "Clean" },
  { id: "voice-broadcast", label: "Broadcast" },
  { id: "voice-warm", label: "Warm" },
];

export const CHARACTER_CHOICES: readonly ClipToolChoice[] = [
  { id: "telephone", label: "Telephone" },
  { id: "radio-am", label: "AM Radio" },
  { id: "megaphone", label: "Megaphone" },
];

export const LOOK_CHOICES: readonly ClipToolChoice[] = [
  { id: "warm-daylight", label: "Warm daylight" },
  { id: "clean-studio", label: "Clean studio" },
  { id: "vintage-wash", label: "Vintage wash" },
  { id: "mono-clean", label: "Mono" },
  { id: "deep-contrast", label: "Deep contrast" },
  { id: "home-movie-8mm", label: "Home movie" },
];

const VOICE_MENU_IDS = new Set([...VOICE_CHOICES, ...CHARACTER_CHOICES].map((c) => c.id));

const EMPTY_CHAIN: HfAudioFxChain = { version: 1, nodes: [] };

function parseChainOrEmpty(raw: string | null | undefined): HfAudioFxChain {
  if (!raw) return EMPTY_CHAIN;
  try {
    return parseAudioFxChain(raw);
  } catch {
    return EMPTY_CHAIN;
  }
}

function labelFor(choices: readonly ClipToolChoice[], id: string | null): string | null {
  return choices.find((choice) => choice.id === id)?.label ?? null;
}

export function activeVoicePreset(rawChain: string | null | undefined): string | null {
  const ids = activeAudioFxPresetIds(parseChainOrEmpty(rawChain));
  return ids.find((id) => VOICE_MENU_IDS.has(id)) ?? null;
}

function voicePresetLabel(id: string | null): string | null {
  return labelFor(VOICE_CHOICES, id) ?? labelFor(CHARACTER_CHOICES, id);
}

/**
 * The `data-fx-chain` after choosing a voice preset, or `null` to drop the attribute.
 * Single choice: the other menu presets' nodes go; carve, leveller and hand-added nodes stay.
 */
export function chainWithVoicePreset(
  rawChain: string | null | undefined,
  presetId: string | null,
): string | null {
  const chain = parseChainOrEmpty(rawChain);
  const others = chain.nodes.filter(
    (node) =>
      !node.fromPreset || !VOICE_MENU_IDS.has(node.fromPreset) || node.fromPreset === presetId,
  );
  const kept: HfAudioFxChain = { ...chain, nodes: others };
  const next = presetId ? (applyPresetToChain(kept, presetId, undefined) ?? kept) : kept;
  return next.nodes.length > 0 ? serializeAudioFxChain(next) : null;
}

function parseJson(raw: string | null | undefined): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function activeLook(rawGrading: string | null | undefined): string | null {
  return normalizeHfColorGrading(parseJson(rawGrading))?.preset ?? null;
}

function lookLabel(id: string | null): string | null {
  return labelFor(LOOK_CHOICES, id);
}

export function lookAttrValue(presetId: string | null): string | null {
  return presetId ? JSON.stringify({ preset: presetId, intensity: 1 }) : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function isDucked(rawCarve: string | null | undefined): boolean {
  const carve = parseJson(rawCarve);
  return isRecord(carve) && carve["enabled"] !== false;
}

function hasRateRamp(rawAutomation: string | null | undefined): boolean {
  return parseRateLane(rawAutomation) !== null;
}

/** Premiere's speed cue on the clip name: ` [ramp]` under a rate lane, else ` [150%]` off 100%. */
export function clipSpeedSuffix(
  playbackRate: number | null | undefined,
  rawAutomation: string | null | undefined,
): string {
  if (hasRateRamp(rawAutomation)) return " [ramp]";
  const rate = playbackRate ?? 1;
  if (!Number.isFinite(rate) || Math.abs(rate - 1) < 0.005) return "";
  return ` [${Math.round(rate * 100)}%]`;
}

const ZERO_INSET = /^inset\(\s*0(px|%)?\s*\)$/i;

export function hasCrop(clipPath: string | null | undefined): boolean {
  const value = clipPath?.trim() ?? "";
  return value !== "" && value !== "none" && !ZERO_INSET.test(value);
}

/** What a clip's attributes say is applied; the element's own attributes, as read off its node. */
export interface ClipToolState {
  tag: string;
  hasSound: boolean;
  volume: number | null;
  muted: boolean;
  fxChain: string | null;
  automation: string | null;
  colorGrading: string | null;
  clipPath: string | null;
  carve: string | null;
}

export function clipVolumeBadge(state: ClipToolState): string | null {
  if (state.tag !== "audio" && !state.hasSound) return null;
  if (state.muted) return "Muted";
  const volume = state.volume ?? 1;
  if (Math.abs(volume - 1) < 0.005) return null;
  return `${Math.round(volume * 100)}%`;
}

function lookEffect(rawGrading: string | null): string | null {
  const grading = normalizeHfColorGrading(parseJson(rawGrading));
  if (!grading) return null;
  const label = lookLabel(grading.preset ?? null);
  return label ? `Look: ${label}` : "Look";
}

function presetEffect(presetId: string): string {
  const voice = voicePresetLabel(presetId);
  return voice ? `Voice: ${voice}` : (getAudioFxPreset(presetId)?.label ?? presetId);
}

function chainNodeEffect(node: HfAudioFxNode): string | null {
  if (node.enabled === false || node.fromCarve) return null;
  if (node.fromPreset) return presetEffect(node.fromPreset);
  if (node.fromEq) return "EQ";
  if (node.fromLeveller) return "Leveller";
  return node.label ?? getAudioFxDef(node.type)?.label ?? node.type;
}

/** Every effect on the clip, in the fx badge tooltip's order; empty means a grey badge. */
export function readClipEffects(state: ClipToolState): string[] {
  const effects: Array<string | null> = [
    lookEffect(state.colorGrading),
    ...parseChainOrEmpty(state.fxChain).nodes.map(chainNodeEffect),
    hasCrop(state.clipPath) ? "Crop" : null,
    isDucked(state.carve) ? "Ducked" : null,
  ];
  return [...new Set(effects.filter((effect): effect is string => effect !== null))];
}
