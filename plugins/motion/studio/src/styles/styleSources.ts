// Where the style tests read from: Tailwind's entry resolved from `node_modules`, and the file list
// that `@source` in `studio.css` describes, shared so the gate, ratchet and theme test agree.

import { createRequire } from "node:module";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const STYLES_DIR = path.dirname(fileURLToPath(import.meta.url));
const SRC_DIR = path.dirname(STYLES_DIR);
export const REPO_ROOT = path.resolve(SRC_DIR, "../..");

const require = createRequire(import.meta.url);
export const TAILWIND_DIR = path.dirname(require.resolve("tailwindcss/package.json"));

/** Resolves `@import` for Tailwind's compiler: bare `tailwindcss`, or a path. */
export function loadStylesheet(id: string, base: string) {
  const file = id === "tailwindcss" ? path.join(TAILWIND_DIR, "index.css") : path.resolve(base, id);
  return { path: file, base: path.dirname(file), content: readFileSync(file, "utf8") };
}

/** Forward slashes on every platform, so keys match the baseline file and the gate's messages. */
export const toPosixPath = (relativePath: string): string => relativePath.replace(/\\/g, "/");

/**
 * Studio's own sources, keyed by path relative to `from`, for every file the
 * caller keeps. Build output and dependencies are never walked.
 */
export function listSourceFiles(
  keep: (relativePath: string) => boolean,
  from: string = SRC_DIR,
): Map<string, string> {
  const files = new Map<string, string>();
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== "node_modules" && entry.name !== "dist") walk(full);
      } else {
        const relative = toPosixPath(path.relative(from, full));
        if (keep(relative)) files.set(relative, readFileSync(full, "utf8"));
      }
    }
  };
  walk(SRC_DIR);
  return files;
}
