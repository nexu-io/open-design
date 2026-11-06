/**
 * NumberField: the inspector's metric control. Commits only on blur, Enter, or a settled step (KTD11),
 * never per keystroke. The unit is a sibling of the input; unparseable text shows a red boundary and commits nothing.
 */

import { NumberField as BaseNumberField } from "@base-ui/react/number-field";
import { useEffect, useRef, useState } from "react";
import { cn } from "./cn";
import { fieldBase, fieldText } from "./Input";
import type { PreviewState } from "./Button";

export interface NumberFieldProps {
  /** Accessible name. The inspector's row label is the usual one. */
  label: string;
  /** The committed value. */
  value: number;
  /** Called when a commit boundary produces a value different from `value`. */
  onCommit: (next: number) => void;
  /** Called once per committed change, for design-input telemetry. */
  onTrack?: () => void;
  /** Rendered beside the number: "px", "%", "deg". Never part of the text. */
  unit?: string;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  className?: string;
  "data-preview-state"?: PreviewState;
}

export function NumberField({
  label,
  value,
  onCommit,
  onTrack,
  unit,
  min,
  max,
  step,
  disabled,
  className,
  "data-preview-state": previewState,
}: NumberFieldProps) {
  const [draft, setDraft] = useState<number | null>(value);
  const [invalid, setInvalid] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  // What was last handed to `onCommit`, which is not the same as `value`: a
  // blur can fire both Base UI's commit and ours in one turn, before the parent
  // has re-rendered with the new prop, and the second must be a no-op.
  const committedRef = useRef(value);
  const valueRef = useRef(value);
  valueRef.current = value;

  useEffect(() => {
    committedRef.current = value;
    setDraft(value);
    setInvalid(false);
  }, [value]);

  const commit = (next: number | null) => {
    if (next === null || !Number.isFinite(next)) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    if (next === committedRef.current) return;
    committedRef.current = next;
    onCommit(next);
    onTrack?.();
  };

  /** Enter commits what is on screen, which Base UI has not parsed for us yet. */
  const commitFromText = () => {
    const text = inputRef.current?.value.trim() ?? "";
    commit(text === "" ? null : Number(text));
  };

  return (
    <BaseNumberField.Root
      value={draft}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      onValueChange={(next) => {
        setDraft(next);
        if (next !== null) setInvalid(false);
      }}
      onValueCommitted={(next) => commit(next)}
    >
      <BaseNumberField.Group
        className={cn(fieldBase, className)}
        aria-invalid={invalid || undefined}
        data-preview-state={previewState}
      >
        <BaseNumberField.Input
          ref={inputRef}
          aria-label={label}
          aria-invalid={invalid || undefined}
          className={cn(fieldText, "tabular-nums")}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            commitFromText();
          }}
          onBlur={() => {
            // Base UI's own blur handler returns without committing when the
            // text does not parse. That is the only case left for us: a valid
            // blur has already arrived through `onValueCommitted`.
            const text = inputRef.current?.value.trim() ?? "";
            if (text === "" || !Number.isFinite(Number(text))) setInvalid(true);
          }}
        />
        {unit && (
          <span className="shrink-0 select-none text-step-10 text-text-4" aria-hidden="true">
            {unit}
          </span>
        )}
      </BaseNumberField.Group>
    </BaseNumberField.Root>
  );
}
