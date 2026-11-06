import { useI18n } from "../../i18n/I18n";
import { Eye, Layers } from "../../icons/SystemIcons";
import type { DomEditSelection } from "./domEditingTypes";
import { canHideSelections } from "../../utils/timelineInspector";
import { useTrackDesignInput } from "../../contexts/DesignPanelInputContext";

function FlatEmptyState() {
  const { t } = useI18n();
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2.5 px-8 py-10 text-center">
      <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-panel-border-input bg-panel-input text-panel-text-3">
        <svg
          width="20"
          height="20"
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
        >
          <path d="M4 3l6 14 2-6 6-2z" strokeLinejoin="round" />
        </svg>
      </span>
      <div className="text-[13px] font-semibold text-panel-text-0">{t("Nothing selected")}</div>
      <div className="max-w-[250px] text-[11px] leading-normal text-panel-text-3">
        {t("Click any element on the canvas to edit it, or drag to select several.")}</div>
      <div className="mt-2 flex w-full flex-col gap-1.5">
        <span className="flex items-center justify-between rounded-lg border border-panel-border bg-panel-bg px-3 py-2">
          <span className="flex items-center gap-2 text-[11px] text-panel-text-2">
            <span className="text-danger-ink">●</span>
            {t("Record a gesture")}</span>
          <span className="rounded-sm border border-panel-border-input px-[5px] py-px font-mono text-[9px] text-panel-text-5">
            R
          </span>
        </span>
        <span className="flex items-center justify-between rounded-lg border border-panel-border bg-panel-bg px-3 py-2">
          <span className="flex items-center gap-2 text-[11px] text-panel-text-2">
            <span className="text-accent-ink">✦</span>
            {t("Describe a change to the agent")}</span>
          <span className="rounded-sm border border-panel-border-input px-[5px] py-px font-mono text-[9px] text-panel-text-5">
            ⌘K
          </span>
        </span>
      </div>
    </div>
  );
}

function elementKindGlyph(element: DomEditSelection): { glyph: string; className: string } {
  if (element.tagName === "video" || element.tagName === "audio" || element.tagName === "img") {
    return { glyph: "◆", className: "bg-panel-media/10 text-panel-media" };
  }
  if (element.textFields?.length > 0) {
    return { glyph: "T", className: "bg-panel-accent/10 text-accent-ink" };
  }
  return { glyph: "▦", className: "bg-panel-container/10 text-panel-container" };
}

function FlatMultiSelectState({
  multiSelectCount,
  multiSelectedElements = [],
  onGroupSelection,
  onHideAllSelected,
  onClearSelection,
}: {
  multiSelectCount: number;
  multiSelectedElements?: DomEditSelection[];
  onGroupSelection?: () => void;
  onHideAllSelected?: () => void;
  onClearSelection?: () => void;
}) {
  const { t } = useI18n();
  // One predicate for both actions and for the handler's own refusal, so the
  // button and the refusal cannot disagree about what audio is.
  const hasAudio = !canHideSelections(multiSelectedElements);
  const trackInput = useTrackDesignInput();
  return (
    <div className="flex flex-col gap-3 px-4 py-3">
      <div className="flex items-center gap-3 rounded-xl border border-panel-border bg-panel-surface p-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-panel-accent/10 text-accent-ink">
          <Layers size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-semibold text-panel-text-0">
            {multiSelectCount} {t("elements selected")}</div>
          <div className="mt-px font-mono text-[10px] text-panel-text-3">
            {t("shift-click to add or remove")}</div>
        </div>
        <button
          type="button"
          data-flat-multiselect-clear="true"
          aria-label={t("Clear selection")}
          onClick={onClearSelection}
          className="flex h-[26px] w-[26px] shrink-0 items-center justify-center text-panel-text-3"
        >
          <svg
            width="13"
            height="13"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <path d="M3 3l10 10M13 3L3 13" />
          </svg>
        </button>
      </div>
      <div className="flex flex-col gap-1">
        {multiSelectedElements.map((element) => {
          const { glyph, className } = elementKindGlyph(element);
          return (
            <span
              key={`${element.id ?? element.selector ?? ""}:${element.selectorIndex ?? 0}`}
              className="flex items-center gap-2 rounded-lg border border-panel-border bg-panel-bg px-2.5 py-[7px]"
            >
              <span
                className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-sm text-[9px] font-bold ${className}`}
              >
                {glyph}
              </span>
              <span className="min-w-0 flex-1 truncate text-[11px] text-panel-text-1">
                {element.label}
              </span>
              <span className="shrink-0 font-mono text-[9px] text-panel-text-4">
                {element.id ? `#${element.id}` : element.selector}
              </span>
            </span>
          );
        })}
      </div>
      {/* Neither action applies to audio, so the row goes rather than showing
          an empty frame. Grouping is the LAYOUT grouper — a positioned wrapper
          around a bounding box, and an <audio> clip has none (grouping two
          produced a 0x0 div with inline left/top on elements that are never
          laid out). Hiding is visibility, which for audio is mute, and the
          timeline owns that as a mute control. Both handlers refuse it too —
          they own keyboard paths no hidden button can gate. */}
      {!hasAudio && (
        <div className="flex gap-2">
          <button
            type="button"
            data-flat-multiselect-group="true"
            onClick={() => {
              if (!onGroupSelection) return;
              onGroupSelection();
              trackInput("button", "group-selection");
            }}
            className="flex h-[34px] flex-1 items-center justify-center gap-2 rounded-lg bg-panel-hover text-[11px] font-semibold text-panel-text-0"
          >
            <Layers size={13} />
            {t("Group selection")}</button>
          <button
            type="button"
            data-flat-multiselect-hide-all="true"
            onClick={() => {
              if (!onHideAllSelected) return;
              onHideAllSelected();
              trackInput("button", "hide-all");
            }}
            className="flex h-[34px] items-center gap-1.5 rounded-lg border border-panel-border-input bg-panel-input px-3 text-[11px] font-medium text-panel-text-2"
          >
            <Eye size={13} />
            {t("Hide all")}</button>
        </div>
      )}
      <span className="text-center text-[10px] text-panel-text-5">
        {t("Select a single element to edit its properties")}</span>
    </div>
  );
}

export function PropertyPanelEmptyState({
  multiSelectCount,
  flat,
  multiSelectedElements,
  onGroupSelection,
  onHideAllSelected,
  onClearSelection,
}: {
  multiSelectCount: number;
  flat?: boolean;
  multiSelectedElements?: DomEditSelection[];
  onGroupSelection?: () => void;
  onHideAllSelected?: () => void;
  onClearSelection?: () => void;
}) {
  const { t } = useI18n();
  if (flat) {
    return multiSelectCount > 1 ? (
      <FlatMultiSelectState
        multiSelectCount={multiSelectCount}
        multiSelectedElements={multiSelectedElements}
        onGroupSelection={onGroupSelection}
        onHideAllSelected={onHideAllSelected}
        onClearSelection={onClearSelection}
      />
    ) : (
      <FlatEmptyState />
    );
  }

  return (
    <div className="flex h-full flex-col bg-neutral-900">
      <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
        {multiSelectCount > 1 ? (
          <>
            <Layers size={18} className="mb-3 text-neutral-600" />
            <p className="text-sm font-medium text-neutral-200">
              {multiSelectCount} {t("elements selected")}</p>
            <p className="mt-2 max-w-[260px] text-xs leading-5 text-neutral-500">
              {t("Select a single element to edit its properties. Click an element in the preview or use the timeline layer panel.")}</p>
          </>
        ) : (
          <>
            <Eye size={18} className="mb-3 text-neutral-600" />
            <p className="text-sm font-medium text-neutral-200">
              {t("Select an element in the preview.")}</p>
            <p className="mt-2 max-w-[260px] text-xs leading-5 text-neutral-500">
              {t("The inspector is tuned for element edits with safer geometry controls, color picking, and cleaner grouped layer controls.")}</p>
          </>
        )}
      </div>
    </div>
  );
}
