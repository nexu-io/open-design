/**
 * Preview a hypothetical chain without committing to it, and put it back on
 * the way out — the machinery behind hovering a preset or an add-menu item.
 *
 * Split out of `propertyPanelFxSection.tsx`, whose `audition` callback and its
 * teardown effect this was.
 */

import { useCallback, useEffect, useRef } from "react";
import type { HfAudioFxChain } from "@hyperframes/core/audio-fx";

export function useFxAudition(
  chain: HfAudioFxChain,
  onChainPreview: ((chain: HfAudioFxChain, ended?: boolean) => void) | undefined,
  onAuditionTransport: ((on: boolean) => void) | undefined,
) {
  /**
   * The chain as it is really stored, captured when an audition starts.
   *
   * Auditioning writes through the preview channel, which does not persist and
   * does not come back as a new `chain` prop — so reverting has to remember what
   * was there rather than read it back. Null means nothing is being auditioned,
   * which is also what makes a stray leave a no-op instead of a write.
   */
  const auditionBase = useRef<HfAudioFxChain | null>(null);

  /**
   * Play something without committing to it, and put it back on the way out.
   *
   * Hearing a preset before choosing it is the strongest affordance in this
   * panel — see `plans/audio-fx-ux/README.md` §Decided. It costs nothing new:
   * the preview channel a slider drag already uses rebuilds the running graph
   * without touching the document.
   */
  const audition = useCallback(
    (make: ((base: HfAudioFxChain) => HfAudioFxChain) | null) => {
      if (!onChainPreview) return;
      if (make) {
        auditionBase.current ??= chain;
        onChainPreview(make(auditionBase.current));
        // After the chain is in the graph, not before: starting the transport
        // first plays a moment of the un-auditioned mix.
        onAuditionTransport?.(true);
      } else if (auditionBase.current) {
        // Stop before reverting, for the mirror of that reason — the last thing
        // heard should be the preset, not a frame of the chain coming back.
        onAuditionTransport?.(false);
        onChainPreview(auditionBase.current, true);
        auditionBase.current = null;
      }
    },
    [chain, onChainPreview, onAuditionTransport],
  );

  /**
   * The chain as the DOCUMENT has it, ignoring whatever is being auditioned.
   *
   * An audition writes through the preview channel, and the `chain` prop is
   * read back from that same live attribute — so mid-hover it is the hovered
   * preset, not the stored chain. Applying on top of it stacked the auditioned
   * preset into the saved chain: hover a reverb, click a different preset, and
   * both were persisted, which is heard as the effect running twice.
   */
  const storedChain = useCallback(() => auditionBase.current ?? chain, [chain]);

  /**
   * Drop whatever is being auditioned WITHOUT reverting the preview, for a
   * caller that is about to mutate the real chain anyway — reverting first
   * would be a chain the document never sees, immediately overwritten.
   */
  const clearAudition = useCallback(() => {
    auditionBase.current = null;
    onAuditionTransport?.(false);
  }, [onAuditionTransport]);

  /**
   * The preview handler as of the last render, held rather than closed over.
   *
   * The teardown below must run on teardown and at no other time, so its deps
   * have to be empty — and `onChainPreview` is an inline arrow in the group,
   * which re-renders on every playhead tick to move the automation readouts. A
   * dep on it made React tear down and re-run the effect on every one of those
   * ticks, so an audition reverted itself about 30 times a second while the
   * pointer was still on the button: the preset was heard for a frame during
   * playback, which is the exact case the whole affordance exists for.
   */
  const previewRef = useRef(onChainPreview);
  previewRef.current = onChainPreview;

  // Leaving by any route other than the pointer — the element deselected, the
  // panel closed — would otherwise leave the audition playing over a chain the
  // document does not have.
  const transportRef = useRef(onAuditionTransport);
  transportRef.current = onAuditionTransport;
  useEffect(
    () => () => {
      if (auditionBase.current) {
        transportRef.current?.(false);
        previewRef.current?.(auditionBase.current, true);
      }
    },
    [],
  );

  return { audition, clearAudition, storedChain };
}
