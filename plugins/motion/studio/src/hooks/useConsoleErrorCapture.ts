import { useCallback, useEffect, useRef, useState } from "react";
import { STUDIO_PREVIEW_ERRORS } from "@hyperframes/core/studio-preview-mark";
import { onPreviewDocumentLoaded } from "../player/sceneSwap";
import type { LintFinding } from "../components/LintModal";

/**
 * Captures `console.error` and `window.onerror` events from a preview iframe
 * and exposes them as LintFinding[] for the console errors modal.
 */
export function useConsoleErrorCapture(previewIframe: HTMLIFrameElement | null) {
  const [consoleErrors, setConsoleErrors] = useState<LintFinding[] | null>(null);
  const consoleErrorsRef = useRef<LintFinding[]>([]);

  const resetErrors = useCallback(() => {
    consoleErrorsRef.current = [];
    setConsoleErrors(null);
  }, []);

  // eslint-disable-next-line no-restricted-syntax
  useEffect(() => {
    resetErrors();
    if (!previewIframe) return;

    let patchedWin: (Window & typeof globalThis) | null = null;
    let origConsoleError: ((...args: unknown[]) => void) | null = null;
    let errorHandler: ((e: ErrorEvent) => void) | null = null;

    const detachErrorCapture = () => {
      const win = patchedWin;
      if (!win) return;
      patchedWin = null;
      try {
        // origConsoleError and errorHandler are always set alongside patchedWin
        win.console.error = origConsoleError!;
        win.removeEventListener("error", errorHandler!);
        delete (win as unknown as Record<string, unknown>).__hfErrorCapture;
      } catch {
        /* cross-origin or destroyed window */
      }
      origConsoleError = null;
      errorHandler = null;
    };

    const attachErrorCapture = () => {
      detachErrorCapture();
      resetErrors();
      try {
        const win = previewIframe.contentWindow as (Window & typeof globalThis) | null;
        if (!win) return;
        if ((win as unknown as Record<string, unknown>).__hfErrorCapture) return;
        (win as unknown as Record<string, unknown>).__hfErrorCapture = true;
        patchedWin = win;
        const record = (texts: readonly string[]) => {
          if (texts.length === 0) return;
          consoleErrorsRef.current = [
            ...consoleErrorsRef.current,
            ...texts.map((message) => ({ severity: "error" as const, message })),
          ];
          setConsoleErrors([...consoleErrorsRef.current]);
        };
        origConsoleError = win.console.error.bind(win.console);
        win.console.error = function (...args: unknown[]) {
          origConsoleError!(...args);
          const text = args.map((a) => (a instanceof Error ? a.message : String(a))).join(" ");
          if (!text.includes("favicon")) record([text]);
        };
        errorHandler = (e: ErrorEvent) => record([e.message || String(e)]);
        win.addEventListener("error", errorHandler);
        const raised: unknown = Reflect.get(win, STUDIO_PREVIEW_ERRORS);
        if (Array.isArray(raised)) record(raised.map(String));
      } catch {
        /* same-origin only */
      }
    };

    attachErrorCapture();
    const stopLoaded = onPreviewDocumentLoaded(previewIframe, attachErrorCapture);
    return () => {
      stopLoaded();
      detachErrorCapture();
    };
  }, [previewIframe, resetErrors]);

  return { consoleErrors, setConsoleErrors };
}
