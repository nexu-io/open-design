import { useI18n } from "../../i18n/I18n";
import { buildProjectApiPath } from "../../utils/projectRouting";
import { useMemo, useRef, useState } from "react";
import { Plus, X } from "../../icons/SystemIcons";
import {
  buildDefaultGradientModel,
  insertGradientStop,
  parseGradient,
  serializeGradient,
  type GradientModel,
} from "./gradientValue";
import { ReverseGradientIcon } from "../icons/ReverseGradientIcon";
import { IMAGE_EXT } from "../../utils/mediaTypes";
import type { DomEditSelection } from "./domEditing";
import { FIELD, LABEL, RESPONSIVE_GRID } from "./propertyPanelHelpers";
import {
  DetailField,
  SelectField,
  SegmentedControl,
  SliderControl,
} from "./propertyPanelPrimitives";
import { ColorField } from "./propertyPanelColor";
import { useTrackDesignInput } from "../../contexts/DesignPanelInputContext";
import { encodeUrlPath } from "@hyperframes/parsers";

/* ------------------------------------------------------------------ */
/*  Asset path helpers                                                 */
/* ------------------------------------------------------------------ */

function normalizeProjectPath(value: string): string {
  const trimmed = value.trim();
  const maybeUrl = /^[a-z]+:\/\//i.test(trimmed) ? new URL(trimmed).pathname : trimmed;
  let decodedPath = maybeUrl;
  try {
    decodedPath = decodeURIComponent(maybeUrl);
  } catch (error) {
    if (!(error instanceof URIError)) throw error;
  }
  return decodedPath.replace(/\\/g, "/").replace(/^\.?\//, "");
}

function toRelativeProjectAssetPath(sourceFile: string, assetPath: string): string {
  const fromParts = normalizeProjectPath(sourceFile).split("/").filter(Boolean);
  const targetParts = normalizeProjectPath(assetPath).split("/").filter(Boolean);
  fromParts.pop();
  while (fromParts.length > 0 && targetParts.length > 0 && fromParts[0] === targetParts[0]) {
    fromParts.shift();
    targetParts.shift();
  }
  return [...fromParts.map(() => ".."), ...targetParts].join("/") || assetPath;
}

function toProjectRootAssetPath(assetPath: string): string {
  return normalizeProjectPath(assetPath);
}

function resolveSelectedAsset(
  imageUrl: string,
  sourceFile: string,
  assets: string[],
): string | null {
  const normalizedUrl = normalizeProjectPath(imageUrl);
  if (!normalizedUrl) return null;
  for (const asset of assets) {
    const normalizedAsset = normalizeProjectPath(asset);
    const relativeAsset = toRelativeProjectAssetPath(sourceFile, asset);
    if (
      normalizedUrl === normalizedAsset ||
      normalizedUrl === relativeAsset ||
      normalizedUrl.endsWith(`/${normalizedAsset}`) ||
      normalizedUrl.endsWith(`/${relativeAsset}`)
    ) {
      return asset;
    }
  }
  return null;
}

/* ------------------------------------------------------------------ */
/*  ImageFillField                                                     */
/* ------------------------------------------------------------------ */

export function ImageFillField({
  projectId,
  element,
  onSetHtmlAttribute,
  value,
  assets,
  disabled,
  onCommit,
  onImportAssets,
}: {
  projectId: string;
  element: DomEditSelection;
  onSetHtmlAttribute: (attr: string, value: string | null) => void | Promise<void>;
  value: string;
  assets: string[];
  disabled?: boolean;
  onCommit: (nextValue: string) => void;
  onImportAssets?: (files: FileList) => Promise<string[]>;
}) {
  const { t } = useI18n();
  const track = useTrackDesignInput();
  const sourceFile = element.sourceFile;
  const isImage = element.tagName === "img";
  const imageUrl = isImage ? (element.element.getAttribute("src") ?? "") : value;
  const commitImage = (next: string, projectAsset = false) => {
    if (isImage) {
      if (next)
        void onSetHtmlAttribute(
          "src",
          projectAsset ? toRelativeProjectAssetPath(sourceFile, next) : next,
        );
      return;
    }
    onCommit(next ? `url("${next}")` : "none");
  };
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const imageAssets = useMemo(() => assets.filter((a) => IMAGE_EXT.test(a)), [assets]);
  const selectedAsset = useMemo(
    () => resolveSelectedAsset(imageUrl, sourceFile, imageAssets),
    [imageAssets, sourceFile, imageUrl],
  );
  const externalUrlValue = selectedAsset ? "" : imageUrl;

  const handleUpload = async (files: FileList | null) => {
    if (!files?.length || !onImportAssets) return;
    setUploading(true);
    setUploadError(null);
    try {
      const uploaded = await onImportAssets(files);
      const nextImage = uploaded.find((a) => IMAGE_EXT.test(a));
      if (nextImage) {
        track("button", "Upload image");
        commitImage(toProjectRootAssetPath(nextImage), true);
      }
    } catch {
      setUploadError("Upload failed. Check the file and try again.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid min-w-0 gap-1.5">
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
          <span className={LABEL}>{t("Project asset")}</span>
          <button
            type="button"
            disabled={disabled || uploading}
            onClick={() => fileInputRef.current?.click()}
            className={`inline-flex h-7 max-w-full items-center gap-1.5 rounded-lg border border-neutral-700 bg-neutral-950 px-2.5 text-[11px] font-medium text-neutral-300 transition-colors ${
              disabled || uploading
                ? "cursor-not-allowed text-neutral-600"
                : "cursor-pointer hover:border-neutral-600 hover:text-text-0"
            }`}
          >
            <Plus size={12} className="shrink-0" />
            <span className="truncate">{uploading ? t("Uploading…") : t("Upload image")}</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            aria-label={t("Upload image asset")}
            disabled={disabled || uploading}
            className="hidden"
            onChange={async (event) => {
              await handleUpload(event.target.files);
              event.target.value = "";
            }}
          />
        </div>
        {uploadError && (
          <div className="text-[10px] text-danger-ink" role="alert">
            {uploadError}
          </div>
        )}
        {imageAssets.length > 0 ? (
          <div className="space-y-3">
            {selectedAsset && (
              <div className="overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900/80">
                <img
                  src={buildProjectApiPath(projectId, `/preview/${encodeUrlPath(selectedAsset)}`)}
                  alt={selectedAsset.split("/").pop() ?? selectedAsset}
                  className="h-28 w-full object-contain bg-neutral-950/80"
                />
              </div>
            )}
            <div className={FIELD}>
              <select
                value={selectedAsset ?? ""}
                disabled={disabled}
                onChange={(e) => {
                  const next = e.target.value;
                  track("select", "Project asset");
                  if (!next) {
                    commitImage("");
                    return;
                  }
                  commitImage(toProjectRootAssetPath(next), true);
                }}
                className="min-w-0 w-full appearance-none bg-transparent text-[11px] font-medium text-neutral-100 outline-hidden disabled:cursor-not-allowed disabled:text-neutral-600"
              >
                <option value="" disabled={isImage}>
                  {t("None")}</option>
                {imageAssets.map((asset) => (
                  <option key={asset} value={asset}>
                    {asset}
                  </option>
                ))}
              </select>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-neutral-800 bg-neutral-900/50 px-3 py-3 text-[11px] leading-5 text-neutral-500">
            {t("No image assets yet. Upload one here and Studio will also add it to the Assets tab.")}</div>
        )}
      </div>

      <DetailField
        label={t("External URL")}
        value={externalUrlValue}
        disabled={disabled}
        onCommit={(next) => commitImage(next.trim())}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  GradientField                                                      */
/* ------------------------------------------------------------------ */

export function GradientField({
  value,
  fallbackColor,
  disabled,
  onCommit,
}: {
  value: string;
  fallbackColor: string | undefined;
  disabled?: boolean;
  onCommit: (nextValue: string) => void;
}) {
  const { t } = useI18n();
  const track = useTrackDesignInput();
  const previewRef = useRef<HTMLDivElement | null>(null);
  const parsed = parseGradient(value) ?? buildDefaultGradientModel(fallbackColor);

  const commit = (next: GradientModel) => onCommit(serializeGradient(next));
  const patch = (partial: Partial<GradientModel>) => commit({ ...parsed, ...partial });

  const updateStop = (index: number, partial: Partial<GradientModel["stops"][number]>) => {
    const stops = parsed.stops.map((stop, i) => (i === index ? { ...stop, ...partial } : stop));
    commit({ ...parsed, stops });
  };

  const addStop = (position?: number) => {
    const nextGradient =
      position != null
        ? insertGradientStop(parsed, position)
        : insertGradientStop(
            parsed,
            parsed.stops.at(-1)?.position != null
              ? Math.min(100, (parsed.stops.at(-1)?.position ?? 90) + 10)
              : 100,
          );
    track("button", "Add gradient stop");
    commit(nextGradient);
  };

  const removeStop = (index: number) => {
    if (parsed.stops.length <= 2) return;
    track("button", `Remove gradient stop ${index + 1}`);
    commit({ ...parsed, stops: parsed.stops.filter((_, i) => i !== index) });
  };

  const previewStyle = { backgroundImage: serializeGradient(parsed) };

  return (
    <div className="space-y-4">
      <div className={`${FIELD} space-y-3 p-3`}>
        <div
          ref={previewRef}
          className="relative h-11 overflow-hidden rounded-lg border border-neutral-700"
          style={previewStyle}
          onClick={(event) => {
            if (disabled) return;
            const rect = previewRef.current?.getBoundingClientRect();
            if (!rect || rect.width <= 0) return;
            addStop(((event.clientX - rect.left) / rect.width) * 100);
          }}
        >
          {parsed.stops.map((stop, index) => (
            <div
              key={`stop-preview-${index}`}
              role="slider"
              tabIndex={disabled ? -1 : 0}
              aria-label={t("Stop {value0} position", { value0: index + 1 })}
              aria-valuenow={Math.round(stop.position)}
              aria-valuemin={0}
              aria-valuemax={100}
              onKeyDown={(event) => {
                if (disabled) return;
                if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
                event.preventDefault();
                const step = event.shiftKey ? 10 : 1;
                const delta = event.key === "ArrowRight" ? step : -step;
                updateStop(index, {
                  position: Math.max(0, Math.min(100, Math.round(stop.position + delta))),
                });
              }}
              className="absolute top-1/2 h-4 w-4 -translate-y-1/2 cursor-ew-resize rounded-full border-2 border-white/90 shadow-[0_0_0_1px_rgba(0,0,0,0.35)] outline-hidden focus-visible:ring-2 focus-visible:ring-studio-accent"
              style={{
                left: `calc(${stop.position}% - 8px)`,
                backgroundColor: stop.color,
              }}
              onClick={(event) => event.stopPropagation()}
              onPointerDown={(event) => {
                if (disabled) return;
                event.stopPropagation();
                event.currentTarget.setPointerCapture(event.pointerId);
              }}
              onPointerMove={(event) => {
                if (disabled || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
                const rect = previewRef.current?.getBoundingClientRect();
                if (!rect || rect.width <= 0) return;
                const next = Math.max(
                  0,
                  Math.min(100, ((event.clientX - rect.left) / rect.width) * 100),
                );
                updateStop(index, { position: Math.round(next * 10) / 10 });
              }}
              onPointerUp={(event) => {
                event.currentTarget.releasePointerCapture(event.pointerId);
              }}
              onPointerCancel={(event) => {
                event.currentTarget.releasePointerCapture(event.pointerId);
              }}
            />
          ))}
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <SegmentedControl
            trackName="Gradient type"
            disabled={disabled}
            value={parsed.kind}
            onChange={(next) => patch({ kind: next as GradientModel["kind"] })}
            options={[
              { label: "Linear", value: "linear" },
              { label: "Radial", value: "radial" },
              { label: "Conic", value: "conic" },
            ]}
          />
          <label className="flex items-center gap-2 text-[11px] font-medium text-neutral-400">
            <input
              type="checkbox"
              checked={parsed.repeating}
              disabled={disabled}
              onChange={(e) => {
                track("toggle", "Repeat gradient");
                patch({ repeating: e.target.checked });
              }}
              className="h-4 w-4 rounded-sm border-neutral-700 bg-neutral-950 text-accent-ink focus:ring-panel-accent"
            />
            {t("Repeat")}</label>
          <button
            type="button"
            disabled={disabled}
            onClick={() => {
              track("button", "Reverse gradient");
              commit({
                ...parsed,
                stops: [...parsed.stops].reverse().map((stop) => ({
                  ...stop,
                  position: 100 - stop.position,
                })),
              });
            }}
            className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-neutral-700 bg-neutral-950 px-2.5 text-[11px] font-medium text-neutral-300 transition-colors hover:border-neutral-600 hover:text-text-0 disabled:cursor-not-allowed disabled:text-neutral-600"
          >
            <ReverseGradientIcon size={16} />
            {t("Reverse")}</button>
        </div>
      </div>

      {(parsed.kind === "linear" || parsed.kind === "conic") && (
        <div className="grid gap-1.5">
          <span className={LABEL}>{parsed.kind === "linear" ? t("Angle") : t("Start angle")}</span>
          <SliderControl
            trackName={parsed.kind === "linear" ? "Angle" : "Start angle"}
            value={parsed.angle}
            min={0}
            max={360}
            step={1}
            disabled={disabled}
            displayValue={`${Math.round(parsed.angle)}°`}
            formatDisplayValue={(next) => `${Math.round(next)}°`}
            onCommit={(next) => patch({ angle: next })}
          />
        </div>
      )}

      {parsed.kind === "radial" && (
        <div className={RESPONSIVE_GRID}>
          <SelectField
            label={t("Shape")}
            value={parsed.shape}
            disabled={disabled}
            onChange={(next) => patch({ shape: next as GradientModel["shape"] })}
            options={["ellipse", "circle"]}
          />
          <SelectField
            label={t("Size")}
            value={parsed.radialSize}
            disabled={disabled}
            onChange={(next) => patch({ radialSize: next as GradientModel["radialSize"] })}
            options={["closest-side", "closest-corner", "farthest-side", "farthest-corner"]}
          />
        </div>
      )}

      {(parsed.kind === "radial" || parsed.kind === "conic") && (
        <div className={RESPONSIVE_GRID}>
          <div className="grid min-w-0 gap-1.5">
            <span className={LABEL}>{t("Center X")}</span>
            <SliderControl
              trackName="Center X"
              value={parsed.centerX}
              min={0}
              max={100}
              step={1}
              disabled={disabled}
              displayValue={`${Math.round(parsed.centerX)}%`}
              formatDisplayValue={(next) => `${Math.round(next)}%`}
              onCommit={(next) => patch({ centerX: next })}
            />
          </div>
          <div className="grid min-w-0 gap-1.5">
            <span className={LABEL}>{t("Center Y")}</span>
            <SliderControl
              trackName="Center Y"
              value={parsed.centerY}
              min={0}
              max={100}
              step={1}
              disabled={disabled}
              displayValue={`${Math.round(parsed.centerY)}%`}
              formatDisplayValue={(next) => `${Math.round(next)}%`}
              onCommit={(next) => patch({ centerY: next })}
            />
          </div>
        </div>
      )}

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className={LABEL}>{t("Stops")}</span>
          <button
            type="button"
            disabled={disabled || parsed.stops.length >= 6}
            onClick={() => addStop()}
            title={parsed.stops.length >= 6 ? t("Maximum 6 stops") : t("Add a gradient stop")}
            className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-neutral-700 bg-neutral-950 px-2.5 text-[11px] font-medium text-neutral-300 transition-colors hover:border-neutral-600 hover:text-text-0 active:scale-[0.98] disabled:cursor-not-allowed disabled:text-neutral-600"
          >
            <Plus size={12} />
            {t("Add stop")}</button>
        </div>
        <div className="space-y-3">
          {parsed.stops.map((stop, index) => (
            <div
              key={`stop-editor-${index}`}
              className="grid min-w-0 grid-cols-[minmax(0,1fr)_68px_28px] gap-2"
            >
              <ColorField
                label={t("Stop {value0}", { value0: index + 1 })}
                value={stop.color}
                disabled={disabled}
                onCommit={(next) => updateStop(index, { color: next })}
              />
              <DetailField
                label={t("Pos")}
                value={`${Math.round(stop.position)}%`}
                disabled={disabled}
                onCommit={(next) =>
                  updateStop(index, {
                    position: Number.parseFloat(next.replace("%", "")) || 0,
                  })
                }
              />
              <button
                type="button"
                disabled={disabled || parsed.stops.length <= 2}
                onClick={() => removeStop(index)}
                className="mt-[22px] flex h-10 items-center justify-center rounded-lg border border-neutral-700 bg-neutral-950 text-neutral-400 transition-colors hover:border-neutral-600 hover:text-text-0 disabled:cursor-not-allowed disabled:text-text-off"
                aria-label={t("Remove stop {value0}", { value0: index + 1 })}
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
