import { homedir } from "node:os";
import path from "node:path";

export function resolveToolsDevDataRoot(
  workspaceRoot: string,
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const configured = env.OD_DATA_DIR?.trim();
  if (configured == null || configured.length === 0) return null;
  const home = homedir();
  const expanded = configured
    .replace(/^~(?=$|[\\/])/, home)
    .replace(/^\$HOME(?=$|[\\/])/, home)
    .replace(/^\$\{HOME\}(?=$|[\\/])/, home);
  return path.isAbsolute(expanded) ? path.resolve(expanded) : path.resolve(workspaceRoot, expanded);
}
