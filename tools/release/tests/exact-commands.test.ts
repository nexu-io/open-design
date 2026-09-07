import { execFile } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { build } from "esbuild";
import { afterEach, expect, it } from "vitest";

const run = promisify(execFile);
const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "release-cli-test-")); roots.push(root);
  const cli = join(root, "tools-release.mjs");
  await build({ entryPoints: [resolve("src/exact/control-cli.ts")], outfile: cli, bundle: true, format: "esm", platform: "node", target: "node24",
    banner: { js: "import { createRequire as exactCreateRequire } from 'node:module'; const require = exactCreateRequire(import.meta.url);" } });
  return { root, invoke: (args: string[]) => run(process.execPath, [cli, ...args], { cwd: root, env: { ...process.env, NODE_PATH: "", NODE_OPTIONS: "" } }) };
}
const identity = ["--channel", "betahyx", "--release-version", "0.1.0-betahyx.1", "--source-commit", "a".repeat(40)];
const policyArgs = ["policy", "resolve", ...identity, "--profile", "exact-validation", "--source-ref", "refs/heads/feat/test",
  "--endpoint-url", "https://storage.example", "--bucket", "release", "--public-base-url", "https://public.example",
  "--end-user-distribution", "false", "--stable-authorized", "false"];

it("runs scene commands without workspace packages or request files", async () => {
  const f = await fixture(); const scene = join(f.root, "source"), archive = join(f.root, "scene.tar");
  await mkdir(scene); await writeFile(join(scene, "scene.json"), "{}");
  await writeFile(join(scene, "native"), "native"); await chmod(join(scene, "native"), 0o755);
  const packed = JSON.parse((await f.invoke(["scene", "pack", "--scene", scene, "--output", archive])).stdout);
  const receipt = join(f.root, "receipt.json"), output = join(f.root, "restored");
  await f.invoke(["scene", "unpack", "--archive", archive, "--output", output, "--receipt", receipt]);
  expect(JSON.parse(await readFile(receipt, "utf8"))).toMatchObject({ operation: "exact.scene.unpack", sha256: packed.sha256 });
  expect(await readFile(join(output, "native"), "utf8")).toBe("native");
  expect(dirname(scene)).toBe(f.root);
});

it("resolves and reauthorizes the same policy with explicit identity binding", async () => {
  const f = await fixture(); const policy = join(f.root, "policy.json");
  await f.invoke([...policyArgs, "--receipt", policy]);
  const args = ["policy", "authorize", ...identity, "--policy", policy, "--capability", "publish"];
  expect(JSON.parse((await f.invoke(args)).stdout)).toMatchObject({ operation: "release.authorized", capability: "publish", channel: "betahyx" });
  await expect(f.invoke(args.map(value => value === "betahyx" ? "stable" : value))).rejects.toThrow("binding mismatch");
});

it("rejects unknown commands, missing arguments and non-boolean switches", async () => {
  const f = await fixture();
  expect((await f.invoke(["--help"])).stdout).toContain("baseline");
  await expect(f.invoke(["publish"])).rejects.toThrow("--pack-receipt is required");
  await expect(f.invoke(["scene", "pack"])).rejects.toThrow("--output is required");
  await expect(f.invoke(["scene", "erase", "--output", f.root])).rejects.toThrow("must be pack or unpack");
  await expect(f.invoke(policyArgs.map(value => value === "false" ? "yes" : value))).rejects.toThrow("must be true or false");
  await expect(f.invoke([...policyArgs, "--bypass"])).rejects.toThrow("Unknown option");
});
