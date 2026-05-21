import type { ToolPackConfig } from "../config.js";
import { packTauriMac } from "../tauri.js";
import type { MacPackResult } from "./types.js";

export async function packMac(config: ToolPackConfig): Promise<MacPackResult> {
  return await packTauriMac(config);
}
