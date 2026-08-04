import {
  access,
  chmod,
  constants,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  materializeServerRuntimeDependencies,
  type ServerRuntimeCommand,
} from "../src/server/runtime-dependencies.js";
import {
  hostServerTarget,
  type ServerTarget,
} from "../src/server/config.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { force: true, recursive: true })),
  );
});

async function writePackage(
  nodeModulesRoot: string,
  name: string,
  version: string,
): Promise<string> {
  const packageRoot = join(nodeModulesRoot, name);
  await mkdir(packageRoot, { recursive: true });
  await writeFile(
    join(packageRoot, "package.json"),
    `${JSON.stringify({ name, version })}\n`,
    "utf8",
  );
  return packageRoot;
}

async function writeRuntimeFixture(
  nodeModulesRoot: string,
  target: ServerTarget,
  options: { nodePtyVersion?: string; omitPtyAsset?: boolean } = {},
): Promise<void> {
  const betterSqlite = await writePackage(
    nodeModulesRoot,
    "better-sqlite3",
    "12.10.0",
  );
  await mkdir(join(betterSqlite, "build", "Release"), { recursive: true });
  await writeFile(
    join(betterSqlite, "build", "Release", "better_sqlite3.node"),
    "native",
  );

  const blake3 = await writePackage(
    nodeModulesRoot,
    "blake3-wasm",
    "2.1.5",
  );
  await mkdir(join(blake3, "dist", "wasm", "nodejs"), { recursive: true });
  await writeFile(
    join(blake3, "dist", "wasm", "nodejs", "blake3_js_bg.wasm"),
    "wasm",
  );

  const nodePty = await writePackage(
    nodeModulesRoot,
    "node-pty",
    options.nodePtyVersion ?? "1.1.0",
  );
  // Mirror real node-pty layouts: linux rebuilds into build/Release with only
  // pty.node; darwin/win32 also ship prebuilds/<platform>-<arch>/ assets, and
  // darwin additionally needs spawn-helper (binding.gyp builds it only on mac).
  const nodePtyNativeRoot =
    target.platform === "linux"
      ? join(nodePty, "build", "Release")
      : join(nodePty, "prebuilds", `${target.platform}-${target.arch}`);
  await mkdir(nodePtyNativeRoot, { recursive: true });
  if (!(options.omitPtyAsset === true && target.platform === "linux")) {
    await writeFile(join(nodePtyNativeRoot, "pty.node"), "native");
  }
  if (target.platform === "win32") {
    for (const file of [
      "conpty.node",
      "conpty_console_list.node",
      "winpty-agent.exe",
      "winpty.dll",
    ]) {
      if (options.omitPtyAsset === true && file === "conpty.node") continue;
      await writeFile(join(nodePtyNativeRoot, file), "native");
    }
  } else if (target.platform === "darwin") {
    if (options.omitPtyAsset !== true) {
      const helper = join(nodePtyNativeRoot, "spawn-helper");
      await writeFile(helper, "#!/bin/sh\nexit 0\n", "utf8");
      await chmod(helper, 0o644);
    }
  }

  if (target.platform === "darwin") {
    const fsevents = await writePackage(
      nodeModulesRoot,
      "fsevents",
      "2.3.3",
    );
    await writeFile(join(fsevents, "fsevents.node"), "native");
  }
}

describe("server runtime dependencies", () => {
  it("materializes the exact host runtime closure and repairs the PTY helper mode", async () => {
    const root = await mkdtemp(join(tmpdir(), "open-design-server-runtime-"));
    roots.push(root);
    const releaseRoot = join(root, "release");
    const workRoot = join(root, "work");
    const target = hostServerTarget();
    const commands: ServerRuntimeCommand[] = [];
    let installManifest = "";
    let installLock = "";

    const versions = await materializeServerRuntimeDependencies({
      releaseRoot,
      target,
      workspaceRoot: join(import.meta.dirname, "../../.."),
      workRoot,
      runCommand: async (command) => {
        commands.push(command);
        installManifest = await readFile(
          join(command.cwd, "package.json"),
          "utf8",
        );
        installLock = await readFile(
          join(command.cwd, "package-lock.json"),
          "utf8",
        );
        await writeRuntimeFixture(
          join(command.cwd, "node_modules"),
          target,
        );
        const nodePtyRoot = join(command.cwd, "node_modules", "node-pty");
        await mkdir(
          join(nodePtyRoot, "prebuilds", "foreign-platform-x64"),
          { recursive: true },
        );
        await writeFile(
          join(
            nodePtyRoot,
            "prebuilds",
            "foreign-platform-x64",
            "pty.node",
          ),
          "foreign-native",
        );
        // Linux fixtures only create build/Release; ensure the target
        // prebuild dir exists so we can plant a .pdb for prune coverage.
        await mkdir(
          join(nodePtyRoot, "prebuilds", `${target.platform}-${target.arch}`),
          { recursive: true },
        );
        await writeFile(
          join(
            nodePtyRoot,
            "prebuilds",
            `${target.platform}-${target.arch}`,
            "debug-symbols.pdb",
          ),
          "debug-symbols",
        );
      },
    });

    expect(commands).toHaveLength(1);
    expect(commands[0]?.args).toEqual([
      "ci",
      "--omit=dev",
      "--no-audit",
      "--no-fund",
    ]);
    expect(installManifest).toContain('"better-sqlite3": "12.10.0"');
    expect(installLock).toContain('"lockfileVersion": 3');

    expect(versions).toEqual({
      "better-sqlite3": "12.10.0",
      "blake3-wasm": "2.1.5",
      "node-pty": "1.1.0",
      ...(target.platform === "darwin" ? { fsevents: "2.3.3" } : {}),
    });
    await expect(
      access(
        join(
          releaseRoot,
          "node_modules",
          "better-sqlite3",
          "build",
          "Release",
          "better_sqlite3.node",
        ),
      ),
    ).resolves.toBeUndefined();
    if (target.platform === "darwin") {
      await expect(
        access(
          join(
            releaseRoot,
            "node_modules",
            "node-pty",
            "prebuilds",
            `${target.platform}-${target.arch}`,
            "spawn-helper",
          ),
          constants.X_OK,
        ),
      ).resolves.toBeUndefined();
    } else if (target.platform === "linux") {
      await expect(
        access(
          join(
            releaseRoot,
            "node_modules",
            "node-pty",
            "build",
            "Release",
            "pty.node",
          ),
        ),
      ).resolves.toBeUndefined();
      // Linux node-pty does not ship/build spawn-helper (binding.gyp OS=="mac" only).
      await expect(
        access(
          join(
            releaseRoot,
            "node_modules",
            "node-pty",
            "build",
            "Release",
            "spawn-helper",
          ),
        ),
      ).rejects.toMatchObject({ code: "ENOENT" });
    }
    await expect(
      access(
        join(
          releaseRoot,
          "node_modules",
          "node-pty",
          "prebuilds",
          "foreign-platform-x64",
          "pty.node",
        ),
      ),
    ).rejects.toMatchObject({ code: "ENOENT" });
    await expect(
      access(
        join(
          releaseRoot,
          "node_modules",
          "node-pty",
          "prebuilds",
          `${target.platform}-${target.arch}`,
          "debug-symbols.pdb",
        ),
      ),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects version drift without replacing an existing runtime tree", async () => {
    const root = await mkdtemp(join(tmpdir(), "open-design-server-runtime-"));
    roots.push(root);
    const releaseRoot = join(root, "release");
    const workRoot = join(root, "work");
    const target = hostServerTarget();
    const sentinel = join(releaseRoot, "node_modules", "sentinel.txt");
    await mkdir(join(releaseRoot, "node_modules"), { recursive: true });
    await writeFile(sentinel, "keep-me\n", "utf8");

    await expect(
      materializeServerRuntimeDependencies({
        releaseRoot,
        target,
        workspaceRoot: join(import.meta.dirname, "../../.."),
        workRoot,
        runCommand: async (command) => {
          await writeRuntimeFixture(
            join(command.cwd, "node_modules"),
            target,
            { nodePtyVersion: "1.0.0" },
          );
        },
      }),
    ).rejects.toThrow(
      /server runtime dependency node-pty expected 1\.1\.0, found 1\.0\.0/,
    );

    await expect(readFile(sentinel, "utf8")).resolves.toBe("keep-me\n");
    await expect(readdir(workRoot)).resolves.toEqual([]);
  });

  it("rejects a target package whose required PTY native asset is missing", async () => {
    const root = await mkdtemp(join(tmpdir(), "open-design-server-runtime-"));
    roots.push(root);
    const target = hostServerTarget();

    await expect(
      materializeServerRuntimeDependencies({
        releaseRoot: join(root, "release"),
        target,
        workspaceRoot: join(import.meta.dirname, "../../.."),
        workRoot: join(root, "work"),
        runCommand: async (command) => {
          await writeRuntimeFixture(
            join(command.cwd, "node_modules"),
            target,
            { omitPtyAsset: true },
          );
        },
      }),
    ).rejects.toThrow(
      target.platform === "win32"
        ? /node-pty Windows asset conpty\.node is missing or empty/
        : target.platform === "darwin"
          ? /node-pty spawn-helper is missing or empty/
          : /node-pty has no native assets for linux-/,
    );
  });

  it("does not inherit Electron ABI overrides when invoking npm", async () => {
    const root = await mkdtemp(join(tmpdir(), "open-design-server-runtime-"));
    roots.push(root);
    const target = hostServerTarget();
    const overridden = {
      npm_config_arch: process.env.npm_config_arch,
      npm_config_disturl: process.env.npm_config_disturl,
      npm_config_runtime: process.env.npm_config_runtime,
      npm_config_target: process.env.npm_config_target,
    };
    process.env.npm_config_arch = "ia32";
    process.env.npm_config_disturl = "https://electronjs.org/headers";
    process.env.npm_config_runtime = "electron";
    process.env.npm_config_target = "41.3.0";
    const commandEnvs: NodeJS.ProcessEnv[] = [];

    try {
      await materializeServerRuntimeDependencies({
        releaseRoot: join(root, "release"),
        target,
        workspaceRoot: join(import.meta.dirname, "../../.."),
        workRoot: join(root, "work"),
        runCommand: async (command) => {
          commandEnvs.push(command.env);
          await writeRuntimeFixture(
            join(command.cwd, "node_modules"),
            target,
          );
        },
      });
    } finally {
      for (const [name, value] of Object.entries(overridden)) {
        if (value == null) delete process.env[name];
        else process.env[name] = value;
      }
    }

    expect(commandEnvs).toHaveLength(1);
    const commandEnv = commandEnvs[0] as NodeJS.ProcessEnv;
    expect(commandEnv["npm_config_arch"]).toBeUndefined();
    expect(commandEnv["npm_config_disturl"]).toBeUndefined();
    expect(commandEnv["npm_config_runtime"]).toBeUndefined();
    expect(commandEnv["npm_config_target"]).toBeUndefined();
  });
});
