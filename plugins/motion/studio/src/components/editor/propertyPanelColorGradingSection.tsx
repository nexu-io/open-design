import { useI18n } from "../../i18n/I18n";
import { type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import { isHfColorGradingActive } from "@hyperframes/core/color-grading";
import { Compare, Palette, RotateCcw } from "../../icons/SystemIcons";
import type { DomEditSelection } from "./domEditing";
import { ColorGradingControls } from "./propertyPanelColorGradingControls";
import { Section } from "./propertyPanelPrimitives";
import {
  useColorGradingController,
  type MediaMetadata,
  type RuntimeColorGradingStatus,
} from "./useColorGradingController";
import { useTrackDesignInput } from "../../contexts/DesignPanelInputContext";

function StatusPill({ status }: { status: RuntimeColorGradingStatus }) {
  const dotClass =
    status.state === "active"
      ? "bg-accent"
      : status.state === "pending"
        ? "bg-warning-ink"
        : status.state === "unavailable"
          ? "bg-danger-ink"
          : "bg-panel-text-5";
  return (
    <div
      className="flex min-w-0 items-center gap-1.5 rounded-sm bg-panel-input px-2 py-1 text-[10px] font-medium text-panel-text-3"
      title={status.message}
    >
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dotClass}`} />
      <span className="truncate">{status.message}</span>
    </div>
  );
}

function HdrMediaWarning({ metadata }: { metadata: MediaMetadata | null }) {
  const { t } = useI18n();
  if (metadata?.color.dynamicRange !== "hdr") return null;
  const details = [
    metadata.color.codecName,
    metadata.color.profile,
    metadata.color.pixelFormat,
    metadata.color.colorPrimaries,
    metadata.color.colorTransfer,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="mb-3 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] leading-4 text-warning-ink">
      <div className="mb-1 flex min-w-0 items-center justify-between gap-2">
        <span className="font-semibold">{metadata.color.label} {t("source")}</span>
        <span className="rounded-sm bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-warning-ink">
          {t("SDR preview")}</span>
      </div>
      <p className="text-text-2">
        {t("These controls use the current SDR shader preview path. Render may stay HDR-tagged, but this is not true HDR color grading yet.")}</p>
      {details && <p className="mt-1 truncate text-[10px] text-text-muted">{details}</p>}
    </div>
  );
}

function HoldBeforeButton({
  active,
  disabled,
  onHoldChange,
}: {
  active: boolean;
  disabled: boolean;
  onHoldChange: (holding: boolean) => void;
}) {
  const { t } = useI18n();
  const track = useTrackDesignInput();
  const startHold = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (disabled) return;
    event.preventDefault();
    event.stopPropagation();
    track("toggle", "Compare original");
    onHoldChange(true);
    const release = () => {
      onHoldChange(false);
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", release);
      window.removeEventListener("blur", release);
    };
    window.addEventListener("pointerup", release);
    window.addEventListener("pointercancel", release);
    window.addEventListener("blur", release);
  };
  const stopHold = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (disabled) return;
    event.preventDefault();
    event.stopPropagation();
    onHoldChange(false);
  };

  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={active}
      aria-label={t("Hold to show original")}
      onPointerDown={startHold}
      onPointerUp={stopHold}
      onPointerCancel={stopHold}
      onBlur={() => {
        if (active) onHoldChange(false);
      }}
      onKeyDown={(event) => {
        if (disabled || (event.key !== " " && event.key !== "Enter")) return;
        event.preventDefault();
        if (!active) {
          track("toggle", "Compare original");
          onHoldChange(true);
        }
      }}
      onKeyUp={(event) => {
        if (disabled || (event.key !== " " && event.key !== "Enter")) return;
        event.preventDefault();
        onHoldChange(false);
      }}
      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded transition-colors ${
        active
          ? "bg-studio-accent text-on-accent"
          : "text-panel-text-4 hover:bg-panel-hover hover:text-panel-text-1"
      } disabled:cursor-not-allowed disabled:opacity-40`}
      title={t("Hold to show original")}
    >
      <Compare size={13} />
    </button>
  );
}

export function ColorGradingSection({
  projectId,
  element,
  assets,
  previewIframeRef,
  onImportAssets,
  onSetAttributeLive,
  onApplyScope,
}: {
  projectId: string;
  element: DomEditSelection;
  assets: string[];
  previewIframeRef?: RefObject<HTMLIFrameElement | null>;
  onImportAssets?: (files: FileList, dir?: string) => Promise<string[]>;
  onSetAttributeLive: (
    attr: string,
    value: string | null,
    onSettled?: (ok: boolean) => void,
  ) => void | Promise<void>;
  onApplyScope?: (
    scope: "source-file" | "project",
    value: string | null,
  ) => Promise<{ changedFiles: number; changedElements: number }>;
}) {
  const { t } = useI18n();
  const track = useTrackDesignInput();
  const {
    grading,
    compareEnabled,
    applyScope,
    applyBusy,
    runtimeStatus,
    mediaMetadata,
    commitColorGrading,
    commitCompare,
    setApplyScope,
    applyToScope,
    resetGrading,
  } = useColorGradingController({
    projectId,
    element,
    previewIframeRef,
    onSetAttributeLive,
    onApplyScope,
  });

  return (
    <Section
      title={t("Color grading")}
      icon={<Palette size={15} />}
      accessory={
        <div className="flex min-w-0 items-center gap-1.5">
          <HoldBeforeButton
            active={compareEnabled}
            disabled={!isHfColorGradingActive(grading)}
            onHoldChange={commitCompare}
          />
          <StatusPill status={runtimeStatus} />
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              track("button", "Reset color grading");
              resetGrading();
            }}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-sm text-panel-text-4 transition-colors hover:bg-panel-hover hover:text-panel-text-1"
            title={t("Reset color grading")}
          >
            <RotateCcw size={12} />
          </button>
        </div>
      }
    >
      <HdrMediaWarning metadata={mediaMetadata} />
      <ColorGradingControls
        grading={grading}
        assets={assets}
        onImportAssets={onImportAssets}
        onCommitColorGrading={commitColorGrading}
      />
      {onApplyScope && (
        <div className="mt-4 grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-2">
          <select
            value={applyScope}
            onChange={(event) => {
              track("select", "Apply scope");
              setApplyScope(event.currentTarget.value as typeof applyScope);
            }}
            disabled={applyBusy}
            className="w-full min-w-0 rounded-md bg-panel-input px-3 py-2 text-[11px] font-medium text-panel-text-1 outline-hidden disabled:cursor-not-allowed disabled:opacity-50"
            title={t("Choose where to copy these color grading settings")}
          >
            <option value="source-file">{t("Current file media")}</option>
            <option value="project">{t("All project media")}</option>
          </select>
          <button
            type="button"
            disabled={applyBusy}
            onClick={(event) => {
              event.stopPropagation();
              track("button", "Apply color grading scope");
              void applyToScope();
            }}
            className="h-8 rounded-md bg-panel-input px-3 text-[11px] font-medium text-panel-text-2 transition-colors hover:bg-panel-hover hover:text-panel-text-1 disabled:cursor-not-allowed disabled:opacity-50"
            title={t("Copy these color grading settings to the selected scope")}
          >
            {applyBusy ? t("Applying") : t("Apply")}
          </button>
        </div>
      )}
    </Section>
  );
}
