import { useI18n } from "../../i18n/I18n";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import type { BlockParam } from "@hyperframes/core/registry";
import { useFileManagerContextOptional } from "../../contexts/FileManagerContext";
import { useStudioPlaybackContext } from "../../contexts/StudioContext";
import { trackBlockParamCommit } from "../../telemetry/events";
import { serializeStudioFileMutation } from "../../utils/studioFileMutationCoordinator";

interface BlockParamsPanelProps {
  blockName: string;
  blockTitle: string;
  params: BlockParam[];
  compositionPath: string;
  onClose: () => void;
}

type CommitState = { tone: "idle" | "saving" | "saved" | "error"; message?: string };

export const BlockParamsPanel = memo(function BlockParamsPanel({
  blockName,
  blockTitle,
  params,
  compositionPath,
  onClose,
}: BlockParamsPanelProps) {
  const { t } = useI18n();
  const fileManager = useFileManagerContextOptional();
  const { setRefreshKey } = useStudioPlaybackContext();
  const [values, setValues] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const p of params) {
      initial[p.key] = p.default;
    }
    return initial;
  });
  // Last value actually written to the block file per param — the literal we
  // substitute when the next commit rewrites the file.
  const appliedRef = useRef<Record<string, string>>(
    Object.fromEntries(params.map((p) => [p.key, p.default])),
  );
  const [commitState, setCommitState] = useState<CommitState>({ tone: "idle" });
  // Per-param debounce timers: a single shared timer would let a second
  // param's edit silently cancel the first param's pending commit.
  const commitTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const commitParamNow = useCallback(
    async (key: string, nextValue: string) => {
      if (!fileManager) return;
      const previous = appliedRef.current[key];
      if (previous === undefined || previous === nextValue || !nextValue.trim()) return;
      setCommitState({ tone: "saving" });
      try {
        const content = await fileManager.readProjectFile(compositionPath);
        // Token-boundary match so "#0c0c0c" never rewrites part of "#0c0c0cff".
        const matcher = new RegExp(
          `(?<![-\\w#])${previous.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![-\\w])`,
          "g",
        );
        const matches = content.match(matcher)?.length ?? 0;
        if (matches === 0) {
          setCommitState({
            tone: "error",
            message: `Couldn't find the current value in ${compositionPath}. It may have been edited by hand.`,
          });
          trackBlockParamCommit({ tone: "error", blockName, key });
          return;
        }
        // The panel maps a param to a bare literal, with no per-occurrence
        // binding metadata. At the string level it cannot tell "both of these
        // belong to this param" from "one is unrelated adjacent content" (a
        // sibling block, a decoration, a comment). A blind replace of a literal
        // that appears more than once could silently mutate that unrelated
        // content — so refuse and tell the user to disambiguate by hand. Only a
        // unique single occurrence is safe to rewrite automatically.
        if (matches > 1) {
          setCommitState({
            tone: "error",
            message: `"${previous}" appears ${matches}× in ${compositionPath}. The panel can't tell which one belongs to this parameter, so it won't risk changing unrelated content. Edit the file directly to disambiguate.`,
          });
          trackBlockParamCommit({ tone: "error", blockName, key });
          return;
        }
        await fileManager.writeProjectFile(
          compositionPath,
          content.replace(matcher, nextValue),
          content,
        );
        appliedRef.current[key] = nextValue;
        setCommitState({ tone: "saved" });
        trackBlockParamCommit({ tone: "saved", blockName, key });
        setRefreshKey((k) => k + 1);
      } catch {
        setCommitState({ tone: "error", message: "Couldn't save the block file. Retry?" });
        trackBlockParamCommit({ tone: "error", blockName, key });
      }
    },
    [fileManager, compositionPath, setRefreshKey, blockName],
  );

  // Commits join the file's queue: two read-modify-writes of one file must not interleave.
  const commitParam = useCallback(
    (key: string, nextValue: string) =>
      fileManager
        ? serializeStudioFileMutation(fileManager.writeProjectFile, compositionPath, () =>
            commitParamNow(key, nextValue),
          )
        : Promise.resolve(),
    [commitParamNow, compositionPath, fileManager],
  );

  const handleChange = useCallback(
    (key: string, value: string) => {
      setValues((prev) => ({ ...prev, [key]: value }));
      const timers = commitTimersRef.current;
      const existing = timers.get(key);
      if (existing) clearTimeout(existing);
      timers.set(
        key,
        setTimeout(() => {
          timers.delete(key);
          void commitParam(key, value);
        }, 300),
      );
    },
    [commitParam],
  );

  // Flush (not discard) pending commits on unmount so closing the panel
  // within the debounce window doesn't silently drop the last edit.
  const flushRef = useRef<() => void>(() => {});
  flushRef.current = () => {
    for (const [key, timer] of commitTimersRef.current) {
      clearTimeout(timer);
      const value = values[key];
      if (value !== undefined) void commitParam(key, value);
    }
    commitTimersRef.current.clear();
  };
  useEffect(() => () => flushRef.current(), []);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b border-neutral-800">
        <div className="text-[11px] font-semibold text-neutral-200 truncate">{blockTitle}</div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("Close block parameters")}
          className="p-1.5 -m-1 text-neutral-500 hover:text-neutral-300 active:scale-[0.97] transition-colors"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        <div className="text-[9px] font-medium text-neutral-500 uppercase tracking-wider">
          {t("Parameters")}</div>
        {params.length === 0 && (
          <div className="text-[10px] text-neutral-500">{t("This block has no editable parameters.")}</div>
        )}
        {!fileManager && params.length > 0 && (
          <div className="text-[10px] text-warning-ink">
            {t("Block params can't be edited here: no project file access.")}</div>
        )}
        {params.map((param) => (
          <ParamControl
            key={param.key}
            param={param}
            value={values[param.key] ?? param.default}
            disabled={!fileManager}
            onChange={(v) => handleChange(param.key, v)}
          />
        ))}
        {commitState.tone === "saving" && (
          <div className="text-[10px] text-neutral-500" role="status">
            {t("Saving…")}</div>
        )}
        {commitState.tone === "saved" && (
          <div className="text-[10px] text-accent-ink" role="status">
            {t("Saved to")}{" "}{compositionPath}
          </div>
        )}
        {commitState.tone === "error" && (
          <div className="text-[10px] text-danger-ink" role="alert">
            {commitState.message}
          </div>
        )}
      </div>
    </div>
  );
});

function ParamControl({
  param,
  value,
  disabled,
  onChange,
}: {
  param: BlockParam;
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="space-y-1">
      <label className="text-[10px] font-medium text-neutral-400">{param.label}</label>

      {param.type === "color" && (
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={value}
            disabled={disabled}
            aria-label={t("{value0} color", { value0: param.label })}
            onChange={(e) => onChange(e.target.value)}
            className="w-7 h-7 rounded-sm border border-neutral-700 bg-transparent cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
          />
          <input
            type="text"
            value={value}
            disabled={disabled}
            aria-label={t("{value0} value", { value0: param.label })}
            onChange={(e) => onChange(e.target.value)}
            className="flex-1 bg-neutral-900 border border-neutral-800 rounded-sm px-2 py-1 text-[10px] text-neutral-200 font-mono focus:outline-hidden focus:border-neutral-700 disabled:cursor-not-allowed disabled:opacity-50"
          />
        </div>
      )}

      {param.type === "number" && (
        <div className="flex items-center gap-2">
          <input
            type="range"
            min={param.min ?? 0}
            max={param.max ?? 100}
            step={param.step ?? 1}
            value={value}
            disabled={disabled}
            aria-label={param.label}
            onChange={(e) => onChange(e.target.value)}
            className="flex-1 disabled:cursor-not-allowed disabled:opacity-50"
          />
          <span className="text-[10px] text-neutral-400 w-8 text-right tabular-nums">{value}</span>
        </div>
      )}

      {param.type === "text" && (
        <input
          type="text"
          value={value}
          disabled={disabled}
          aria-label={param.label}
          onChange={(e) => onChange(e.target.value)}
          className="w-full bg-neutral-900 border border-neutral-800 rounded-sm px-2 py-1 text-[10px] text-neutral-200 focus:outline-hidden focus:border-neutral-700 disabled:cursor-not-allowed disabled:opacity-50"
        />
      )}

      {param.type === "select" && param.options && (
        <select
          value={value}
          disabled={disabled}
          aria-label={param.label}
          onChange={(e) => onChange(e.target.value)}
          className="w-full bg-neutral-900 border border-neutral-800 rounded-sm px-2 py-1 text-[10px] text-neutral-200 focus:outline-hidden focus:border-neutral-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {param.options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
