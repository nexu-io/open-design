import { Eye, EyeSlash } from "@phosphor-icons/react";
import { X } from "../../icons/SystemIcons";
import { useTrackDesignInput } from "../../contexts/DesignPanelInputContext";
import type { DomEditSelection } from "./domEditingTypes";

/** The action buttons in the inspector header: visibility, Ungroup (groups only), copy, clear. */
import { keyHint, useStudioKeys } from "../../player/components/studioShortcuts";

export function InspectorHeaderActions({
  element,
  copied,
  onCopy,
  onClear,
  onUngroup,
  selectedElementId,
  selectedElementHidden,
  visibilityLabel,
  onToggleHidden,
}: {
  element: DomEditSelection;
  copied: boolean;
  onCopy: () => void;
  onClear: () => void;
  onUngroup?: () => void;
  selectedElementId?: string | null;
  selectedElementHidden?: boolean;
  visibilityLabel?: string;
  onToggleHidden?: (id: string, hidden: boolean) => void;
}) {
  const track = useTrackDesignInput();
  return (
    <div className="flex items-center gap-1">
      {selectedElementId && onToggleHidden && (
        <button
          type="button"
          aria-label={visibilityLabel}
          title={visibilityLabel}
          onClick={() => {
            track("toggle", "Element visibility");
            void onToggleHidden(selectedElementId, !selectedElementHidden);
          }}
          className="flex h-6 w-6 items-center justify-center rounded-sm text-neutral-500 transition-colors hover:bg-neutral-800 hover:text-neutral-300"
        >
          {selectedElementHidden ? (
            <EyeSlash size={13} weight="bold" aria-hidden="true" />
          ) : (
            <Eye size={13} weight="bold" aria-hidden="true" />
          )}
        </button>
      )}
      {onUngroup && element.dataAttributes["hf-group"] != null && (
        <button
          type="button"
          onClick={() => {
            track("button", "Ungroup");
            onUngroup();
          }}
          title={`Ungroup (${keyHint("ungroup", useStudioKeys())})`}
          className="flex h-6 items-center rounded-sm px-2 text-[11px] font-medium text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-neutral-200"
        >
          Ungroup
        </button>
      )}
      <button
        type="button"
        onClick={() => {
          track("button", "Copy element info");
          onCopy();
        }}
        className={`flex h-6 w-6 items-center justify-center rounded transition-colors ${
          copied
            ? "text-accent-ink"
            : "text-neutral-500 hover:bg-neutral-800 hover:text-neutral-300"
        }`}
        title={copied ? "Copied!" : "Copy element info to clipboard"}
      >
        <svg
          width="13"
          height="13"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <rect x="5" y="5" width="9" height="9" rx="1.5" />
          <path d="M11 5V3.5A1.5 1.5 0 009.5 2h-6A1.5 1.5 0 002 3.5v6A1.5 1.5 0 003.5 11H5" />
        </svg>
      </button>
      <button
        type="button"
        aria-label="Clear selection"
        onClick={() => {
          track("button", "Clear selection");
          onClear();
        }}
        className="flex h-6 w-6 items-center justify-center rounded-sm text-neutral-500 transition-colors hover:bg-neutral-800 hover:text-neutral-300"
      >
        <X size={13} />
      </button>
    </div>
  );
}
