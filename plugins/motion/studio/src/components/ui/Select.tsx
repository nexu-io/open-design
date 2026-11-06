/**
 * Select: Base UI select in Input's box. The trigger keeps `role="combobox"`, which both hotkey selector
 * lists match. Options are data, not children, so typeahead and the value display can read labels.
 */

import { Select as BaseSelect } from "@base-ui/react/select";
import { cn } from "./cn";
import { fieldBase } from "./Input";
import { floatingMotion, POPUP_LAYER } from "./Menu";
import type { PreviewState } from "./Button";

export interface SelectOption {
  label: string;
  value: string;
  /** Offered but not choosable; the label stays visible so the reason stays visible too. */
  disabled?: boolean;
}

export interface SelectProps {
  /** Accessible name for the trigger. */
  label: string;
  value: string;
  options: SelectOption[];
  /** Called when a different option is chosen. */
  onCommit: (next: string) => void;
  /** Called once per committed change, for design-input telemetry. */
  onTrack?: () => void;
  disabled?: boolean;
  className?: string;
  "data-preview-state"?: PreviewState;
}

export function Select({
  label,
  value,
  options,
  onCommit,
  onTrack,
  disabled,
  className,
  "data-preview-state": previewState,
}: SelectProps) {
  return (
    <BaseSelect.Root
      value={value}
      disabled={disabled}
      items={options}
      onValueChange={(next) => {
        const chosen = String(next);
        if (chosen === value) return;
        onCommit(chosen);
        onTrack?.();
      }}
    >
      <BaseSelect.Trigger
        aria-label={label}
        className={cn(
          fieldBase,
          "w-full cursor-pointer justify-between text-left",
          "data-[popup-open]:border-border-strong",
          className,
        )}
        data-preview-state={previewState}
      >
        <BaseSelect.Value className="truncate" />
        <BaseSelect.Icon className="shrink-0 text-text-4" aria-hidden="true">
          <svg width="8" height="5" viewBox="0 0 8 5" fill="none">
            <path
              d="M1 1L4 4L7 1"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </BaseSelect.Icon>
      </BaseSelect.Trigger>

      <BaseSelect.Portal>
        <BaseSelect.Positioner sideOffset={4} alignItemWithTrigger={false} className={POPUP_LAYER}>
          <BaseSelect.Popup
            className={cn(
              "min-w-[var(--anchor-width)] rounded-md border border-border bg-surface py-1 shadow-menu",
              floatingMotion("duration-open"),
            )}
          >
            <BaseSelect.List>
              {options.map((option) => (
                <BaseSelect.Item
                  key={option.value}
                  value={option.value}
                  disabled={option.disabled}
                  className={cn(
                    "flex h-ctl-sm cursor-pointer select-none items-center gap-2 px-2.5",
                    "text-step-11 text-text-2 outline-hidden",
                    "data-[highlighted]:bg-hover data-[highlighted]:text-text-0",
                    "data-[selected]:text-text-0",
                    "data-[disabled]:cursor-not-allowed data-[disabled]:opacity-40",
                  )}
                >
                  <BaseSelect.ItemText className="truncate">{option.label}</BaseSelect.ItemText>
                </BaseSelect.Item>
              ))}
            </BaseSelect.List>
          </BaseSelect.Popup>
        </BaseSelect.Positioner>
      </BaseSelect.Portal>
    </BaseSelect.Root>
  );
}
