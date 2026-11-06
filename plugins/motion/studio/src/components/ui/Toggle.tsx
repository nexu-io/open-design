/**
 * Toggle: a switch, not a checkbox (immediate effect). `role="switch"` needed an entry in
 * `typingTarget.ts` so Space is not leaked to the global playback shortcut.
 */

import { Switch } from "@base-ui/react/switch";
import { cn } from "./cn";
import type { PreviewState } from "./Button";

export interface ToggleProps {
  /** Accessible name. */
  label: string;
  checked: boolean;
  /** Called on every flip. */
  onCommit: (next: boolean) => void;
  /** Called once per flip, for design-input telemetry. */
  onTrack?: () => void;
  disabled?: boolean;
  className?: string;
  "data-preview-state"?: PreviewState;
}

export function Toggle({
  label,
  checked,
  onCommit,
  onTrack,
  disabled,
  className,
  "data-preview-state": previewState,
}: ToggleProps) {
  return (
    <Switch.Root
      aria-label={label}
      checked={checked}
      disabled={disabled}
      onCheckedChange={(next) => {
        onCommit(next);
        onTrack?.();
      }}
      data-preview-state={previewState}
      className={cn(
        "relative inline-flex h-4 w-7 shrink-0 cursor-pointer items-center rounded-full p-0.5",
        "border border-border-input bg-input",
        "transition-[background-color,border-color] ease-standard duration-press",
        "hover:border-border-strong data-[preview-state=hover]:border-border-strong",
        "data-[checked]:border-accent data-[checked]:bg-accent",
        "outline-hidden focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent",
        "data-[preview-state=focus]:outline-solid data-[preview-state=focus]:outline-2 data-[preview-state=focus]:outline-offset-1 data-[preview-state=focus]:outline-accent",
        "disabled:cursor-not-allowed disabled:opacity-40",
        className,
      )}
    >
      <Switch.Thumb
        className={cn(
          "size-3 rounded-full bg-text-3",
          "transition-[transform,background-color] ease-standard duration-press",
          "data-[checked]:translate-x-3 data-[checked]:bg-bg-0",
        )}
      />
    </Switch.Root>
  );
}
