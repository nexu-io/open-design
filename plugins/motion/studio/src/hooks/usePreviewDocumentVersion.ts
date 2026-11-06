import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Version counter for the preview DOM. `refresh` bumps immediately and again
 * at 80ms / 300ms so consumers re-scan after the iframe settles; pending
 * timers are collapsed by each new refresh and cleared on unmount.
 */
export function usePreviewDocumentVersion(): [number, () => void] {
  const [previewDocumentVersion, setPreviewDocumentVersion] = useState(0);
  const refreshTimersRef = useRef<number[]>([]);
  const refresh = useCallback(() => {
    for (const id of refreshTimersRef.current) clearTimeout(id);
    refreshTimersRef.current = [];
    setPreviewDocumentVersion((v) => v + 1);
    refreshTimersRef.current.push(
      window.setTimeout(() => setPreviewDocumentVersion((v) => v + 1), 80),
      window.setTimeout(() => setPreviewDocumentVersion((v) => v + 1), 300),
    );
  }, []);
  useEffect(
    () => () => {
      for (const id of refreshTimersRef.current) clearTimeout(id);
    },
    [],
  );
  return [previewDocumentVersion, refresh];
}
