export type StudioRuntimeMode = "development" | "production";

function readStudioImportMetaEnv(): ImportMetaEnv | undefined {
  try {
    return import.meta.env;
  } catch {
    return undefined;
  }
}

const studioImportMetaEnv = readStudioImportMetaEnv();

/**
 * Test hooks belong to Vite's development server, even when that server uses
 * production React for performance measurement. A production build has neither
 * DEV nor the development server mode, so the API stays out of shipped assets.
 */
export const STUDIO_RUNTIME_MODE: StudioRuntimeMode = studioImportMetaEnv?.DEV
  ? "development"
  : "production";

export const STUDIO_TEST_HOOKS_ENABLED =
  studioImportMetaEnv?.DEV === true || studioImportMetaEnv?.MODE === "development";
