import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { bindNodePlatform } from "@/packages/runtime.js";

const execute = vi.hoisted(() => vi.fn());
vi.mock("node:child_process", () => ({ execFile: (...args: unknown[]) => {
  Promise.resolve().then(() => execute(args[0], args[1], args[2])).then(
    result => (args[3] as (error: unknown, result?: unknown) => void)(null, result),
    error => (args[3] as (error: unknown) => void)(error),
  );
} }));
const roots: string[] = [];
afterEach(async () => { vi.resetAllMocks(); await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
async function fixture() {
  const root = await realpath(await mkdtemp(join(tmpdir(), "electron-physical-binding-"))); roots.push(root);
  const command = join(root, process.platform === "win32" ? "node.exe" : "bin/node");
  await mkdir(dirname(command), { recursive: true });
  await mkdir(join(root, "node_modules"));
  await writeFile(command, "signed Node fixture");
  for (const name of ["package.json", "package-lock.json", "platform-check.cjs"]) await writeFile(join(root, name), name);
  const identity = { version: "24.18.0", abi: "137", target: `${process.platform}-${process.arch}`, electron: null };
  const manifest = { schemaVersion: 1, node: { schemaVersion: 1, ...identity,
    executable: { path: process.platform === "win32" ? "node.exe" : "bin/node", sha256: sha256("pre-sign Node") } },
    packageSha256: sha256("package.json"), lockSha256: sha256("package-lock.json"),
    verification: { path: "platform-check.cjs", sha256: sha256("platform-check.cjs") } };
  await writeFile(join(root, "platform.json"), JSON.stringify(manifest));
  execute.mockImplementation(async (_command: string, args: string[]) => ({ stdout: args[0] === "-e" ? JSON.stringify(identity) : "product probe passed" }));
  return { root, command, identity, manifest };
}

describe.skipIf(!["darwin-arm64", "darwin-x64", "win32-x64"].includes(`${process.platform}-${process.arch}`))("read-only physical platform binding", () => {
  it("checks native identity and the bound product probe, preserving post-sign executable bytes", async () => {
    const input = await fixture();
    const before = await readdir(input.root, { recursive: true });
    const binding = await bindNodePlatform(input.root);
    expect(binding.command).toBe(input.command);
    expect(binding.env).toMatchObject({ NODE_PATH: join(input.root, "node_modules"), NODE_OPTIONS: "", ELECTRON_RUN_AS_NODE: "" });
    expect(execute).toHaveBeenCalledTimes(2);
    expect(execute.mock.calls[1]).toEqual([binding.command, [join(input.root, "platform-check.cjs")], expect.objectContaining({ cwd: input.root, env: expect.objectContaining(binding.env) })]);
    expect(await readFile(input.command, "utf8")).toBe("signed Node fixture");
    expect(await readdir(input.root, { recursive: true })).toEqual(before);
  });
  it.each(["package.json", "package-lock.json", "platform-check.cjs"])("rejects damaged %s before executing anything", async name => {
    const input = await fixture();
    await writeFile(join(input.root, name), "damaged");
    await expect(bindNodePlatform(input.root)).rejects.toThrow(/install the latest physical Shell/u);
    expect(execute).not.toHaveBeenCalled();
  });
  it.each(["abi", "version", "target", "electron"])("rejects mismatched %s before the product probe", async key => {
    const input = await fixture();
    execute.mockResolvedValue({ stdout: JSON.stringify({ ...input.identity, [key]: "wrong" }) });
    await expect(bindNodePlatform(input.root)).rejects.toThrow(/physical Node platform is unavailable/u);
    expect(execute).toHaveBeenCalledTimes(1);
  });
  it("refuses missing Node and does not recreate it", async () => {
    const input = await fixture();
    await rm(input.command);
    await expect(bindNodePlatform(input.root)).rejects.toThrow(/physical Node platform is unavailable/u);
    await expect(readFile(input.command)).rejects.toThrow(/ENOENT/u);
    expect(execute).not.toHaveBeenCalled();
  });
  it("surfaces product native probe failures as physical repair, without changing files", async () => {
    const input = await fixture();
    const before = await readFile(join(input.root, "platform.json"));
    execute.mockResolvedValueOnce({ stdout: JSON.stringify(input.identity) }).mockRejectedValueOnce(new Error("native addon ABI mismatch"));
    await expect(bindNodePlatform(input.root)).rejects.toThrow(/install the latest physical Shell/u);
    expect(await readFile(join(input.root, "platform.json"))).toEqual(before);
  });
  it.skipIf(process.platform === "win32")("refuses a Node symlink outside the physical installation", async () => {
    const input = await fixture();
    await rm(input.command);
    await symlink(process.execPath, input.command);
    await expect(bindNodePlatform(input.root)).rejects.toThrow(/physical Node platform is unavailable/u);
    expect(execute).not.toHaveBeenCalled();
  });
});
