import { useI18n } from "../../i18n/I18n";
import { useState, useCallback, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { useMountEffect } from "../../hooks/useMountEffect";
import { usePlayerStore } from "../store/playerStore";
import { formatTime } from "../lib/time";
import { buildPromptCopyText, buildTimelineAgentPrompt } from "./timelineEditing";
import { copyTextToClipboard } from "../../utils/clipboard";

interface EditPopoverProps {
  rangeStart: number;
  rangeEnd: number;
  anchorX: number;
  anchorY: number;
  onClose: () => void;
  initialPrompt?: string;
}

function draftKey(start: number, end: number): string {
  return `hf-edit-draft:${start.toFixed(2)}:${end.toFixed(2)}`;
}

function readDraft(key: string): string {
  try {
    return sessionStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}

function writeDraft(key: string, value: string): void {
  try {
    if (value) sessionStorage.setItem(key, value);
    else sessionStorage.removeItem(key);
  } catch {
    /* storage unavailable — draft persistence degrades gracefully */
  }
}

export function EditPopover({ rangeStart, rangeEnd, anchorX, anchorY, onClose, initialPrompt }: EditPopoverProps) {
  const { t } = useI18n();
  const elements = usePlayerStore((s) => s.elements);
  const start = Math.min(rangeStart, rangeEnd);
  const end = Math.max(rangeStart, rangeEnd);
  // Persist the typed prompt per range so Escape/outside-click doesn't destroy it.
  const storageKey = draftKey(start, end);
  const [prompt, setPromptState] = useState(() => initialPrompt || readDraft(storageKey));
  const setPrompt = (value: string) => {
    setPromptState(value);
    writeDraft(storageKey, value);
  };
  const [copiedAgentPrompt, setCopiedAgentPrompt] = useState(false);
  const [copiedPromptOnly, setCopiedPromptOnly] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const elementsInRange = useMemo(() => {
    return elements.filter((el) => {
      const elEnd = el.start + el.duration;
      return el.start < end && elEnd > start;
    });
  }, [elements, start, end]);

  useMountEffect(() => {
    setTimeout(() => textareaRef.current?.focus(), 50);
  });

  useMountEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  });

  useMountEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    setTimeout(() => window.addEventListener("mousedown", handleClick), 100);
    return () => window.removeEventListener("mousedown", handleClick);
  });

  const buildClipboardText = useCallback(() => {
    return buildTimelineAgentPrompt({
      rangeStart: start,
      rangeEnd: end,
      elements: elementsInRange,
      prompt,
    });
  }, [start, end, elementsInRange, prompt]);

  const handleCopy = useCallback(async () => {
    const copied = await copyTextToClipboard(buildClipboardText());
    if (!copied) {
      setCopyError(true);
      return;
    }
    setCopyError(false);
    writeDraft(storageKey, "");
    setCopiedAgentPrompt(true);
    setTimeout(() => {
      setCopiedAgentPrompt(false);
      onClose();
    }, 800);
  }, [buildClipboardText, onClose, storageKey]);

  const handleCopyPrompt = useCallback(async () => {
    const promptText = buildPromptCopyText(prompt);
    if (!promptText) return;
    const copied = await copyTextToClipboard(promptText);
    if (!copied) {
      setCopyError(true);
      return;
    }
    setCopyError(false);
    setCopiedPromptOnly(true);
    setTimeout(() => {
      setCopiedPromptOnly(false);
    }, 800);
  }, [prompt]);

  const style: React.CSSProperties = {
    position: "fixed",
    left: Math.max(8, Math.min(anchorX - 160, window.innerWidth - 336)),
    top: Math.max(8, anchorY - 280),
    zIndex: 200,
  };

  return createPortal(
    <div ref={popoverRef} style={style}>
      <div className="w-80 bg-neutral-900 border border-neutral-700/60 rounded-xl shadow-2xl shadow-black/40 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-neutral-800/60">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-studio-accent" />
            <span className="text-[11px] font-medium text-neutral-300">
              {formatTime(start)} {t("to")}{" "}{formatTime(end)}
            </span>
          </div>
          <span className="text-[10px] text-neutral-600">
            {t("{count} elements", { count: elementsInRange.length })}
          </span>
        </div>

        {/* Elements */}
        {elementsInRange.length > 0 && (
          <div className="px-4 py-2 border-b border-neutral-800/40 max-h-24 overflow-y-auto">
            {elementsInRange.map((el) => (
              <div key={el.id} className="flex items-center justify-between py-0.5">
                <span className="text-[10px] font-mono text-accent-ink/80">#{el.id}</span>
                <span className="text-[10px] text-neutral-600">{el.tag}</span>
              </div>
            ))}
          </div>
        )}

        {/* Prompt */}
        <div className="p-3">
          <textarea
            ref={textareaRef}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                handleCopy();
              }
            }}
            placeholder={t("What should change?")}
            rows={2}
            className="w-full px-3 py-2 text-xs bg-neutral-800/60 border border-neutral-700/40 rounded-lg text-neutral-200 placeholder:text-neutral-600 resize-none focus:outline-hidden focus:border-studio-accent/40 transition-colors"
          />
        </div>

        {/* Action */}
        {copyError && (
          <p className="px-3 pb-2 text-[10px] text-danger-ink" role="alert">
            {t("Copy failed. Check clipboard permissions and try again.")}</p>
        )}
        <div className="grid grid-cols-2 gap-2 px-3 pb-3">
          <button
            onClick={handleCopyPrompt}
            disabled={!buildPromptCopyText(prompt)}
            className={`py-1.5 text-[11px] font-medium rounded-lg transition-all border ${
              copiedPromptOnly
                ? "bg-accent/15 text-accent-ink border-accent/30"
                : "bg-neutral-800/70 text-neutral-200 border-neutral-700/50 hover:bg-neutral-800"
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {copiedPromptOnly ? t("Prompt Copied!") : t("Copy Prompt")}
          </button>
          <button
            onClick={handleCopy}
            className={`py-1.5 text-[11px] font-medium rounded-lg transition-all ${
              copiedAgentPrompt
                ? "bg-accent/15 text-accent-ink border border-accent/30"
                : "bg-studio-accent/15 text-accent-ink border border-studio-accent/25 hover:bg-studio-accent/25"
            }`}
          >
            {copiedAgentPrompt ? t("Copied!") : t("Copy to Agent")}
            {!copiedAgentPrompt && (
              <span className="text-[9px] text-text-muted ml-1.5">Cmd+Enter</span>
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
