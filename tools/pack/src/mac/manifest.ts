import type { ToolPackConfig } from "../config/index.js";
import { readRuntimeAppVersion } from "../versioning/index.js";

export async function readPackagedVersion(config: ToolPackConfig): Promise<string> {
  return readRuntimeAppVersion(config);
}
