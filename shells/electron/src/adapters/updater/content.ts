import type { ElectronStandaloneContentUpdaterPort } from "@open-design/electron-kit/runtime";

import type { ElectronContentUpdateProjection } from "../../contracts/content-update.js";

const failed = (): ElectronContentUpdateProjection => Object.freeze({
  schemaVersion: 1,
  state: "failed",
  error: Object.freeze({ code: "content-update-failed" as const }),
});

/**
 * Product-facing projection of the frozen Standalone content updater. It
 * exposes no Store paths, release URLs, lifecycle tokens, or arbitrary input.
 */
export function createElectronContentUpdateHandler(updater: ElectronStandaloneContentUpdaterPort): Readonly<{
  prepare(): Promise<ElectronContentUpdateProjection>;
  apply(force: boolean): Promise<ElectronContentUpdateProjection>;
}> {
  return Object.freeze({
    async prepare() {
      try {
        const result = await updater.prepareLatest("observe");
        if (result.status === "current") return Object.freeze({ schemaVersion: 1 as const, state: "current" as const, generationId: result.generationId });
        if (result.status === "shell-reinstall-required") {
          return Object.freeze({
            schemaVersion: 1 as const,
            state: "shell-update-required" as const,
            releaseVersion: result.releaseVersion,
            minimumShellVersion: result.minimumVersion,
          });
        }
        return Object.freeze({
          schemaVersion: 1 as const,
          state: "prepared" as const,
          generationId: result.generation.id,
          releaseVersion: result.generation.releaseVersion,
          authorized: result.authorized,
        });
      } catch {
        return failed();
      }
    },
    async apply(force: boolean) {
      try {
        const result = await updater.applyNow({ force });
        if (result.status === "blocked") {
          return Object.freeze({
            schemaVersion: 1 as const,
            state: "blocked" as const,
            reason: result.reason,
            blockedBy: Object.freeze(result.occupants.map(({ attachmentId, shell }) => Object.freeze({ attachmentId, shellType: shell.type }))),
          });
        }
        return Object.freeze({
          schemaVersion: 1 as const,
          state: "applied" as const,
          generationId: result.generation.id,
          releaseVersion: result.generation.releaseVersion,
        });
      } catch {
        return failed();
      }
    },
  });
}
