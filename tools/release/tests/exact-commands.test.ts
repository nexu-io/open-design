import { execFile } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { build } from "esbuild";
import { afterEach, expect, it } from "vitest";
import { resolveExactDataPlanNode } from "../src/exact/plan.ts";

const run = promisify(execFile);
const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "release-cli-test-")); roots.push(root);
  const cli = join(root, "tools-release.mjs");
  await build({ entryPoints: [resolve("src/exact/control-cli.ts")], outfile: cli, bundle: true, format: "esm", platform: "node", target: "node24", external: ["original-fs"],
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

it("dispatches Capsule production through the selected workspace public package", async () => {
  const f = await fixture();
  const pkg = join(f.root, "tools/release/node_modules/@open-design/shell-electron");
  await mkdir(pkg, { recursive: true });
  await writeFile(join(pkg, "package.json"), JSON.stringify({ name: "@open-design/shell-electron", type: "module", exports: { "./build": "./build.mjs" } }));
  await writeFile(join(pkg, "build.mjs"), "export async function buildElectronCapsuleContent(request) { return { request }; }\n");
  const output = join(f.root, "content"), receipt = join(f.root, "capsule-receipt.json");
  const args = ["build", "capsule", "--root", f.root, "--shell", "electron", "--target", "darwin-arm64", "--output", output, "--receipt", receipt];
  await f.invoke(args);
  expect(JSON.parse(await readFile(receipt, "utf8"))).toEqual({ schemaVersion: 1, operation: "electron.capsule.build", request: { target: "darwin-arm64", outputRoot: output } });
  await expect(f.invoke(args.map(value => value === "electron" ? "terminal" : value))).rejects.toThrow("requires electron");
  await expect(f.invoke([...args, "--capsule-content", "content.json"])).rejects.toThrow("only supported by build scene");
  await expect(f.invoke([...args.map(value => value === "capsule" ? "scene" : value), "--capsule-content", "content.json"])).rejects.toThrow("both --capsule-content and --capsule-archive");
});

it("rejects unknown commands, missing arguments and non-boolean switches", async () => {
  const f = await fixture();
  expect((await f.invoke(["--help"])).stdout).toContain("baseline");
  await f.invoke(["self-check"]);
  await expect(f.invoke(["--request", "/removed-request.json"])).rejects.toThrow("Unknown option");
  await expect(f.invoke(["removed-command"])).rejects.toThrow("Unknown command");
  await expect(f.invoke(["publish"])).rejects.toThrow("--pack-receipt is required");
  await expect(f.invoke(["scene", "pack"])).rejects.toThrow("--output is required");
  await expect(f.invoke(["scene", "erase", "--output", f.root])).rejects.toThrow("must be pack or unpack");
  await expect(f.invoke(policyArgs.map(value => value === "false" ? "yes" : value))).rejects.toThrow("must be true or false");
  await expect(f.invoke([...policyArgs, "--bypass"])).rejects.toThrow("Unknown option");
});

it("builds one Closure data resource without requiring Shell, platform or release identity", async () => {
  const f = await fixture();
  const pkg = join(f.root, "tools/release/node_modules/@open-design/closure");
  await mkdir(pkg, { recursive: true });
  await writeFile(join(pkg, "package.json"), JSON.stringify({ name: "@open-design/closure", type: "module", exports: { "./build-resources": "./build.mjs" } }));
  await writeFile(join(pkg, "build.mjs"), "export async function buildClosureDataResource(request) { return { request }; }\n");
  const output = join(f.root, "resource"), receipt = join(f.root, "resource.json");
  const args = ["build", "resource", "--root", f.root, "--resource-id", "design-systems", "--output", output, "--receipt", receipt];
  await f.invoke(args);
  expect(JSON.parse(await readFile(receipt, "utf8"))).toEqual({ schemaVersion: 1, operation: "closure.data-resource.build",
    resource: { request: { id: "design-systems", workspaceRoot: f.root, outputDirectory: output } } });
  await expect(f.invoke([...args, "--shell", "electron"])).rejects.toThrow("resource build does not accept --shell");
  await expect(f.invoke([...args, "--target", "darwin-arm64"])).rejects.toThrow("resource build does not accept --target");
});

it("binds a selected data build without needing other plan nodes or resource directories", async () => {
  const f = await fixture(), id = "closure.data.craft.build", target = "darwin-arm64";
  const pkg = join(f.root, "tools/release/node_modules/@open-design/closure");
  await mkdir(pkg, { recursive: true });
  await writeFile(join(pkg, "package.json"), JSON.stringify({ type: "module", exports: { "./build-resources": "./build.mjs" } }));
  await writeFile(join(pkg, "build.mjs"), "export async function buildClosureDataResource(request) { return { request }; }\n");
  await mkdir(join(f.root, "craft/dist"), { recursive: true });
  await writeFile(join(f.root, "craft/dist/input.txt"), "baseline");
  const registryPath = join(f.root, "tools/release/resources/exact-plan-identities.json");
  await mkdir(dirname(registryPath), { recursive: true });
  await writeFile(registryPath, JSON.stringify({ schemaVersion: 1,
    identities: { [id]: { schemaVersion: 1, sourceSets: [id], parameters: ["target"] } },
    sourceSets: { [id]: { paths: [{ path: "craft", excludeDirectoryNames: [] }] } },
  }));
  const node = await resolveExactDataPlanNode({ root: f.root, registryPath, id, target });
  const plan = join(f.root, "plan.json"), receipt = join(f.root, "result.json");
  const value = { schemaVersion: 1, actions: [{ id }], plan: { target, nodes: { [id]: node } } };
  await writeFile(plan, JSON.stringify(value));
  const args = ["build", "resource", "--root", f.root, "--resource-id", "craft", "--output", join(f.root, "out"), "--plan", plan, "--receipt", receipt];
  await f.invoke(args);
  expect(JSON.parse(await readFile(receipt, "utf8")).planNode).toEqual({ id, identity: node.identity, target });
  await writeFile(join(f.root, "craft/dist/input.txt"), "changed bytes inside dist are real resource inputs");
  const failedArgs = args.map(arg => arg === receipt ? join(f.root, "failed.json") : arg);
  await expect(f.invoke(failedArgs)).rejects.toThrow("plan binding mismatch");
  await expect(readFile(join(f.root, "failed.json"))).rejects.toMatchObject({ code: "ENOENT" });
  await writeFile(join(f.root, "craft/dist/input.txt"), "baseline");
  await writeFile(join(pkg, "build.mjs"), "import {writeFile} from 'node:fs/promises'; export async function buildClosureDataResource(request) { await writeFile(request.workspaceRoot + '/craft/dist/input.txt', 'changed during build'); return {}; }\n");
  await expect(f.invoke(failedArgs)).rejects.toThrow("source changed during execution");
  await expect(readFile(join(f.root, "failed.json"))).rejects.toMatchObject({ code: "ENOENT" });
});

it("keeps workspace command names distinct from the relocatable exact grammar", async () => {
  const root = await mkdtemp(join(tmpdir(), "release-workspace-cli-")); roots.push(root);
  const cli = join(root, "workspace.mjs");
  await build({ entryPoints: [resolve("src/index.ts")], outfile: cli, bundle: true, format: "esm", platform: "node", target: "node24", external: ["original-fs"],
    banner: { js: "import { createRequire as exactCreateRequire } from 'node:module'; const require = exactCreateRequire(import.meta.url);" } });
  const invoke = (args: string[]) => run(process.execPath, [cli, ...args], { cwd: root });
  const help = (await invoke(["--help"])).stdout;
  expect(help).toContain("prepare-metadata <channel>");
  expect(help).not.toContain("prepare <channel>");
  await expect(invoke(["prepare"])).rejects.toThrow("--policy is required");
  await expect(invoke(["finalize"])).rejects.toThrow("--policy is required");
});
