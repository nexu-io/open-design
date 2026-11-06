import {
  HF_AUDIO_FX_ATTR,
  parseAudioFxChain,
  serializeAudioFxChain,
  type HfAudioFxChain,
} from "@hyperframes/core/audio-fx";
import {
  clipsOverlap,
  DEFAULT_CARVE,
  HF_AUDIO_CARVE_ATTR,
  normalizeCarveSettings,
  type HfCarveSettings,
} from "@hyperframes/core/audio-carve";
import { resolveCarveSourceIds } from "@hyperframes/core/audio-groups";
import { parseAutomation, type HfAutomation } from "@hyperframes/core/audio-automation";
import {
  carveBedRoles,
  carverAgainst,
  collectCarveCandidates,
  CARVE_ABORTED,
  isPromiseLike,
  resolveNextCarveSettings,
} from "../../components/editor/useFxCarveGrouping";
import {
  dropCarveOutput,
  resolveCarveVoices,
  withoutCarveLanes,
} from "../../components/editor/carveOutput";
import { carveLanes, measureCarve, mintCarveNodes } from "../../components/editor/useFxCarveNodes";
import { readClipClock } from "../../components/editor/clipAudioClock";
import {
  automationAttrValue,
  HF_AUDIO_AUTOMATION_ATTR,
} from "../../components/editor/propertyPanelAutomation";
import { spanOf } from "../../components/editor/propertyPanelAudioFxGroupUtils";

export type WriteBedAttribute = (attr: string, value: string | null) => Promise<void>;
export type GroupClips = (clipIds: readonly string[], groupId: string) => Promise<void>;

export function readBedCarve(bed: Element): HfCarveSettings | null {
  const raw = bed.getAttribute(HF_AUDIO_CARVE_ATTR);
  if (!raw) return null;
  try {
    return normalizeCarveSettings(JSON.parse(raw));
  } catch {
    return null;
  }
}

function readChain(bed: Element): HfAudioFxChain {
  const raw = bed.getAttribute(HF_AUDIO_FX_ATTR);
  try {
    return raw ? parseAudioFxChain(raw) : { version: 1, nodes: [] };
  } catch {
    return { version: 1, nodes: [] };
  }
}

function readAutomation(bed: Element): HfAutomation {
  const raw = bed.getAttribute(HF_AUDIO_AUTOMATION_ATTR);
  try {
    return raw ? parseAutomation(raw) : { version: 1, lanes: [] };
  } catch {
    return { version: 1, lanes: [] };
  }
}

export function isDuckableBed(bed: Element | null): bed is Element {
  if (bed === null || !carveBedRoles(bed.id, bed).couldBeBed) return false;
  return carverAgainst(bed.ownerDocument, bed.id) === null;
}

/** Every overlapping clip with speech, including a video's own sound; never the bed itself. */
export function duckVoiceSources(doc: Document, bed: Element): string[] {
  const bedSpan = spanOf(bed.getAttribute("data-start"), bed.getAttribute("data-duration"));
  const others = Array.from(doc.querySelectorAll("audio[id], video[id]")).filter(
    (el) => el.id !== bed.id,
  );
  const overlaps = (el: Element) =>
    clipsOverlap(bedSpan, spanOf(el.getAttribute("data-start"), el.getAttribute("data-duration")));
  return collectCarveCandidates(doc, others, overlaps, bed.id)
    .filter((candidate) => candidate.kind === "voice" || candidate.kind === "unknown")
    .map((candidate) => candidate.id);
}

export function offersDuck(doc: Document | null, bed: Element | null): boolean {
  if (!doc || !isDuckableBed(bed)) return false;
  return readBedCarve(bed)?.enabled === true || duckVoiceSources(doc, bed).length > 0;
}

async function writeMeasuredCarve(
  doc: Document,
  bed: Element,
  settings: HfCarveSettings,
  write: WriteBedAttribute,
): Promise<void> {
  const expanded = resolveCarveSourceIds(doc, settings.sources).filter((id) => id !== bed.id);
  const voices = resolveCarveVoices(doc, expanded);
  if (voices.length === 0) return;
  const measured = await measureCarve(doc, voices, settings.strength, {
    src: bed.getAttribute("src"),
    start: bed.getAttribute("data-start"),
    clock: readClipClock((name) => bed.getAttribute(name)),
  });
  if (!measured) return;
  const chain = readChain(bed);
  const automation = readAutomation(bed);
  const { next, carvedNodes, duckNode } = mintCarveNodes(chain, measured.carved, measured.duck);
  await write(HF_AUDIO_FX_ATTR, serializeAudioFxChain(next));
  const lanes = carveLanes(carvedNodes, duckNode, measured.duck, measured.voiceMix, measured.bands);
  const carriedOver = withoutCarveLanes(automation, chain);
  const nextAutomation = { version: 1, lanes: [...carriedOver.lanes, ...lanes] };
  await write(HF_AUDIO_AUTOMATION_ATTR, automationAttrValue(nextAutomation) || null);
}

export type DuckOutcome = "ducked" | "no-voice" | "aborted" | "off";

/**
 * Switch the carve on a music bed. On: carve against every overlapping voice at
 * core's default strength (several voices are grouped first, as the carve lint
 * requires). Off: `enabled:false`, which drops the generated filters and lanes.
 */
export async function setDuckUnderVoice(
  doc: Document,
  bed: Element,
  on: boolean,
  write: WriteBedAttribute,
  groupClips?: GroupClips,
): Promise<DuckOutcome> {
  const current = readBedCarve(bed);
  if (!on) {
    await dropCarveOutput(readChain(bed), readAutomation(bed), write);
    await write(
      HF_AUDIO_CARVE_ATTR,
      JSON.stringify({ ...(current ?? DEFAULT_CARVE), enabled: false }),
    );
    return "off";
  }
  const sources = duckVoiceSources(doc, bed);
  if (sources.length === 0) return "no-voice";
  const resolved = resolveNextCarveSettings({ ...DEFAULT_CARVE, sources }, doc, groupClips);
  const settings = isPromiseLike(resolved) ? await resolved : resolved;
  if (settings === CARVE_ABORTED || settings === null) return "aborted";
  await write(HF_AUDIO_CARVE_ATTR, JSON.stringify(settings));
  await writeMeasuredCarve(doc, bed, settings, write);
  return "ducked";
}
