import { useI18n } from "../../i18n/I18n";
/**
 * Typing an exact value into a breakpoint.
 *
 * Dragging is how an envelope is shaped, but it cannot land on a number: -6.0 dB
 * is not a pixel you can find. This is the lane's keyboard route to one value,
 * kept in its own file so the lane component stays about the pointer.
 */

export interface AutomationValueInputProps {
  text: string;
  /** Left edge in the lane's own coordinates. */
  leftPx: number;
  label: string;
  onChange(text: string): void;
  /** Enter or blur: apply what was typed. */
  onCommit(): void;
  /** Escape: leave the point where it was. */
  onCancel(): void;
}

export function AutomationValueInput({
  text,
  leftPx,
  label,
  onChange,
  onCommit,
  onCancel,
}: AutomationValueInputProps) {
  const { t } = useI18n();
  return (
    <input
      // pointer-events-auto: the lane band around it takes none, so that clips
      // sharing the row do not cover each other's envelopes (see the lane).
      className="hf-automation-value pointer-events-auto absolute rounded-[3px] border border-panel-border-input bg-panel-bg-2 px-1 font-mono text-[9px] text-panel-text-1"
      style={{ left: leftPx, top: 1, width: 44, zIndex: 4 }}
      // The lane is a pointer surface, and the timeline above it owns single-key
      // shortcuts. Without stopping both, a press lands on the lane instead of
      // the field and a typed "5" scrubs the transport.
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") onCommit();
        if (e.key === "Escape") onCancel();
      }}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onCommit}
      value={text}
      aria-label={t("{label} value", { label: label })}
      autoFocus
    />
  );
}
