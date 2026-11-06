import { vi } from "vitest";
import { mountReactHarness } from "./domSelectionTestHarness";
import { useGsapAwareEditing } from "./useGsapAwareEditing";
import { useGsapInteractionFailureTelemetry } from "./useGsapInteractionFailureTelemetry";

type Params = Parameters<typeof useGsapAwareEditing>[0];

/**
 * Mounts useGsapAwareEditing with no-op callbacks for every param not given, and the real
 * failure telemetry toasting through `showToast`. `editing()` reads the latest render.
 */
export function mountGsapAwareEditing(
  params: Partial<Omit<Params, "trackGsapInteractionFailure">> & Pick<Params, "showToast">,
) {
  let editing!: ReturnType<typeof useGsapAwareEditing>;
  function Harness() {
    editing = useGsapAwareEditing({
      domEditSelection: null,
      selectedGsapAnimations: [],
      gsapCommitMutation: vi.fn().mockResolvedValue(undefined),
      previewIframeRef: { current: null },
      bumpGsapCache: vi.fn(),
      makeFetchFallback: () => vi.fn().mockResolvedValue([]),
      stageElementPositionOffset: vi.fn(),
      handleDomBoxSizeCommit: vi.fn(),
      handleDomRotationCommit: vi.fn(),
      commitPositionPatchToHtml: vi.fn(),
      addGsapAnimation: vi.fn(),
      convertToKeyframes: vi.fn(),
      setArcPath: vi.fn(),
      updateArcSegment: vi.fn(),
      ...params,
      trackGsapInteractionFailure: useGsapInteractionFailureTelemetry(
        "index.html",
        params.showToast,
      ),
    });
    return null;
  }
  const root = mountReactHarness(<Harness />);
  return { editing: () => editing, root };
}
