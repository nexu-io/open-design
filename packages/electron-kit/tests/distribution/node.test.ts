import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it, vi } from "vitest";
import { stageElectronNode } from "@/distribution/node.js";

const probe = vi.hoisted(() => ({ abi: "137", target: `${process.platform}-${process.arch}`, electron: null as string | null }));
vi.mock("node:child_process", async (original) => {
  const actual = await original<typeof import("node:child_process")>();
  return { ...actual, execFile: (...args: unknown[]) => {
    if (String(args[0]).endsWith("/bin/node")) {
      const options = args[2] as { env: NodeJS.ProcessEnv };
      expect(options.env.NODE_OPTIONS).toBe("");
      expect(options.env.NODE_PATH).toBe("");
      expect(options.env.ELECTRON_RUN_AS_NODE).toBe("");
      (args[3] as (error: null, result: unknown) => void)(null, { stdout: JSON.stringify({ version: "24.18.0", ...probe }) });
      return;
    }
    return Reflect.apply(actual.execFile, null, args);
  } };
});
const execute = promisify(execFile);
const roots: string[] = [];
afterEach(async () => {
  probe.abi = "137"; probe.target = `${process.platform}-${process.arch}`; probe.electron = null;
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});
async function fixture(license = true) {
  const root = await mkdtemp(join(tmpdir(), "electron-node-stage-")); roots.push(root);
  const target = process.arch === "arm64" ? "darwin-arm64" as const : "darwin-x64" as const;
  const archiveRoot = `node-v24.18.0-${target}`;
  await mkdir(join(root, archiveRoot, "bin"), { recursive: true });
  await writeFile(join(root, archiveRoot, "bin/node"), "fixture node bytes");
  if (license) await writeFile(join(root, archiveRoot, "LICENSE"), "fixture license");
  const archive = `${archiveRoot}.tar.gz`, archivePath = join(root, archive);
  await execute("tar", ["-czf", archivePath, "-C", root, archiveRoot]);
  const lockPath = join(root, "node-lock.json");
  await writeFile(lockPath, JSON.stringify({ schemaVersion: 1, version: "24.18.0", targets: { [target]: {
    archive, url: `https://nodejs.org/dist/v24.18.0/${archive}`, mediaType: "application/gzip",
    sha256: createHash("sha256").update(await readFile(archivePath)).digest("hex"),
  } } }));
  return { root, target, lockPath, archivePath, outputRoot: join(root, "platform") };
}

describe.skipIf(process.platform !== "darwin")("build-time official Node staging", () => {
  it("stages only locked Node and license with a path-neutral byte-bound receipt, without overwriting", async () => {
    const input = await fixture();
    const built = await stageElectronNode(input);
    expect(await readdir(input.outputRoot)).toEqual(["NODE-LICENSE", "bin", "node.json"]);
    expect(built.receipt).toMatchObject({ target: input.target, version: "24.18.0", abi: "137", executable: { path: "bin/node" }, license: { path: "NODE-LICENSE" } });
    expect(built.receipt.executable.sha256).toBe(createHash("sha256").update("fixture node bytes").digest("hex"));
    expect(JSON.stringify(built.receipt)).not.toContain(input.root);
    await expect(stageElectronNode(input)).rejects.toThrow(/EEXIST/u);
    expect(await readFile(built.executablePath, "utf8")).toBe("fixture node bytes");
  });
  it("rejects archive tampering before creating output", async () => {
    const input = await fixture();
    await writeFile(input.archivePath, "tampered");
    await expect(stageElectronNode(input)).rejects.toThrow(/digest mismatch/u);
    await expect(readdir(input.outputRoot)).rejects.toThrow(/ENOENT/u);
  });
  it("requires the license and leaves no extraction scratch on failure", async () => {
    const input = await fixture(false);
    await expect(stageElectronNode(input)).rejects.toThrow(/ENOENT/u);
    expect(await readdir(input.outputRoot)).toEqual([]);
  });
  it("rejects a mismatched native target and Electron-as-Node", async () => {
    const input = await fixture();
    probe.target = "linux-x64";
    await expect(stageElectronNode(input)).rejects.toThrow(/identity mismatch/u);
    probe.target = `${process.platform}-${process.arch}`; probe.electron = "41.3.0";
    await expect(stageElectronNode({ ...input, outputRoot: join(input.root, "second") })).rejects.toThrow(/identity mismatch/u);
  });
});
