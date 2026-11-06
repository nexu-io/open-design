import { useI18n } from "../../i18n/I18n";
import { useEffect, useRef, useState } from "react";

/** Click-to-type readout. Enter/blur commits; a refused value stays open and turns red. */
export function FlatSliderReadout({
  label,
  displayValue,
  tier,
  disabled,
  onCommitText,
  onCommitted,
}: {
  label: string;
  displayValue: string;
  tier: "default" | "explicitCustom";
  disabled?: boolean;
  /** Receives the raw text; return false to refuse it and keep the field open. */
  onCommitText?: (text: string) => boolean | void;
  /** Fires after an accepted commit, for telemetry. */
  onCommitted?: () => void;
}) {
  const { t } = useI18n();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  const [invalid, setInvalid] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const editable = Boolean(onCommitText) && !disabled;

  useEffect(() => {
    if (!editing) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [editing]);

  const begin = () => {
    if (!editable) return;
    setText(displayValue);
    setInvalid(false);
    setEditing(true);
  };
  // Enter and blur both commit, so a value typed and then clicked away from is
  // not silently dropped. A refused value stays open on Enter (the author is
  // still there to fix it) and is discarded on blur (they have moved on).
  const commit = (keepOpenIfRefused: boolean) => {
    const accepted = onCommitText?.(text.trim());
    if (accepted === false && keepOpenIfRefused) {
      setInvalid(true);
      inputRef.current?.select();
      return;
    }
    setEditing(false);
    if (accepted !== false) onCommitted?.();
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        data-flat-slider-input="true"
        aria-label={t("{label} value", { label: label })}
        aria-invalid={invalid || undefined}
        value={text}
        spellCheck={false}
        onChange={(e) => {
          setText(e.target.value);
          setInvalid(false);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit(true);
          } else if (e.key === "Escape") {
            e.preventDefault();
            setEditing(false);
          }
          // Keep the timeline's own shortcuts from firing on every keystroke.
          e.stopPropagation();
        }}
        onBlur={() => commit(false)}
        className={`w-11 shrink-0 rounded-[3px] border bg-panel-surface px-1 text-right font-mono text-[10px] text-panel-text-0 outline-none ${
          invalid ? "border-dashed border-danger-ink" : "border-panel-accent"
        }`}
      />
    );
  }

  return (
    <span
      data-flat-slider-value="true"
      role={editable ? "button" : undefined}
      tabIndex={editable ? 0 : undefined}
      title={editable ? t("Click to type a value") : undefined}
      onClick={begin}
      onKeyDown={(e) => {
        if (!editable) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          begin();
        }
      }}
      className={`w-11 shrink-0 text-right font-mono text-[10px] ${
        tier === "explicitCustom" ? "text-panel-text-0" : "text-panel-text-3"
      } ${editable ? "cursor-text rounded-[3px] hover:bg-panel-hover hover:text-panel-text-0" : ""}`}
    >
      {displayValue}
    </span>
  );
}
