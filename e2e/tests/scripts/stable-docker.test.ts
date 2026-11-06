import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

import { afterEach, describe, expect, it } from "vitest";

const e2eRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const workspaceRoot = dirname(e2eRoot);
const script = join(workspaceRoot, ".github", "scripts", "release", "stable-docker.py");
const fixtures: string[] = [];
const commit = "0123456789abcdef0123456789abcdef01234567";
const targetDigest = `sha256:${"a".repeat(64)}`;

async function jsonFile(value: unknown): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "od-stable-docker-"));
  fixtures.push(root);
  const path = join(root, "fixture.json");
  await writeFile(path, `${JSON.stringify(value)}\n`, "utf8");
  return path;
}

function run(args: string[]) {
  return spawnSync("python3", [script, ...args], {
    cwd: workspaceRoot,
    encoding: "utf8",
  });
}

function outputs(stdout: string): Record<string, string> {
  return Object.fromEntries(
    stdout.trim().split("\n").filter(Boolean).map((line) => {
      const index = line.indexOf("=");
      return [line.slice(0, index), line.slice(index + 1)];
    }),
  );
}

function metadata(version = "1.2.3") {
  return {
    channel: "stable",
    dryRun: false,
    releaseState: "complete",
    releaseVersion: version,
    stableVersion: version,
    versionTag: `open-design-v${version}`,
    github: {
      branch: `release/v${version}`,
      commit,
      repository: "nexu-io/open-design",
      runAttempt: 2,
      runId: 12345,
      workflow: "release-stable",
    },
    r2: {
      versionMetadataUrl: `https://releases.example/stable/versions/${version}/metadata.json`,
      versionPrefix: `stable/versions/${version}`,
    },
  };
}

function inspection(options: {
  digest?: string;
  platforms?: string[];
  revision?: string;
  version?: string;
} = {}) {
  const revision = options.revision ?? commit;
  const version = options.version ?? "1.2.3";
  const platforms = options.platforms ?? ["linux/amd64", "linux/arm64"];
  return {
    manifest: { digest: options.digest ?? targetDigest },
    image: Object.fromEntries(platforms.map((platform) => [
      platform,
      {
        config: {
          Labels: {
            "org.opencontainers.image.revision": revision,
            "org.opencontainers.image.version": version,
          },
        },
      },
    ])),
  };
}

afterEach(async () => {
  await Promise.all(fixtures.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("stable Docker reconciliation contract", () => {
  it("resolves an exact immutable stable identity", async () => {
    const path = await jsonFile(metadata());
    const result = run([
      "resolve",
      "--metadata", path,
      "--repository", "nexu-io/open-design",
      "--release-version", "1.2.3",
      "--origin-run-id", "12345",
      "--origin-run-attempt", "2",
    ]);

    expect(result.status).toBe(0);
    expect(outputs(result.stdout)).toMatchObject({
      commit,
      is_target_version: "true",
      release_run_id: "12345",
      release_version: "1.2.3",
      version_tag: "open-design-v1.2.3",
    });
  });

  it("allows latest metadata to identify a newer authoritative version", async () => {
    const path = await jsonFile(metadata("1.2.4"));
    const result = run([
      "resolve",
      "--metadata", path,
      "--repository", "nexu-io/open-design",
      "--release-version", "1.2.3",
      "--allow-version-mismatch",
    ]);

    expect(result.status).toBe(0);
    expect(outputs(result.stdout)).toMatchObject({
      is_target_version: "false",
      release_version: "1.2.4",
    });
  });

  it("fails closed when dispatch and metadata identity disagree", async () => {
    const value = metadata();
    value.github.commit = "f".repeat(40);
    value.github.repository = "someone/else";
    const path = await jsonFile(value);
    const result = run([
      "resolve",
      "--metadata", path,
      "--repository", "nexu-io/open-design",
      "--release-version", "1.2.3",
      "--origin-run-id", "12345",
    ]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("metadata.github.repository");
  });

  it("returns no-op for a complete matching multi-arch version image", async () => {
    const path = await jsonFile(inspection());
    const result = run([
      "image-state",
      "--inspection", path,
      "--expected-revision", commit,
      "--expected-version", "1.2.3",
    ]);

    expect(result.status).toBe(0);
    expect(outputs(result.stdout)).toEqual({
      digest: targetDigest,
      missing_platforms: "",
      state: "complete",
    });
  });

  it("repairs a matching version image with a missing platform", async () => {
    const path = await jsonFile(inspection({ platforms: ["linux/amd64"] }));
    const result = run([
      "image-state",
      "--inspection", path,
      "--expected-revision", commit,
      "--expected-version", "1.2.3",
    ]);

    expect(result.status).toBe(0);
    expect(outputs(result.stdout)).toMatchObject({
      missing_platforms: "linux/arm64",
      state: "repair",
    });
  });

  it("refuses to overwrite an existing version tag with another identity", async () => {
    const path = await jsonFile(inspection({ revision: "f".repeat(40) }));
    const result = run([
      "image-state",
      "--inspection", path,
      "--expected-revision", commit,
      "--expected-version", "1.2.3",
    ]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("existing version tag identity conflict");
  });

  it.each([
    [targetDigest, "1.2.3", "noop"],
    [`sha256:${"b".repeat(64)}`, "1.2.2", "promote"],
    [`sha256:${"c".repeat(64)}`, "1.2.4", "skip-newer"],
  ])("plans latest digest %s at version %s as %s", async (digest, version, action) => {
    const path = await jsonFile(inspection({ digest, version }));
    const result = run([
      "latest-action",
      "--inspection", path,
      "--target-digest", targetDigest,
      "--target-version", "1.2.3",
    ]);

    expect(result.status).toBe(0);
    expect(outputs(result.stdout).action).toBe(action);
  });
});
