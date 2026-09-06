import { mkdir, readFile, writeFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";

type LogRoot = Readonly<{ scope: "shell" | "product"; path: string }>;

function logRoots(value: unknown): readonly LogRoot[] {
  if (!Array.isArray(value)) return [];
  return value.filter((root): root is LogRoot => root != null && typeof root === "object"
    && (root.scope === "shell" || root.scope === "product") && typeof root.path === "string" && isAbsolute(root.path))
    .map(({ scope, path }) => ({ scope, path }));
}

/** Diagnostic locations survive exit; process state and CDP never do. */
export async function observeElectronDevDiagnostics(controlRuntimeRoot: string, status: unknown): Promise<unknown> {
  const path = join(controlRuntimeRoot, "diagnostic-log-roots.json");
  if (status != null) {
    const roots = logRoots(typeof status === "object" && "logRoots" in status ? status.logRoots : null);
    if (roots.length > 0) {
      await mkdir(controlRuntimeRoot, { recursive: true });
      // Concurrent identical observations are harmless; incomplete reads are
      // treated as unavailable diagnostics, never as lifecycle authority.
      await writeFile(path, JSON.stringify(roots), "utf8");
    }
    return status;
  }
  const roots = await readFile(path, "utf8").then((text) => logRoots(JSON.parse(text))).catch(() => []);
  return Object.freeze({ state: "idle", logRoots: roots });
}
