import { describe, expect, it } from "vitest";
import {
  access,
  chmod,
  constants,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import process from "node:process";

import { domToPptxBundleResource } from "../src/dom-to-pptx-resource.js";
import { copyBundledResourceTrees } from "../src/resources.js";
import { copyOptionalVelaCliBinary, resolveOptionalVelaCliBinary } from "../src/vela-cli.js";

async function writeFakeOpenCodeCompanion(
  source: string,
  content = "#!/bin/sh\nexit 0\n",
): Promise<string> {
  const companion = join(dirname(source), "libexec", "opencode", "opencode");
  await mkdir(dirname(companion), { recursive: true });
  await writeFile(companion, content, "utf8");
  await chmod(companion, 0o755);
  return companion;
}

describe("domToPptxBundleResource", () => {
  it("derives the vendored bundle path from the workspace root, not the caller cwd", async () => {
    const root = await mkdtemp(join(tmpdir(), "open-design-tools-pack-resource-"));
    const workspaceRoot = join(root, "workspace");
    const callerCwd = join(root, "caller");
    const previousCwd = process.cwd();

    try {
      await mkdir(workspaceRoot, { recursive: true });
      await mkdir(callerCwd, { recursive: true });
      process.chdir(callerCwd);

      expect(domToPptxBundleResource({ workspaceRoot })).toEqual({
        from: join(workspaceRoot, "apps", "desktop", "vendor", "dom-to-pptx", "dom-to-pptx.bundle.js.gz"),
        to: "dom-to-pptx.bundle.js.gz",
      });
    } finally {
      process.chdir(previousCwd);
      await rm(root, { force: true, recursive: true });
    }
  });
});

describe("copyBundledResourceTrees", () => {
  it("includes daemon resource trees", async () => {
    const root = await mkdtemp(join(tmpdir(), "open-design-tools-pack-"));
    const workspaceRoot = join(root, "workspace");
    const resourceRoot = join(root, "resources");

    try {
      const promptTemplatePath = join(
        workspaceRoot,
        "prompt-templates",
        "image",
        "sample.json",
      );
      const designTemplatePath = join(
        workspaceRoot,
        "design-templates",
        "orbit-general",
        "SKILL.md",
      );
      const communityPetPath = join(
        workspaceRoot,
        "assets",
        "community-pets",
        "sample",
        "pet.json",
      );
      const communityRegistryPath = join(
        workspaceRoot,
        "plugins",
        "registry",
        "community",
        "open-design-marketplace.json",
      );
      await mkdir(join(workspaceRoot, "skills", "sample"), { recursive: true });
      // The skills/design-templates split (see specs/current/
      // skills-and-design-templates.md) added a separate top-level
      // `design-templates/` tree that copyBundledResourceTrees now also
      // bundles. Create it in the fixture so the recursive copy does not
      // fail with ENOENT before reaching the prompt-templates assertion.
      await mkdir(join(workspaceRoot, "design-templates", "orbit-general"), {
        recursive: true,
      });
      await mkdir(join(workspaceRoot, "design-systems", "sample"), {
        recursive: true,
      });
      await mkdir(join(workspaceRoot, "craft", "sample"), { recursive: true });
      await mkdir(join(workspaceRoot, "plugins", "_official", "sample"), {
        recursive: true,
      });
      await mkdir(join(workspaceRoot, "plugins", "registry", "community"), {
        recursive: true,
      });
      await mkdir(join(workspaceRoot, "assets", "frames"), { recursive: true });
      await mkdir(join(workspaceRoot, "assets", "community-pets", "sample"), {
        recursive: true,
      });
      await mkdir(join(workspaceRoot, "prompt-templates", "image"), {
        recursive: true,
      });
      await mkdir(join(workspaceRoot, "data", "plugin-previews"), {
        recursive: true,
      });
      await writeFile(promptTemplatePath, "{\"id\":\"sample\"}\n", "utf8");
      await writeFile(
        join(workspaceRoot, "data", "plugin-previews", "manifest.json"),
        "{\"previews\":{}}\n",
        "utf8",
      );
      await writeFile(designTemplatePath, "# Orbit General\n", "utf8");
      await writeFile(communityPetPath, "{\"name\":\"sample\"}\n", "utf8");
      await writeFile(
        join(workspaceRoot, "plugins", "_official", "sample", "open-design.json"),
        "{\"id\":\"sample\"}\n",
        "utf8",
      );
      await writeFile(communityRegistryPath, "{\"plugins\":[]}\n", "utf8");

      await copyBundledResourceTrees({ workspaceRoot, resourceRoot });

      await expect(
        readFile(
          join(resourceRoot, "prompt-templates", "image", "sample.json"),
          "utf8",
        ),
      ).resolves.toBe("{\"id\":\"sample\"}\n");
      // The baked plugin-preview manifest must land under data/plugin-previews so
      // the packaged daemon can map plugins to their R2 clips; without it the
      // gallery silently falls back to live iframes.
      await expect(
        readFile(
          join(resourceRoot, "data", "plugin-previews", "manifest.json"),
          "utf8",
        ),
      ).resolves.toBe("{\"previews\":{}}\n");
      await expect(
        readFile(
          join(resourceRoot, "design-templates", "orbit-general", "SKILL.md"),
          "utf8",
        ),
      ).resolves.toBe("# Orbit General\n");
      await expect(
        readFile(
          join(resourceRoot, "community-pets", "sample", "pet.json"),
          "utf8",
        ),
      ).resolves.toBe("{\"name\":\"sample\"}\n");
      await expect(
        readFile(
          join(resourceRoot, "plugins", "_official", "sample", "open-design.json"),
          "utf8",
        ),
      ).resolves.toBe("{\"id\":\"sample\"}\n");
      await expect(
        readFile(
          join(
            resourceRoot,
            "plugins",
            "registry",
            "community",
            "open-design-marketplace.json",
          ),
          "utf8",
        ),
      ).resolves.toBe("{\"plugins\":[]}\n");
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });
});

describe("copyOptionalVelaCliBinary", () => {
  it("copies the installed Vela CLI through the default npm resolver", async () => {
    const root = await mkdtemp(join(tmpdir(), "open-design-tools-pack-vela-installed-"));
    const resourceRoot = join(root, "resources", "open-design");
    const platform = process.platform === "win32" ? "win" : process.platform === "darwin" ? "mac" : "linux";

    try {
      const copied = await copyOptionalVelaCliBinary({
        env: {},
        platform,
        requireBundled: true,
        resourceRoot,
      });

      const target = join(resourceRoot, "bin", process.platform === "win32" ? "vela.exe" : "vela");
      expect(copied?.target).toBe(target);
      await expect(access(target)).resolves.toBeUndefined();
      await expect(access(join(resourceRoot, "bin", "libexec", "opencode", "opencode"))).resolves.toBeUndefined();
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("copies a configured Vela CLI binary into the POSIX resource bin", async () => {
    const root = await mkdtemp(join(tmpdir(), "open-design-tools-pack-vela-"));
    const source = join(root, "source", "vela");
    const resourceRoot = join(root, "resources", "open-design");

    try {
      await mkdir(join(root, "source"), { recursive: true });
      await writeFile(source, "#!/bin/sh\nexit 0\n", "utf8");
      await writeFakeOpenCodeCompanion(source, "#!/bin/sh\necho opencode\n");

      const copied = await copyOptionalVelaCliBinary({
        env: { OPEN_DESIGN_VELA_CLI_BIN: source },
        platform: "mac",
        requireBundled: true,
        resourceRoot,
      });

      const target = join(resourceRoot, "bin", "vela");
      const companionTarget = join(resourceRoot, "bin", "libexec", "opencode", "opencode");
      await expect(readFile(target, "utf8")).resolves.toBe("#!/bin/sh\nexit 0\n");
      await expect(readFile(companionTarget, "utf8")).resolves.toBe(
        "#!/bin/sh\necho opencode\n",
      );
      await expect(access(target, constants.X_OK)).resolves.toBeUndefined();
      await expect(access(companionTarget, constants.X_OK)).resolves.toBeUndefined();
      expect(copied).toEqual({ source, target });
      if (process.platform !== "win32") {
        expect((await stat(target)).mode & 0o111).not.toBe(0);
        expect((await stat(companionTarget)).mode & 0o111).not.toBe(0);
      }
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("fails strict mode when the OpenCode companion tree is missing", async () => {
    const root = await mkdtemp(join(tmpdir(), "open-design-tools-pack-vela-strict-"));
    const source = join(root, "source", "vela");
    const resourceRoot = join(root, "resources", "open-design");

    try {
      await mkdir(join(root, "source"), { recursive: true });
      await writeFile(source, "#!/bin/sh\nexit 0\n", "utf8");

      await expect(
        copyOptionalVelaCliBinary({
          env: { OPEN_DESIGN_VELA_CLI_BIN: source },
          platform: "mac",
          requireBundled: true,
          resourceRoot,
        }),
      ).rejects.toThrow(/OpenCode companion directory is missing.*OPEN_DESIGN_VELA_CLI_BIN/);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("copies the Vela CLI binary without a companion tree in non-strict mode", async () => {
    const root = await mkdtemp(join(tmpdir(), "open-design-tools-pack-vela-nonstrict-"));
    const source = join(root, "source", "vela");
    const resourceRoot = join(root, "resources", "open-design");

    try {
      await mkdir(join(root, "source"), { recursive: true });
      await writeFile(source, "#!/bin/sh\nexit 0\n", "utf8");

      const copied = await copyOptionalVelaCliBinary({
        env: { OPEN_DESIGN_VELA_CLI_BIN: source },
        platform: "mac",
        requireBundled: false,
        resourceRoot,
      });

      const target = join(resourceRoot, "bin", "vela");
      const companionTarget = join(resourceRoot, "bin", "libexec", "opencode", "opencode");
      await expect(readFile(target, "utf8")).resolves.toBe("#!/bin/sh\nexit 0\n");
      await expect(access(companionTarget)).rejects.toThrow();
      expect(copied).toEqual({ source, target });
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("copies a configured Vela CLI binary into the Windows resource bin", async () => {
    const root = await mkdtemp(join(tmpdir(), "open-design-tools-pack-vela-win-"));
    const source = join(root, "source", "vela.exe");
    const resourceRoot = join(root, "resources", "open-design");

    try {
      await mkdir(join(root, "source"), { recursive: true });
      await writeFile(source, "fake exe\n", "utf8");
      await writeFakeOpenCodeCompanion(source, "fake opencode\n");

      const copied = await copyOptionalVelaCliBinary({
        env: { OPEN_DESIGN_VELA_CLI_BIN: source },
        platform: "win",
        resourceRoot,
      });

      const target = join(resourceRoot, "bin", "vela.exe");
      const companionTarget = join(resourceRoot, "bin", "libexec", "opencode", "opencode");
      await expect(readFile(target, "utf8")).resolves.toBe("fake exe\n");
      await expect(readFile(companionTarget, "utf8")).resolves.toBe("fake opencode\n");
      expect(copied).toEqual({ source, target });
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("copies a Vela CLI binary resolved from the npm package", async () => {
    const root = await mkdtemp(join(tmpdir(), "open-design-tools-pack-vela-npm-"));
    const source = join(root, "source", "vela");
    const resourceRoot = join(root, "resources", "open-design");

    try {
      await mkdir(join(root, "source"), { recursive: true });
      await writeFile(source, "#!/bin/sh\nexit 0\n", "utf8");
      await writeFakeOpenCodeCompanion(source, "#!/bin/sh\necho opencode\n");

      const copied = await copyOptionalVelaCliBinary({
        env: {},
        importPackage: async () => ({
          resolveVelaCliBin: () => source,
        }),
        platform: "mac",
        requireBundled: true,
        resourceRoot,
      });

      const target = join(resourceRoot, "bin", "vela");
      const companionTarget = join(resourceRoot, "bin", "libexec", "opencode", "opencode");
      await expect(readFile(target, "utf8")).resolves.toBe("#!/bin/sh\nexit 0\n");
      await expect(readFile(companionTarget, "utf8")).resolves.toBe(
        "#!/bin/sh\necho opencode\n",
      );
      await expect(access(target, constants.X_OK)).resolves.toBeUndefined();
      expect(copied).toEqual({ source, target });
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("skips copying when the npm resolver reports an unsupported non-strict platform", async () => {
    const root = await mkdtemp(join(tmpdir(), "open-design-tools-pack-vela-skip-"));
    const resourceRoot = join(root, "resources", "open-design");

    try {
      const copied = await copyOptionalVelaCliBinary({
        env: {},
        importPackage: async () => ({
          resolveVelaCliBin: () => null,
        }),
        platform: "linux",
        resourceRoot,
      });

      expect(copied).toBeNull();
      await expect(access(join(resourceRoot, "bin", "vela"))).rejects.toThrow();
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });
});

describe("resolveOptionalVelaCliBinary", () => {
  it("prefers OPEN_DESIGN_VELA_CLI_BIN over the npm resolver", async () => {
    await expect(
      resolveOptionalVelaCliBinary({
        env: { OPEN_DESIGN_VELA_CLI_BIN: "/tmp/local-vela" },
        importPackage: async () => ({
          resolveVelaCliBin: () => "/tmp/npm-vela",
        }),
      }),
    ).resolves.toBe("/tmp/local-vela");
  });

  it("fails strict mode when the resolver package is missing", async () => {
    await expect(
      resolveOptionalVelaCliBinary({
        env: {},
        importPackage: async () => {
          throw new Error("not installed");
        },
        requireBundled: true,
      }),
    ).rejects.toThrow(/@powerformer\/vela-cli.*OPEN_DESIGN_VELA_CLI_BIN/);
  });

  it("fails strict mode when the resolver returns no binary", async () => {
    await expect(
      resolveOptionalVelaCliBinary({
        env: {},
        importPackage: async () => ({
          resolveVelaCliBin: () => ({ supported: false }),
        }),
        requireBundled: true,
      }),
    ).rejects.toThrow(/@powerformer\/vela-cli.*OPEN_DESIGN_VELA_CLI_BIN/);
  });

  it("returns null in non-strict mode when the resolver package is missing", async () => {
    await expect(
      resolveOptionalVelaCliBinary({
        env: {},
        importPackage: async () => {
          throw new Error("not installed");
        },
      }),
    ).resolves.toBeNull();
  });
});
