import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Node resolves the module URL through symlinks, while argv[1] can retain them.
export function isMain(moduleUrl: string): boolean {
  if (!process.argv[1]) return false;
  try { return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(moduleUrl)); }
  catch { return false; }
}
