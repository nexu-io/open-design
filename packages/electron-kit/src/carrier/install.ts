import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

import { OfficialNodeCarrierError, type OfficialNodeCarrierReceipt, type OfficialNodeTarget } from "./contracts.js";
import { currentOfficialNodeTarget, readOfficialNodeLock } from "./lock.js";

const execFileAsync = promisify(execFile);
const pause = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function sha256File(path: string): Promise<string> {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

async function acquireLock(path: string): Promise<() => Promise<void>> {
  for (let attempt = 0; attempt < 400; attempt += 1) {
    try {
      await mkdir(path);
      return async () => { await rm(path, { force: true, recursive: true }); };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const metadata = await stat(path).catch(() => null);
      if (metadata != null && Date.now() - metadata.mtimeMs > 120_000) {
        await rm(path, { force: true, recursive: true });
        continue;
      }
      await pause(25);
    }
  }
  throw new OfficialNodeCarrierError("resource-unavailable", "official Node carrier lock timed out");
}

async function download(url: string, path: string, expectedSha256: string): Promise<void> {
  let response: Response;
  try {
    response = await fetch(url, { redirect: "follow" });
  } catch (cause) {
    throw new OfficialNodeCarrierError("resource-unavailable", "official Node archive download failed", { cause });
  }
  if (!response.ok) throw new OfficialNodeCarrierError("resource-unavailable", `official Node archive request failed: ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const actual = createHash("sha256").update(bytes).digest("hex");
  if (actual !== expectedSha256) throw new OfficialNodeCarrierError("integrity-failed", "official Node archive digest mismatch");
  await writeFile(path, bytes, { flag: "wx" });
}

async function extractArchive(archivePath: string, destination: string, target: OfficialNodeTarget): Promise<void> {
  try {
    if (target.startsWith("darwin-")) {
      await execFileAsync("tar", ["-xzf", archivePath, "-C", destination]);
    } else {
      await execFileAsync("powershell.exe", [
        "-NoLogo",
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "Expand-Archive -LiteralPath $args[0] -DestinationPath $args[1]",
        archivePath,
        destination,
      ]);
    }
  } catch (cause) {
    throw new OfficialNodeCarrierError("extraction-failed", "official Node archive extraction failed", { cause });
  }
}

async function verifyExecutable(path: string, version: string): Promise<string> {
  let observed: string;
  try {
    ({ stdout: observed } = await execFileAsync(path, ["--version"], { encoding: "utf8" }));
  } catch (cause) {
    throw new OfficialNodeCarrierError("integrity-failed", "official Node executable could not run", { cause });
  }
  if (observed.trim() !== `v${version}`) throw new OfficialNodeCarrierError("integrity-failed", "official Node executable version mismatch");
  return sha256File(path);
}

async function readCachedReceipt(path: string, executablePath: string, expected: Readonly<{
  target: OfficialNodeTarget;
  version: string;
  archiveSha256: string;
}>): Promise<OfficialNodeCarrierReceipt | null> {
  try {
    const receipt = JSON.parse(await readFile(path, "utf8")) as OfficialNodeCarrierReceipt;
    if (receipt.schemaVersion !== 1 || receipt.target !== expected.target || receipt.version !== expected.version || receipt.archiveSha256 !== expected.archiveSha256) return null;
    const executableSha256 = await verifyExecutable(executablePath, expected.version);
    if (receipt.executableSha256 !== executableSha256) return null;
    return { ...receipt, executablePath, source: "cache" };
  } catch {
    return null;
  }
}

export async function ensureOfficialNodeCarrier(input: Readonly<{
  lockPath: string;
  cacheRoot: string;
  target?: OfficialNodeTarget;
}>): Promise<OfficialNodeCarrierReceipt> {
  const lock = await readOfficialNodeLock(input.lockPath);
  const target = input.target ?? currentOfficialNodeTarget();
  const locked = lock.targets[target];
  if (locked == null) throw new OfficialNodeCarrierError("unsupported-target", `official Node lock lacks ${target}`);

  const carrierRoot = join(input.cacheRoot, "node", lock.version, target);
  const executablePath = join(carrierRoot, target === "win32-x64" ? "node.exe" : "bin/node");
  const receiptPath = join(carrierRoot, "electron-kit-carrier.json");
  const expected = { target, version: lock.version, archiveSha256: locked.sha256 };
  const cached = await readCachedReceipt(receiptPath, executablePath, expected);
  if (cached != null) return cached;

  await mkdir(join(input.cacheRoot, "node", lock.version), { recursive: true });
  const release = await acquireLock(`${carrierRoot}.lock`);
  const stage = `${carrierRoot}.stage-${process.pid}-${randomUUID()}`;
  const archivePath = `${carrierRoot}.${locked.archive}`;
  try {
    const raced = await readCachedReceipt(receiptPath, executablePath, expected);
    if (raced != null) return raced;
    await rm(carrierRoot, { force: true, recursive: true });
    await rm(stage, { force: true, recursive: true });
    await mkdir(stage, { recursive: true });

    const archiveDigest = await sha256File(archivePath).catch(() => null);
    if (archiveDigest !== locked.sha256) {
      await rm(archivePath, { force: true });
      const temporaryArchive = `${archivePath}.${process.pid}.${randomUUID()}.tmp`;
      try {
        await download(locked.url, temporaryArchive, locked.sha256);
        await rename(temporaryArchive, archivePath);
      } finally {
        await rm(temporaryArchive, { force: true });
      }
    }

    await extractArchive(archivePath, stage, target);
    const roots = (await readdir(stage, { withFileTypes: true })).filter((entry) => entry.isDirectory());
    if (roots.length !== 1) throw new OfficialNodeCarrierError("extraction-failed", "official Node archive must contain exactly one root directory");
    const extractedRoot = join(stage, roots[0]!.name);
    const extractedExecutable = join(extractedRoot, target === "win32-x64" ? "node.exe" : "bin/node");
    const executableSha256 = await verifyExecutable(extractedExecutable, lock.version);
    const receipt: OfficialNodeCarrierReceipt = {
      schemaVersion: 1,
      target,
      version: lock.version,
      archiveSha256: locked.sha256,
      executablePath,
      executableSha256,
      source: "download",
    };
    await writeFile(join(extractedRoot, "electron-kit-carrier.json"), `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
    await rename(extractedRoot, carrierRoot);
    return receipt;
  } finally {
    await rm(stage, { force: true, recursive: true });
    await release();
  }
}
