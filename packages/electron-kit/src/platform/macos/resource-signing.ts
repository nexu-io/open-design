import { open, readdir } from "node:fs/promises";
import { join } from "node:path";

/** Chromium data packs are resources sealed by their enclosing bundle, not
 * independent code-signing targets. Keep every other file on the default path.
 * Validate the data-pack header before allowing the signer to omit these files;
 * an executable renamed to .pak must fail, not escape code signing. */
export function macResourceSigningPattern(appPath: string): string {
  const root = appPath.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  return `^${root}/Contents/(?:[^/]+/)*Resources/(?:[^/]+/)*[^/]+\\.pak$`;
}

export async function inspectMacSigningResources(appPath: string): Promise<number> {
  const pattern = new RegExp(macResourceSigningPattern(appPath), "u");
  let count = 0;
  async function visit(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      // Framework aliases point to the same versioned files. Inspect physical
      // entries once; do not follow aliases or introduce recursive link walks.
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile() && pattern.test(path)) {
        const file = await open(path, "r");
        try {
          const header = Buffer.alloc(12);
          const { bytesRead } = await file.read(header, 0, header.length, 0);
          const version = header.readUInt32LE(0);
          if (bytesRead < 12 || (version !== 4 && version !== 5)) {
            throw new Error(`invalid Chromium signing resource: ${path}`);
          }
          count += 1;
        } finally { await file.close(); }
      }
    }
  }
  await visit(join(appPath, "Contents"));
  return count;
}
