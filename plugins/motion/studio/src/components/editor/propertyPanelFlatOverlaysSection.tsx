import { useI18n } from "../../i18n/I18n";
import { useState } from "react";
import type { RegistryItem } from "@hyperframes/core/registry";
import { useBlockCatalog } from "../../hooks/useBlockCatalog";
import { Film, Plus } from "../../icons/SystemIcons";
import { useTrackDesignInput } from "../../contexts/DesignPanelInputContext";
import type { DomEditSelection } from "./domEditing";
import { FLAT_PREVIEW_GRID } from "./propertyPanelFlatPrimitives";
import type { ElementTiming } from "./propertyPanelFlatTimingDerivation";

export const MEDIA_TREATMENT_OVERLAY_TAG = "media-treatment-overlay";

export function filterMediaTreatmentOverlays(items: readonly RegistryItem[]): RegistryItem[] {
  return items.filter(
    (item) =>
      item.type === "hyperframes:block" &&
      item.tags?.includes(MEDIA_TREATMENT_OVERLAY_TAG) === true,
  );
}

export function deriveMediaOverlayPlacement(
  element: Pick<DomEditSelection, "dataAttributes" | "sourceFile">,
  timing: Pick<ElementTiming, "start" | "duration">,
) {
  const authoredTrack = Number.parseInt(element.dataAttributes["track-index"] ?? "", 10);
  return {
    start: timing.start,
    ...(timing.duration > 0 ? { duration: timing.duration } : {}),
    ...(Number.isFinite(authoredTrack) ? { track: authoredTrack + 1 } : {}),
    compositionPath: element.sourceFile,
  };
}

export function FlatOverlaysSection({
  onAddOverlay,
}: {
  onAddOverlay: (name: string) => Promise<void>;
}) {
  const { t } = useI18n();
  const track = useTrackDesignInput();
  const { blocks, loading, error } = useBlockCatalog();
  const overlays = filterMediaTreatmentOverlays(blocks);
  const [adding, setAdding] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState<string | null>(null);

  if (loading) {
    return <div className="py-4 text-center text-[10px] text-panel-text-4">{t("Loading overlays…")}</div>;
  }
  if (error) {
    return <div className="py-4 text-center text-[10px] text-danger-ink">{error}</div>;
  }

  const busy = adding !== null;
  return (
    <div data-flat-overlays="true" className={FLAT_PREVIEW_GRID}>
      {overlays.map((overlay) => (
        <button
          key={overlay.name}
          type="button"
          data-flat-overlay={overlay.name}
          aria-label={t("Add {value0}", { value0: overlay.title })}
          disabled={busy}
          title={overlay.description}
          onPointerEnter={() => setPreviewing(overlay.name)}
          onPointerLeave={() => setPreviewing(null)}
          onFocus={() => setPreviewing(overlay.name)}
          onBlur={() => setPreviewing(null)}
          onClick={() => {
            track("button", `Add ${overlay.title}`);
            setAdding(overlay.name);
            void onAddOverlay(overlay.name).finally(() => setAdding(null));
          }}
          className="group min-w-0 overflow-hidden border border-panel-hairline bg-panel-bg-soft text-left transition-colors hover:border-panel-border-input hover:bg-panel-bg disabled:cursor-wait disabled:opacity-50"
        >
          <span className="relative flex aspect-video w-full items-center justify-center overflow-hidden bg-black/20">
            {previewing === overlay.name && overlay.preview?.video ? (
              <video
                src={overlay.preview.video}
                poster={overlay.preview.poster}
                autoPlay
                muted
                loop
                playsInline
                className="block h-full w-full object-cover"
              />
            ) : overlay.preview?.poster ? (
              <img
                data-flat-overlay-preview={overlay.name}
                src={overlay.preview.poster}
                alt=""
                draggable={false}
                loading="lazy"
                className="block h-full w-full object-cover"
              />
            ) : (
              <Film size={15} className="text-panel-text-4" />
            )}
            <Plus
              size={12}
              className="absolute right-1.5 top-1.5 text-white opacity-70 drop-shadow-sm group-hover:text-accent-ink group-hover:opacity-100"
            />
          </span>
          <span className="block truncate px-2 py-1.5 text-[10px] text-panel-text-2">
            {adding === overlay.name ? t("Adding…") : overlay.title}
          </span>
        </button>
      ))}
    </div>
  );
}
