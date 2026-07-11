// Feature-local hook for the project-files/live-artifacts/artifact-persistence
// cluster: the project's file list + live-artifact list (and the refresh
// functions that reload them), the six "open X" request signals FileWorkspace
// consumes (open/browser-open/share/download/design-system-edit/slide-nav),
// the HTML-content read cache, and the artifact-persistence pipeline
// (`persistArtifact` / `artifactFromStandaloneHtml`).
//
// This is the highest-fan-out cluster in the file: `requestOpenFile`,
// `refreshProjectFiles`/`refreshWorkspaceItems`, and `persistArtifact` are
// called from many not-yet-extracted clusters (brand extraction, run
// reattach/recovery, the chat-send pipeline, the plugin-folder agent action).
// Those callers are unaffected by this move — they keep calling the exact
// same function references, now sourced from this hook's return value instead
// of an inline `useCallback` in the orchestrator.
//
// `projectDesignSystemId` (a derived value) and `savedArtifactRef`/`setError`/
// `setFilesRefresh` (cross-cutting orchestrator state written by several other
// not-yet-extracted clusters) are taken as params rather than owned here.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { createHtmlArtifactManifest, inferLegacyManifest } from '../../../artifacts/manifest';
import { resolveHtmlPointerArtifactTarget } from '../../../artifacts/pointer';
import { validateHtmlArtifact } from '../../../artifacts/validate';
import { resolvePersistedArtifactHtml } from '../../../artifacts/recover';
import type { BrowserOpenRequest } from '../../../components/FileWorkspace';
import type { Artifact, LiveArtifactSummary, ProjectFile } from '../../../types';
import {
  artifactBaseNameFor,
  artifactExtensionFor,
  artifactFromRecoverableSourceText,
  filterProjectFilesByMinMtime,
} from '../rules';
import { projectViewTransportPort } from '../dependencies';
import type { ProjectViewTransportPort } from '../ports';

interface NamedNonceRequest {
  name: string;
  nonce: number;
}

interface DesignSystemEditRequest {
  module: 'logo';
  nonce: number;
}

interface SlideNavRequest {
  name: string;
  slideIndex: number;
  nonce: number;
}

export interface ProjectFilesAndArtifactsController {
  projectFiles: ProjectFile[];
  projectFilesRef: MutableRefObject<ProjectFile[]>;
  liveArtifacts: LiveArtifactSummary[];
  openRequest: NamedNonceRequest | null;
  browserOpenRequest: BrowserOpenRequest | null;
  setBrowserOpenRequest: Dispatch<SetStateAction<BrowserOpenRequest | null>>;
  shareRequest: NamedNonceRequest | null;
  setShareRequest: Dispatch<SetStateAction<NamedNonceRequest | null>>;
  downloadRequest: NamedNonceRequest | null;
  setDownloadRequest: Dispatch<SetStateAction<NamedNonceRequest | null>>;
  designSystemEditRequest: DesignSystemEditRequest | null;
  setDesignSystemEditRequest: Dispatch<SetStateAction<DesignSystemEditRequest | null>>;
  slideNavRequest: SlideNavRequest | null;
  setSlideNavRequest: Dispatch<SetStateAction<SlideNavRequest | null>>;
  refreshProjectFiles: () => Promise<ProjectFile[]>;
  refreshLiveArtifacts: () => Promise<LiveArtifactSummary[]>;
  refreshWorkspaceItems: () => Promise<ProjectFile[]>;
  requestOpenFile: (name: string) => void;
  readProjectHtml: (name: string) => Promise<string | null>;
  persistArtifact: (
    art: Artifact,
    projectFilesSnapshot?: ProjectFile[],
    sourceText?: string,
    options?: { pointerMinMtime?: number },
  ) => Promise<void>;
  artifactFromStandaloneHtml: (sourceText: string) => Artifact | null;
}

export function useProjectFilesAndArtifacts(
  port: ProjectViewTransportPort,
  projectId: string,
  projectSkillId: string | undefined,
  projectDesignSystemId: string | null | undefined,
  savedArtifactRef: MutableRefObject<string | null>,
  setError: (message: string | null) => void,
  setFilesRefresh: Dispatch<SetStateAction<number>>,
): ProjectFilesAndArtifactsController {
  const [projectFiles, setProjectFiles] = useState<ProjectFile[]>([]);
  const projectFilesRef = useRef<ProjectFile[]>([]);
  const [liveArtifacts, setLiveArtifacts] = useState<LiveArtifactSummary[]>([]);

  // Routed to FileWorkspace — bumped whenever the user clicks "open" on a
  // tool card, an attachment chip, or a produced-file chip in chat. We
  // include a nonce so re-clicking the same name after the user closed the
  // tab still focuses it.
  const [openRequest, setOpenRequest] = useState<NamedNonceRequest | null>(null);
  const [browserOpenRequest, setBrowserOpenRequest] = useState<BrowserOpenRequest | null>(null);
  // Like `openRequest`, but additionally asks the preview workspace to open the
  // file's Share/Export menu. Drives the "Share" next-step action: it reuses the
  // existing export/deploy surface rather than introducing a new share backend.
  const [shareRequest, setShareRequest] = useState<NamedNonceRequest | null>(null);
  // Parallel to shareRequest, but opens the workspace's Download/Export menu.
  const [downloadRequest, setDownloadRequest] = useState<NamedNonceRequest | null>(null);
  const [designSystemEditRequest, setDesignSystemEditRequest] =
    useState<DesignSystemEditRequest | null>(null);
  // When a queued chat send starts processing, ask the workspace to flip the
  // deck preview to the slide its marked element lives on, so the user watches
  // the edit land in context instead of staying parked on slide 1. Mirrors the
  // `shareRequest` nonce signal: FileWorkspace matches `name` against the open
  // file and FileViewer consumes each nonce once.
  const [slideNavRequest, setSlideNavRequest] = useState<SlideNavRequest | null>(null);

  const refreshProjectFiles = useCallback(async (): Promise<ProjectFile[]> => {
    const next = await port.fetchProjectFiles(projectId);
    projectFilesRef.current = next;
    setProjectFiles(next);
    return next;
  }, [port, projectId]);

  useEffect(() => {
    projectFilesRef.current = projectFiles;
  }, [projectFiles]);

  // Cache HTML file contents so the auto-open module check (issue #2744) does
  // not re-fetch unchanged entries on every Write. Keyed by file name with the
  // mtime stored alongside, so a rewrite REPLACES the file's single entry
  // rather than accreting a new key. Bounded by the project's HTML file count.
  const htmlContentCacheRef = useRef<Map<string, { mtime: number; text: string | null }>>(
    new Map(),
  );
  const readProjectHtml = useCallback(
    async (name: string): Promise<string | null> => {
      const file = projectFilesRef.current.find((entry) => entry.name === name);
      const mtime = file?.mtime ?? 0;
      const cached = htmlContentCacheRef.current.get(name);
      if (cached && cached.mtime === mtime) return cached.text;
      const text = await port.readProjectRawText(projectId, name);
      htmlContentCacheRef.current.set(name, { mtime, text });
      return text;
    },
    [port, projectId],
  );

  const refreshLiveArtifacts = useCallback(async (): Promise<LiveArtifactSummary[]> => {
    const next = await port.fetchLiveArtifacts(projectId);
    setLiveArtifacts(next);
    return next;
  }, [port, projectId]);

  const refreshWorkspaceItems = useCallback(async (): Promise<ProjectFile[]> => {
    const [nextFiles] = await Promise.all([refreshProjectFiles(), refreshLiveArtifacts()]);
    return nextFiles;
  }, [refreshLiveArtifacts, refreshProjectFiles]);

  const requestOpenFile = useCallback((name: string) => {
    if (!name) return;
    setOpenRequest({ name, nonce: Date.now() });
  }, []);

  const persistArtifact = useCallback(
    async (
      art: Artifact,
      projectFilesSnapshot?: ProjectFile[],
      sourceText?: string,
      options: { pointerMinMtime?: number } = {},
    ) => {
      const persistedHtml = resolvePersistedArtifactHtml({
        artifactHtml: art.html,
        identifier: art.identifier,
        sourceText,
      });
      const artifactToPersist = persistedHtml === art.html ? art : { ...art, html: persistedHtml };
      const baseName = artifactBaseNameFor(art);
      const ext = artifactExtensionFor(art);
      // Pick a name that doesn't collide with an existing project file.
      // The first run uses `<base>.<ext>`; subsequent runs append `-2`, `-3`…
      // so prior artifacts aren't silently overwritten.
      const currentProjectFiles = projectFilesSnapshot ?? projectFilesRef.current;
      const existing = new Set(currentProjectFiles.map((f) => f.name));
      let fileName = `${baseName}${ext}`;
      let n = 2;
      while (existing.has(fileName) && savedArtifactRef.current !== fileName) {
        fileName = `${baseName}-${n}${ext}`;
        n += 1;
      }
      if (ext === '.html') {
        const pointerProjectFiles = filterProjectFilesByMinMtime(
          currentProjectFiles,
          options.pointerMinMtime,
        );
        const pointerTarget = resolveHtmlPointerArtifactTarget({
          content: artifactToPersist.html,
          candidateFileName: fileName,
          projectFiles: pointerProjectFiles,
        });
        if (pointerTarget) {
          if (savedArtifactRef.current === pointerTarget) return;
          savedArtifactRef.current = pointerTarget;
          requestOpenFile(pointerTarget);
          return;
        }
      }
      // Pre-write structural gate for HTML artifacts (#50, #1143). Reject
      // bodies that obviously aren't a complete document — usually a one-line
      // prose summary the model emitted inside `<artifact type="text/html">`
      // when only Edit-tool changes happened this turn. Without this guard,
      // such content lands as a phantom HTML file in the project panel.
      if (ext === '.html') {
        const validation = validateHtmlArtifact(artifactToPersist.html);
        if (!validation.ok) {
          setError(`Refused to save artifact "${art.identifier || art.title || 'untitled'}": ${validation.reason}`);
          return;
        }
      }
      if (savedArtifactRef.current === fileName) return;
      const title = art.title || art.identifier || fileName;
      const metadata = {
        identifier: art.identifier,
        artifactType: art.artifactType,
        inferred: false,
      };
      const manifest =
        ext === '.html'
          ? createHtmlArtifactManifest({
              entry: fileName,
              title,
              sourceSkillId: projectSkillId,
              designSystemId: projectDesignSystemId,
              metadata,
            })
          : inferLegacyManifest({
              entry: fileName,
              title,
              metadata: {
                ...metadata,
                sourceSkillId: projectSkillId,
                designSystemId: projectDesignSystemId,
              },
            });
      const file = await port.writeProjectTextFile(projectId, fileName, artifactToPersist.html, {
        artifactManifest: manifest ?? undefined,
      });
      if (file) {
        savedArtifactRef.current = file.name;
        setFilesRefresh((n) => n + 1);
        // Surface the daemon's stub-guard warning when it fires in `warn`
        // mode (the default). Without this the warning would land in the
        // file metadata silently and the user would never see that the
        // model shipped a placeholder.
        if (file.stubGuardWarning) {
          setError(
            `Saved "${file.name}", but the model may have shipped a placeholder: ` +
              `${file.stubGuardWarning.message}`,
          );
        }
        // Auto-open the freshly-persisted artifact as a tab so the user
        // sees it without an extra click. The Write-tool path already does
        // this for tool-emitted files; this handles the artifact-tag path.
        requestOpenFile(file.name);
      } else {
        // writeProjectTextFile collapses all failure paths (non-OK HTTP
        // responses, network errors, and stub-guard 422s) to null — the
        // helper's return contract would need to be widened to distinguish
        // them, which is out of scope here.  Show a generic banner so the
        // failure is observable rather than silent; the daemon logs carry
        // the structured details for any specific error type.
        // Clear the saved-artifact ref so the user can retry.
        savedArtifactRef.current = '';
        setError(
          `Couldn't save artifact "${fileName}". The write failed — ` +
            'check the daemon logs for details.',
        );
      }
    },
    [port, projectId, projectDesignSystemId, projectSkillId, requestOpenFile, savedArtifactRef, setError, setFilesRefresh],
  );

  const artifactFromStandaloneHtml = useCallback(
    (sourceText: string): Artifact | null => artifactFromRecoverableSourceText(sourceText),
    [],
  );

  return {
    projectFiles,
    projectFilesRef,
    liveArtifacts,
    openRequest,
    browserOpenRequest,
    setBrowserOpenRequest,
    shareRequest,
    setShareRequest,
    downloadRequest,
    setDownloadRequest,
    designSystemEditRequest,
    setDesignSystemEditRequest,
    slideNavRequest,
    setSlideNavRequest,
    refreshProjectFiles,
    refreshLiveArtifacts,
    refreshWorkspaceItems,
    requestOpenFile,
    readProjectHtml,
    persistArtifact,
    artifactFromStandaloneHtml,
  };
}

/** Wirer: binds the real project-view transport port; swap in tests. */
export function useWiredProjectFilesAndArtifacts(
  projectId: string,
  projectSkillId: string | undefined,
  projectDesignSystemId: string | null | undefined,
  savedArtifactRef: MutableRefObject<string | null>,
  setError: (message: string | null) => void,
  setFilesRefresh: Dispatch<SetStateAction<number>>,
): ProjectFilesAndArtifactsController {
  return useProjectFilesAndArtifacts(
    projectViewTransportPort,
    projectId,
    projectSkillId,
    projectDesignSystemId,
    savedArtifactRef,
    setError,
    setFilesRefresh,
  );
}
