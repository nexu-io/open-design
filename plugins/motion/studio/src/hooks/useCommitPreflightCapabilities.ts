import { useEffect, useMemo, useRef, useState } from "react";
import type { GsapAnimation } from "@hyperframes/core/gsap-parser";
import type { DomEditSelection } from "../components/editor/domEditingTypes";
import { dragEditOutcome, preflightGsapRotationIntercept } from "./gsapRuntimeBridge";
import { preflightGsapResizeIntercept } from "./gsapResizePreflight";
import { withTweenIndex } from "./gsapRuntimeTweenIndex";
import { gsapEditBlockMessage, type GsapEditOutcome } from "./gsapEditOutcome";
import { fetchParsedAnimations, parseCacheKey } from "./keyframeCacheAstLoad";
import { getAnimationsForElement } from "./gsapElementMatch";
import { gsapSourceFileForSelection } from "./useGsapAnimationFetchFallback";

interface CommitPreflight {
  offset: GsapEditOutcome;
  size: GsapEditOutcome;
  rotation: GsapEditOutcome;
}

function runCommitPreflights(
  selection: DomEditSelection,
  fileAnimations: GsapAnimation[],
  iframe: HTMLIFrameElement | null,
  group: boolean,
): CommitPreflight {
  const target = { id: selection.id ?? null, selector: selection.selector ?? null };
  const animations = getAnimationsForElement(fileAnimations, target, selection.element);
  return {
    offset: dragEditOutcome(selection, animations, iframe, [], group),
    size: preflightGsapResizeIntercept(selection, animations, iframe),
    rotation: preflightGsapRotationIntercept(selection, animations, iframe),
  };
}

// Studio can hand a narrowed copy back as a new selection; narrowing starts from the resolved one.
const resolvedSelections = new WeakMap<DomEditSelection, DomEditSelection>();

interface CheckInputs {
  animations: GsapAnimation[];
  iframe: HTMLIFrameElement | null;
  group: boolean;
  version: number;
}

interface Checked extends CheckInputs {
  preflight: CommitPreflight;
  narrowed?: DomEditSelection;
}

// A member whose selection, parse, preview and cache version are unchanged keeps its answer.
const checkedSelections = new WeakMap<DomEditSelection, Checked>();

function checkedPreflight(resolved: DomEditSelection, inputs: CheckInputs): Checked {
  const known = checkedSelections.get(resolved);
  const same =
    known?.animations === inputs.animations &&
    known.iframe === inputs.iframe &&
    known.group === inputs.group &&
    known.version === inputs.version;
  if (same) return known;
  const { animations, iframe, group } = inputs;
  const checked = {
    ...inputs,
    preflight: runCommitPreflights(resolved, animations, iframe, group),
  };
  checkedSelections.set(resolved, checked);
  return checked;
}

const resolvedOf = (selection: DomEditSelection) => resolvedSelections.get(selection) ?? selection;

const MANUAL_FLAGS = [
  ["canApplyManualOffset", "offset"],
  ["canApplyManualSize", "size"],
  ["canApplyManualRotation", "rotation"],
] as const;

/** Null when the commit would go through; "" while the check is still running. */
function refusal(preflight: CommitPreflight | null, check: keyof CommitPreflight): string | null {
  const outcome = preflight?.[check];
  if (!outcome) return "";
  return outcome.status === "blocked" ? gsapEditBlockMessage(outcome.reason, outcome.detail) : null;
}

/** Closes each manual flag whose commit Studio would refuse, and says why. */
function narrowCapabilities(
  selection: DomEditSelection,
  preflight: CommitPreflight | null,
): DomEditSelection {
  const resolved = resolvedOf(selection);
  const next = { ...resolved.capabilities };
  const reasons: string[] = [];
  for (const [flag, check] of MANUAL_FLAGS) {
    const reason = refusal(preflight, check);
    if (!next[flag] || reason === null) continue;
    next[flag] = false;
    reasons.push(reason);
  }
  if (reasons.length === 0) return resolved;
  next.reasonIfDisabled = reasons.find(Boolean) || next.reasonIfDisabled;
  if (!preflight) next.commitCheckPending = true;
  const narrowed = { ...resolved, capabilities: next };
  resolvedSelections.set(narrowed, resolved);
  return narrowed;
}

interface FileParse {
  version: number;
  animations: GsapAnimation[] | null;
}

/**
 * The one place selection capabilities learn what the GSAP commit would refuse,
 * so chrome, nudge and group gates never offer an edit that snaps back.
 */
export function useCommitPreflightCapabilities({
  projectId,
  enabled,
  selection,
  groupSelections,
  previewIframeRef,
  version,
}: {
  projectId: string | null;
  enabled: boolean;
  selection: DomEditSelection | null;
  groupSelections: DomEditSelection[];
  previewIframeRef: React.RefObject<HTMLIFrameElement | null>;
  version: number;
}) {
  // One parse per project file and version; the last good parse answers while a newer one loads.
  const parsesRef = useRef(new Map<string, FileParse>());
  const [parseTick, setParseTick] = useState(0);

  useEffect(() => {
    if (!enabled || !projectId) return;
    const targets = selection ? [selection, ...groupSelections] : groupSelections;
    for (const file of new Set(targets.map(gsapSourceFileForSelection))) {
      const key = parseCacheKey(projectId, file);
      const known = parsesRef.current.get(key);
      if (known?.version === version) continue;
      parsesRef.current.set(key, { version, animations: known?.animations ?? null });
      void fetchParsedAnimations(projectId, file).then((parsed) => {
        if (parsesRef.current.get(key)?.version !== version) return;
        if (parsed) {
          parsesRef.current.set(key, { version, animations: parsed.animations });
          setParseTick((tick) => tick + 1);
          return;
        }
        // A failed read is not an answer: keep the last one, and the next selection asks again.
        if (known?.animations) parsesRef.current.set(key, known);
        else parsesRef.current.delete(key);
      });
    }
  }, [enabled, projectId, selection, groupSelections, version]);

  return useMemo(() => {
    void parseTick;
    if (!enabled || !projectId) return { selection, groupSelections };
    const group = groupSelections.length > 1;
    const iframe = previewIframeRef.current;
    const narrow = (target: DomEditSelection) => {
      const file = gsapSourceFileForSelection(target);
      const animations = parsesRef.current.get(parseCacheKey(projectId, file))?.animations;
      if (!animations) return narrowCapabilities(target, null);
      const inputs = { animations, iframe, group, version };
      const checked = checkedPreflight(resolvedOf(target), inputs);
      checked.narrowed ??= narrowCapabilities(target, checked.preflight);
      return checked.narrowed;
    };
    return withTweenIndex(() => ({
      selection: selection && narrow(selection),
      groupSelections: groupSelections.map(narrow),
    }));
  }, [enabled, projectId, selection, groupSelections, parseTick, previewIframeRef, version]);
}
