import { useTrackDesignInput } from "../../contexts/DesignPanelInputContext";
/**
 * An open effect's knobs, with whatever automation surface applies to them.
 *
 * Split into its own file — rather than living in `propertyPanelFxNodeRow.tsx`
 * or `propertyPanelFxNodeOpenBody.tsx` — because both of those import it: it
 * backs the row's own Details disclosure AND the open face's derived/primary
 * knobs, and either owning file would have made the other import a cycle.
 */

import {
  defaultAudioFxParams,
  type HfAudioFxDef,
  type HfAudioFxNode,
  type HfAudioFxParamValues,
} from "@hyperframes/core/audio-fx";
import { fxAutomationTarget } from "@hyperframes/core/audio-automation";
import { trackParamCommitted } from "./audioFxTelemetry.js";
import { FxParams } from "./propertyPanelFxControls.js";

/**
 * Which of an effect's knobs already have a lane.
 *
 * A lane addresses a node by id, so a node the panel has not yet given one
 * cannot be automated at all. Adding an effect mints the id, so this only
 * affects chains written before ids existed.
 */
function automatedKeysOf(
  node: HfAudioFxNode,
  params: readonly { key: string }[],
  automatedTargets: ReadonlySet<string> | undefined,
): Set<string> {
  if (!node.id || !automatedTargets) return new Set();
  const nodeId = node.id;
  return new Set(
    params.filter((p) => automatedTargets.has(fxAutomationTarget(nodeId, p.key))).map((p) => p.key),
  );
}

/**
 * Wiring a knob row hands down to whatever renders it — shared between
 * `FxNodeParams` and `FxNodeOpenBody`, which both sit between the row and the
 * controls.
 */
export interface FxNodeControlHandlers {
  automatedTargets?: ReadonlySet<string>;
  liveAutomationValues?: ReadonlyMap<string, number>;
  onUpdate(index: number, patch: Partial<HfAudioFxNode>): void;
  onPreview(index: number, params: HfAudioFxParamValues): void;
  onAutomateParam?(nodeId: string, paramKey: string): void;
  onRemoveParamAutomation?(nodeId: string, paramKey: string): void;
  trackKind?: string;
}

export function FxNodeParams({
  node,
  def,
  index,
  disabled,
  automatedTargets,
  liveAutomationValues,
  onUpdate,
  onPreview,
  onAutomateParam,
  onRemoveParamAutomation,
  trackKind,
}: FxNodeControlHandlers & {
  node: HfAudioFxNode;
  def: HfAudioFxDef;
  index: number;
  disabled: boolean;
}) {
  const trackInput = useTrackDesignInput();
  const nodeId = node.id;
  // Lanes address a node by id; the controls know their own parameter keys. This
  // is the one place that translation belongs.
  const liveValues = ((): Map<string, number> | undefined => {
    if (!nodeId || !liveAutomationValues?.size) return undefined;
    const byKey = new Map<string, number>();
    for (const param of def.params) {
      const live = liveAutomationValues.get(fxAutomationTarget(nodeId, param.key));
      if (live !== undefined) byKey.set(param.key, live);
    }
    return byKey;
  })();
  return (
    <FxParams
      def={def}
      params={node.params ?? defaultAudioFxParams(node.type)}
      liveValues={liveValues}
      disabled={disabled}
      onChange={(params: HfAudioFxParamValues) => onPreview(index, params)}
      onCommit={(next: HfAudioFxParamValues) => {
        // Which knob actually moved. `onCommit` hands over the whole parameter
        // set, so without the diff every commit would report the first key and
        // the numbers would say authors only ever touch "frequency".
        const before = node.params ?? defaultAudioFxParams(node.type);
        for (const [key, value] of Object.entries(next)) {
          if (before[key] === value) continue;
          if (typeof value !== "number" && typeof value !== "string") continue;
          trackParamCommitted(node.type, key, value, "details", { trackKind });
          trackInput(typeof value === "number" ? "slider" : "select", key);
        }
        onUpdate(index, { params: next });
      }}
      automatedKeys={automatedKeysOf(node, def.params, automatedTargets)}
      onAutomate={
        nodeId && onAutomateParam
          ? (key) => {
              onAutomateParam(nodeId, key);
              trackInput("button", "automate-param");
            }
          : undefined
      }
      onRemoveAutomation={
        nodeId && onRemoveParamAutomation
          ? (key) => {
              onRemoveParamAutomation(nodeId, key);
              trackInput("button", "remove-param-automation");
            }
          : undefined
      }
    />
  );
}
