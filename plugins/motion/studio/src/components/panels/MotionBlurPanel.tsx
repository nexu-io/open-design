import { useI18n } from "../../i18n/I18n";
import { memo, useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import type { Composition } from "@hyperframes/sdk";
import type { MotionBlurSettings } from "@hyperframes/core/motion-blur-settings";
import { useStudioPlaybackContext, useStudioShellContext } from "../../contexts/StudioContext";
import { useFileManagerContext } from "../../contexts/FileManagerContext";
import {
  useVariablesPersist,
  type UseVariablesPersistParams,
} from "../../hooks/useVariablesPersist";
import { resolveMasterCompositionPath } from "../../utils/studioUrlState";
import { Button } from "../ui";
import {
  BLUR_LEVELS,
  changedEdits,
  findCompositionRoot,
  levelOf,
  patchForLevel,
  readPreviewRootAttributes,
  sameAttributes,
  settingsOf,
  withEdits,
  type BlurLevel,
  type RootAttributes,
} from "./motionBlurPanelModel";

export interface MotionBlurPanelProps {
  sdkSession: Composition | null;
  publishSdkSession?: UseVariablesPersistParams["publishSdkSession"];
  reloadPreview: () => void;
  recordEdit: UseVariablesPersistParams["recordEdit"];
}

const POLL_MS = 500;
/** After a write the preview is reloading: keep what was just written instead of the old document. */
const SETTLE_MS = 1500;

/** Thrown from the edit when the file already holds the level, so nothing is written or recorded for undo. */
class NothingToChange extends Error {}

/** The preview's own root attributes, polled; `hold` pins an optimistic value until the preview catches up. */
function useLivePreviewAttributes(
  previewIframeRef: { current: HTMLIFrameElement | null },
  refreshKey: number,
) {
  const [live, setLive] = useState<RootAttributes | null>(null);
  const holdUntil = useRef(0);
  useEffect(() => {
    const read = () => {
      const found = readPreviewRootAttributes(previewIframeRef.current);
      if (found && Date.now() >= holdUntil.current) {
        setLive((current) => (sameAttributes(current, found) ? current : found));
      }
    };
    read();
    const timer = setInterval(read, POLL_MS);
    return () => clearInterval(timer);
  }, [previewIframeRef, refreshKey]);
  const hold = useCallback((next: (current: RootAttributes | null) => RootAttributes) => {
    holdUntil.current = Date.now() + SETTLE_MS;
    setLive(next);
  }, []);
  return [live, hold] as const;
}

export const MotionBlurPanel = memo(function MotionBlurPanel({
  sdkSession,
  publishSdkSession,
  reloadPreview,
  recordEdit,
}: MotionBlurPanelProps) {
  const { t } = useI18n();
  const { activeCompPath, previewIframeRef, showToast } = useStudioShellContext();
  const { refreshKey } = useStudioPlaybackContext();
  const { readProjectFile, writeProjectFile, compositions } = useFileManagerContext();
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  const [live, hold] = useLivePreviewAttributes(previewIframeRef, refreshKey);

  useEffect(() => sdkSession?.on("change", rerender), [sdkSession]);

  const root = sdkSession ? findCompositionRoot(sdkSession.getRootElements()) : null;
  // The preview's own root is the truth after an undo or an outside edit, which the shared session does not follow.
  const attributes = live ?? root?.attributes ?? null;
  const settings = useMemo(() => (attributes ? settingsOf(attributes) : null), [attributes]);
  const isMain =
    activeCompPath == null || activeCompPath === resolveMasterCompositionPath(compositions);
  const persist = useVariablesPersist({
    sdkSession,
    activeCompPath,
    readProjectFile,
    writeProjectFile,
    recordEdit,
    reloadPreview,
    publishSdkSession,
  });

  const apply = useCallback(
    async (patch: Partial<MotionBlurSettings>) => {
      if (!attributes) return;
      // The write lands on the file's own root, so the edits are worked out there, not from the preview.
      let applied: Array<{ name: string; value: string | null }> = [];
      try {
        await persist("Edit motion blur", (session) => {
          const target = findCompositionRoot(session.getRootElements());
          if (!target) return;
          const next = { ...settingsOf(target.attributes), ...patch };
          applied = changedEdits(target.attributes, next);
          if (applied.length === 0) throw new NothingToChange();
          for (const e of applied) {
            session.dispatch({
              type: "setAttribute",
              target: target.id,
              name: e.name,
              value: e.value,
            });
          }
        });
        hold((current) => withEdits(current ?? attributes, applied));
        rerender();
      } catch (err) {
        if (err instanceof NothingToChange) return;
        showToast(err instanceof Error ? err.message : String(err), "error");
      }
    },
    [attributes, persist, hold, showToast],
  );

  if (!settings) {
    return (
      <p className="p-3 text-[10px] leading-relaxed text-neutral-500">
        {t("Open a composition to set up motion blur.")}</p>
    );
  }
  const locked = !isMain;
  // A sub-composition's own root is not the setting being edited, so no level is shown while locked.
  const current = locked ? null : levelOf(settings);

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-3 text-[11px] text-neutral-300">
      <span className="text-[12px] font-medium text-neutral-100">{t("Motion blur")}</span>
      <div role="radiogroup" aria-label={t("Motion blur")} className="flex gap-1.5">
        {BLUR_LEVELS.map(({ level, label }) => (
          <Button
            key={level}
            role="radio"
            aria-checked={current === level}
            size="sm"
            variant={current === level ? "secondary" : "ghost"}
            className="flex-1"
            disabled={locked}
            onClick={() => void apply(patchForLevel(level as BlurLevel))}
          >
            {label}
          </Button>
        ))}
      </div>
      {locked ? (
        <p className="text-[10px] leading-relaxed text-amber-400/90">
          {t("Motion blur is read from the main composition. Open it to change this setting.")}</p>
      ) : null}
    </div>
  );
});
