import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  createReleaseNotePublication,
  releaseNoteMetadataFromPublication,
  verifyReleaseNotePublication,
} from "../src/release-note/publication.js";
import { assertReleaseNotePlanPolicy } from "../src/release-note/policy.js";
import { discoverReleaseNotePlan } from "../src/release-note/source.js";

const roots: string[] = [];

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "od-release-note-"));
  roots.push(root);
  return root;
}

async function writeNote(
  root: string,
  releaseVersion: string,
  locale: string,
  options: { body?: string; description?: string; title?: string } = {},
): Promise<string> {
  const directory = join(root, `v${releaseVersion}`);
  await mkdir(directory, { recursive: true });
  const value = [
    "---",
    `title: ${options.title ?? `Open Design ${releaseVersion}`}`,
    `description: ${options.description ?? `Release notes for ${releaseVersion}.`}`,
    "---",
    "",
    options.body ?? "## Improvements\n\nA deterministic release note body.",
    "",
  ].join("\n");
  const path = join(directory, `${locale}.md`);
  await writeFile(path, value, "utf8");
  return value;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

describe("release note source discovery", () => {
  it("uses the exact full release version and parses self-describing Markdown", async () => {
    const root = await temporaryRoot();
    const raw = await writeNote(root, "1.2.3-beta.4", "en", {
      description: "Beta release details.",
      title: "Beta 4",
    });
    await writeNote(root, "1.2.3-beta.4", "zh-CN");

    const plan = discoverReleaseNotePlan({
      channel: "beta",
      releaseVersion: "1.2.3-beta.4",
      sourceRoot: root,
    });

    expect(plan.state).toBe("ready");
    expect(plan.entries.map((entry) => entry.locale)).toEqual(["en", "zh-CN"]);
    expect(plan.entries[0]).toMatchObject({
      description: "Beta release details.",
      mediaType: "text/markdown; charset=utf-8",
      name: "en.md",
      sha256: createHash("sha256").update(raw).digest("hex"),
      title: "Beta 4",
    });

    expect(discoverReleaseNotePlan({
      channel: "stable",
      releaseVersion: "1.2.3",
      sourceRoot: root,
    }).state).toBe("absent");
  });

  it("rejects supplied Markdown without valid front matter or body", async () => {
    const root = await temporaryRoot();
    const directory = join(root, "v1.2.3-preview.2");
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, "en.md"), "# No front matter\n", "utf8");

    expect(() => discoverReleaseNotePlan({
      channel: "preview",
      releaseVersion: "1.2.3-preview.2",
      sourceRoot: root,
    })).toThrow(/front matter/i);

    await writeFile(
      join(directory, "en.md"),
      "---\ntitle: Preview\ndescription: Preview details.\n---\n\n",
      "utf8",
    );
    expect(() => discoverReleaseNotePlan({
      channel: "preview",
      releaseVersion: "1.2.3-preview.2",
      sourceRoot: root,
    })).toThrow(/body/i);
  });

  it("rejects an explicitly supplied empty release-note directory", async () => {
    const root = await temporaryRoot();
    await mkdir(join(root, "v1.2.3-beta.5"), { recursive: true });

    expect(() => discoverReleaseNotePlan({
      channel: "beta",
      releaseVersion: "1.2.3-beta.5",
      sourceRoot: root,
    })).toThrow(/present but empty/i);
  });
});

describe("release note channel policy", () => {
  it("keeps discovery channel-neutral and makes stable require en and zh-CN", async () => {
    const root = await temporaryRoot();
    await writeNote(root, "1.2.3", "en");
    const plan = discoverReleaseNotePlan({
      channel: "stable",
      releaseVersion: "1.2.3",
      sourceRoot: root,
    });

    expect(() => assertReleaseNotePlanPolicy(plan, "stable")).toThrow(/zh-CN/);
    expect(() => assertReleaseNotePlanPolicy({ ...plan, channel: "beta" }, "beta")).not.toThrow();
  });

  it("allows absent notes outside stable and rejects them for stable", async () => {
    const root = await temporaryRoot();
    const absent = discoverReleaseNotePlan({
      channel: "prerelease",
      releaseVersion: "1.2.3-prerelease.1",
      sourceRoot: root,
    });

    expect(() => assertReleaseNotePlanPolicy(absent, "prerelease")).not.toThrow();
    expect(() => assertReleaseNotePlanPolicy({ ...absent, channel: "stable" }, "stable")).toThrow(/required/i);
  });
});

describe("release note publication contract", () => {
  it("projects a planned publication into storage-neutral public metadata", async () => {
    const root = await temporaryRoot();
    await writeNote(root, "1.2.3", "en");
    await writeNote(root, "1.2.3", "zh-CN");
    const plan = discoverReleaseNotePlan({
      channel: "stable",
      releaseVersion: "1.2.3",
      sourceRoot: root,
    });
    const publication = createReleaseNotePublication(plan, {
      publicOrigin: "https://releases.example.test",
      published: false,
      versionPrefix: "stable/versions/1.2.3",
    });

    expect(publication.state).toBe("planned");
    expect(() => verifyReleaseNotePublication(plan, publication, { requirePublished: false })).not.toThrow();
    expect(() => verifyReleaseNotePublication(plan, publication, { requirePublished: true })).toThrow(/published/i);
    expect(releaseNoteMetadataFromPublication(publication)).toEqual({
      content: {
        defaultLocale: "en",
        locales: {
          en: {
            mediaType: "text/markdown; charset=utf-8",
            sha256: plan.entries[0]?.sha256,
            size: plan.entries[0]?.size,
            url: "https://releases.example.test/stable/versions/1.2.3/release-notes/en.md",
          },
          "zh-CN": {
            mediaType: "text/markdown; charset=utf-8",
            sha256: plan.entries[1]?.sha256,
            size: plan.entries[1]?.size,
            url: "https://releases.example.test/stable/versions/1.2.3/release-notes/zh-CN.md",
          },
        },
      },
    });
  });
});
