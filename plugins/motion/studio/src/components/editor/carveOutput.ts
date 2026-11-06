import {
  HF_AUDIO_FX_ATTR,
  serializeAudioFxChain,
  type HfAudioFxChain,
} from "@hyperframes/core/audio-fx";
import { type HfAutomation } from "@hyperframes/core/audio-automation";
import { isCarveVoiceElement } from "./useFxCarveGrouping.js";
import { automationAttrValue, HF_AUDIO_AUTOMATION_ATTR } from "./propertyPanelAutomation";
import type { CarveClip } from "./useFxCarveNodes.js";
import { readClipClock } from "./clipAudioClock.js";

/** Lanes belonging to nodes the carve generated, which a re-run replaces. */
export function withoutCarveLanes(automation: HfAutomation, chain: HfAudioFxChain): HfAutomation {
  const prefixes = chain.nodes.filter((n) => n.fromCarve && n.id).map((n) => `fx.${n.id}.`);
  if (prefixes.length === 0) return automation;
  return {
    version: automation.version,
    lanes: automation.lanes.filter((lane) => !prefixes.some((p) => lane.target.startsWith(p))),
  };
}

/** Every named voice still present with a src; a deleted source is skipped, not fatal. */
export function resolveCarveVoices(doc: Document, sources: readonly string[]): CarveClip[] {
  const voices: CarveClip[] = [];
  for (const id of sources) {
    const el = doc.getElementById(id);
    // By tag name: iframe-realm elements fail `instanceof HTMLAudioElement`.
    if (!isCarveVoiceElement(el)) continue;
    const src = el.getAttribute("src");
    if (!src) continue;
    const clock = readClipClock((name) => el.getAttribute(name));
    voices.push({ src, start: el.getAttribute("data-start"), clock });
  }
  return voices;
}

/** Remove the filters and lanes a carve generated once it no longer names a voice. */
export async function dropCarveOutput(
  chain: HfAudioFxChain,
  automation: HfAutomation,
  onSetAttributeQuiet: (attr: string, value: string | null) => void | Promise<void>,
): Promise<void> {
  const carriedOver = withoutCarveLanes(automation, chain);
  if (carriedOver.lanes.length !== automation.lanes.length) {
    await onSetAttributeQuiet(HF_AUDIO_AUTOMATION_ATTR, automationAttrValue(carriedOver) || null);
  }
  const kept = chain.nodes.filter((n) => !n.fromCarve);
  if (kept.length !== chain.nodes.length) {
    await onSetAttributeQuiet(
      HF_AUDIO_FX_ATTR,
      kept.length ? serializeAudioFxChain({ version: 1, nodes: kept }) : null,
    );
  }
}
