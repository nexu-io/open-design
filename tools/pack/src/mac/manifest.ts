import type { ToolPackConfig } from "../config.js";
import { readRuntimeShellVersion } from "../versions.js";

export async function readPackagedVersion(config: ToolPackConfig): Promise<string> {
  return readRuntimeShellVersion(config);
}
