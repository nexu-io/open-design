import { useI18n } from "../../i18n/I18n";
import { useEffect, useRef, useState } from "react";
import { adjustNumericToken, parseNumericToken } from "./propertyPanelHelpers";
import { useInspectorGestureTransaction } from "./useInspectorGestureTransaction";

function arrowDirection(key: string): 1 | -1 | null {
  if (key === "ArrowUp") return 1;
  if (key === "ArrowDown") return -1;
  return null;
}

export function CommitField({
  value,
  disabled,
  liveCommit,
  align = "left",
  onPreview,
  onCommit,
}: {
  value: string;
  disabled?: boolean;
  liveCommit?: boolean;
  align?: "left" | "right";
  onPreview?: (nextValue: string) => void;
  onCommit: (nextValue: string) => void | Promise<unknown>;
}) {
  const { t } = useI18n();
  const [draft, setDraft] = useState(value);
  const valueRef = useRef(value);
  const draftRef = useRef(draft);
  const inputRef = useRef<HTMLInputElement>(null);
  const focusedRef = useRef(false);
  const dirtyRef = useRef(false);
  const commitGenerationRef = useRef(0);
  const pendingCommitRef = useRef<{
    baseline: string;
    optimistic: string;
  } | null>(null);
  const lastValueRef = useRef(value);
  if (!Object.is(lastValueRef.current, value)) {
    lastValueRef.current = value;
    if (!Object.is(pendingCommitRef.current?.optimistic, value)) {
      commitGenerationRef.current += 1;
      pendingCommitRef.current = null;
    }
  }
  valueRef.current = value;
  draftRef.current = draft;

  const gestureActiveRef = useRef(false);
  const gestureSettleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gestureTransaction = useInspectorGestureTransaction({
    sourceValue: value,
    onPreview: (nextValue) => {
      setDraft(nextValue);
      onPreview?.(nextValue);
    },
    onCommit,
  });
  const gestureTransactionRef = useRef(gestureTransaction);
  gestureTransactionRef.current = gestureTransaction;

  const clearGestureSettleTimer = () => {
    if (!gestureSettleTimerRef.current) return;
    clearTimeout(gestureSettleTimerRef.current);
    gestureSettleTimerRef.current = null;
  };
  const settleGesture = () => {
    clearGestureSettleTimer();
    if (!gestureActiveRef.current) return false;
    gestureActiveRef.current = false;
    gestureTransaction.settle();
    return true;
  };
  const scheduleGestureSettle = () => {
    clearGestureSettleTimer();
    gestureSettleTimerRef.current = setTimeout(() => {
      gestureSettleTimerRef.current = null;
      if (!gestureActiveRef.current) return;
      gestureActiveRef.current = false;
      gestureTransactionRef.current.settle();
    }, 250);
  };
  const cancelGesture = () => {
    commitGenerationRef.current += 1;
    clearGestureSettleTimer();
    gestureActiveRef.current = false;
    gestureTransaction.cancel();
  };
  const commitDraft = (nextValue: string) => {
    const generation = ++commitGenerationRef.current;
    setDraft(nextValue);
    onPreview?.(nextValue);
    if (nextValue !== valueRef.current) {
      const baseline = valueRef.current;
      pendingCommitRef.current = { baseline, optimistic: nextValue };
      const rollback = () => {
        if (generation !== commitGenerationRef.current) return;
        pendingCommitRef.current = null;
        // The source write is authoritative. A rejected mutation must not leave
        // the field showing an optimistic value that will disappear on seek.
        setDraft(baseline);
        onPreview?.(baseline);
      };
      try {
        void Promise.resolve(onCommit(nextValue)).then(() => {
          if (generation === commitGenerationRef.current) pendingCommitRef.current = null;
        }, rollback);
      } catch {
        rollback();
      }
    }
  };
  const cancelGestureFromKeyEvent = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!gestureActiveRef.current) return false;
    event.preventDefault();
    event.stopPropagation();
    cancelGesture();
    return true;
  };
  const previewNumericKeyStep = (event: React.KeyboardEvent<HTMLInputElement>) => {
    const direction = arrowDirection(event.key);
    if (direction === null) return;
    const nextDraft = adjustNumericToken(draftRef.current, direction, event);
    if (!nextDraft) return;
    event.preventDefault();
    commitGenerationRef.current += 1;
    dirtyRef.current = false;
    gestureActiveRef.current = true;
    gestureTransaction.preview(nextDraft);
    scheduleGestureSettle();
  };
  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
      cancelGestureFromKeyEvent(event);
      return;
    }
    if (event.key === "Escape") {
      if (cancelGestureFromKeyEvent(event)) return;
      // No gesture to cancel means the draft was typed. Escape abandons it
      // rather than leaving it for the blur-commit to write.
      event.preventDefault();
      event.stopPropagation();
      dirtyRef.current = false;
      setDraft(valueRef.current);
      if (liveCommit) onPreview?.(valueRef.current);
      event.currentTarget.blur();
      return;
    }
    if (event.key === "Enter") {
      event.currentTarget.blur();
      return;
    }
    previewNumericKeyStep(event);
  };

  useEffect(() => {
    if (focusedRef.current && dirtyRef.current) return;
    setDraft(value);
  }, [value]);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    const handler = (event: WheelEvent) => {
      if (disabled || document.activeElement !== el) return;
      const delta = event.deltaY === 0 ? event.deltaX : event.deltaY;
      if (delta === 0) return;
      const nextDraft = adjustNumericToken(draftRef.current, delta < 0 ? 1 : -1, event);
      if (!nextDraft) return;
      event.preventDefault();
      event.stopPropagation();
      dirtyRef.current = false;
      gestureActiveRef.current = true;
      gestureTransactionRef.current.preview(nextDraft);
      scheduleGestureSettle();
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => {
      el.removeEventListener("wheel", handler);
      clearGestureSettleTimer();
    };
  }, [disabled]);

  return (
    <input
      ref={inputRef}
      type="text"
      value={draft}
      disabled={disabled}
      onFocus={() => {
        focusedRef.current = true;
      }}
      onChange={(event) => {
        commitGenerationRef.current += 1;
        settleGesture();
        dirtyRef.current = true;
        setDraft(event.target.value);
        if (liveCommit) onPreview?.(event.target.value);
      }}
      onBlur={() => {
        if (settleGesture()) {
          focusedRef.current = false;
          return;
        }
        const wasDirty = dirtyRef.current;
        focusedRef.current = false;
        dirtyRef.current = false;
        if (wasDirty && (!liveCommit || parseNumericToken(draft))) {
          commitDraft(draft);
        } else {
          setDraft(valueRef.current);
          if (wasDirty && liveCommit) onPreview?.(valueRef.current);
        }
      }}
      onKeyDown={handleKeyDown}
      title={parseNumericToken(value) ? t("Scroll or use Arrow keys to adjust") : undefined}
      className={`min-w-0 w-full bg-transparent text-[11px] font-medium text-neutral-100 outline-hidden disabled:cursor-not-allowed disabled:text-neutral-600 ${
        align === "right" ? "text-right" : "text-left"
      }`}
    />
  );
}
