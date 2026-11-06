import { useI18n, type Translate } from "../../i18n/I18n";
import { memo, useState, useRef, useEffect, useLayoutEffect, useId } from "react";
import { createPortal } from "react-dom";
import { CANVAS_DIMENSIONS } from "@hyperframes/parsers";
import { RenderDurationNote } from "./RenderDurationNote";
import { RenderQueueItem } from "./RenderQueueItem";
import { FfmpegRequiredNotice } from "./FfmpegRequiredNotice";
import type { FfmpegStatus } from "./useFfmpegStatus";
import { Button } from "../ui/Button";
import { IconButton } from "../ui/IconButton";
import { Select, type SelectOption } from "../ui/Select";
import { Tooltip } from "../ui/Tooltip";
import { resolveFloatingPanelPosition, type FloatingPosition } from "../editor/floatingPanel";
import type { RenderJob, ResolutionPreset } from "./useRenderQueue";
import {
  FORMAT_INFO,
  resolveRenderFps,
  getRenderFpsOptions,
  getPersistedRenderSettings,
  persistRenderSettings,
  resolveRenderFormat,
  startConfiguredRender,
  isRenderExportBlocked,
} from "./renderSettings";
import { GpuEncodingToggle } from "./GpuEncodingToggle";
import { GifLoopInput, isInvalidGifLoop } from "./GifLoopInput";
import { trackStudioEvent } from "../../utils/studioTelemetry";

export interface CompositionDimensions {
  width: number;
  height: number;
}

export type StartRenderHandler = (
  format: "mp4" | "webm" | "mov" | "gif",
  quality: "draft" | "standard" | "high",
  resolution: ResolutionPreset | "auto",
  fps: 24 | 30 | 60,
  gpu?: boolean,
  gifLoop?: number,
) => void | Promise<void>;

export interface RenderQueueProps {
  jobs: RenderJob[];
  projectId: string;
  onDelete: (jobId: string) => void;
  onCancel?: (jobId: string) => void;
  onClearCompleted: () => void;
  onStartRender: StartRenderHandler;
  isRendering: boolean;
  /** History fetch failure (null when the last load succeeded). */
  loadError?: string | null;
  /** Retry a failed history load. */
  onRetryLoad?: () => void;
  /** Failure of a delete/cancel action, shown inline until dismissed. */
  actionError?: string | null;
  onDismissActionError?: () => void;
  /**
   * Authored dimensions of the active composition. Used to pick the
   * matching preset (landscape / portrait / square) when the user selects
   * a 1080p or 4K scale. `null` falls back to landscape (legacy default).
   */
  compositionDimensions?: CompositionDimensions | null;
  /**
   * Encoder availability, owned by useRenderQueue so the panel's Export button
   * and the header's agree. `null` means "no answer", not "missing".
   */
  ffmpeg: FfmpegStatus | null;
  ffmpegChecking: boolean;
  onRecheckFfmpeg: () => void;
}

// Orientation is derived from the composition's authored aspect ratio,
// not chosen by the user — picking "1080p portrait" for a landscape comp
// would just produce a wrong-aspect render.
type RenderScale = "auto" | "1080p" | "4k";

const SCALE_OPTION_ORDER: RenderScale[] = ["auto", "1080p", "4k"];

const SCALE_LABEL: Record<RenderScale, string> = {
  auto: "Auto",
  "1080p": "1080p",
  "4k": "4K",
};

type CompAspect = "landscape" | "portrait" | "square";

function compAspect(dims: CompositionDimensions | null | undefined): CompAspect {
  // Missing dims fall through to landscape (legacy default — "landscape" was
  // the first preset). Studio shows resolved dims inline, so the user can see
  // when this fallback is in effect.
  if (dims == null) return "landscape";
  if (dims.width === dims.height) return "square";
  return dims.height > dims.width ? "portrait" : "landscape";
}

function resolveResolution(
  scale: RenderScale,
  dims: CompositionDimensions | null | undefined,
): ResolutionPreset | "auto" {
  if (scale === "auto") return "auto";
  const aspect = compAspect(dims);
  if (scale === "1080p") return aspect;
  return aspect === "landscape"
    ? "landscape-4k"
    : aspect === "portrait"
      ? "portrait-4k"
      : "square-4k";
}

function resolvedDimensions(
  scale: RenderScale,
  dims: CompositionDimensions | null | undefined,
): CompositionDimensions | null {
  if (scale === "auto") return dims ?? null;
  const preset = resolveResolution(scale, dims);
  return preset === "auto" ? null : CANVAS_DIMENSIONS[preset];
}

// Mirrors the producer's resolveDeviceScaleFactor validation
// (renderOrchestrator.ts:608): the chosen preset must match the comp's aspect
// ratio exactly (cross-multiplied), can't downsample, and must be an integer
// scale factor. Without this guard the user can pick a preset that throws at
// render time — e.g. 1080p on a 1080×1080 square or 1080p on a 1280×720 comp
// (1.5× isn't integer).
function scaleApplies(scale: RenderScale, dims: CompositionDimensions | null | undefined): boolean {
  if (scale === "auto" || dims == null) return true;
  const preset = resolveResolution(scale, dims);
  if (preset === "auto") return true;
  const target = CANVAS_DIMENSIONS[preset];
  if (target.width * dims.height !== target.height * dims.width) return false;
  if (target.width < dims.width) return false;
  return Number.isInteger(target.width / dims.width);
}

function scaleOptionLabel(
  scale: RenderScale,
  dims: CompositionDimensions | null | undefined,
  t: Translate,
): string {
  const resolved = resolvedDimensions(scale, dims);
  const base = resolved
    ? `${t(SCALE_LABEL[scale])} · ${resolved.width}×${resolved.height}`
    : t(SCALE_LABEL[scale]);
  // Explain *why* an option is disabled instead of greying it silently:
  // the preset must be an exact integer upscale of the authored size.
  if (dims && !scaleApplies(scale, dims)) {
    return t("{base} (not an integer scale of {width}×{height})", { base, width: dims.width, height: dims.height });
  }
  return base;
}

// Estimated, like COLOR_PICKER_SIZE in propertyPanelColor: only the flip
// decision uses the height, and the clamp keeps the panel on screen either way.
const FORMAT_PANEL_SIZE = { width: 208, height: 210 };

// Rich format guidance in a keyboard-reachable disclosure: the trigger is a
// real button (focusable, labelled), the panel is tied to it via
// aria-describedby, and Escape dismisses (WCAG 1.4.13). Content is too rich
// for the one-line ui/Tooltip primitive, so this stays a local popover.
// It renders in a portal because the right panel is overflow-hidden: an
// in-flow absolute panel gets clipped at the panel edge.
function FormatInfoTooltip({ format }: { format: "mp4" | "webm" | "mov" | "gif" }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<FloatingPosition | null>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const panelId = useId();

  const show = () => {
    clearTimeout(timeoutRef.current);
    setOpen(true);
  };
  const hide = () => {
    timeoutRef.current = setTimeout(() => setOpen(false), 120);
  };

  useEffect(() => () => clearTimeout(timeoutRef.current), []);

  // Positioned once on open, so it does not follow panel scroll. The popover
  // is hover-lived; add a scroll listener only if that ever shows up.
  useLayoutEffect(() => {
    if (!open) return;
    const el = triggerRef.current;
    if (!el) return;
    setPosition(
      resolveFloatingPanelPosition(
        el.getBoundingClientRect(),
        { width: window.innerWidth, height: window.innerHeight },
        FORMAT_PANEL_SIZE,
        { offset: 6 },
      ),
    );
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  const info = FORMAT_INFO[format];

  return (
    <div ref={triggerRef} className="relative" onPointerEnter={show} onPointerLeave={hide}>
      <button
        type="button"
        aria-label={t("About video formats")}
        aria-expanded={open}
        aria-describedby={open ? panelId : undefined}
        onFocus={show}
        onBlur={hide}
        onClick={() => setOpen((prev) => !prev)}
        className="flex items-center justify-center p-0.5 -m-0.5 rounded-sm text-text-5 hover:text-text-3 transition-colors cursor-help outline-hidden focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-accent"
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="10" />
          <path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      </button>
      {open &&
        createPortal(
          <div
            id={panelId}
            role="tooltip"
            onPointerEnter={show}
            onPointerLeave={hide}
            className="fixed w-52 p-2 rounded-sm bg-input border border-border-input shadow-menu z-200"
            style={{ left: position?.left ?? -9999, top: position?.top ?? -9999 }}
          >
            <p className="text-step-10 font-semibold text-text-1 mb-0.5">{info.label}</p>
            <p className="text-step-9 text-text-3 leading-tight">{t(info.desc)}</p>
            <div className="mt-1.5 pt-1.5 border-t border-border">
              {(["mp4", "mov", "webm", "gif"] as const)
                .filter((f) => f !== format)
                .map((f) => (
                  <p key={f} className="text-step-9 text-text-4 leading-relaxed">
                    <span className="text-text-3 font-medium">{FORMAT_INFO[f].label}</span>
                    {": "}
                    {t(FORMAT_INFO[f].desc)}
                  </p>
                ))}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

const FORMAT_OPTIONS: SelectOption[] = [
  { value: "mp4", label: "MP4" },
  { value: "mov", label: "MOV (ProRes)" },
  { value: "webm", label: "WebM" },
  { value: "gif", label: "GIF" },
];

const QUALITY_OPTIONS: SelectOption[] = [
  { value: "draft", label: "Draft" },
  { value: "standard", label: "Standard" },
  { value: "high", label: "High Quality" },
];

function FormatExportButton({
  onStartRender,
  isRendering,
  compositionDimensions,
  lastRenderDurationMs,
  ffmpeg,
  ffmpegChecking,
  onRecheckFfmpeg,
}: {
  onStartRender: StartRenderHandler;
  isRendering: boolean;
  compositionDimensions?: CompositionDimensions | null;
  lastRenderDurationMs?: number;
  ffmpeg: FfmpegStatus | null;
  ffmpegChecking: boolean;
  onRecheckFfmpeg: () => void;
}) {
  const { t } = useI18n();
  const persisted = getPersistedRenderSettings();
  const [format, setFormat] = useState<"mp4" | "webm" | "mov" | "gif">(persisted.format);
  const [quality, setQuality] = useState<"draft" | "standard" | "high">(persisted.quality);
  const [resolution, setResolution] = useState<RenderScale>("auto");
  const [requestedFps, setFps] = useState<24 | 30 | 60>(persisted.fps);
  const fps = resolveRenderFps(format, requestedFps);
  const [gpu, setGpu] = useState(persisted.gpu);
  const [gifLoop, setGifLoop] = useState("0");
  const loopCount = Number(gifLoop);
  const invalidGifLoop = isInvalidGifLoop(format, gifLoop);

  // Only a definite "not installed" blocks Export. A null status means the
  // probe gave no answer, and refusing to export on no answer would break
  // setups that are perfectly fine. Holding the narrowed value rather than a
  // boolean keeps the notice from re-testing what this line already decided.
  const missingFfmpeg = ffmpeg && !ffmpeg.ok ? ffmpeg : null;
  const exportBlocked = isRenderExportBlocked(isRendering, missingFfmpeg !== null, invalidGifLoop);

  // MOV (ProRes) is a fixed-quality codec — quality selector has no effect.
  const showQuality = format !== "mov";

  return (
    <div className="flex flex-col gap-3">
      {missingFfmpeg && (
        <FfmpegRequiredNotice
          status={missingFfmpeg}
          checking={ffmpegChecking}
          onRecheck={onRecheckFfmpeg}
        />
      )}
      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1">
            <span className="text-step-10 text-text-4">{t("Format")}</span>
            <FormatInfoTooltip format={format} />
          </div>
          <Select
            label={t("Format")}
            value={format}
            options={FORMAT_OPTIONS}
            disabled={isRendering}
            onCommit={(next) => {
              const v = resolveRenderFormat(next);
              setFormat(v);
              persistRenderSettings(v, quality, resolveRenderFps(v, requestedFps));
            }}
          />
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-step-10 text-text-4">{t("Resolution")}</span>
          <Select
            label={t("Resolution")}
            value={resolution}
            options={SCALE_OPTION_ORDER.map((value) => ({
              value,
              label: scaleOptionLabel(value, compositionDimensions, t),
              disabled: !scaleApplies(value, compositionDimensions),
            }))}
            disabled={isRendering}
            onCommit={(next) => setResolution(next as RenderScale)}
          />
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-step-10 text-text-4">{t("Frame rate")}</span>
          <Select
            label={t("Frame rate")}
            value={String(fps)}
            options={getRenderFpsOptions(format)}
            disabled={isRendering}
            onCommit={(next) => {
              const v = Number(next) as 24 | 30 | 60;
              setFps(v);
              persistRenderSettings(format, quality, v);
            }}
          />
        </div>
        {showQuality && (
          <div className="flex flex-col gap-1">
            <span className="text-step-10 text-text-4">{t("Quality")}</span>
            <Select
              label={t("Quality")}
              value={quality}
              options={QUALITY_OPTIONS.map(option => ({ ...option, label: t(option.label) }))}
              disabled={isRendering}
              onCommit={(next) => {
                const v = next as "draft" | "standard" | "high";
                setQuality(v);
                persistRenderSettings(format, v, fps);
              }}
            />
          </div>
        )}
      </div>
      <GifLoopInput
        format={format}
        value={gifLoop}
        disabled={isRendering}
        invalid={invalidGifLoop}
        onChange={setGifLoop}
      />
      <GpuEncodingToggle
        format={format}
        checked={gpu}
        disabled={isRendering}
        onToggle={() => {
          setGpu(!gpu);
          persistRenderSettings(format, quality, fps, !gpu);
        }}
      />
      <Button
        variant="primary"
        size="md"
        data-testid="renders-export"
        loading={isRendering}
        disabled={exportBlocked}
        title={missingFfmpeg ? t("Install FFmpeg to export. See the note above.") : undefined}
        onClick={() => {
          // loading already disables the button; this guard also stops a
          // double-click in the same frame from enqueueing two renders.
          if (exportBlocked) return;
          const outputResolution = resolveResolution(resolution, compositionDimensions);
          trackStudioEvent("render_start", { format, quality, resolution: outputResolution, fps });
          void startConfiguredRender(onStartRender, {
            format,
            quality,
            resolution: outputResolution,
            fps,
            gpu,
            gifLoop: loopCount,
          });
        }}
        // Width only. A type size or a weight here would win the merge against
        // the size recipe and leave this Export a step away from the header's
        // (AE3), which is exactly what it used to do.
        className="w-full"
      >
        {isRendering ? t("Rendering…") : t("Export")}
      </Button>
      <RenderDurationNote durationMs={lastRenderDurationMs} isRendering={isRendering} />
    </div>
  );
}

export const RenderQueue = memo(function RenderQueue({
  jobs,
  projectId,
  onDelete,
  onCancel,
  onClearCompleted,
  onStartRender,
  isRendering,
  loadError,
  onRetryLoad,
  actionError,
  onDismissActionError,
  compositionDimensions,
  ffmpeg,
  ffmpegChecking,
  onRecheckFfmpeg,
}: RenderQueueProps) {
  const { t } = useI18n();
  const listRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new jobs are added.
  // Runs in an effect to avoid side effects during the render phase.
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
    }
  }, [jobs.length]);

  const completedCount = jobs.filter((j) => j.status !== "rendering").length;
  const lastRenderDurationMs = [...jobs]
    .reverse()
    .find((j) => j.status === "complete" && j.durationMs !== undefined)?.durationMs;

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-3 border-b border-border shrink-0">
        <FormatExportButton
          onStartRender={onStartRender}
          isRendering={isRendering}
          compositionDimensions={compositionDimensions}
          lastRenderDurationMs={lastRenderDurationMs}
          ffmpeg={ffmpeg}
          ffmpegChecking={ffmpegChecking}
          onRecheckFfmpeg={onRecheckFfmpeg}
        />
      </div>

      {actionError && (
        <div
          role="alert"
          className="flex items-start justify-between gap-2 px-3 py-2 border-b border-border bg-danger/10"
        >
          <span className="text-step-10 text-danger-ink">{actionError}</span>
          {onDismissActionError && (
            <IconButton
              size="sm"
              onClick={onDismissActionError}
              aria-label={t("Dismiss error")}
              className="shrink-0"
              icon={
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  aria-hidden="true"
                >
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              }
            />
          )}
        </div>
      )}

      {/* Job list */}
      <div ref={listRef} className="flex-1 overflow-y-auto">
        {loadError && jobs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full px-4 gap-2" role="alert">
            <p className="text-step-10 text-danger-ink text-center">{loadError}</p>
            {onRetryLoad && (
              <Button size="sm" variant="secondary" onClick={onRetryLoad}>
                {t("Retry")}</Button>
            )}
          </div>
        ) : jobs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full px-4 gap-2">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              className="text-text-5"
            >
              <rect
                x="2"
                y="2"
                width="20"
                height="20"
                rx="2.18"
                ry="2.18"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M7 2v20M17 2v20M2 12h20M2 7h5M2 17h5M17 17h5M17 7h5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <p className="text-step-10 text-text-5 text-center">{t("No renders yet")}</p>
          </div>
        ) : (
          <div>
            {completedCount > 0 && (
              <div className="flex items-center justify-between px-3 py-1.5 border-b border-border">
                <span className="text-step-10 text-text-4">
                  {t("{count} renders", { count: jobs.length })}
                </span>
                {/* "Hide", not "Clear": files stay on disk (delete is per-row
                    and confirmed); hidden rows don't resurrect on reload. */}
                <Tooltip label={t("Hide finished renders from this list (files stay on disk)")}>
                  <Button size="sm" variant="ghost" onClick={onClearCompleted}>
                    {t("Hide finished")}</Button>
                </Tooltip>
              </div>
            )}
            {jobs.map((job) => (
              <RenderQueueItem
                key={job.id}
                job={job}
                projectId={projectId}
                onDelete={() => onDelete(job.id)}
                onCancel={() => onCancel?.(job.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
});
