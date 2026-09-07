import { join } from "node:path";

/** Product-owned Store placement shared by production and diagnostic observation. */
export function resolveElectronStandaloneStoreRoot(runtimeRoot: string): string {
  return join(runtimeRoot, "standalone-store");
}
