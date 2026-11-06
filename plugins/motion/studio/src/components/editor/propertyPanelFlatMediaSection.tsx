import { useI18n } from "../../i18n/I18n";
import { useEffect, useState } from "react";
import { isVideoAudible } from "../../player/lib/timelineElementHelpers";
import { useTrackDesignInput } from "../../contexts/DesignPanelInputContext";
import { Check, ClipboardList } from "../../icons/SystemIcons";
import type { DomEditSelection } from "./domEditing";
import {
  type BackgroundRemovalProgress,
  type BackgroundRemovalResult,
  formatNumericValue,
  formatTimingValue,
  parseNumericValue,
  readClipInPoint,
} from "./propertyPanelHelpers";
import { FlatSelectRow, FlatSlider } from "./propertyPanelFlatPrimitives";
import { FlatToggle } from "./propertyPanelFlatToggle";
import { AutomationToggle } from "./propertyPanelFxControls";
import { RATE_RANGE } from "@hyperframes/core/audio-automation";
import { type SpeedPresetId } from "@hyperframes/core/speed-ramp";
import { SPEED_PRESET_OPTIONS, type RateBinding } from "./useVolumeAutomation";
import { fromUnit, toUnit } from "../../player/components/automationLaneGeometry";
import {
  AUDIO_GAIN_FADER_MAX,
  AUDIO_GAIN_FADER_MIN,
  audioFaderPositionToGain,
  formatAudioGain,
  audioGainToFaderPosition,
  audioGainToText,
} from "@hyperframes/core/audio-gain";
import {
  HF_AUDIO_FADE_IN_DATA_KEY,
  HF_AUDIO_FADE_OUT_DATA_KEY,
  clampFadesToDuration,
  formatFadeSeconds,
  readFadeSeconds,
} from "@hyperframes/core/audio-fade";
import { parseGainInput, parseRateInput, parseSecondsInput } from "./audioInspectorInput";
import type { CommitDomAttributeBatch } from "../../hooks/domEditCommitTypes";
import { commitCutout, commitHasAudioToggle, commitMutedToggle } from "./mediaAudioEdits";
import { authoredSrcPath } from "../../player/components/thumbnailUtils";

// fallow-ignore-next-line complexity
export function FlatMediaSection({
  projectId = null,
  projectDir,
  element,
  styles,
  onSetStyle,
  onSetAttribute,
  onSetHtmlAttribute,
  onSetAttributeBatch,
  onRemoveBackground,
  volumeAutomated,
  onAutomateVolume,
  onRemoveVolumeAutomation,
  onCommitVolumeAt,
  automatedVolumeValue,
  rate,
}: {
  projectId?: string | null;
  projectDir: string | null;
  element: DomEditSelection;
  styles: Record<string, string>;
  onSetStyle: (prop: string, value: string) => void | Promise<unknown>;
  onSetAttribute: (attr: string, value: string) => void | Promise<void>;
  onSetHtmlAttribute: (attr: string, value: string | null) => void | Promise<void>;
  onSetAttributeBatch: CommitDomAttributeBatch;
  /** A volume lane in the timeline drives the level; the Volume slider writes a keyframe. */
  volumeAutomated?: boolean;
  onAutomateVolume?: () => void;
  onRemoveVolumeAutomation?: () => void;
  onCommitVolumeAt?: (v: number) => void;
  automatedVolumeValue?: number;
  /** Speed lane binding and presets; absent outside the Studio panel. */
  rate?: RateBinding;
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
  const isVideo = element.tagName === "video";
  const isAudio = element.tagName === "audio";
  const isImage = element.tagName === "img";
  const isVisualMedia = isVideo || isImage;
  const el = element.element;

  // Gain is `data-volume`, ahead of the effects; Volume is the lane's level at the
  // playhead, unity without one. What plays is gain times level, as in an editor.
  const gain = parseNumericValue(element.dataAttributes.volume ?? "") ?? 1;
  const volume = volumeAutomated && automatedVolumeValue !== undefined ? automatedVolumeValue : 1;
  const { mediaStart, mediaStartAttr } = readClipInPoint(element.dataAttributes);
  const constantRate = Number.parseFloat(element.dataAttributes["playback-rate"] ?? "1") || 1;
  const playbackRate =
    rate?.automated && rate.automatedValue !== undefined ? rate.automatedValue : constantRate;
  const sourceDuration =
    Number.parseFloat(element.dataAttributes["source-duration"] ?? "") ||
    (el as HTMLMediaElement).duration ||
    0;
  const mediaStartMax = Math.max(30, Math.ceil(sourceDuration || mediaStart + 10));
  const fadeIn = readFadeSeconds(element.dataAttributes[HF_AUDIO_FADE_IN_DATA_KEY]);
  const fadeOut = readFadeSeconds(element.dataAttributes[HF_AUDIO_FADE_OUT_DATA_KEY]);
  const clipDuration = Number.parseFloat(element.dataAttributes.duration ?? "") || 0;
  const fadeMax = clipDuration > 0 ? clipDuration : 10;
  const hasLoop = el.hasAttribute("loop");
  const hasMuted = el.hasAttribute("muted");
  const hasAudio = isVideoAudible({
    tag: el.tagName,
    hasAudioAttr: element.dataAttributes["has-audio"],
    muted: el.hasAttribute("muted"),
  });
  const objectFit = styles["object-fit"] || "contain";
  const objectPosition = styles["object-position"] || "center";

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
    <div className="space-y-1.5">
      <div className="flex min-h-8 items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2">
          <span className="h-5 w-8 shrink-0 rounded-[3px] bg-panel-surface" />
          <span className="min-w-0 truncate font-mono text-[11px] text-panel-text-0">
            {srcAttr}
          </span>
        </span>
        <button
          type="button"
          data-flat-media-copy="true"
          onClick={() => {
            track("button", "Copy media path");
            void navigator.clipboard.writeText(absoluteSrc).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            });
          }}
          className="flex shrink-0 items-center gap-1 text-[10px] text-panel-text-3 hover:text-panel-text-1"
        >
          {copied ? <Check size={11} /> : <ClipboardList size={11} />}
          {copied ? t("Copied") : t("Copy")}
        </button>
      </div>
      {isVisualMedia && (
        <div className="ml-px border-l-2 border-panel-border-input py-1 pl-[10px]">
          <div className="flex min-h-6 items-center justify-between">
            <span className="flex items-baseline gap-[7px]">
              <span className="text-[11px] font-semibold text-panel-text-1">{t("Cutout")}</span>
              <span className="font-mono text-[9px] text-panel-text-4">
                {t("transparent")}{" "}{isVideo ? "WebM" : "PNG"}
              </span>
            </span>
            <button
              type="button"
              data-flat-media-remove-bg="true"
              disabled={!canRemoveBackground || removeBusy}
              onClick={() => void runBackgroundRemoval()}
              className="flex items-center gap-1 text-[10px] font-medium text-accent-ink disabled:cursor-not-allowed disabled:opacity-50"
              title={
                canRemoveBackground
                  ? t("Remove background and save a transparent asset")
                  : t("Select a project-local image or video asset")
              }
            >
              {removeBusy ? t("Working") : t("Remove BG")}
            </button>
          </div>
          <FlatSelectRow
            label={t("Quality")}
            value={quality}
            options={["fast", "balanced", "best"]}
            tier="explicitDefault"
            onChange={(next) => setQuality(next as typeof quality)}
          />
          {isVideo && (
            <FlatToggle label={t("BG plate")} checked={createPlate} onChange={setCreatePlate} />
          )}
          {removeProgress && (
            <div className="mt-1 space-y-1">
              <div className="flex items-center justify-between text-[10px] text-panel-text-4">
                <span className="min-w-0 flex-1 truncate">
                  {removeProgress.error ?? removeProgress.stage ?? "Processing"}
                </span>
                <span>{Math.round(removeProgress.progress)}%</span>
              </div>
              <div className="h-1 overflow-hidden rounded-full bg-panel-hover">
                <div
                  className={`h-full rounded-full ${
                    removeProgress.status === "failed" ? "bg-danger-ink" : "bg-panel-accent"
                  }`}
                  style={{ width: `${Math.max(0, Math.min(100, removeProgress.progress))}%` }}
                />
              </div>
            </div>
          )}
        </div>
      )}
      {(isVideo || isAudio) && (
        <>
          <FlatSlider
            label={t("Gain")}
            value={audioGainToFaderPosition(gain)}
            min={AUDIO_GAIN_FADER_MIN}
            max={AUDIO_GAIN_FADER_MAX}
            tier={gain === 1 ? "default" : "explicitCustom"}
            displayValue={audioGainToText(gain)}
            centerTick
            onCommit={(next) =>
              void onSetAttribute("volume", formatAudioGain(audioFaderPositionToGain(next)))
            }
            onCommitText={(text) => {
              const next = parseGainInput(text);
              if (next === null) return false;
              void onSetAttribute("volume", formatAudioGain(next));
              return true;
            }}
          />
          {/* A commit writes a keyframe at the playhead, starting a lane when there is none. */}
          <div
            className="hf-volume-row flex items-center gap-1"
            data-volume-automated={volumeAutomated ? "" : undefined}
          >
            <div className="min-w-0 flex-1">
              <FlatSlider
                label={t("Volume")}
                value={audioGainToFaderPosition(volume)}
                min={AUDIO_GAIN_FADER_MIN}
                max={AUDIO_GAIN_FADER_MAX}
                tier={volume === 1 ? "default" : "explicitCustom"}
                displayValue={audioGainToText(volume)}
                centerTick
                onCommit={(next) => onCommitVolumeAt?.(audioFaderPositionToGain(next))}
                onCommitText={(text) => {
                  const next = parseGainInput(text);
                  if (next === null) return false;
                  onCommitVolumeAt?.(next);
                  return true;
                }}
              />
            </div>
            <AutomationToggle
              paramKey="volume"
              label={t("Volume")}
              automated={Boolean(volumeAutomated)}
              onAutomate={onAutomateVolume ? () => onAutomateVolume() : undefined}
              onRemoveAutomation={
                onRemoveVolumeAutomation ? () => onRemoveVolumeAutomation() : undefined
              }
            />
          </div>
          <div className="flex items-center gap-1">
            <div className="min-w-0 flex-1">
              <FlatSlider
                label={t("Speed")}
                value={Math.round(toUnit(RATE_RANGE, playbackRate) * 1000)}
                min={0}
                max={1000}
                tier={playbackRate === 1 ? "default" : "explicitCustom"}
                displayValue={`${formatNumericValue(playbackRate)}x`}
                onCommit={(next) => {
                  const speed = fromUnit(RATE_RANGE, next / 1000);
                  if (rate?.automated) {
                    rate.onCommitAt(speed);
                  } else {
                    void onSetAttribute("playback-rate", formatNumericValue(speed));
                  }
                }}
                onCommitText={(text) => {
                  const speed = parseRateInput(text);
                  if (speed === null) return false;
                  if (rate?.automated) rate.onCommitAt(speed);
                  else void onSetAttribute("playback-rate", formatNumericValue(speed));
                  return true;
                }}
              />
            </div>
            <AutomationToggle
              paramKey="rate"
              label={t("Speed")}
              automated={Boolean(rate?.automated)}
              onAutomate={rate ? () => rate.onAutomate() : undefined}
              onRemoveAutomation={rate ? () => rate.onRemoveAutomation() : undefined}
            />
          </div>
          {/* Speed presets are picture-driven ramps (slow-mo reveals, whip
              speed-ups); on a bare audio clip they only warp pitch, so the
              row is video-only. */}
          {rate?.canApplyPreset && !isAudio && (
            <FlatSelectRow
              label={t("Speed preset")}
              value=""
              options={[{ value: "", label: "Choose…" }, ...SPEED_PRESET_OPTIONS]}
              tier="default"
              onChange={(id) => id && rate.onApplyPreset(id as SpeedPresetId)}
            />
          )}
          <FlatSlider
            label={t("Media start")}
            value={Math.round(mediaStart * 100)}
            min={0}
            max={mediaStartMax * 100}
            tier={mediaStart === 0 ? "default" : "explicitCustom"}
            displayValue={formatTimingValue(mediaStart)}
            onCommit={(next) => void onSetAttribute(mediaStartAttr, (next / 100).toFixed(2))}
            onCommitText={(text) => {
              const seconds = parseSecondsInput(text);
              if (seconds === null) return false;
              void onSetAttribute(mediaStartAttr, Math.min(seconds, mediaStartMax).toFixed(2));
              return true;
            }}
          />
          {(isAudio || hasAudio) && (
            <MediaFadeSliders
              fadeIn={fadeIn}
              fadeOut={fadeOut}
              fadeMax={fadeMax}
              onSetAttribute={onSetAttribute}
            />
          )}
          <FlatToggle
            label={t("Loop")}
            checked={hasLoop}
            onChange={(next) => void onSetHtmlAttribute("loop", next ? "true" : null)}
          />
          <FlatToggle
            label={t("Muted")}
            checked={hasMuted}
            onChange={(next) => void commitMutedToggle(mediaEdit, next)}
          />
          {isVideo && (
            <FlatToggle
              label={t("Has audio track")}
              checked={hasAudio}
              onChange={(next) => void commitHasAudioToggle(mediaEdit, next)}
            />
          )}
        </>
      )}
      {isVisualMedia && (
        <>
          <FlatSelectRow
            label={t("Fit")}
            value={objectFit}
            options={["contain", "cover", "fill", "none", "scale-down"]}
            tier={objectFit === "contain" ? "default" : "explicitCustom"}
            onChange={(next) => void onSetStyle("object-fit", next)}
          />
          <FlatSelectRow
            label={t("Position")}
            value={objectPosition}
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
            tier={objectPosition === "center" ? "default" : "explicitCustom"}
            onChange={(next) => void onSetStyle("object-position", next)}
          />
        </>
      )}
    </div>
  );
}

function MediaFadeSliders({
  fadeIn,
  fadeOut,
  fadeMax,
  onSetAttribute,
}: {
  fadeIn: number;
  fadeOut: number;
  fadeMax: number;
  onSetAttribute: (attr: string, value: string) => void | Promise<void>;
}) {
  const { t } = useI18n();
  const fadeText = (seconds: number) => (seconds > 0 ? formatFadeSeconds(seconds) : "");
  return (["in", "out"] as const).map((edge) => {
    const seconds = edge === "in" ? fadeIn : fadeOut;
    const dataKey = edge === "in" ? HF_AUDIO_FADE_IN_DATA_KEY : HF_AUDIO_FADE_OUT_DATA_KEY;
    const edgeMax = Math.max(0, fadeMax - (edge === "in" ? fadeOut : fadeIn));
    return (
      <FlatSlider
        key={edge}
        label={t("Fade {edge}", { edge: edge })}
        value={Math.round(seconds * 100)}
        min={0}
        max={Math.round(edgeMax * 100)}
        tier={seconds === 0 ? "default" : "explicitCustom"}
        displayValue={formatTimingValue(seconds)}
        onCommit={(next) => void onSetAttribute(dataKey, fadeText(next / 100))}
        onCommitText={(text) => {
          const parsed = parseSecondsInput(text);
          if (parsed === null) return false;
          const next = Math.min(parsed, edgeMax);
          const bounded = clampFadesToDuration(
            { fadeIn: edge === "in" ? next : fadeIn, fadeOut: edge === "out" ? next : fadeOut },
            fadeMax,
          );
          void onSetAttribute(dataKey, fadeText(edge === "in" ? bounded.fadeIn : bounded.fadeOut));
          return true;
        }}
        onReset={seconds > 0 ? () => void onSetAttribute(dataKey, "") : undefined}
      />
    );
  });
}
