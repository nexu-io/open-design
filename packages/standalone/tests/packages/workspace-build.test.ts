import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, readlink, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { deployWorkspacePackage } from "@/packages/workspace-build.js";

vi.mock("node:child_process", () => ({ execFile: vi.fn() }));
const roots: string[] = [];
afterEach(async () => {
  vi.resetAllMocks();
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

async function fixture(escape = false) {
  const root = await realpath(await mkdtemp(join(tmpdir(), "portable-workspace-"))); roots.push(root);
  const source = join(root, "packages/example"), output = join(root, "export");
  const manifest = { name: "@fixture/example", version: "1.0.0" };
  await mkdir(source, { recursive: true });
  await writeFile(join(root, "package.json"), JSON.stringify({ packageManager: "pnpm@10.33.2" }));
  await writeFile(join(source, "package.json"), JSON.stringify(manifest));
  vi.mocked(execFile).mockImplementation(((file: string, args: string[], _options: unknown, callback: Function) => {
    void (async () => {
      if (args[0] === "--version") return callback(null, { stdout: "10.33.2\n", stderr: "" });
      expect(file).toBe("fixture-pnpm");
      expect(args.slice(0, -1)).toEqual(["--filter", "@fixture/example", "deploy", "--legacy", "--prod", "--offline", "--ignore-scripts"]);
      const deployed = args.at(-1)!;
      await mkdir(join(deployed, "node_modules"), { recursive: true });
      await writeFile(join(deployed, "package.json"), JSON.stringify(manifest));
      await symlink(escape ? root : source, join(deployed, "node_modules/self"), "dir");
      callback(null, { stdout: "", stderr: "" });
    })().catch(error => callback(error));
  }) as typeof execFile);
  return { workspaceRoot: root, packageDirectory: source, outputRoot: output, pnpmPath: "fixture-pnpm" };
}

it("exports an offline built package and normalizes only its verified source self-link", async () => {
  const input = await fixture();
  const result = await deployWorkspacePackage(input);
  expect(result.name).toBe("@fixture/example");
  expect(await readlink(join(result.packageRoot, "node_modules/self"))).toBe("..");
  expect(await realpath(join(result.packageRoot, "node_modules/self"))).toBe(result.packageRoot);
});

it("refuses unrelated external links and removes only its newly created output", async () => {
  const input = await fixture(true);
  await expect(deployWorkspacePackage(input)).rejects.toThrow("escapes its deployment");
  await expect(readFile(join(input.outputRoot, "package/package.json"))).rejects.toMatchObject({ code: "ENOENT" });
  expect(JSON.parse(await readFile(join(input.packageDirectory, "package.json"), "utf8")).name).toBe("@fixture/example");
});

it("preserves an existing output instead of replacing it", async () => {
  const input = await fixture();
  await mkdir(input.outputRoot);
  await writeFile(join(input.outputRoot, "keep"), "owned by caller");
  await expect(deployWorkspacePackage(input)).rejects.toMatchObject({ code: "EEXIST" });
  expect(await readFile(join(input.outputRoot, "keep"), "utf8")).toBe("owned by caller");
});
