import { useI18n } from "../../i18n/I18n";
import { useEffect, useState } from "react";
import { isVideoAudible } from "../../player/lib/timelineElementHelpers";
import { Check, ClipboardList, Film, Music, Scissors } from "../../icons/SystemIcons";
import type { DomEditSelection } from "./domEditing";
import {
  type BackgroundRemovalProgress,
  type BackgroundRemovalResult,
  formatNumericValue,
  formatTimingValue,
  LABEL,
  parseNumericValue,
  readClipInPoint,
  RESPONSIVE_GRID,
} from "./propertyPanelHelpers";
import { Section, SegmentedControl, SelectField, SliderControl } from "./propertyPanelPrimitives";
import { useTrackDesignInput } from "../../contexts/DesignPanelInputContext";
import {
  AUDIO_GAIN_FADER_MAX,
  AUDIO_GAIN_FADER_MIN,
  audioFaderPositionToGain,
  formatAudioGain,
  audioGainToFaderPosition,
  audioGainToText,
} from "@hyperframes/core/audio-gain";
import type { CommitDomAttributeBatch } from "../../hooks/domEditCommitTypes";
import { useLinkedSpeedCommit, withLinkedPlaybackRate } from "./linkedSpeedEdits";
import { commitCutout, commitHasAudioToggle, commitMutedToggle } from "./mediaAudioEdits";
import { authoredSrcPath } from "../../player/components/thumbnailUtils";

// fallow-ignore-next-line complexity
export function MediaSection({
  projectId = null,
  projectDir,
  element,
  styles,
  onSetStyle,
  onSetAttribute,
  onSetHtmlAttribute,
  onSetAttributeBatch,
  onRemoveBackground,
}: {
  projectId?: string | null;
  projectDir: string | null;
  element: DomEditSelection;
  styles: Record<string, string>;
  onSetStyle: (prop: string, value: string) => void | Promise<unknown>;
  onSetAttribute: (attr: string, value: string) => void | Promise<void>;
  onSetHtmlAttribute: (attr: string, value: string | null) => void | Promise<void>;
  onSetAttributeBatch: CommitDomAttributeBatch;
  onRemoveBackground?: (
    inputPath: string,
    options: {
      createBackgroundPlate?: boolean;
      quality?: "fast" | "balanced" | "best";
      onProgress?: (progress: BackgroundRemovalProgress) => void;
    },
  ) => Promise<BackgroundRemovalResult>;
}) {
  const { t } = useI18n();
  const track = useTrackDesignInput();
  const setRate = withLinkedPlaybackRate(
    onSetAttribute,
    useLinkedSpeedCommit(element, onSetAttributeBatch),
  );
  const isVideo = element.tagName === "video";
  const isAudio = element.tagName === "audio";
  const isImage = element.tagName === "img";
  const isVisualMedia = isVideo || isImage;
  const el = element.element;

  const volume = parseNumericValue(element.dataAttributes.volume ?? "") ?? 1;
  const volumeFaderPosition = audioGainToFaderPosition(volume);

  const { mediaStart, mediaStartAttr } = readClipInPoint(element.dataAttributes);

  const hasLoop = el.hasAttribute("loop");
  const hasMuted = el.hasAttribute("muted");
  const hasAudio = isVideoAudible({
    tag: el.tagName,
    hasAudioAttr: element.dataAttributes["has-audio"],
    muted: el.hasAttribute("muted"),
  });

  const playbackRate = Number.parseFloat(element.dataAttributes["playback-rate"] ?? "1") || 1;

  const objectFit = styles["object-fit"] || "contain";
  const objectPosition = styles["object-position"] || "center";

  const sourceDuration =
    Number.parseFloat(element.dataAttributes["source-duration"] ?? "") ||
    (el as HTMLMediaElement).duration ||
    0;
  const mediaStartMax = Math.max(30, Math.ceil(sourceDuration || mediaStart + 10));

  const srcAttr = el.getAttribute("src") ?? "";
  const [copied, setCopied] = useState(false);
  const [removeBusy, setRemoveBusy] = useState(false);
  const [removeProgress, setRemoveProgress] = useState<BackgroundRemovalProgress | null>(null);
  const [createPlate, setCreatePlate] = useState(false);
  const [quality, setQuality] = useState<"fast" | "balanced" | "best">("balanced");

  const projectSrc =
    srcAttr && !/^(?:https?:|data:|blob:)/i.test(srcAttr)
      ? authoredSrcPath(srcAttr.startsWith("./") ? srcAttr.slice(2) : srcAttr)
      : "";
  const absoluteSrc = projectDir && projectSrc ? `${projectDir}/${projectSrc}` : srcAttr;
  const canRemoveBackground = Boolean(onRemoveBackground && isVisualMedia && projectSrc);
  const panelTitle = isImage ? "Image" : isVideo ? "Video" : "Audio";

  useEffect(() => {
    setRemoveProgress(null);
    setCreatePlate(false);
  }, [srcAttr]);

  const mediaEdit = { element, projectId, projectSrc, commit: onSetAttributeBatch };

  const runBackgroundRemoval = async () => {
    if (!onRemoveBackground || !projectSrc || removeBusy) return;
    track("button", "Remove background");
    setRemoveBusy(true);
    setRemoveProgress({ status: "processing", progress: 0, stage: "Preparing" });
    try {
      const result = await onRemoveBackground(projectSrc, {
        createBackgroundPlate: isVideo && createPlate,
        quality,
        onProgress: setRemoveProgress,
      });
      const stage = await commitCutout(mediaEdit, result.outputPath, hasAudio);
      setRemoveProgress({ status: "complete", progress: 100, stage, ...result });
    } catch (error) {
      setRemoveProgress({
        status: "failed",
        progress: 0,
        stage: "Failed",
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setRemoveBusy(false);
    }
  };

  return (
    <Section title={panelTitle} icon={isAudio ? <Music size={15} /> : <Film size={15} />}>
      <div className="space-y-4">
        {srcAttr && (
          <div className="min-w-0">
            <div className="flex items-center justify-between gap-2">
              <div className="text-[11px] font-medium text-neutral-500">{t("Source")}</div>
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard.writeText(absoluteSrc).then(() => {
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  });
                }}
                className="flex h-6 items-center gap-1 rounded-lg border border-neutral-700 bg-neutral-950 px-2 text-[10px] font-medium text-neutral-400 transition-colors hover:border-neutral-600 hover:text-neutral-200"
              >
                {copied ? <Check size={11} /> : <ClipboardList size={11} />}
                <span>{copied ? t("Copied") : t("Copy")}</span>
              </button>
            </div>
            <div
              className="mt-1 truncate text-[11px] font-medium text-neutral-300"
              title={absoluteSrc}
            >
              {absoluteSrc}
            </div>
          </div>
        )}

        {isVisualMedia && (
          <div className="grid min-w-0 max-w-full gap-2 overflow-hidden rounded-md bg-panel-input/30 p-2">
            <div className="flex min-w-0 items-center justify-between gap-2">
              <div className="min-w-0">
                <div className={LABEL}>{t("Cutout")}</div>
                <div className="mt-0.5 truncate text-[10px] text-panel-text-4">
                  {t("Create transparent")}{" "}{isVideo ? t("WebM video") : t("PNG image")}
                </div>
              </div>
              <button
                type="button"
                disabled={!canRemoveBackground || removeBusy}
                onClick={(event) => {
                  event.stopPropagation();
                  void runBackgroundRemoval();
                }}
                className="flex h-8 shrink-0 items-center gap-1.5 rounded-md bg-panel-input px-2.5 text-[11px] font-medium text-panel-text-2 transition-colors hover:bg-panel-hover hover:text-panel-text-1 disabled:cursor-not-allowed disabled:opacity-50"
                title={
                  canRemoveBackground
                    ? t("Remove background and save a transparent asset")
                    : t("Select a project-local image or video asset")
                }
              >
                <Scissors size={13} />
                <span>{removeBusy ? t("Working") : t("Remove BG")}</span>
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <SelectField
                label={t("Quality")}
                value={quality}
                onChange={(next) => setQuality(next as typeof quality)}
                options={["fast", "balanced", "best"]}
              />
              {isVideo ? (
                <div className="grid min-w-0 gap-1.5">
                  <span className={LABEL}>{t("BG plate")}</span>
                  <SegmentedControl
                    trackName="BG plate"
                    value={createPlate ? "on" : "off"}
                    onChange={(next) => setCreatePlate(next === "on")}
                    options={[
                      { label: "On", value: "on" },
                      { label: "Off", value: "off" },
                    ]}
                  />
                  <span className="text-[10px] leading-tight text-panel-text-4">
                    {t("Optional hole-cut background copy.")}</span>
                </div>
              ) : (
                <div />
              )}
            </div>

            {removeProgress && (
              <div className="space-y-1">
                <div className="flex min-w-0 items-center justify-between gap-2 text-[10px] text-panel-text-4">
                  <span className="min-w-0 flex-1 truncate">
                    {removeProgress.error ?? removeProgress.stage ?? "Processing"}
                  </span>
                  <span>{Math.round(removeProgress.progress)}%</span>
                </div>
                <div className="h-1 overflow-hidden rounded-full bg-panel-border">
                  <div
                    className={`h-full rounded-full ${
                      removeProgress.status === "failed" ? "bg-danger-ink" : "bg-studio-accent"
                    }`}
                    style={{ width: `${Math.max(0, Math.min(100, removeProgress.progress))}%` }}
                  />
                </div>
              </div>
            )}

            {removeProgress?.status === "complete" && removeProgress.outputPath && (
              <div
                className="truncate text-[10px] font-medium text-panel-text-3"
                title={removeProgress.outputPath}
              >
                {t("Applied")}{" "}{removeProgress.outputPath}
              </div>
            )}
          </div>
        )}

        {(isVideo || isAudio) && (
          <>
            <div className="grid min-w-0 gap-1.5">
              <span className={LABEL}>{t("Volume")}</span>
              <SliderControl
                trackName="Volume"
                value={volumeFaderPosition}
                min={AUDIO_GAIN_FADER_MIN}
                max={AUDIO_GAIN_FADER_MAX}
                step={1}
                displayValue={audioGainToText(volume)}
                formatDisplayValue={(next) => audioGainToText(audioFaderPositionToGain(next))}
                onCommit={(next) => {
                  void onSetAttribute("volume", formatAudioGain(audioFaderPositionToGain(next)));
                }}
              />
            </div>

            <div className="grid min-w-0 gap-1.5">
              <span className={LABEL}>{t("Playback rate")}</span>
              <SliderControl
                trackName="Playback rate"
                value={playbackRate * 100}
                min={25}
                max={300}
                step={5}
                displayValue={`${formatNumericValue(playbackRate)}x`}
                formatDisplayValue={(next) => `${formatNumericValue(next / 100)}x`}
                onCommit={(next) => {
                  void setRate("playback-rate", formatNumericValue(next / 100));
                }}
              />
            </div>

            <div className="grid min-w-0 gap-1.5">
              <span className={LABEL}>{t("Media start")}</span>
              <SliderControl
                trackName="Media start"
                value={Math.round(mediaStart * 100)}
                min={0}
                max={mediaStartMax * 100}
                step={10}
                displayValue={formatTimingValue(mediaStart)}
                formatDisplayValue={(next) => formatTimingValue(next / 100)}
                onCommit={(next) => {
                  void onSetAttribute(mediaStartAttr, (next / 100).toFixed(2));
                }}
              />
            </div>

            <div className={RESPONSIVE_GRID}>
              <div className="grid min-w-0 gap-1.5">
                <span className={LABEL}>{t("Loop")}</span>
                <SegmentedControl
                  trackName="Loop"
                  value={hasLoop ? "on" : "off"}
                  onChange={(next) => {
                    void onSetHtmlAttribute("loop", next === "on" ? "true" : null);
                  }}
                  options={[
                    { label: "On", value: "on" },
                    { label: "Off", value: "off" },
                  ]}
                />
              </div>
              <div className="grid min-w-0 gap-1.5">
                <span className={LABEL}>{t("Muted")}</span>
                <SegmentedControl
                  trackName="Muted"
                  value={hasMuted ? "on" : "off"}
                  onChange={(next) => void commitMutedToggle(mediaEdit, next === "on")}
                  options={[
                    { label: "On", value: "on" },
                    { label: "Off", value: "off" },
                  ]}
                />
              </div>
            </div>

            {isVideo && (
              <div className="grid min-w-0 gap-1.5">
                <span className={LABEL}>{t("Has audio track")}</span>
                <SegmentedControl
                  trackName="Has audio track"
                  value={hasAudio ? "yes" : "no"}
                  onChange={(next) => void commitHasAudioToggle(mediaEdit, next === "yes")}
                  options={[
                    { label: "Yes", value: "yes" },
                    { label: "No", value: "no" },
                  ]}
                />
              </div>
            )}
          </>
        )}

        {isVisualMedia && (
          <>
            <div className={RESPONSIVE_GRID}>
              <SelectField
                label={t("Fit")}
                value={objectFit}
                onChange={(next) => {
                  void onSetStyle("object-fit", next);
                }}
                options={["contain", "cover", "fill", "none", "scale-down"]}
              />
              <SelectField
                label={t("Position")}
                value={objectPosition}
                onChange={(next) => {
                  void onSetStyle("object-position", next);
                }}
                options={[
                  "center",
                  "top",
                  "bottom",
                  "left",
                  "right",
                  "left top",
                  "right top",
                  "left bottom",
                  "right bottom",
                ]}
              />
            </div>
          </>
        )}
      </div>
    </Section>
  );
}
