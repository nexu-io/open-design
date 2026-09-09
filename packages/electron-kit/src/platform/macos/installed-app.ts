import { execFile, spawn } from "node:child_process";
import { lstat, mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join } from "node:path";
import { promisify } from "node:util";

const execute = promisify(execFile);

/** Install into a new caller-owned path without changing signed bundle bytes. */
export async function installMacElectronApp(input: Readonly<{ artifact: string; appPath: string }>) {
  if (process.platform !== "darwin") throw new Error("DMG installation requires macOS");
  if (!isAbsolute(input.artifact) || !isAbsolute(input.appPath) || !input.appPath.endsWith(".app")) throw new Error("Installation requires absolute artifact and app paths");
  await mkdir(dirname(input.appPath), { recursive: true });
  await mkdir(input.appPath); // Never replace an existing installation.
  const mount = await mkdtemp(join(tmpdir(), "electron-install-volume-"));
  let mounted = false;
  try {
    await execute("/usr/bin/hdiutil", ["attach", input.artifact, "-nobrowse", "-readonly", "-mountpoint", mount], { timeout: 120_000 });
    mounted = true;
    const apps = (await readdir(mount, { withFileTypes: true })).filter(entry => entry.isDirectory() && entry.name.endsWith(".app"));
    if (apps.length !== 1) throw new Error("Installer must contain exactly one app bundle");
    await execute("/usr/bin/ditto", [join(mount, apps[0]!.name), input.appPath], { timeout: 120_000 });
    await execute("/usr/bin/codesign", ["--verify", "--deep", "--strict", input.appPath], { timeout: 120_000 });
    return { appPath: input.appPath, resources: join(input.appPath, "Contents/Resources") };
  } finally {
    // Never recursively remove a mountpoint if detachment fails.
    if (mounted) await execute("/usr/bin/hdiutil", ["detach", mount, "-quiet"], { timeout: 60_000 });
    await rm(mount, { recursive: true, force: true });
  }
}

/** Foreground ownership remains with the caller, including failed exercise cleanup. */
export async function withMacElectronProcess<T>(input: Readonly<{
  appPath: string; executableName: string; args: readonly string[];
  env?: NodeJS.ProcessEnv; timeoutMs: number;
}>, exercise?: () => Promise<T>): Promise<T | undefined> {
  if (process.platform !== "darwin" || !isAbsolute(input.appPath)
    || !input.executableName || /[\x00-\x1f/\\]/u.test(input.executableName)
    || input.executableName === "." || input.executableName === "..") throw new Error("Invalid macOS Electron process input");
  const executable = join(input.appPath, "Contents/MacOS", input.executableName);
  if (!(await lstat(executable)).isFile()) throw new Error("Installed executable is not a file");
  const child = spawn(executable, [...input.args], { env: { ...process.env, ...input.env }, stdio: "inherit" });
  let closed = false;
  const completion = new Promise<void>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code, signal) => {
      closed = true;
      if (code === 0) resolve(); else reject(new Error(`Electron exited with ${code ?? signal}`));
    });
  });
  void completion.catch(() => {});
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      (async () => { const result = await exercise?.(); await completion; return result; })(),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("Electron exercise timed out")), input.timeoutMs); }),
    ]);
  } finally {
    clearTimeout(timer);
    if (!closed) {
      child.kill("SIGTERM");
      const force = setTimeout(() => { if (!closed) child.kill("SIGKILL"); }, 5_000);
      try { await completion.catch(() => {}); } finally { clearTimeout(force); }
    }
  }
}
