import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export {
  pathExists,
  sizeExistingFileBytes,
  sizePathBytes,
  sumChildDirectorySizes,
} from "../lib/fs.js";

export const MAC_XATTRS_TO_SCRUB = ["com.apple.quarantine", "com.apple.provenance", "com.apple.macl"] as const;

export async function scrubMacExtendedAttributes(path: string): Promise<void> {
  for (const attribute of MAC_XATTRS_TO_SCRUB) {
    try {
      await execFileAsync("xattr", ["-dr", attribute, path]);
    } catch {
      // Ignore when the attribute is absent, protected, or unsupported for local artifacts.
    }
  }
}
