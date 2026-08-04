import { createHash } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  utimes,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  formatSha256Sums,
  prepareServerReleaseFeed,
} from "../src/server/feed.js";

async function writeArchive(
  root: string,
  name: string,
  body: string,
): Promise<{ path: string; sha256: string }> {
  const path = join(root, name);
  await writeFile(path, body, "utf8");
  const sha256 = createHash("sha256").update(body, "utf8").digest("hex");
  await writeFile(join(root, `${name}.sha256`), `${sha256}  ${name}\n`, "utf8");
  return { path, sha256 };
}

describe("server release feed", () => {
  it("formats SHA256SUMS entries the bootstrap installers can parse", () => {
    expect(
      formatSha256Sums([
        {
          archiveName: "open-design-server-1.2.3-linux-x64.tar.gz",
          sha256: "a".repeat(64),
        },
        {
          archiveName: "open-design-server-1.2.3-darwin-arm64.tar.gz",
          sha256: "b".repeat(64),
        },
      ]),
    ).toBe(
      [
        `${"b".repeat(64)}  open-design-server-1.2.3-darwin-arm64.tar.gz`,
        `${"a".repeat(64)}  open-design-server-1.2.3-linux-x64.tar.gz`,
        "",
      ].join("\n"),
    );
  });

  it("materializes latest/VERSION and v<version>/SHA256SUMS for hosted bootstrap", async () => {
    const root = await mkdtemp(join(tmpdir(), "od-server-feed-"));
    const archivesDir = join(root, "archives");
    const feedDir = join(root, "feed");
    await mkdir(archivesDir, { recursive: true });

    const darwin = await writeArchive(
      archivesDir,
      "open-design-server-1.2.3-darwin-arm64.tar.gz",
      "darwin-bytes",
    );
    const linux = await writeArchive(
      archivesDir,
      "open-design-server-1.2.3-linux-x64.tar.gz",
      "linux-bytes",
    );
    const win = await writeArchive(
      archivesDir,
      "open-design-server-1.2.3-win32-x64.zip",
      "win-bytes",
    );

    const result = await prepareServerReleaseFeed({
      appVersion: "1.2.3",
      archives: [archivesDir],
      feedRoot: feedDir,
    });

    expect(result.appVersion).toBe("1.2.3");
    expect(result.versionPrefix).toBe("v1.2.3");
    expect(result.archiveEntries.map((entry) => entry.archiveName).sort()).toEqual([
      "open-design-server-1.2.3-darwin-arm64.tar.gz",
      "open-design-server-1.2.3-linux-x64.tar.gz",
      "open-design-server-1.2.3-win32-x64.zip",
    ]);

    expect(await readFile(result.latestVersionPath, "utf8")).toBe("1.2.3\n");
    expect(await readFile(result.sha256SumsPath, "utf8")).toBe(
      formatSha256Sums([
        {
          archiveName: "open-design-server-1.2.3-darwin-arm64.tar.gz",
          sha256: darwin.sha256,
        },
        {
          archiveName: "open-design-server-1.2.3-linux-x64.tar.gz",
          sha256: linux.sha256,
        },
        {
          archiveName: "open-design-server-1.2.3-win32-x64.zip",
          sha256: win.sha256,
        },
      ]),
    );
    expect(
      await readFile(
        join(result.versionRoot, "open-design-server-1.2.3-darwin-arm64.tar.gz"),
        "utf8",
      ),
    ).toBe("darwin-bytes");
    expect(
      await readFile(
        join(result.versionRoot, "open-design-server-1.2.3-win32-x64.zip"),
        "utf8",
      ),
    ).toBe("win-bytes");
  });

  it("rejects rebuilding an existing version with different archive bytes", async () => {
    const root = await mkdtemp(join(tmpdir(), "od-server-feed-conflict-"));
    const firstArchivesDir = join(root, "archives-first");
    const secondArchivesDir = join(root, "archives-second");
    const feedDir = join(root, "feed");
    const archiveName = "open-design-server-1.2.3-linux-x64.tar.gz";

    try {
      await mkdir(firstArchivesDir, { recursive: true });
      await mkdir(secondArchivesDir, { recursive: true });
      await writeArchive(firstArchivesDir, archiveName, "first-build");
      await writeArchive(secondArchivesDir, archiveName, "different-second-build");

      await prepareServerReleaseFeed({
        appVersion: "1.2.3",
        archives: [firstArchivesDir],
        feedRoot: feedDir,
      });

      await expect(
        prepareServerReleaseFeed({
          appVersion: "1.2.3",
          archives: [secondArchivesDir],
          feedRoot: feedDir,
        }),
      ).rejects.toThrow(/already exists with different content/i);

      expect(await readFile(join(feedDir, "v1.2.3", archiveName), "utf8")).toBe(
        "first-build",
      );
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("reuses an existing version when its complete contents are identical", async () => {
    const root = await mkdtemp(join(tmpdir(), "od-server-feed-idempotent-"));
    const archivesDir = join(root, "archives");
    const feedDir = join(root, "feed");
    const archiveName = "open-design-server-1.2.3-linux-x64.tar.gz";

    try {
      await mkdir(archivesDir, { recursive: true });
      await writeArchive(archivesDir, archiveName, "identical-build");
      const first = await prepareServerReleaseFeed({
        appVersion: "1.2.3",
        archives: [archivesDir],
        feedRoot: feedDir,
      });
      const publishedArchive = join(first.versionRoot, archiveName);
      const oldTimestamp = new Date("2000-01-01T00:00:00.000Z");
      await utimes(publishedArchive, oldTimestamp, oldTimestamp);
      const before = await stat(publishedArchive);

      await expect(
        prepareServerReleaseFeed({
          appVersion: "1.2.3",
          archives: [archivesDir],
          feedRoot: feedDir,
        }),
      ).resolves.toMatchObject({
        appVersion: "1.2.3",
        versionRoot: first.versionRoot,
      });

      const after = await stat(publishedArchive);
      expect(after.mtimeMs).toBe(before.mtimeMs);
      expect(await readFile(publishedArchive, "utf8")).toBe("identical-build");
      expect((await readdir(feedDir)).filter((name) => name.startsWith("."))).toEqual(
        [],
      );
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("rejects an existing version whose file set differs", async () => {
    const root = await mkdtemp(join(tmpdir(), "od-server-feed-fileset-"));
    const archivesDir = join(root, "archives");
    const feedDir = join(root, "feed");
    const archiveName = "open-design-server-1.2.3-linux-x64.tar.gz";

    try {
      await mkdir(archivesDir, { recursive: true });
      await writeArchive(archivesDir, archiveName, "published-build");
      const first = await prepareServerReleaseFeed({
        appVersion: "1.2.3",
        archives: [archivesDir],
        feedRoot: feedDir,
      });
      await writeFile(join(first.versionRoot, "unexpected.txt"), "unexpected", "utf8");

      await expect(
        prepareServerReleaseFeed({
          appVersion: "1.2.3",
          archives: [archivesDir],
          feedRoot: feedDir,
        }),
      ).rejects.toThrow(/file set mismatch/i);

      expect(await readFile(join(first.versionRoot, archiveName), "utf8")).toBe(
        "published-build",
      );
      expect(await readFile(join(first.versionRoot, "unexpected.txt"), "utf8")).toBe(
        "unexpected",
      );
      expect((await readdir(feedDir)).filter((name) => name.startsWith("."))).toEqual(
        [],
      );
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("atomically publishes one complete version when concurrent builds differ", async () => {
    const root = await mkdtemp(join(tmpdir(), "od-server-feed-race-"));
    const firstArchivesDir = join(root, "archives-first");
    const secondArchivesDir = join(root, "archives-second");
    const feedDir = join(root, "feed");
    const archiveName = "open-design-server-1.2.3-linux-x64.tar.gz";

    try {
      await mkdir(firstArchivesDir, { recursive: true });
      await mkdir(secondArchivesDir, { recursive: true });
      await writeArchive(firstArchivesDir, archiveName, "concurrent-first");
      await writeArchive(secondArchivesDir, archiveName, "concurrent-second");

      const results = await Promise.allSettled([
        prepareServerReleaseFeed({
          appVersion: "1.2.3",
          archives: [firstArchivesDir],
          feedRoot: feedDir,
        }),
        prepareServerReleaseFeed({
          appVersion: "1.2.3",
          archives: [secondArchivesDir],
          feedRoot: feedDir,
        }),
      ]);

      expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      const rejected = results.find((result) => result.status === "rejected");
      expect(rejected).toMatchObject({
        reason: expect.objectContaining({
          message: expect.stringMatching(/already exists with different content/i),
        }),
        status: "rejected",
      });

      const versionRoot = join(feedDir, "v1.2.3");
      const publishedBody = await readFile(join(versionRoot, archiveName), "utf8");
      expect(["concurrent-first", "concurrent-second"]).toContain(publishedBody);
      const publishedSha256 = createHash("sha256")
        .update(publishedBody, "utf8")
        .digest("hex");
      expect(await readFile(join(versionRoot, "SHA256SUMS"), "utf8")).toBe(
        `${publishedSha256}  ${archiveName}\n`,
      );
      expect((await readdir(versionRoot)).sort()).toEqual(
        ["SHA256SUMS", archiveName, `${archiveName}.sha256`].sort(),
      );
      expect((await readdir(feedDir)).filter((name) => name.startsWith("."))).toEqual(
        [],
      );
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("rejects archives whose embedded version does not match the feed version", async () => {
    const root = await mkdtemp(join(tmpdir(), "od-server-feed-mismatch-"));
    await writeArchive(
      root,
      "open-design-server-9.9.9-darwin-arm64.tar.gz",
      "bytes",
    );

    await expect(
      prepareServerReleaseFeed({
        appVersion: "1.2.3",
        archives: [root],
        feedRoot: join(root, "feed"),
      }),
    ).rejects.toThrow(/does not match feed version 1\.2\.3/);
  });
});
