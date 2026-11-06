import { useCallback, useMemo } from "react";
import {
  createStudioSaveHttpError,
  retryStudioSave,
  StudioFileConflictError,
  StudioSaveNetworkError,
} from "../utils/studioSaveDiagnostics";
import { studioExpectedFileVersion, studioWriteHeaders } from "../utils/studioFileVersion";
import { studioApiFetch } from "../utils/studioApiFetch";

export interface UseProjectFileWriterOptions {
  projectId: string | null;
}

async function fetchProjectFile(projectId: string | null, path: string, query: string) {
  if (!projectId) throw new Error("No active project");
  const response = await studioApiFetch(
    `/api/projects/${encodeURIComponent(projectId)}/files/${encodeURIComponent(path)}${query}`,
  );
  if (!response.ok) throw new Error(`Failed to read ${path}`);
  const data = (await response.json()) as { content?: string; version?: string };
  return { content: data.content, version: data.version ?? response.headers.get("etag") };
}

// The etag-guarded project-file read/write pair every Studio save path
// shares. A host mounting hand editing outside Studio needs only this, not
// the full file manager (file tree, editor tabs, uploads, font assets).
export function useProjectFileWriter({ projectId }: UseProjectFileWriterOptions) {
  const fileVersionScope = useMemo(
    () => ({ projectId, versions: new Map<string, string | null>() }),
    [projectId],
  );
  const fileVersions = fileVersionScope.versions;

  const observeProjectFileVersion = useCallback(
    (path: string, version: string | null) => {
      fileVersions.set(path, version);
    },
    [fileVersions],
  );

  const readProjectFile = useCallback(
    async (path: string): Promise<string> => {
      const { content, version } = await fetchProjectFile(projectId, path, "");
      if (typeof content !== "string") throw new Error(`Missing file contents for ${path}`);
      fileVersions.set(path, version);
      return content;
    },
    [fileVersions, projectId],
  );

  const readOptionalProjectFile = useCallback(
    async (path: string): Promise<string> => {
      const { content, version } = await fetchProjectFile(projectId, path, "?optional=1");
      fileVersions.set(path, version);
      return typeof content === "string" ? content : "";
    },
    [fileVersions, projectId],
  );

  const writeProjectFile = useCallback(
    async (path: string, content: string, expectedContent?: string): Promise<void> => {
      if (!projectId) throw new Error("No active project");
      const writeProjectId = projectId;
      let expectedVersion = await studioExpectedFileVersion(fileVersions, path, expectedContent);
      if (expectedVersion === undefined) {
        const preflight = await studioApiFetch(
          `/api/projects/${encodeURIComponent(writeProjectId)}/files/${encodeURIComponent(path)}`,
        );
        if (preflight.ok) {
          const data = (await preflight.json()) as { content?: string; version?: string };
          throw new StudioFileConflictError({
            filePath: path,
            currentVersion: data.version ?? preflight.headers.get("etag"),
            currentContent: data.content ?? null,
            attemptedContent: content,
          });
        } else if (preflight.status === 404) {
          expectedVersion = null;
        } else {
          throw await createStudioSaveHttpError(preflight, `Failed to read ${path} before save`);
        }
      }
      // fallow-ignore-next-line complexity
      await retryStudioSave(async () => {
        // Each request gets its own receipt identity. If a committed request loses its response,
        // the retry can produce a second filesystem receipt that must be suppressed independently.
        let response: Response;
        try {
          response = await studioApiFetch(
            `/api/projects/${encodeURIComponent(writeProjectId)}/files/${encodeURIComponent(path)}`,
            {
              method: "PUT",
              headers: {
                "Content-Type": "text/plain",
                ...studioWriteHeaders(),
                ...(expectedVersion ? { "If-Match": expectedVersion } : { "If-None-Match": "*" }),
              },
              body: content,
            },
          );
        } catch (error) {
          throw new StudioSaveNetworkError(`Failed to save ${path}: network error`, {
            cause: error,
          });
        }
        if (response.status === 409) {
          const conflict = (await response.json().catch(() => null)) as {
            currentVersion?: string | null;
            currentContent?: string | null;
          } | null;
          const currentVersion = conflict?.currentVersion ?? null;
          if (currentVersion && conflict?.currentContent === content) {
            fileVersions.set(path, currentVersion);
            return;
          }
          throw new StudioFileConflictError({
            filePath: path,
            currentVersion,
            currentContent: conflict?.currentContent ?? null,
            attemptedContent: content,
          });
        }
        if (!response.ok) throw await createStudioSaveHttpError(response, `Failed to save ${path}`);
        const result = (await response.json()) as { version?: string };
        const version = result.version ?? response.headers.get("etag");
        if (!version)
          throw new Error(`Save response for ${path} did not include a content version`);
        fileVersions.set(path, version);
      });
    },
    [fileVersions, projectId],
  );

  return useMemo(
    () => ({
      fileVersions,
      readProjectFile,
      writeProjectFile,
      readOptionalProjectFile,
      observeProjectFileVersion,
    }),
    [
      fileVersions,
      readProjectFile,
      writeProjectFile,
      readOptionalProjectFile,
      observeProjectFileVersion,
    ],
  );
}
