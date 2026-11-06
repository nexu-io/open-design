/** Plain-field clip facts from the player store; feeds the Ask-agent prompt and `studio_look`. */
import type { TimelineElement } from "../store/playerStore";
import { elementAutomationLanes } from "../components/automationLaneData";
import { byStart, formatClipLine, type ClipFact } from "@hyperframes/core/clip-facts";
export { byStart } from "@hyperframes/core/clip-facts";
export type { ClipFact } from "@hyperframes/core/clip-facts";

/** The store holds preview URLs; the agent edits project files, so drop the origin and preview prefix. */
function projectRelativeSrc(src: string): string {
  return src.replace(/^https?:\/\/[^/]+/, "").replace(/^\/api\/projects\/[^/]+\/preview\//, "");
}

export function describeClip(element: TimelineElement): ClipFact {
  return {
    id: element.domId ?? element.id,
    label: element.label ?? null,
    kind: element.kind ?? element.tag.toLowerCase(),
    start: element.start,
    duration: element.duration,
    end: element.start + element.duration,
    trackIndex: element.authoredTrack ?? element.track,
    src: element.src ? projectRelativeSrc(element.src) : null,
    sourceFile: element.sourceFile ?? null,
    volume: element.volume ?? null,
    lanes: elementAutomationLanes(element).map((lane) => ({
      target: lane.target,
      points: lane.points.map(({ t, v }) => ({ t, v })),
    })),
    playbackRate: element.playbackRate === 1 ? null : (element.playbackRate ?? null),
    audioGroup: element.audioGroup ?? null,
    role: element.timelineRole ?? null,
  };
}

export function describeClips(elements: readonly TimelineElement[]): ClipFact[] {
  return elements.map(describeClip).sort(byStart);
}

const PROMPT_CLIP_CAP = 200;

/** The Ask-agent prompt's Timeline block; empty when the timeline has no clips. */
export function formatTimelineBlock(elements: readonly TimelineElement[]): string {
  const clips = describeClips(elements);
  if (clips.length === 0) return "";
  const shown = clips.slice(0, PROMPT_CLIP_CAP).map(formatClipLine);
  const more = clips.length - shown.length;
  return [
    "Timeline (composition seconds; lane points are seconds from the clip start):",
    ...shown,
    ...(more > 0 ? [`(${more} more clips not listed)`] : []),
  ].join("\n");
}
