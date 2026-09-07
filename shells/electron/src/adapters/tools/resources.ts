import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Stable self-export resolves the owner in source and compiled package layouts alike.
export const electronShellRoot = dirname(fileURLToPath(import.meta.resolve("@open-design/shell-electron/package.json")));
export const electronShellSource = (path: string) => join(electronShellRoot, "src", path);
