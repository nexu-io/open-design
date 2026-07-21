import { createRequire } from "node:module";
import { open, readFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);

/**
 * Linux AppImage cold-start prewarm (issue #5835).
 *
 * Every AppImage launch mounts a FRESH FUSE squashfs, and the VFS page cache
 * for FUSE files is per-mount — so the underlying AppImage file can be fully
 * cached while every launch still cold-reads the daemon/web payload through
 * the FUSE server. The daemon sidecar demand-pages its 124 MB bundled node
 * binary (plus its JS dist) one fault at a time while the Electron main
 * process faults through the same single mount, and the 35s status budget is
 * blown before the daemon ever binds its IPC socket.
 *
 * The same payload read sequentially is dramatically faster (~45 MB/s through
 * squashfuse vs ~5 MB/s demand-paged under contention: 124 MB in ~3s instead
 * of ~25-60s). Reading it into the page cache BEFORE spawning a sidecar
 * moves that cost out of the timed status window and turns every launch into
 * the "later launches are warm" case the win32 budget already assumes.
 *
 * Everything here is best-effort: a prewarm miss must never break startup,
 * it just falls back to the old demand-paged behavior.
 */

export type PrewarmTarget = {
  kind: "file" | "dir";
  path: string;
};

export type PrewarmReport = {
  skipped: boolean;
  reason?: string;
  files?: number;
  bytes?: number;
  durationMs?: number;
};

/** /proc/mounts escapes space, tab, newline and backslash as octal \040 etc. */
export function unescapeProcMountsField(field: string): string {
  return field.replace(/\\([0-7]{3})/g, (_, octal: string) =>
    String.fromCharCode(Number.parseInt(octal, 8)),
  );
}

/**
 * Decides whether `targetPath` lives on a FUSE mount, parsing an injected
 * /proc/mounts table. Returns null when no mountpoint matches at all (a
 * malformed table), so the caller can choose its own fail-open/closed policy.
 */
export function detectFuseBackedPath(
  targetPath: string,
  mountsContent: string,
): boolean | null {
  let bestMatch: { mountpoint: string; fstype: string } | null = null;
  for (const line of mountsContent.split("\n")) {
    const fields = line.trim().split(/\s+/);
    if (fields.length < 3) continue;
    const mountpoint = unescapeProcMountsField(fields[1]);
    const fstype = fields[2];
    const matches =
      mountpoint === "/"
        ? targetPath.startsWith("/")
        : targetPath === mountpoint || targetPath.startsWith(`${mountpoint}/`);
    if (!matches) continue;
    if (bestMatch == null || mountpoint.length > bestMatch.mountpoint.length) {
      bestMatch = { mountpoint, fstype };
    }
  }
  if (bestMatch == null) return null;
  return /^fuse(\..*)?$/.test(bestMatch.fstype);
}

/**
 * Daemon cold-start payload: the bundled node binary (the dominant 124 MB
 * demand-paged artifact) plus the daemon's compiled dist. When the sidecar
 * would run under Electron-as-node (no bundled node configured) the binary
 * target is omitted — the Electron executable is already paged in, since the
 * launcher itself is running from it.
 */
export function resolveDaemonPrewarmTargets(options: {
  nodeCommand: string | null;
  daemonSidecarEntry: string;
  resourceRoot: string | null;
}): PrewarmTarget[] {
  const targets: PrewarmTarget[] = [];
  if (options.nodeCommand != null && options.nodeCommand.length > 0) {
    targets.push({ kind: "file", path: options.nodeCommand });
  }
  targets.push({ kind: "dir", path: dirname(dirname(options.daemonSidecarEntry)) });
  // The daemon registers ~460 bundled plugins at startup by reading them from
  // the resource root (~70 MB here) — measured as the dominant cold FUSE read
  // left in the daemon's timed status window after the binary and dist are
  // warm (6.4s -> 2.7s ready time once plugins are prewarmed too).
  if (options.resourceRoot != null && options.resourceRoot.length > 0) {
    targets.push({ kind: "dir", path: join(options.resourceRoot, "plugins") });
  }
  return targets;
}

/**
 * Web cold-start payload. In "server" output mode (always the case on Linux)
 * the web sidecar boots a Next server from the shipped web package, so the
 * cold set is the sidecar dist, the compiled `.next/server` route chunks, and
 * the Next framework's own server code. `next/dist/compiled` is deliberately
 * NOT prewarmed: at ~107 MB it dominates the read set while only a small
 * fraction is required during the status window — the rest is demand-loaded
 * on first paint, which has no hard timeout. In "standalone" mode the whole
 * self-contained bundle root is the payload. Missing pieces are skipped at
 * collection time, so stale targets never fail the prewarm.
 */
export function resolveWebPrewarmTargets(options: {
  webSidecarEntry: string | null;
  webStandaloneRoot: string | null;
  resolveNextPackageRoot?: (webPackageRoot: string) => string | null;
}): PrewarmTarget[] {
  if (options.webStandaloneRoot != null && options.webStandaloneRoot.length > 0) {
    return [{ kind: "dir", path: options.webStandaloneRoot }];
  }
  if (options.webSidecarEntry == null || options.webSidecarEntry.length === 0) {
    return [];
  }
  // <webPkg>/dist/sidecar/index.js -> sidecarDir = dist/sidecar, webPkg = ../..
  const sidecarDir = dirname(options.webSidecarEntry);
  const webPackageRoot = dirname(dirname(sidecarDir));
  const targets: PrewarmTarget[] = [
    { kind: "dir", path: sidecarDir },
    { kind: "dir", path: join(webPackageRoot, ".next", "server") },
  ];
  const resolveNext =
    options.resolveNextPackageRoot ?? defaultResolveNextPackageRoot;
  const nextRoot = resolveNext(webPackageRoot);
  if (nextRoot != null) {
    targets.push({ kind: "dir", path: join(nextRoot, "dist", "server") });
  }
  return targets;
}

function defaultResolveNextPackageRoot(webPackageRoot: string): string | null {
  try {
    const packageJsonPath = require.resolve("next/package.json", {
      paths: [webPackageRoot],
    });
    return dirname(packageJsonPath);
  } catch {
    return null;
  }
}

/**
 * Expands targets into a concrete file list. Directories are walked
 * recursively; symlinks are not followed (a FUSE mount full of symlinks must
 * not pull the prewarm outside its payload); missing/unreadable paths are
 * dropped silently. The result is sorted and de-duplicated so reports and
 * tests are deterministic.
 */
export async function collectPrewarmFiles(
  targets: PrewarmTarget[],
): Promise<string[]> {
  const files = new Set<string>();

  const walk = async (dir: string): Promise<void> => {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile() && !entry.isSymbolicLink()) {
        files.add(fullPath);
      }
    }
  };

  for (const target of targets) {
    if (target.kind === "dir") {
      await walk(target.path);
    } else {
      try {
        await open(target.path, "r").then((handle) => handle.close());
        files.add(target.path);
      } catch {
        // Missing file target: skip.
      }
    }
  }

  return [...files].sort();
}

/**
 * Reads each file sequentially into a small reused buffer and discards the
 * contents — the point is populating the VFS page cache, not consuming the
 * data. A concurrency of two keeps a FUSE server saturated without making
 * the reads random. Per-file failures are swallowed: whatever could not be
 * prewarmed will simply be demand-paged later, as before.
 */
export async function prewarmFiles(
  files: string[],
  options: { concurrency?: number; chunkBytes?: number } = {},
): Promise<{ files: number; bytes: number }> {
  const concurrency = Math.max(1, options.concurrency ?? 2);
  const chunkBytes = Math.max(64 * 1024, options.chunkBytes ?? 4 * 1024 * 1024);
  let done = 0;
  let totalBytes = 0;
  let nextIndex = 0;

  const worker = async (): Promise<void> => {
    const buffer = Buffer.alloc(chunkBytes);
    while (nextIndex < files.length) {
      const file = files[nextIndex++];
      try {
        const handle = await open(file, "r");
        try {
          for (;;) {
            const { bytesRead } = await handle.read(buffer, 0, chunkBytes, null);
            if (bytesRead <= 0) break;
            totalBytes += bytesRead;
          }
        } finally {
          await handle.close();
        }
        done += 1;
      } catch {
        // Unreadable file: leave it to demand paging.
      }
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(concurrency, files.length) }, () => worker()),
  );
  return { files: done, bytes: totalBytes };
}

/**
 * Gated, best-effort prewarm entry point used by the packaged launcher.
 *
 * Gates: linux only (win32 already has its own AV-scan budget, macOS has no
 * per-launch FUSE remount), and only when the payload actually lives on a
 * FUSE mount — plain-file installs (unpacked dir, extracted AppImage) have a
 * persistent page cache and prewarming them would be pure overhead. When the
 * mounts table cannot be read at all the function fails OPEN toward
 * prewarming: a few hundred MB of redundant cached reads costs ~0.1s on a
 * plain filesystem, while a wrongly skipped prewarm reintroduces #5835.
 */
export async function prewarmPackagedFiles(
  targets: PrewarmTarget[],
  options: {
    platform?: NodeJS.Platform;
    mountsContent?: string | null;
    log?: (message: string) => void;
  } = {},
): Promise<PrewarmReport> {
  const platform = options.platform ?? process.platform;
  if (platform !== "linux") {
    return { skipped: true, reason: "not-linux" };
  }
  if (targets.length === 0) {
    return { skipped: true, reason: "no-targets" };
  }

  let mountsContent = options.mountsContent;
  if (mountsContent === undefined) {
    mountsContent = await readFile("/proc/mounts", "utf8").catch(() => null);
  }
  if (mountsContent != null) {
    const fuseBacked = detectFuseBackedPath(targets[0].path, mountsContent);
    if (fuseBacked === false) {
      return { skipped: true, reason: "not-fuse" };
    }
  }

  const startedAt = Date.now();
  try {
    const files = await collectPrewarmFiles(targets);
    const { files: done, bytes } = await prewarmFiles(files);
    const durationMs = Date.now() - startedAt;
    options.log?.(
      `[open-design packaged] prewarm complete files=${done}/${files.length} bytes=${bytes} durationMs=${durationMs}`,
    );
    return { skipped: false, files: done, bytes, durationMs };
  } catch (error) {
    return {
      skipped: true,
      reason: `error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
