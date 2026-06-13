import type { ToolPackConfig } from "../config.js";
import { readRuntimeAppVersion } from "../versions.js";

export async function readPackagedVersion(config: ToolPackConfig): Promise<string> {
  return readRuntimeAppVersion(config);
}
