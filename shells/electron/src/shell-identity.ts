import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { fileURLToPath } from "node:url";

/** Digest the actual bundled Electron entry, not mutable presentation metadata. */
export async function digestElectronShellEntry(
  entryUrl: string = import.meta.url,
): Promise<`sha256:${string}`> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(fileURLToPath(entryUrl))) {
    hash.update(chunk as Buffer);
  }
  return `sha256:${hash.digest("hex")}`;
}
