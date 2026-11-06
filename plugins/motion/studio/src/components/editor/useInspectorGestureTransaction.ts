import { useCallback, useEffect, useRef, useState } from "react";

function isPromiseCommit(result: void | Promise<unknown>): result is Promise<unknown> {
  return Boolean(result && typeof result.then === "function");
}

/** One owner for continuous inspector edits: preview freely, persist once. */
export function useInspectorGestureTransaction<T>({
  sourceValue,
  onPreview,
  onCommit,
}: {
  sourceValue: T;
  onPreview: (value: T) => void;
  onCommit: (value: T) => void | Promise<unknown>;
}) {
  const sourceRef = useRef(sourceValue);
  const activeRef = useRef<{ before: T; latest: T } | null>(null);
  const previewRef = useRef(onPreview);
  const commitRef = useRef(onCommit);
  const generationRef = useRef(0);
  const pendingRef = useRef<{ before: T; latest: T } | null>(null);
  const awaitingSourceAckRef = useRef<{ generation: number; value: T } | null>(null);
  const lastSourceValueRef = useRef(sourceValue);
  if (!Object.is(lastSourceValueRef.current, sourceValue)) {
    lastSourceValueRef.current = sourceValue;
    const matchesSourceAck = Object.is(awaitingSourceAckRef.current?.value, sourceValue);
    const matchesOptimisticValue =
      (activeRef.current && Object.is(activeRef.current.latest, sourceValue)) ||
      (pendingRef.current && Object.is(pendingRef.current.latest, sourceValue)) ||
      matchesSourceAck;
    if (matchesSourceAck) awaitingSourceAckRef.current = null;
    if (!matchesOptimisticValue) {
      generationRef.current += 1;
      activeRef.current = null;
      pendingRef.current = null;
      awaitingSourceAckRef.current = null;
      sourceRef.current = sourceValue;
    } else {
      sourceRef.current = sourceValue;
    }
  }
  previewRef.current = onPreview;
  commitRef.current = onCommit;

  const begin = useCallback(() => {
    if (!activeRef.current) {
      generationRef.current += 1;
      activeRef.current = { before: sourceRef.current, latest: sourceRef.current };
    }
  }, []);

  const preview = useCallback((value: T) => {
    if (!activeRef.current) {
      generationRef.current += 1;
      activeRef.current = { before: sourceRef.current, latest: sourceRef.current };
    }
    activeRef.current.latest = value;
    previewRef.current(value);
  }, []);

  const rollbackCommit = useCallback((active: { before: T; latest: T }, generation: number) => {
    if (generation !== generationRef.current) return;
    pendingRef.current = null;
    if (awaitingSourceAckRef.current?.generation === generation) {
      awaitingSourceAckRef.current = null;
    }
    sourceRef.current = active.before;
    previewRef.current(active.before);
  }, []);

  const settle = useCallback(() => {
    const active = activeRef.current;
    activeRef.current = null;
    if (active && !Object.is(active.before, active.latest)) {
      const generation = ++generationRef.current;
      sourceRef.current = active.latest;
      pendingRef.current = active;
      awaitingSourceAckRef.current = { generation, value: active.latest };
      try {
        const result = commitRef.current(active.latest);
        if (isPromiseCommit(result)) {
          void result.then(
            () => {
              if (generation === generationRef.current) pendingRef.current = null;
            },
            () => rollbackCommit(active, generation),
          );
        } else if (generation === generationRef.current) {
          pendingRef.current = null;
          // Synchronous inspector consumers historically restore their preview
          // after persisting (color pickers close, curves release the pointer).
          // Async source mutations keep the optimistic preview until the write
          // resolves so they do not flash back to the baseline while pending.
          previewRef.current(active.before);
        }
      } catch {
        rollbackCommit(active, generation);
      }
    }
  }, [rollbackCommit]);

  const cancel = useCallback(() => {
    generationRef.current += 1;
    const active = activeRef.current;
    activeRef.current = null;
    if (active && !Object.is(active.before, active.latest)) {
      sourceRef.current = active.before;
      previewRef.current(active.before);
    }
  }, []);

  useEffect(() => cancel, [cancel]);

  return { begin, preview, settle, cancel, activeRef };
}

export function useInspectorGestureDraft<T>({
  sourceValue,
  onPreview,
  onCommit,
}: {
  sourceValue: T;
  onPreview: (value: T) => void;
  onCommit: (value: T) => void | Promise<unknown>;
}) {
  const [draft, setDraft] = useState(sourceValue);
  const transaction = useInspectorGestureTransaction({
    sourceValue,
    onPreview: (next) => {
      setDraft(next);
      onPreview(next);
    },
    onCommit: (next) => {
      setDraft(next);
      return onCommit(next);
    },
  });

  useEffect(() => {
    if (!transaction.activeRef.current) setDraft(sourceValue);
  }, [sourceValue, transaction.activeRef]);

  return { draft, setDraft, transaction };
}
