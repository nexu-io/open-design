import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { startReleaseStorageFixtureServer } from "../src/release-storage-fixture.js";

function runNode(args: string[], options: { cwd: string; env: NodeJS.ProcessEnv }): Promise<void> {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(process.execPath, args, options);
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", rejectRun);
    child.on("close", (code) => {
      if (code === 0) {
        resolveRun();
      } else {
        rejectRun(new Error(`node ${args.join(" ")} exited ${String(code)}\n${stdout}\n${stderr}`));
      }
    });
  });
}

async function writeReleaseNote(
  root: string,
  version: string,
  locale: string,
  body = "A fixture release note.",
  options: { bom?: boolean } = {},
): Promise<void> {
  const directory = join(root, `v${version}`);
  await mkdir(directory, { recursive: true });
  await writeFile(
    join(directory, `${locale}.md`),
    `${options.bom === true ? "\uFEFF" : ""}---\ntitle: Open Design ${version}\ndescription: Release notes for ${version}.\n---\n\n## Changes\n\n${body}\n`,
    "utf8",
  );
}

describe("shared release metadata publisher", () => {
  it("publishes complete beta, prerelease, preview, and stable metadata through the release storage fixture", async () => {
    const repoRoot = resolve(import.meta.dirname, "../../..");
    const root = await mkdtemp(join(tmpdir(), "od-release-metadata-publish-"));
    const server = await startReleaseStorageFixtureServer();
    try {
      for (const [channel, version] of [
        ["beta", "1.2.3-beta.4"],
        ["prerelease", "1.2.3-prerelease.4"],
        ["preview", "1.2.3-preview.4"],
        ["stable", "1.2.3"],
      ] as const) {
        const manifestDir = join(root, channel, "manifests");
        const metadataDir = join(root, channel, "metadata");
        const releaseNoteRoot = join(root, channel, "CHANGELOG");
        const releaseNotePlanPath = join(metadataDir, "release-note-plan.json");
        const releaseNoteManifestPath = join(metadataDir, "release-note-publication.json");
        await mkdir(manifestDir, { recursive: true });
        await writeReleaseNote(releaseNoteRoot, version, "en", "A fixture release note.", { bom: channel === "beta" });
        await writeReleaseNote(releaseNoteRoot, version, "zh-CN");
        const base = {
          channel,
          enabled: true,
          github: { commit: "abc123", runId: 42 },
          r2: { versionPrefix: `${channel}/versions/${version}` },
          releaseVersion: version,
          status: "published",
          version: 1,
        };
        await writeFile(
          join(manifestDir, "mac_arm64.json"),
          JSON.stringify(
            {
              ...base,
              arch: "arm64",
              artifacts: { dmg: { url: "https://example.test/dmg" }, payload: { url: "https://example.test/mac-payload" } },
              feed: null,
              legacyPlatformKey: "mac",
              platformKey: "mac_arm64",
              releaseTarget: "mac_arm64",
              signed: true,
            },
            null,
            2,
          ),
          "utf8",
        );
        await writeFile(
          join(manifestDir, "win_x64.json"),
          JSON.stringify(
            {
              ...base,
              arch: "x64",
              artifacts: { installer: { url: "https://example.test/exe" }, payload: { url: "https://example.test/win-payload" } },
              feed: null,
              legacyPlatformKey: "win",
              platformKey: "win_x64",
              releaseTarget: "win_x64",
              signed: false,
            },
            null,
            2,
          ),
          "utf8",
        );

        const env = {
          ...process.env,
          BASE_VERSION: "1.2.3",
          ENABLE_LINUX_X64: "false",
          ENABLE_MAC_ARM64: "true",
          ENABLE_MAC_X64: "false",
          ENABLE_WIN_X64: "true",
          MAC_ARM64_RESULT: "success",
          RELEASE_ASSET_SUFFIX: "",
          RELEASE_CHANNEL: channel,
          RELEASE_COMMIT: "abc123",
          RELEASE_MANIFEST_DIR: manifestDir,
          RELEASE_METADATA_DIR: metadataDir,
          RELEASE_OUTPUTS_PATH: join(metadataDir, "outputs.json"),
          RELEASE_PUBLIC_ORIGIN: "https://releases.example.test",
          RELEASE_NOTE_MANIFEST_PATH: releaseNoteManifestPath,
          RELEASE_NOTE_PLAN_PATH: releaseNotePlanPath,
          RELEASE_NOTE_SOURCE_ROOT: releaseNoteRoot,
          RELEASE_RUN_ID: "42",
          RELEASE_SIGNED: "true",
          RELEASE_STORAGE_ACCESS_KEY_ID: "ak",
          RELEASE_STORAGE_BUCKET: server.info.bucket,
          RELEASE_STORAGE_ENDPOINT: server.info.endpointUrl,
          RELEASE_STORAGE_REGION: "auto",
          RELEASE_STORAGE_SECRET_ACCESS_KEY: "sk",
          RELEASE_VERSION: version,
          STATE_SOURCE: "local-tools-serve",
          WIN_X64_RESULT: "success",
          ...(channel === "beta" ? { RELEASE_LATEST_CAS_REQUIRED: "true" } : {}),
          // The launcher version floor rides through publish + verify on one
          // channel via its channel-suffixed repo-vars pair; the others must
          // publish without a control block (their pairs and the stable
          // fallback pair stay unset).
          RELEASE_LAUNCHER_VERSION_MIN_STABLE: "",
          RELEASE_LAUNCHER_VERSION_MIN_URL_STABLE: "",
          ...(channel === "beta"
            ? {
                RELEASE_LAUNCHER_VERSION_MIN_BETA: "1.2.3-beta.4",
                RELEASE_LAUNCHER_VERSION_MIN_URL_BETA: "https://example.test/reinstall-help",
              }
            : {}),
        };
        await runNode(["--experimental-strip-types", "tools/release/src/release-note/prepare.ts"], {
          cwd: repoRoot,
          env,
        });
        await runNode(["--experimental-strip-types", "tools/release/src/release-note/publish.ts"], {
          cwd: repoRoot,
          env,
        });
        await runNode(["--experimental-strip-types", "tools/release/src/release-note/verify.ts"], {
          cwd: repoRoot,
          env,
        });
        await runNode(["--experimental-strip-types", "tools/release/src/storage/publish-metadata.ts"], {
          cwd: repoRoot,
          env,
        });
        await runNode(["--experimental-strip-types", "tools/release/src/storage/verify-metadata.ts"], {
          cwd: repoRoot,
          env: { ...env, RELEASE_METADATA_PATH: join(metadataDir, "metadata.json") },
        });

        const metadata = JSON.parse(await readFile(join(metadataDir, "metadata.json"), "utf8")) as {
          channel?: string;
          control?: { launcher?: { version?: { min?: string; url?: string } } };
          releaseState?: string;
          releaseTargets?: {
            mac_arm64?: { artifacts?: { payload?: { url?: string } } };
            win_x64?: { artifacts?: { payload?: { url?: string } } };
          };
          allReadyTargetsSigned?: boolean;
          signed?: boolean;
          stableVersion?: string;
          github?: { commit?: string };
          releaseNote?: {
            content?: {
              defaultLocale?: string;
              locales?: Record<string, { mediaType?: string; sha256?: string; size?: number; url?: string }>;
            };
          };
        };
        expect(metadata.channel).toBe(channel);
        expect(metadata.releaseState).toBe("complete");
        expect(metadata.signed).toBe(true);
        expect(metadata.allReadyTargetsSigned).toBe(false);
        expect(metadata.releaseTargets?.mac_arm64?.artifacts?.payload?.url).toBe("https://example.test/mac-payload");
        expect(metadata.releaseTargets?.win_x64?.artifacts?.payload?.url).toBe("https://example.test/win-payload");
        // github attribution must round-trip from the RELEASE_* env the workflow
        // passes; the stable promotion gate checks metadata.github.commit.
        expect(metadata.github?.commit).toBe("abc123");
        expect(metadata.releaseNote?.content?.defaultLocale).toBe("en");
        expect(Object.keys(metadata.releaseNote?.content?.locales ?? {})).toEqual(["en", "zh-CN"]);
        expect(metadata.releaseNote?.content?.locales?.en?.url).toBe(
          `https://releases.example.test/${channel}/versions/${version}/release-notes/en.md`,
        );
        expect(metadata.releaseNote?.content?.locales?.en?.mediaType).toBe("text/markdown; charset=utf-8");
        if (channel === "stable") {
          expect(metadata.stableVersion).toBe("1.2.3");
        }
        if (channel === "beta") {
          expect(metadata.control?.launcher?.version).toEqual({
            min: "1.2.3-beta.4",
            url: "https://example.test/reinstall-help",
          });
        } else {
          expect(metadata.control).toBeUndefined();
        }
        expect(server.getObject(`${channel}/latest/metadata.json`)).not.toBeNull();
        expect(server.getObject(`${channel}/versions/${version}/release-notes/en.md`)?.toString("utf8")).toContain(
          `title: Open Design ${version}`,
        );

        if (channel === "beta") {
          await runNode(["--experimental-strip-types", "tools/release/src/release-note/publish.ts"], {
            cwd: repoRoot,
            env,
          });
          await writeReleaseNote(releaseNoteRoot, version, "en", "Changed content must not replace the immutable object.");
          await runNode(["--experimental-strip-types", "tools/release/src/release-note/prepare.ts"], {
            cwd: repoRoot,
            env,
          });
          await expect(runNode(["--experimental-strip-types", "tools/release/src/release-note/publish.ts"], {
            cwd: repoRoot,
            env,
          })).rejects.toThrow(/immutable release note already exists with different content/);
        }
      }
    } finally {
      await server.close();
    }
  });

  it("rejects a launcher version floor above the release version", async () => {
    // A floor the published release cannot satisfy would make the updater's
    // same-version reinstall offer nag forever; publication must refuse it.
    const repoRoot = resolve(import.meta.dirname, "../../..");
    const root = await mkdtemp(join(tmpdir(), "od-release-metadata-floor-"));
    await expect(runNode(["--experimental-strip-types", "tools/release/src/storage/publish-metadata.ts"], {
      cwd: repoRoot,
      env: {
        ...process.env,
        RELEASE_CHANNEL: "beta",
        RELEASE_LAUNCHER_VERSION_MIN_BETA: "9.9.9",
        RELEASE_MANIFEST_DIR: root,
        RELEASE_METADATA_DIR: root,
        RELEASE_OUTPUTS_PATH: join(root, "outputs.json"),
        RELEASE_PUBLIC_ORIGIN: "https://releases.example.test",
        RELEASE_PUBLISH_SIDE_EFFECTS: "false",
        RELEASE_VERSION: "1.2.3-beta.4",
        STATE_SOURCE: "local-tools-serve",
      },
    })).rejects.toThrow(/exceeds release version/);
  });

  it("builds planned release-note and metadata artifacts without storage access in dry-run mode", async () => {
    const repoRoot = resolve(import.meta.dirname, "../../..");
    const root = await mkdtemp(join(tmpdir(), "od-release-metadata-dry-run-"));
    const version = "1.2.3";
    const manifestDir = join(root, "manifests");
    const metadataDir = join(root, "metadata");
    const releaseNoteRoot = join(root, "CHANGELOG");
    const releaseNotePlanPath = join(metadataDir, "release-note-plan.json");
    const releaseNoteManifestPath = join(metadataDir, "release-note-publication.json");
    await mkdir(manifestDir, { recursive: true });
    await writeReleaseNote(releaseNoteRoot, version, "en");
    await writeReleaseNote(releaseNoteRoot, version, "zh-CN");
    await writeFile(
      join(manifestDir, "mac_arm64.json"),
      JSON.stringify({
        artifacts: { payload: { url: "https://releases.example.test/mac-payload" } },
        channel: "stable",
        enabled: true,
        github: { commit: "dry123", runId: 77 },
        legacyPlatformKey: "mac",
        platformKey: "mac_arm64",
        r2: { versionPrefix: `stable/versions/${version}` },
        releaseTarget: "mac_arm64",
        releaseVersion: version,
        signed: true,
        status: "published",
      }),
      "utf8",
    );

    const env = {
      ...process.env,
      BASE_VERSION: version,
      ENABLE_LINUX_X64: "false",
      ENABLE_MAC_ARM64: "true",
      ENABLE_MAC_X64: "false",
      ENABLE_WIN_X64: "false",
      MAC_ARM64_RESULT: "success",
      RELEASE_CHANNEL: "stable",
      RELEASE_COMMIT: "dry123",
      RELEASE_DRY_RUN_MODE: "prepublish",
      RELEASE_MANIFEST_DIR: manifestDir,
      RELEASE_METADATA_DIR: metadataDir,
      RELEASE_NOTE_MANIFEST_PATH: releaseNoteManifestPath,
      RELEASE_NOTE_PLAN_PATH: releaseNotePlanPath,
      RELEASE_NOTE_SOURCE_ROOT: releaseNoteRoot,
      RELEASE_OUTPUTS_PATH: join(metadataDir, "outputs.json"),
      RELEASE_PUBLIC_ORIGIN: "https://releases.example.test",
      RELEASE_PUBLISH_SIDE_EFFECTS: "false",
      RELEASE_RUN_ID: "77",
      RELEASE_SIGNED: "true",
      RELEASE_VERSION: version,
      STATE_SOURCE: "local-dry-run",
      STABLE_VERSION: version,
    };

    for (const script of [
      "tools/release/src/release-note/prepare.ts",
      "tools/release/src/release-note/publish.ts",
      "tools/release/src/release-note/verify.ts",
      "tools/release/src/storage/publish-metadata.ts",
    ]) {
      await runNode(["--experimental-strip-types", script], { cwd: repoRoot, env });
    }
    await runNode(["--experimental-strip-types", "tools/release/src/storage/verify-metadata.ts"], {
      cwd: repoRoot,
      env: { ...env, RELEASE_METADATA_PATH: join(metadataDir, "metadata.json") },
    });

    const publication = JSON.parse(await readFile(releaseNoteManifestPath, "utf8")) as { state?: string };
    const metadata = JSON.parse(await readFile(join(metadataDir, "metadata.json"), "utf8")) as {
      dryRun?: boolean;
      releaseNote?: { content?: { locales?: Record<string, unknown> } };
    };
    expect(publication.state).toBe("planned");
    expect(metadata.dryRun).toBe(true);
    expect(Object.keys(metadata.releaseNote?.content?.locales ?? {})).toEqual(["en", "zh-CN"]);
  });
});
