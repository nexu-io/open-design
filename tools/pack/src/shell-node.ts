import { execFile } from "node:child_process";
import { chmod, cp, mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function copyShellNodeRuntime(options: {
  source?: string;
  target: string;
}): Promise<void> {
  const source = options.source ?? process.execPath;
  if (options.source == null && (process.release.name !== "node" || process.versions.electron != null)) {
    throw new Error("tools-pack must run under an official Node runtime before it can seed a Shell");
  }

  // Probe the source before copying it. A tools-pack test may assemble a macOS
  // resource tree on Windows, where the extensionless target is not executable;
  // executing a copied node.exe also leaves the cache staging tree briefly
  // locked on Windows and prevents its atomic rename.
  const { stdout } = await execFileAsync(source, ["--version"], {
    windowsHide: true,
  });
  const actualVersion = stdout.trim();
  const expectedVersion = process.version;
  if (options.source == null && actualVersion !== expectedVersion) {
    throw new Error(`seeded Shell Node version mismatch: expected ${expectedVersion}, got ${actualVersion}`);
  }

  await mkdir(dirname(options.target), { recursive: true });
  await cp(source, options.target);
  if (process.platform !== "win32") await chmod(options.target, 0o755);
}

export async function copyStandaloneBootstrapSeed(options: Readonly<{
  resourceRoot: string;
  seedRoot?: string;
  workspaceRoot: string;
}>): Promise<void> {
  const targetRoot = join(options.resourceRoot, "standalone");
  await mkdir(targetRoot, { recursive: true });
  await cp(
    join(options.workspaceRoot, "apps", "standalone", "dist", "bootstrap", "bootloader.mjs"),
    join(targetRoot, "bootloader.mjs"),
  );
  await mkdir(join(targetRoot, "baseline"), { recursive: true });
  await cp(
    join(options.workspaceRoot, "apps", "standalone", "dist", "bootstrap", "baseline", "launcher.mjs"),
    join(targetRoot, "baseline", "launcher.mjs"),
  );
  if (options.seedRoot != null) {
    await cp(options.seedRoot, join(targetRoot, "seed"), {
      dereference: true,
      recursive: true,
    });
  }
  await writeFile(join(targetRoot, "repository.json"), `${JSON.stringify({
    localSeeds: [{ root: "seed" }],
    // Remote discovery is selected from release metadata supplied by the
    // launcher descriptor. Component bytes remain content-addressed URLs in
    // that graph; the Shell never owns or interprets an origin.
    remoteOrigins: [],
    schemaVersion: 1,
  }, null, 2)}\n`, "utf8");
}
