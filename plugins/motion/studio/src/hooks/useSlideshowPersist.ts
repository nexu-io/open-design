import { useCallback } from "react";
import type { Composition } from "@hyperframes/sdk";
import type { SlideshowManifest } from "@hyperframes/core/slideshow";
import type { PublishSdkSession } from "../utils/sdkCutover";
import { persistSlideshowManifest } from "../utils/setSlideshowManifest";

export interface UseSlideshowPersistParams {
  sdkSession: Composition | null;
  activeCompPath: string | null;
  readProjectFile: (path: string) => Promise<string>;
  writeProjectFile: (path: string, content: string) => Promise<void>;
  recordEdit: (entry: {
    label: string;
    files: Record<string, { before: string; after: string }>;
  }) => Promise<void>;
  reloadPreview: () => void;
  /** Publish a fully persisted candidate SDK session. */
  publishSdkSession?: PublishSdkSession;
  /**
   * When provided, rapid writes with the same key coalesce through the
   * save-queue infra (via recordEdit's coalesceKey) so back-to-back persists
   * collapse to a single undo entry rather than polluting history.
   * Pass e.g. `"slideshow-notes:" + activeCompPath` for the notes path.
   */
  coalesceKey?: string;
}

export function useSlideshowPersist({
  sdkSession,
  activeCompPath,
  readProjectFile,
  writeProjectFile,
  recordEdit,
  reloadPreview,
  publishSdkSession,
  coalesceKey,
}: UseSlideshowPersistParams): (manifest: SlideshowManifest) => Promise<void> {
  return useCallback(
    async (manifest: SlideshowManifest) => {
      if (!sdkSession) return;
      const path = activeCompPath ?? "index.html";
      const originalContent = await readProjectFile(path);
      await persistSlideshowManifest({
        manifest,
        originalContent,
        targetPath: path,
        deps: {
          editHistory: { recordEdit },
          writeProjectFile,
          reloadPreview,
          readProjectFile,
          publishSession: publishSdkSession,
        },
        coalesceKey,
      });
    },
    [
      sdkSession,
      activeCompPath,
      readProjectFile,
      writeProjectFile,
      recordEdit,
      reloadPreview,
      publishSdkSession,
      coalesceKey,
    ],
  );
}
