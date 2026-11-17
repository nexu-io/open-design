import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";
import { pruneWindowsCache } from "../../../.github/scripts/release/cache/windows.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

describe("packaged build validation", () => {
  it("keeps test and generated-route diagnostics in independent checking, with production-only build roots", async () => {
    const fixture = await mkdtemp(join(tmpdir(), "pack-typecheck-"));
    try {
      for (const file of ["tsconfig.json", "tsconfig.build.json"]) {
        const parsed = JSON.parse(await readFile(join(root, "apps/web", file), "utf8")) as {
          include?: string[];
          exclude?: string[];
        };
        await writeFile(join(fixture, file), JSON.stringify({
          compilerOptions: { noEmit: true, strict: true, skipLibCheck: true, target: "ES2022" },
          include: parsed.include,
          exclude: parsed.exclude,
        }));
      }
      for (const dir of ["tests", "src", "sidecar", ".next/types"]) await mkdir(join(fixture, dir), { recursive: true });
      for (const dir of ["tests", "src", "sidecar", ".next/types"]) {
        await writeFile(join(fixture, dir, "witness.ts"), "export const value: string = 123;\n");
      }
      const diagnostics = (config: string) => {
        let output = "";
        try {
          output = execFileSync(join(root, "node_modules/.bin/tsc"), ["-p", config, "--noEmit", "--pretty", "false", "--incremental", "false"], {
            cwd: fixture,
            encoding: "utf8",
          });
        } catch (error) {
          const err = error as { stdout?: string; stderr?: string };
          output = `${err.stdout ?? ""}${err.stderr ?? ""}`;
        }
        return [...output.matchAll(/(?:^|\n)(.+?)\(\d+,\d+\): error TS2322:/g)]
          .map((match) => match[1]!.replaceAll("\\", "/"))
          .sort();
      };
      expect(diagnostics("tsconfig.json")).toEqual([".next/types/witness.ts", "sidecar/witness.ts", "src/witness.ts", "tests/witness.ts"]);
      expect(diagnostics("tsconfig.build.json")).toEqual([".next/types/witness.ts", "src/witness.ts"]);
      const pkg = JSON.parse(await readFile(join(root, "apps/web/package.json"), "utf8"));
      expect(pkg.scripts.typecheck).toBe("next typegen && tsc -b --noEmit");
    } finally { await rm(fixture, { recursive: true, force: true }); }
  });

  it("always skips Next's embedded checker so native TypeScript 7 remains the web type gate", () => {
    const read = (mode: string) => JSON.parse(execFileSync(process.execPath, ["--input-type=module", "-e",
      "const {default:config}=await import('./apps/web/next.config.ts'); console.log(JSON.stringify(config.typescript));"],
    { cwd: root, env: { ...process.env, NODE_ENV: "production", OD_WEB_TYPECHECK: mode, OD_WEB_TSCONFIG_PATH: "" }, encoding: "utf8" }));
    expect(read("")).toEqual({ tsconfigPath: "tsconfig.build.json", ignoreBuildErrors: true });
    expect(read("external")).toEqual({ tsconfigPath: "tsconfig.build.json", ignoreBuildErrors: true });
  });
});

describe("Windows cache transfer budget", () => {
  it("validates handoff keys and detects damaged archives before cache restore", async () => {
    const fixture = await mkdtemp(join(tmpdir(), "pack-cache-handoff-"));
    try {
      const archive = Buffer.from("cache fixture");
      const prefix = "tools-pack-win-v2-slim-beta-Windows-";
      const metadata = {
        schema_version: 1, kind: "pack-cache", id: "windows", prefix,
        key: prefix + "a".repeat(64), head_sha: "b".repeat(40), run_id: 42,
        run_attempt: 1, repository: "nexu-io/open-design", ref: "refs/heads/test",
        sha256: createHash("sha256").update(archive).digest("hex"),
      };
      await writeFile(join(fixture, "cache.tar.gz"), archive);
      await writeFile(join(fixture, "metadata.json"), JSON.stringify(metadata));
      const validate = () => execFileSync("python3", [join(root, ".github/scripts/handoff.py"), "validate", "pack-cache", fixture], { encoding: "utf8", stdio: "pipe" });
      expect(JSON.parse(validate()).key).toBe(metadata.key);
      await writeFile(join(fixture, "cache.tar.gz"), "damaged");
      expect(validate).toThrow();
      await writeFile(join(fixture, "cache.tar.gz"), archive);
      await writeFile(join(fixture, "metadata.json"), JSON.stringify({ ...metadata, key: "pnpm-store" }));
      expect(validate).toThrow();
    } finally { await rm(fixture, { recursive: true, force: true }); }
  });

  it("keeps only the newest expensive entries and leaves complete retained payloads intact", async () => {
    const fixture = await mkdtemp(join(tmpdir(), "pack-cache-"));
    const entry = async (node: string, name: string, size: number, time: number) => {
      const path = join(fixture, "entries", node, name);
      await mkdir(path, { recursive: true });
      await writeFile(join(path, "manifest.json"), "{}");
      await writeFile(join(path, "payload"), "x".repeat(size));
      await utimes(path, time, time);
      return path;
    };
    try {
      await entry("win.workspace-build", "old", 10, 1);
      const workspace = await entry("win.workspace-build", "new", 20, 2);
      const nsis = await entry("win.nsis-payload-base", "base", 20, 1);
      await entry("win.portable-zip", "zip", 50, 1);
      const report = await pruneWindowsCache(fixture, 50);
      expect(report.keptBytes).toBe(44);
      expect(report.entries.filter((e) => e.kept).map((e) => e.entry).sort()).toEqual(["base", "new"]);
      expect(await readFile(join(workspace, "payload"), "utf8")).toHaveLength(20);
      expect(await readFile(join(nsis, "payload"), "utf8")).toHaveLength(20);
      await expect(readFile(join(fixture, "entries/win.workspace-build/old/payload"))).rejects.toThrow();
      await expect(readFile(join(fixture, "entries/win.portable-zip/zip/payload"))).rejects.toThrow();
      // Byte limits remove whole entries; there is never a partially reusable payload.
      const trimmed = await pruneWindowsCache(fixture, 25);
      expect(trimmed.keptBytes).toBe(22);
      await expect(readFile(join(nsis, "manifest.json"))).rejects.toThrow();
    } finally { await rm(fixture, { recursive: true, force: true }); }
  });

  it("handles a cold cache and rejects invalid budgets", async () => {
    const fixture = await mkdtemp(join(tmpdir(), "pack-cache-cold-"));
    try {
      expect((await pruneWindowsCache(fixture)).keptBytes).toBe(0);
      await expect(pruneWindowsCache(fixture, -1)).rejects.toThrow("Invalid cache byte budget");
    } finally { await rm(fixture, { recursive: true, force: true }); }
  });

  it("retains final artifacts for repeat builds while dropping their historical copies", async () => {
    const fixture = await mkdtemp(join(tmpdir(), "pack-cache-generations-"));
    try {
      for (const node of ["win.electron-builder-dir", "win.nsis-installer", "win.portable-zip", "win.launcher-payload"]) {
        for (const [generation, time] of [["old", 1], ["latest", 2]] as const) {
          const path = join(fixture, "entries", node, generation);
          await mkdir(path, { recursive: true });
          await writeFile(join(path, "manifest.json"), "{}");
          await writeFile(join(path, "artifact"), `${node}:${generation}`);
          await utimes(path, time, time);
        }
      }
      const report = await pruneWindowsCache(fixture);
      expect(report.entries.filter((entry) => entry.kept)).toHaveLength(4);
      expect(report.entries.filter((entry) => entry.kept).every((entry) => entry.entry === "latest")).toBe(true);
      for (const entry of report.entries) {
        const artifact = readFile(join(fixture, "entries", entry.node, entry.entry, "artifact"), "utf8");
        if (entry.kept) expect(await artifact).toBe(`${entry.node}:latest`);
        else await expect(artifact).rejects.toThrow();
      }
    } finally { await rm(fixture, { recursive: true, force: true }); }
  });
});
