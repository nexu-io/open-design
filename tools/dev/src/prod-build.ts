import { access } from "node:fs/promises";
import path from "node:path";

import { APP_KEYS } from "@open-design/sidecar-proto";

import type { ToolDevAppName } from "./config.js";

/**
 * Fails before any app is started or stopped when --prod has no web build.
 * apps/web/next.config.ts pins distDir to `.next` when OD_WEB_PROD=1.
 */
export async function assertWebProductionBuild(
  workspaceRoot: string,
  targets: readonly ToolDevAppName[],
  options: { prod?: boolean },
): Promise<void> {
  if (options.prod !== true || !targets.includes(APP_KEYS.WEB)) return;

  const buildIdPath = path.join(workspaceRoot, "apps/web/.next/BUILD_ID");
  try {
    await access(buildIdPath);
  } catch (error) {
    throw new Error(
      `--prod requires a web production build, but ${buildIdPath} is not readable.\n` +
      "Run: pnpm --filter @open-design/web build",
      { cause: error },
    );
  }
}
