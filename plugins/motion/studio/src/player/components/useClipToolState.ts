import { useEffect, useState } from "react";
import { HF_AUDIO_AUTOMATION_ATTR } from "@hyperframes/core/audio-automation";
import { HF_AUDIO_CARVE_ATTR } from "@hyperframes/core/audio-carve";
import { HF_AUDIO_FX_ATTR } from "@hyperframes/core/audio-fx";
import { HF_COLOR_GRADING_ATTR } from "@hyperframes/core/color-grading";
import type { TimelineElement } from "../store/playerStore";
import { useLivePreviewIframe } from "../store/previewIframeStore";
import { useStudioShellContextOptional } from "../../contexts/StudioContext";
import { findTimelineElementInIframe } from "../../hooks/timelineEditingHelpers";
import { committedClipPath } from "../../components/editor/cropPresetStore";
import { isAudibleVideoNode } from "../lib/timelineElementHelpers";
import type { ClipToolState } from "./clipToolAttrs";

const WATCHED_ATTRS = [
  HF_AUDIO_FX_ATTR,
  HF_AUDIO_AUTOMATION_ATTR,
  HF_AUDIO_CARVE_ATTR,
  HF_COLOR_GRADING_ATTR,
  "data-volume",
  "data-has-audio",
  "muted",
  "style",
];

function readVolume(node: Element): number | null {
  const volume = Number.parseFloat(node.getAttribute("data-volume") ?? "");
  return Number.isFinite(volume) ? volume : null;
}

function toolStateFromNode(node: Element): ClipToolState {
  const tag = node.tagName.toLowerCase();
  return {
    tag,
    hasSound: tag === "audio" || isAudibleVideoNode(node),
    volume: readVolume(node),
    muted: node.hasAttribute("muted"),
    fxChain: node.getAttribute(HF_AUDIO_FX_ATTR),
    automation: node.getAttribute(HF_AUDIO_AUTOMATION_ATTR),
    colorGrading: node.getAttribute(HF_COLOR_GRADING_ATTR),
    clipPath: committedClipPath(node),
    carve: node.getAttribute(HF_AUDIO_CARVE_ATTR),
  };
}

function toolStateFromElement(el: TimelineElement): ClipToolState {
  const tag = el.tag.trim().toLowerCase();
  return {
    tag,
    hasSound: tag === "audio" || el.hasAudio === true,
    volume: el.volume ?? null,
    muted: el.muted === true,
    fxChain: el.fxChain ?? null,
    automation: el.automation ?? null,
    colorGrading: null,
    clipPath: null,
    carve: null,
  };
}

/** Inline style changes every frame under a tween; only a changed reading re-renders. */
function keepIfUnchanged(prev: ClipToolState, next: ClipToolState): ClipToolState {
  return JSON.stringify(prev) === JSON.stringify(next) ? prev : next;
}

/** A clip's tool attributes as the live preview node holds them, kept current as they change. */
export function useClipToolState(el: TimelineElement): ClipToolState {
  const iframe = useLivePreviewIframe();
  const activeCompPath = useStudioShellContextOptional()?.activeCompPath ?? null;
  const [state, setState] = useState<ClipToolState>(() => toolStateFromElement(el));

  useEffect(() => {
    const node = findTimelineElementInIframe(iframe, el, activeCompPath);
    if (!node) {
      setState(toolStateFromElement(el));
      return;
    }
    const refresh = () => setState((prev) => keepIfUnchanged(prev, toolStateFromNode(node)));
    refresh();
    const view = node.ownerDocument.defaultView;
    if (!view) return;
    const observer = new view.MutationObserver(refresh);
    observer.observe(node, { attributes: true, attributeFilter: WATCHED_ATTRS });
    return () => observer.disconnect();
  }, [iframe, el, activeCompPath]);

  return state;
}
