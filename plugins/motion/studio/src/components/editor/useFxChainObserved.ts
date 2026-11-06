/**
 * Report the shape of a chain this panel did not write.
 *
 * Split out of `propertyPanelAudioFxGroup.tsx`, which owned this whole
 * provenance mechanism before the file grew past a size where it was still
 * one thing to read alongside the carve and the leveller.
 */

import { useEffect, useRef } from "react";
import type { HfAudioFxChain } from "@hyperframes/core/audio-fx";
import { classifyAudioName, type HfCarveSettings } from "@hyperframes/core/audio-carve";
import type { HfAutomation } from "@hyperframes/core/audio-automation";
import { trackChainObserved } from "./audioFxTelemetry.js";
import type { DomEditSelection } from "./domEditingTypes";

/**
 * This is the only way agent-applied effects become visible. An agent asked to
 * fix a mix does not drive this panel — it edits the composition HTML, or runs
 * `skills/media-use/audio/scripts/carve.mjs`, and the rack simply finds the work already done. Not
 * one of the panel's own events fires for any of it.
 *
 * So: watch the chain's shape, and report it when it changes without a panel
 * edit behind it. `panelEdits` is the discriminator — this session's own
 * writes bump it, so a chain that moved while the counter stood still moved
 * because something outside the studio moved it.
 *
 * Keyed on the shape rather than fired once per mount: a soft reload after an
 * agent edits the file re-mounts this component, and a mount-only event would
 * either miss the change or double-count every HMR. Comparing the fingerprint
 * reports real changes and stays quiet through both.
 *
 * Returns a wrapped `onSetAttributeQuiet` that every other write in the panel
 * must go through instead of the raw prop: the count is only meaningful if it
 * is exhaustive, and a write added later that forgot to route through here
 * would silently start reporting the author's own edits as having come from
 * outside.
 */
export function useFxChainObserved(
  element: DomEditSelection,
  chain: HfAudioFxChain,
  carve: HfCarveSettings | null,
  automation: HfAutomation,
  onSetAttributeQuietRaw: (attr: string, value: string | null) => void | Promise<void>,
): (attr: string, value: string | null) => void | Promise<void> {
  const lastShape = useRef<string | null>(null);
  const panelEdits = useRef(0);

  const onSetAttributeQuiet = (attr: string, value: string | null): void | Promise<void> => {
    panelEdits.current += 1;
    return onSetAttributeQuietRaw(attr, value);
  };

  useEffect(() => {
    const shape = JSON.stringify([
      chain.nodes.map((n) => `${n.type}:${n.fromPreset ?? ""}:${n.fromCarve ? 1 : 0}`),
      carve?.enabled ?? false,
      automation.lanes.length,
    ]);
    if (lastShape.current === shape) return;
    const firstSight = lastShape.current === null;
    lastShape.current = shape;
    // An empty chain on first sight is the ordinary case — nothing to report.
    if (firstSight && chain.nodes.length === 0 && !carve) return;
    trackChainObserved(
      chain,
      {
        firstSight,
        panelEdits: panelEdits.current,
        hasCarve: Boolean(carve?.enabled),
        hasAutomation: automation.lanes.length > 0,
      },
      {
        trackKind: classifyAudioName(element.id, element.element?.getAttribute("src")) ?? undefined,
      },
    );
    // Each observation is measured against the edits made SINCE the last one, so
    // a session that edits, then receives an outside change, still reports that
    // second change as unattributed.
    panelEdits.current = 0;
  });

  return onSetAttributeQuiet;
}
