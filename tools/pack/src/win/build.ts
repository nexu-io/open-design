import type { ToolPackConfig } from "../config.js";
import { packTauriWin } from "../tauri.js";
import type { WinPackResult } from "./types.js";

export async function packWin(config: ToolPackConfig): Promise<WinPackResult> {
  return await packTauriWin(config);
}
