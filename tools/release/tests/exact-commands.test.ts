import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { build } from "esbuild";
import { afterEach, expect, it } from "vitest";
import { buildClosureDataResource } from "@open-design/closure/build-resources";

const run = promisify(execFile);
const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "release-cli-test-")); roots.push(root);
  const cli = join(root, "tools-release");
  await build({ entryPoints: [resolve("src/index.ts")], outfile: cli, bundle: true, format: "esm", platform: "node", target: "node24", external: ["original-fs", "sharp", "playwright"],
    banner: { js: "#!/usr/bin/env node\nimport { createRequire as exactCreateRequire } from 'node:module'; const require = exactCreateRequire(import.meta.url);" } });
  await chmod(cli, 0o755);
  return { root, cli, invoke: (args: string[]) => run(process.execPath, [cli, ...args], { cwd: root, env: { ...process.env, NODE_PATH: "", NODE_OPTIONS: "" } }) };
}
it.skipIf(process.platform === "win32")("starts the extensionless public executable outside the workspace", async () => {
  const f = await fixture();
  const result = await run(f.cli, ["self-check"], { cwd: f.root, env: { ...process.env, NODE_PATH: "", NODE_OPTIONS: "" } });
  expect(result.stderr).toBe("");
});
const identity = ["--channel", "betahyx", "--release-version", "0.1.0-betahyx.1", "--source-commit", "a".repeat(40)];
const policyArgs = ["policy", "resolve", ...identity, "--profile", "exact-validation", "--source-ref", "refs/heads/feat/test",
  "--endpoint-url", "https://storage.example", "--bucket", "release", "--public-base-url", "https://public.example",
  "--end-user-distribution", "false", "--stable-authorized", "false"];

it("hands off a portable base without workspace packages or a convergence hit", async () => {
  const f = await fixture(), base = join(f.root, "base"), buildReceipt = join(f.root, "build.json");
  await mkdir(base);
  const manifest = JSON.stringify({ schemaVersion: 1, operation: "electron.base.build", target: "darwin-arm64" });
  const node = { id: "electron.base.build", target: "darwin-arm64" };
  await writeFile(join(base, "base.json"), manifest); await writeFile(join(base, "native"), "native");
  await writeFile(buildReceipt, JSON.stringify({ schemaVersion: 1, operation: node.id, target: node.target,
    base: { root: base, manifestSha256: createHash("sha256").update(manifest).digest("hex") } }));
  const transport = join(f.root, "transport"), output = join(f.root, "restored");
  await f.invoke(["base", "pack", "--target", node.target, "--build-receipt", buildReceipt, "--output", transport]);
  const portable = JSON.parse(await readFile(join(transport, "base-build-receipt.json"), "utf8"));
  expect(portable.base).not.toHaveProperty("root");
  await rm(base, { recursive: true });
  const result = JSON.parse((await f.invoke(["base", "unpack", "--target", node.target, "--source", transport, "--output", output])).stdout);
  expect(result.operation).toBe("exact.base.unpack");
  expect(await readFile(join(output, "base", "native"), "utf8")).toBe("native");
  expect(JSON.parse(await readFile(result.buildReceipt, "utf8")).base.root).toBe(join(output, "base"));
  await expect(f.invoke(["base", "unpack", "--target", node.target, "--source", transport, "--output", output])).rejects.toThrow("already exists");
});

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
  await expect(f.invoke([...args, "--capsule-content", "content.json"])).rejects.toThrow("Capsule build does not accept --capsule-content");
  await expect(f.invoke([...args, "--plan", "plan.json"])).rejects.toThrow("Unknown option");
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
  await expect(f.invoke(["scene", "erase", "--output", f.root])).rejects.toThrow("must be pack, unpack, import or verify");
  await expect(f.invoke(policyArgs.map(value => value === "false" ? "yes" : value))).rejects.toThrow("must be true or false");
  await expect(f.invoke([...policyArgs, "--bypass"])).rejects.toThrow("Unknown option");
});

it("passes an explicit runtime resource selection to the workspace producer", async () => {
  const f = await fixture(), moduleRoot = join(f.root, "node_modules/@open-design/closure");
  await mkdir(moduleRoot, { recursive: true });
  await writeFile(join(moduleRoot, "package.json"), JSON.stringify({ type: "module", exports: { "./build-runtime-resources": "./producer.mjs" } }));
  await writeFile(join(moduleRoot, "producer.mjs"), `
    import { mkdir, writeFile } from "node:fs/promises";
    import { join } from "node:path";
    import { createHash } from "node:crypto";
    export async function buildClosureRuntimeResources(input) {
      if (JSON.stringify(input.resourceIds) !== '["open-design-web"]') throw new Error("selection lost");
      await mkdir(input.outputDirectory);
      const path = join(input.outputDirectory, "open-design-web.zip");
      const bytes = Buffer.from("selected web"); await writeFile(path, bytes);
      return { schemaVersion: 1, operation: "closure.runtime-resources.build", resources: [{
        id: "open-design-web", path, size: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex")
      }] };
    }
  `);
  const output = join(f.root, "runtime"), receipt = join(f.root, "runtime.json");
  const args = ["build", "runtime-resources", "--root", f.root, "--resource-ids", '["open-design-web"]', "--output", output, "--receipt", receipt];
  await f.invoke(args);
  expect(JSON.parse(await readFile(receipt, "utf8")).resources.map((resource: { id: string }) => resource.id)).toEqual(["open-design-web"]);
  await expect(f.invoke([...args, "--shell", "electron"])).rejects.toThrow("does not accept --shell");
});

it("dispatches independent platform builds and rejects unrelated policy or Capsule arguments", async () => {
  const f = await fixture(), pkg = join(f.root, "tools/release/node_modules/@open-design/shell-electron");
  await mkdir(pkg, { recursive: true });
  await writeFile(join(pkg, "package.json"), JSON.stringify({ name: "@open-design/shell-electron", type: "module", exports: { "./build": "./build.mjs" } }));
  await writeFile(join(pkg, "build.mjs"), `
    import { writeFile } from 'node:fs/promises'; import { createHash } from 'node:crypto';
    export async function buildElectronPlatformResource(request) {
      await writeFile(request.outputArchivePath, 'platform');
      return { archivePath: request.outputArchivePath, resource: { schemaVersion: 1, target: request.target,
        blob: { sha256: createHash('sha256').update('platform').digest('hex'), size: 8, mediaType: 'application/zip', sources: [] },
        treeSha256: 'b'.repeat(64), executables: ['bin/node'] } };
    }
  `);
  const output = join(f.root, "platform"), receipt = join(f.root, "platform-receipt.json");
  const args = ["build", "platform", "--root", f.root, "--shell", "electron", "--target", "darwin-arm64", "--output", output,
    "--receipt", receipt, "--node-archive", join(f.root, "node.tar.gz")];
  await f.invoke(args);
  expect(JSON.parse(await readFile(receipt, "utf8"))).toMatchObject({ operation: "electron.platform.build", target: "darwin-arm64",
    resourcePath: join(output, "platform-resource.json"), archivePath: join(output, "platform.zip") });
  for (const option of ["--channel", "--capsule-content", "--resources"]) {
    await expect(f.invoke([...args, option, "unrelated"])).rejects.toThrow(`platform build does not accept ${option}`);
  }
});

it("builds one Closure data resource without requiring Shell, platform or release identity", async () => {
  const f = await fixture();
  await mkdir(join(f.root, "design-systems"));
  await writeFile(join(f.root, "design-systems/input.txt"), "data");
  const output = join(f.root, "resource"), receipt = join(f.root, "resource.json");
  const args = ["build", "resource", "--root", f.root, "--resource-id", "design-systems", "--output", output, "--receipt", receipt];
  await f.invoke(args);
  expect(JSON.parse(await readFile(receipt, "utf8"))).toMatchObject({ schemaVersion: 1, operation: "closure.data-resource.build",
    resource: { id: "design-systems", entrypoint: "resource.json" } });
  await expect(f.invoke([...args, "--shell", "electron"])).rejects.toThrow("resource build does not accept --shell");
  await expect(f.invoke([...args, "--target", "darwin-arm64"])).rejects.toThrow("resource build does not accept --target");
});


it("builds a selected resource batch without workspace packages and keeps independent contributions", async () => {
  const f = await fixture();
  for (const id of ["craft", "skills"]) {
    await mkdir(join(f.root, id)); await writeFile(join(f.root, id, "input.txt"), id);
  }
  const output = join(f.root, "batch"), receipt = join(f.root, "batch.json");
  const args = ["resource", "build", "--root", f.root, "--resource-ids", '["craft","skills"]', "--output", output, "--receipt", receipt];
  await f.invoke(args);
  const result = JSON.parse(await readFile(receipt, "utf8"));
  expect(result.resources.map((item: { resourceId: string }) => item.resourceId)).toEqual(["craft", "skills"]);
  for (const id of ["craft", "skills"]) {
    const contribution = JSON.parse(await readFile(join(output, "contributions", id, "artifact/resource-receipt.json"), "utf8"));
    expect(contribution.resource.id).toBe(id);
    expect(contribution.resource.path).toBeUndefined();
  }
  await expect(f.invoke(args.map(value => value === '["craft","skills"]' ? '["craft","craft"]' : value))).rejects.toThrow("unique array");
  const failedReceipt = join(f.root, "failed.json");
  await expect(f.invoke(args.map(value => value === '["craft","skills"]' ? '["frames"]' : value === receipt ? failedReceipt : value)))
    .rejects.toThrow("resource.build.failed");
  await expect(readFile(failedReceipt)).rejects.toMatchObject({ code: "ENOENT" });
});

it("stages a real data product through the public artifact export command", async () => {
  const f = await fixture();
  await mkdir(join(f.root, "craft")); await writeFile(join(f.root, "craft/input.txt"), "resource bytes");
  const resource = await buildClosureDataResource({ id: "craft", workspaceRoot: f.root, outputDirectory: join(f.root, "built") });
  const receipt = join(f.root, "built/receipt.json");
  await writeFile(receipt, JSON.stringify({ schemaVersion: 1, operation: "closure.data-resource.build", resource }));
  const args = ["resource", "export", "--resource-id", "craft", "--output", join(f.root, "contribution"), "--resource-receipt", receipt];
  const result = JSON.parse((await f.invoke(args)).stdout);
  expect(result).toMatchObject({ operation: "exact.resource.export" });
  expect(result).not.toHaveProperty("contributed");
  expect(await readFile(join(result.artifactDirectory, resource.file))).toEqual(await readFile(resource.path));
  await expect(f.invoke(args)).rejects.toThrow("destination already exists");
  for (const flag of ["--plan", "--pending", "--workload"]) {
    await expect(f.invoke([...args, flag, "forbidden"])).rejects.toThrow("Unknown option");
  }
});

it("dispatches runtime-only production through the Closure public API", async () => {
  const f = await fixture(), pkg = join(f.root, "tools/release/node_modules/@open-design/closure");
  await mkdir(pkg, { recursive: true });
  await writeFile(join(pkg, "package.json"), JSON.stringify({ name: "@open-design/closure", type: "module",
    exports: { "./build-runtime-resources": "./build.mjs" } }));
  await writeFile(join(pkg, "build.mjs"), `
    import {mkdir,writeFile} from 'node:fs/promises'; import {join} from 'node:path'; import {createHash} from 'node:crypto';
    export const CLOSURE_RUNTIME_RESOURCE_IDS = ['open-design-daemon','open-design-web'];
    export async function buildClosureRuntimeResources({outputDirectory}) {
      await mkdir(outputDirectory); const resources=[];
      for(const id of ['open-design-daemon','open-design-web']) {
        const path=join(outputDirectory,id+'.zip'); await writeFile(path,id);
        resources.push({id,path,file:id+'.zip',sha256:createHash('sha256').update(id).digest('hex'),size:id.length});
      }
      return {schemaVersion:1,operation:'closure.runtime-resources.build',resources};
    }
  `);
  const output = join(f.root, "runtime"), receipt = join(f.root, "receipt.json");
  const args = ["build", "runtime-resources", "--root", f.root, "--output", output, "--receipt", receipt];
  await f.invoke(args);
  expect(JSON.parse(await readFile(receipt, "utf8"))).toMatchObject({ operation: "closure.runtime-resources.build",
    resources: [{ id: "open-design-daemon" }, { id: "open-design-web" }] });
  await expect(f.invoke([...args, "--resource-id", "craft"])).rejects.toThrow("does not accept");
});

it("exposes existing workspace commands and release commands from one public entry", async () => {
  const root = await mkdtemp(join(tmpdir(), "release-workspace-cli-")); roots.push(root);
  const cli = join(root, "workspace.mjs");
  await build({ entryPoints: [resolve("src/index.ts")], outfile: cli, bundle: true, format: "esm", platform: "node", target: "node24", external: ["original-fs", "sharp", "playwright"],
    banner: { js: "import { createRequire as exactCreateRequire } from 'node:module'; const require = exactCreateRequire(import.meta.url);" } });
  const invoke = (args: string[]) => run(process.execPath, [cli, ...args], { cwd: root });
  const help = (await invoke(["--help"])).stdout;
  expect(help).toContain("prepare-metadata <channel>");
  expect(help).not.toContain("prepare <channel>");
  await expect(invoke(["prepare"])).rejects.toThrow("--policy is required");
  await expect(invoke(["finalize"])).rejects.toThrow("--policy is required");
});
