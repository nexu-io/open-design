import { useI18n } from "../../i18n/I18n";
import { useState, useCallback, useEffect, useRef } from "react";
import { useDialogBehavior } from "../ui/useDialogBehavior";

export function PromptPreviewModal({
  title,
  prompt,
  onClose,
}: {
  title: string;
  prompt: string;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [value, setValue] = useState(prompt);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const [entered, setEntered] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const valueRef = useRef(value);
  valueRef.current = value;

  // Escape / focus trap / focus restore. A dirty draft vetoes Escape and
  // backdrop close so a stray click can't discard edits (the X still closes).
  const { requestClose } = useDialogBehavior({
    open: true,
    onClose,
    containerRef,
    canClose: () => valueRef.current === prompt,
  });

  useEffect(() => {
    requestAnimationFrame(() => {
      setEntered(true);
      textareaRef.current?.focus();
    });
  }, []);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(valueRef.current);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
    setTimeout(() => setCopyState("idle"), 1500);
  }, []);

  return (
    <div
      className={`fixed inset-0 z-100 flex items-center justify-center bg-black/60 backdrop-blur-xs transition-opacity duration-150 ease-out ${
        entered ? "opacity-100" : "opacity-0"
      }`}
      onClick={requestClose}
    >
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-label={t("Ask agent: {title}", { title: title })}
        tabIndex={-1}
        className="w-[560px] max-h-[80vh] flex flex-col rounded-2xl border border-neutral-800 bg-neutral-950 shadow-2xl outline-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-800/60">
          <div>
            <h3 className="text-sm font-medium text-neutral-200">{t("Ask agent")}</h3>
            <p className="text-xs text-neutral-500 mt-0.5">{title}</p>
          </div>
          <button
            aria-label={t("Close")}
            className="p-1 rounded-md text-neutral-500 hover:text-neutral-300 hover:bg-neutral-800/50 active:scale-[0.95]"
            onClick={onClose}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <p className="text-[11px] text-neutral-500 mb-2">
            {t("Edit the prompt below, then copy and paste into your AI agent")}</p>
          <textarea
            ref={textareaRef}
            aria-label={t("Prompt")}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void handleCopy();
            }}
            className="w-full min-h-[240px] text-[11px] text-neutral-200 leading-relaxed font-mono bg-neutral-900/60 rounded-lg p-3 border border-neutral-800 resize-y focus:outline-hidden focus:border-studio-accent/60 focus:ring-1 focus:ring-studio-accent/30"
          />
        </div>
        <div className="flex items-center justify-between px-5 py-3 border-t border-neutral-800/60">
          <span className="text-[11px] text-neutral-600">
            {navigator.platform.includes("Mac") ? "⌘" : "Ctrl"}{t("+Enter to copy")}</span>
          <button
            className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-colors active:scale-[0.97] ${
              copyState === "copied"
                ? "bg-accent text-on-accent"
                : copyState === "failed"
                  ? "bg-danger text-on-danger"
                  : "bg-accent text-on-accent hover:bg-accent-hover"
            }`}
            onClick={handleCopy}
          >
            {copyState === "copied"
              ? t("Copied!")
              : copyState === "failed"
                ? t("Copy failed")
                : t("Copy prompt")}
          </button>
        </div>
      </div>
    </div>
  );
}
