import { access, cp, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const runWebStandaloneAfterPack = require("../../resources/linux/web-standalone-after-pack.cjs") as (
  context: unknown,
) => Promise<void>;

const CONFIG_ENV = "OD_TOOLS_PACK_WEB_STANDALONE_HOOK_CONFIG";
const savedConfigEnv = process.env[CONFIG_ENV];

afterEach(() => {
  if (savedConfigEnv == null) delete process.env[CONFIG_ENV];
  else process.env[CONFIG_ENV] = savedConfigEnv;
});

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

type Fixture = {
  appOutDir: string;
  auditReportPath: string;
  hookConfigPath: string;
  resourcesRoot: string;
  root: string;
  standaloneSourceRoot: string;
};

// Builds the workspace-shape standalone tree the workspace-build stage
// produces (apps/web/.next/standalone with a nested apps/web server) plus the
// hook config the linux.ts writer emits.
async function writeFixture(options: { resourceName?: string; withServer?: boolean } = {}): Promise<Fixture> {
  const root = await mkdtemp(join(tmpdir(), "od-linux-webstandalone-hook-"));
  const workspaceRoot = join(root, "workspace");
  const standaloneSourceRoot = join(workspaceRoot, "apps", "web", ".next", "standalone");
  const sourceWebRoot = join(standaloneSourceRoot, "apps", "web");

  await mkdir(join(sourceWebRoot, ".next"), { recursive: true });
  await writeFile(join(sourceWebRoot, ".next", "routes-manifest.json"), "{}\n", "utf8");
  if (options.withServer !== false) {
    await writeFile(join(sourceWebRoot, "server.js"), "// standalone server fixture\n", "utf8");
  }
  await writeFile(
    join(sourceWebRoot, "package.json"),
    `${JSON.stringify({ name: "@open-design/web", private: true, version: "0.0.0" }, null, 2)}\n`,
    "utf8",
  );
  // pnpm-shaped standalone tree, matching what `next build` traces in this
  // workspace: dependency packages exist only inside node_modules/.pnpm and
  // are exposed through relative links from the public-hoist area and the
  // app-local node_modules — never as top-level real directories.
  for (const moduleName of ["next", "react", "react-dom", "styled-jsx"]) {
    const moduleRoot = join(standaloneSourceRoot, "node_modules", ".pnpm", `${moduleName}@0.0.0`, "node_modules", moduleName);
    await mkdir(moduleRoot, { recursive: true });
    await writeFile(
      join(moduleRoot, "package.json"),
      `${JSON.stringify({ name: moduleName, version: "0.0.0" }, null, 2)}\n`,
      "utf8",
    );
    const hoistRoot = join(standaloneSourceRoot, "node_modules", ".pnpm", "node_modules");
    await mkdir(hoistRoot, { recursive: true });
    await symlink(`../${moduleName}@0.0.0/node_modules/${moduleName}`, join(hoistRoot, moduleName));
  }
  // App-local next link exactly as the traced tree emits it.
  const appNodeModules = join(sourceWebRoot, "node_modules");
  await mkdir(appNodeModules, { recursive: true });
  await symlink(
    "../../../node_modules/.pnpm/next@0.0.0/node_modules/next",
    join(appNodeModules, "next"),
  );
  await mkdir(join(workspaceRoot, "apps", "web", ".next", "static"), { recursive: true });
  await writeFile(join(workspaceRoot, "apps", "web", ".next", "static", "asset.js"), "// static\n", "utf8");
  await mkdir(join(workspaceRoot, "apps", "web", "public"), { recursive: true });
  await writeFile(join(workspaceRoot, "apps", "web", "public", "favicon.ico"), "icon", "utf8");

  const appOutDir = join(root, "out", "app");
  const resourcesRoot = join(appOutDir, "resources");
  await mkdir(resourcesRoot, { recursive: true });

  const auditReportPath = join(root, "web-standalone-after-pack-audit.json");
  const hookConfigPath = join(root, "web-standalone-after-pack-config.json");
  await writeFile(
    hookConfigPath,
    `${JSON.stringify(
      {
        auditReportPath,
        resourceName: options.resourceName ?? "open-design-web-standalone",
        standaloneSourceRoot,
        version: 1,
        webPublicSourceRoot: join(workspaceRoot, "apps", "web", "public"),
        webStaticSourceRoot: join(workspaceRoot, "apps", "web", ".next", "static"),
        workspaceRoot,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  return { appOutDir, auditReportPath, hookConfigPath, resourcesRoot, root, standaloneSourceRoot };
}

async function runHook(fixture: Fixture): Promise<void> {
  process.env[CONFIG_ENV] = fixture.hookConfigPath;
  await runWebStandaloneAfterPack({
    appOutDir: fixture.appOutDir,
    electronPlatformName: "linux",
  });
}

describe("linux web-standalone-after-pack hook", () => {
  it("rejects non-linux electron-builder contexts like the shared hook rejects linux", async () => {
    const fixture = await writeFixture();
    try {
      process.env[CONFIG_ENV] = fixture.hookConfigPath;
      await expect(runWebStandaloneAfterPack({ appOutDir: fixture.appOutDir, electronPlatformName: "darwin" }))
        .rejects.toThrow("unsupported platform: darwin");
    } finally {
      await rm(fixture.root, { force: true, recursive: true });
    }
  });

  it("fails loudly when the hook config env is missing", async () => {
    const fixture = await writeFixture();
    try {
      delete process.env[CONFIG_ENV];
      await expect(runWebStandaloneAfterPack({ appOutDir: fixture.appOutDir, electronPlatformName: "linux" }))
        .rejects.toThrow(`missing ${CONFIG_ENV}`);
    } finally {
      await rm(fixture.root, { force: true, recursive: true });
    }
  });

  it("fails loudly when the standalone source has no server entry", async () => {
    const fixture = await writeFixture({ withServer: false });
    try {
      await expect(runHook(fixture)).rejects.toThrow("standalone server.js not found under");
    } finally {
      await rm(fixture.root, { force: true, recursive: true });
    }
  });

  it("rejects unsupported resource names so the packaged app default stays authoritative", async () => {
    const fixture = await writeFixture({ resourceName: "some-other-name" });
    try {
      await expect(runHook(fixture)).rejects.toThrow("unsupported resourceName: some-other-name");
    } finally {
      await rm(fixture.root, { force: true, recursive: true });
    }
  });

  it("materializes the standalone runtime into resources and writes the audit report", async () => {
    const fixture = await writeFixture();
    try {
      await runHook(fixture);

      const destinationRoot = join(fixture.resourcesRoot, "open-design-web-standalone");
      const destinationWebRoot = join(destinationRoot, "apps", "web");
      expect(await pathExists(join(destinationWebRoot, "server.js"))).toBe(true);
      expect(await pathExists(join(destinationWebRoot, "package.json"))).toBe(true);
      expect(await pathExists(join(destinationRoot, "node_modules", "next", "package.json"))).toBe(true);
      expect(await pathExists(join(destinationWebRoot, ".next", "routes-manifest.json"))).toBe(true);
      expect(await pathExists(join(destinationWebRoot, ".next", "static", "asset.js"))).toBe(true);
      expect(await pathExists(join(destinationWebRoot, "public", "favicon.ico"))).toBe(true);

      const audit = JSON.parse(await readFile(fixture.auditReportPath, "utf8")) as {
        copiedAudit: { destinationWebRoot: string; resolvedModules: Record<string, string>; serverPath: string };
        platformName: string;
        version: number;
      };
      expect(audit.version).toBe(1);
      expect(audit.platformName).toBe("linux");
      expect(audit.copiedAudit.destinationWebRoot).toBe(destinationWebRoot);
      // The packaged web sidecar boots server.js; next/react must resolve
      // strictly inside the copied resource tree.
      for (const resolved of Object.values(audit.copiedAudit.resolvedModules)) {
        expect(resolved.startsWith(destinationRoot)).toBe(true);
      }
    } finally {
      await rm(fixture.root, { force: true, recursive: true });
    }
  });

  it("links the pnpm public-hoist area so plain Node resolution from server.js stays inside the resource", async () => {
    const fixture = await writeFixture();
    try {
      await runHook(fixture);

      const destinationRoot = join(fixture.resourcesRoot, "open-design-web-standalone");
      const hoistedReact = join(destinationRoot, "node_modules", "react");
      expect((await (await import("node:fs/promises")).lstat(hoistedReact)).isSymbolicLink()).toBe(true);
      // The build machine's ancestor node_modules would otherwise mask a
      // resolution escape; assert the real path is inside the resource.
      expect(await realpath(hoistedReact)).toContain(join(destinationRoot, "node_modules", ".pnpm"));

      const audit = JSON.parse(await readFile(fixture.auditReportPath, "utf8")) as {
        linkedHoistEntries: string[];
      };
      expect(audit.linkedHoistEntries).toContain(hoistedReact);
      // Existing app-local links must not be clobbered by the hoist pass.
      expect((await realpath(join(destinationRoot, "apps", "web", "node_modules", "next")))).toContain(
        join(destinationRoot, "node_modules", ".pnpm"),
      );
    } finally {
      await rm(fixture.root, { force: true, recursive: true });
    }
  });

  it("fails the package when a copied symlink resolves outside the resource", async () => {
    const fixture = await writeFixture();
    try {
      // A valid link pointing OUTSIDE the standalone tree: prune keeps it
      // (the target exists), the containment audit must reject it because a
      // user machine has no ancestor node_modules to satisfy it.
      await symlink(
        join(fixture.root, "outside-store"),
        join(fixture.standaloneSourceRoot, "node_modules", "external-link"),
      );
      await mkdir(join(fixture.root, "outside-store"), { recursive: true });

      await expect(runHook(fixture)).rejects.toThrow(
        "copied standalone has symlinks resolving outside the resource: node_modules/external-link",
      );
    } finally {
      await rm(fixture.root, { force: true, recursive: true });
    }
  });

  it("prunes dangling symlinks copied from the standalone tree so the packaged closure is clean", async () => {
    const fixture = await writeFixture();
    try {
      const danglingLink = join(fixture.standaloneSourceRoot, "node_modules", "dangling-link");
      await symlink(join(fixture.standaloneSourceRoot, "node_modules", "does-not-exist"), danglingLink);

      await runHook(fixture);

      const destinationRoot = join(fixture.resourcesRoot, "open-design-web-standalone");
      expect(await pathExists(join(destinationRoot, "node_modules", "dangling-link"))).toBe(false);

      const audit = JSON.parse(await readFile(fixture.auditReportPath, "utf8")) as {
        brokenSymlinkPrune: Array<{ path: string; reason: string }>;
      };
      expect(audit.brokenSymlinkPrune).toHaveLength(1);
      expect(audit.brokenSymlinkPrune[0]?.reason).toBe("copied broken symlink");
    } finally {
      await rm(fixture.root, { force: true, recursive: true });
    }
  });

  it("replaces a previous resource tree instead of merging stale entries into it", async () => {
    const fixture = await writeFixture();
    try {
      const destinationRoot = join(fixture.resourcesRoot, "open-design-web-standalone");
      const staleEntry = join(destinationRoot, "stale-from-previous-build.txt");
      await mkdir(destinationRoot, { recursive: true });
      await writeFile(staleEntry, "stale", "utf8");

      await runHook(fixture);

      expect(await pathExists(staleEntry)).toBe(false);
      expect(await pathExists(join(destinationRoot, "apps", "web", "server.js"))).toBe(true);
    } finally {
      await rm(fixture.root, { force: true, recursive: true });
    }
  });
});

// The hook copies verbatim symlinks; guard the fixture machinery itself so the
// dangling-link test can never silently degrade into a dereferenced copy.
describe("web-standalone hook fixtures", () => {
  it("copies symlink entries verbatim with the hook's cp options", async () => {
    const root = await mkdtemp(join(tmpdir(), "od-linux-webstandalone-cp-"));
    try {
      const sourceRoot = join(root, "source");
      const targetRoot = join(root, "target");
      await mkdir(join(sourceRoot, "real"), { recursive: true });
      await writeFile(join(sourceRoot, "real", "file.txt"), "x", "utf8");
      await symlink("real", join(sourceRoot, "link"));
      await cp(sourceRoot, targetRoot, { recursive: true, verbatimSymlinks: true });
      const lstat = await (await import("node:fs/promises")).lstat(join(targetRoot, "link"));
      expect(lstat.isSymbolicLink()).toBe(true);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });
});
