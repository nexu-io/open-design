import { useLivePreviewIframe } from "../../player/store/previewIframeStore";
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import {
  HF_COLOR_GRADING_ACTIVE_EFFECT_KEYS,
  HF_COLOR_GRADING_EFFECT_APPLY_DEFAULTS,
  HF_COLOR_GRADING_PRESETS,
  normalizeHfColorGrading,
  type HfColorGradingActiveEffectKey,
  type HfColorGradingTarget,
  type NormalizedHfColorGrading,
} from "@hyperframes/core/color-grading";

export interface ColorGradingPresetPreviews {
  status: "idle" | "loading" | "ready" | "unavailable";
  images: Record<string, string>;
  width: number;
  height: number;
}

export interface ColorGradingCapturedFrame {
  dataUrl: string;
  width: number;
  height: number;
}

type ColorGradingPreviewKind = "presets" | "effects";

export interface ColorGradingPreviewOptions {
  animatedPreview: { kind: ColorGradingPreviewKind; id: string };
}

type RuntimeColorGradingPreview = {
  renderPreviews: (
    target: HfColorGradingTarget,
    candidates: Array<{ id: string; grading: unknown }>,
    options: { maxDimension: number; useMediaTime?: boolean },
  ) => Promise<{
    width: number;
    height: number;
    images: Array<{ id: string; dataUrl: string | null }>;
  } | null>;
  startPreviewPlayback?: (target: HfColorGradingTarget) => (() => void) | null;
};

type PreviewRequest = {
  kind: ColorGradingPreviewKind;
  version: number;
  effects?: readonly HfColorGradingActiveEffectKey[];
};

const emptyPreviews = (): Record<ColorGradingPreviewKind, ColorGradingPresetPreviews> => ({
  presets: { status: "idle", images: {}, width: 16, height: 9 },
  effects: { status: "idle", images: {}, width: 16, height: 9 },
});

function readRuntime(
  iframe: HTMLIFrameElement | null | undefined,
): RuntimeColorGradingPreview | null {
  try {
    const runtime = (
      iframe?.contentWindow as
        | (Window & { __hf?: { colorGrading?: Partial<RuntimeColorGradingPreview> } })
        | null
        | undefined
    )?.__hf?.colorGrading;
    return runtime?.renderPreviews
      ? {
          renderPreviews: runtime.renderPreviews,
          startPreviewPlayback: runtime.startPreviewPlayback,
        }
      : null;
  } catch {
    return null;
  }
}

function previewMaxDimension(): number {
  return Math.min(320, Math.ceil(160 * Math.max(1, window.devicePixelRatio || 1)));
}

function toPreviewColorGrading(grading: NormalizedHfColorGrading): unknown {
  const { enabled: _enabled, ...previewGrading } = grading;
  return previewGrading;
}

function previewCandidates(
  request: PreviewRequest,
  grading: Pick<NormalizedHfColorGrading, "effects" | "lut" | "palette">,
): Array<{ id: string; grading: unknown }> {
  if (request.kind === "presets") {
    return HF_COLOR_GRADING_PRESETS.map((preset) => {
      const resolved = normalizeHfColorGrading({ preset: preset.id, lut: grading.lut });
      return {
        id: preset.id,
        grading: resolved
          ? toPreviewColorGrading({
              ...resolved,
              effects: grading.effects,
              palette: grading.palette,
            })
          : null,
      };
    });
  }
  return (request.effects ?? HF_COLOR_GRADING_ACTIVE_EFFECT_KEYS).map((effect) => {
    const resolved = normalizeHfColorGrading({
      effects: HF_COLOR_GRADING_EFFECT_APPLY_DEFAULTS[effect],
    });
    return { id: effect, grading: resolved ? toPreviewColorGrading(resolved) : null };
  });
}

async function renderRequestedPreviews(
  runtime: RuntimeColorGradingPreview,
  target: HfColorGradingTarget,
  request: PreviewRequest,
  grading: Pick<NormalizedHfColorGrading, "effects" | "lut" | "palette">,
) {
  const candidates = previewCandidates(request, grading);
  const batch = await runtime.renderPreviews(target, candidates, {
    maxDimension: previewMaxDimension(),
  });
  if (!batch) return null;
  const images = Object.fromEntries(
    batch.images.flatMap((image) => (image.dataUrl ? [[image.id, image.dataUrl]] : [])),
  );
  return Object.keys(images).length
    ? { ...batch, images, complete: Object.keys(images).length === candidates.length }
    : null;
}

export function useColorGradingPreviews({
  grading,
  gradingRef,
  identityKey,
  target,
  previewIframeRef,
  postColorGrading,
}: {
  grading: NormalizedHfColorGrading;
  gradingRef: RefObject<NormalizedHfColorGrading>;
  identityKey: string;
  target: HfColorGradingTarget;
  previewIframeRef?: RefObject<HTMLIFrameElement | null>;
  postColorGrading: (grading: NormalizedHfColorGrading) => void;
}) {
  const [state, setState] = useState(() => ({
    identityKey,
    previews: emptyPreviews(),
  }));
  const [request, setRequest] = useState<PreviewRequest | null>(null);
  const animatedRef = useRef<{ stopPlayback: () => void; timer: number | null } | null>(null);
  if (state.identityKey !== identityKey) {
    setState({ identityKey, previews: emptyPreviews() });
    setRequest(null);
  }
  const previews = state.identityKey === identityKey ? state.previews : emptyPreviews();

  const livePreviewIframe = useLivePreviewIframe();
  useEffect(() => {
    if (!request) return;
    const { kind } = request;
    const iframe = previewIframeRef?.current;
    if (!iframe) {
      setState((current) => ({
        ...current,
        previews: {
          ...current.previews,
          [kind]: { status: "unavailable", images: {}, width: 16, height: 9 },
        },
      }));
      return;
    }
    let cancelled = false;
    let complete = false;
    let inFlight = false;
    let timedOut = false;
    const timers: number[] = [];
    setState((current) => ({
      ...current,
      previews: {
        ...current.previews,
        [kind]: { ...current.previews[kind], status: "loading" },
      },
    }));

    const attempt = async () => {
      if (cancelled || complete || inFlight) return;
      const runtime = readRuntime(iframe);
      if (!runtime) return;
      inFlight = true;
      try {
        const result = await renderRequestedPreviews(runtime, target, request, {
          effects: grading.effects,
          lut: grading.lut,
          palette: grading.palette,
        });
        if (cancelled || !result) return;
        complete = result.complete;
        setState((current) => ({
          ...current,
          previews: {
            ...current.previews,
            [kind]: {
              status: result.complete ? "ready" : timedOut ? "unavailable" : "loading",
              images:
                kind === "effects"
                  ? { ...current.previews[kind].images, ...result.images }
                  : result.images,
              width: result.width,
              height: result.height,
            },
          },
        }));
      } catch {
        // Timed retries handle runtime and media readiness races.
      } finally {
        inFlight = false;
      }
    };
    const onMessage = (event: MessageEvent) => {
      if (event.source !== iframe.contentWindow) return;
      const data = event.data as { source?: unknown; type?: unknown } | null;
      if (data?.source === "hf-preview" && data.type === "ready") void attempt();
    };
    iframe.addEventListener("load", attempt);
    window.addEventListener("message", onMessage);
    for (const delay of [0, 100, 350, 1000]) {
      timers.push(window.setTimeout(() => void attempt(), delay));
    }
    timers.push(
      window.setTimeout(() => {
        if (cancelled || complete) return;
        timedOut = true;
        setState((current) => ({
          ...current,
          previews: {
            ...current.previews,
            [kind]: { ...current.previews[kind], status: "unavailable" },
          },
        }));
      }, 1600),
    );
    return () => {
      cancelled = true;
      for (const timer of timers) window.clearTimeout(timer);
      iframe.removeEventListener("load", attempt);
      window.removeEventListener("message", onMessage);
    };
  }, [
    grading.effects,
    grading.lut,
    grading.palette,
    previewIframeRef,
    livePreviewIframe,
    request,
    target,
  ]);

  const stopAnimatedPreview = useCallback(() => {
    const session = animatedRef.current;
    if (!session) return;
    animatedRef.current = null;
    if (session.timer !== null) window.clearTimeout(session.timer);
    session.stopPlayback();
  }, []);

  const previewColorGrading = useCallback(
    (next: NormalizedHfColorGrading | null, options?: ColorGradingPreviewOptions) => {
      stopAnimatedPreview();
      postColorGrading(next ?? gradingRef.current);
      if (!next || !options) return;
      const runtime = readRuntime(previewIframeRef?.current);
      const stopPlayback = runtime?.startPreviewPlayback?.(target);
      if (!runtime || !stopPlayback) return;
      const session = { stopPlayback, timer: null as number | null };
      animatedRef.current = session;
      const renderFrame = async () => {
        try {
          const batch = await runtime.renderPreviews(
            target,
            [{ id: options.animatedPreview.id, grading: toPreviewColorGrading(next) }],
            { maxDimension: previewMaxDimension(), useMediaTime: true },
          );
          const image = batch?.images[0]?.dataUrl;
          if (animatedRef.current !== session || !batch || !image) return;
          setState((current) => ({
            ...current,
            previews: {
              ...current.previews,
              [options.animatedPreview.kind]: {
                ...current.previews[options.animatedPreview.kind],
                status: "ready",
                images: {
                  ...current.previews[options.animatedPreview.kind].images,
                  [options.animatedPreview.id]: image,
                },
                width: batch.width,
                height: batch.height,
              },
            },
          }));
        } catch {
          // A later frame can recover after media/runtime readiness races.
        } finally {
          if (animatedRef.current === session) {
            session.timer = window.setTimeout(() => void renderFrame(), 100);
          }
        }
      };
      void renderFrame();
    },
    [gradingRef, postColorGrading, previewIframeRef, stopAnimatedPreview, target],
  );

  useEffect(() => stopAnimatedPreview, [identityKey, stopAnimatedPreview]);

  const requestPreviews = useCallback(
    (kind: ColorGradingPreviewKind, effects?: readonly HfColorGradingActiveEffectKey[]) => {
      setRequest((current) => ({
        kind,
        version: (current?.version ?? 0) + 1,
        effects,
      }));
    },
    [],
  );
  const requestPresetPreviews = useCallback(() => requestPreviews("presets"), [requestPreviews]);
  const requestEffectPreviews = useCallback(
    (effects: readonly HfColorGradingActiveEffectKey[]) => requestPreviews("effects", effects),
    [requestPreviews],
  );
  const captureGradedFrame = useCallback(
    async ({
      grading: requestedGrading = gradingRef.current,
    }: {
      grading?: NormalizedHfColorGrading;
    } = {}): Promise<ColorGradingCapturedFrame | null> => {
      const runtime = readRuntime(previewIframeRef?.current);
      if (!runtime) return null;
      const batch = await runtime.renderPreviews(
        target,
        [{ id: "capture", grading: toPreviewColorGrading(requestedGrading) }],
        { maxDimension: 320, useMediaTime: true },
      );
      const dataUrl = batch?.images[0]?.dataUrl;
      return batch && dataUrl ? { dataUrl, width: batch.width, height: batch.height } : null;
    },
    [gradingRef, previewIframeRef, target],
  );

  return {
    presetPreviews: previews.presets,
    effectPreviews: previews.effects,
    requestPresetPreviews,
    requestEffectPreviews,
    previewColorGrading,
    captureGradedFrame,
  };
}
