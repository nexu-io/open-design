import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  createReleaseNotePublication,
  parseReleaseNotePublication,
  releaseNoteMetadataFromPublication,
  verifyReleaseNotePublication,
} from "../src/release-note/publication.js";
import { reportReleaseNotePolicyWarnings, reviewReleaseNotePlanPolicy } from "../src/release-note/policy.js";
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
  // The invariant: missing release notes never block a release. A note that
  // exists but cannot be consumed (wrong channel, no default locale) still
  // fails, because that is a broken artifact rather than an absent one.
  it("keeps discovery channel-neutral and warns instead of failing when stable notes are partial", async () => {
    const root = await temporaryRoot();
    await writeNote(root, "1.2.3", "en");
    const plan = discoverReleaseNotePlan({
      channel: "stable",
      releaseVersion: "1.2.3",
      sourceRoot: root,
    });

    const warnings = reviewReleaseNotePlanPolicy(plan, "stable");
    expect(warnings.map((warning) => warning.code)).toEqual(["stable-release-note-locale-missing"]);
    expect(warnings[0]?.message).toMatch(/zh-CN/);
    expect(reviewReleaseNotePlanPolicy({ ...plan, channel: "beta" }, "beta")).toEqual([]);
  });

  it("reports nothing when a stable release carries every recommended locale", async () => {
    const root = await temporaryRoot();
    await writeNote(root, "1.2.3", "en");
    await writeNote(root, "1.2.3", "zh-CN");
    const plan = discoverReleaseNotePlan({
      channel: "stable",
      releaseVersion: "1.2.3",
      sourceRoot: root,
    });

    expect(reviewReleaseNotePlanPolicy(plan, "stable")).toEqual([]);
  });

  it("lets a stable release ship with no notes at all and reports the gap", async () => {
    const root = await temporaryRoot();
    const absent = discoverReleaseNotePlan({
      channel: "stable",
      releaseVersion: "1.2.3",
      sourceRoot: root,
    });

    expect(absent.state).toBe("absent");
    const warnings = reviewReleaseNotePlanPolicy(absent, "stable");
    expect(warnings.map((warning) => warning.code)).toEqual(["stable-release-note-absent"]);
    expect(warnings[0]?.message).toContain("1.2.3");
  });

  it("leaves non-stable channels silent when notes are absent", async () => {
    const root = await temporaryRoot();
    for (const [channel, releaseVersion] of [
      ["beta", "1.2.3-beta.1"],
      ["prerelease", "1.2.3-prerelease.1"],
      ["preview", "1.2.3-preview.1"],
    ] as const) {
      const absent = discoverReleaseNotePlan({ channel, releaseVersion, sourceRoot: root });
      expect(absent.state).toBe("absent");
      expect(reviewReleaseNotePlanPolicy(absent, channel)).toEqual([]);
    }
  });

  it("still rejects a plan that has notes but omits the default locale", async () => {
    const root = await temporaryRoot();
    await writeNote(root, "1.2.3", "zh-CN");
    const plan = discoverReleaseNotePlan({
      channel: "stable",
      releaseVersion: "1.2.3",
      sourceRoot: root,
    });

    expect(plan.state).toBe("ready");
    expect(() => reviewReleaseNotePlanPolicy(plan, "stable")).toThrow(/default locale/i);
    expect(() => reviewReleaseNotePlanPolicy({ ...plan, channel: "beta" }, "beta")).toThrow(/default locale/i);
  });

  it("still rejects a plan whose channel disagrees with the caller", async () => {
    const root = await temporaryRoot();
    await writeNote(root, "1.2.3", "en");
    const plan = discoverReleaseNotePlan({
      channel: "stable",
      releaseVersion: "1.2.3",
      sourceRoot: root,
    });

    expect(() => reviewReleaseNotePlanPolicy(plan, "beta")).toThrow(/channel mismatch/i);
  });
});

describe("release note policy reporting", () => {
  // Not blocking only works if the gap is loud. A skipped stable note must land
  // on the run page as an annotation and in the job summary.
  it("annotates the run and appends to the job summary", async () => {
    const root = await temporaryRoot();
    const summaryPath = join(root, "step-summary.md");
    await writeFile(summaryPath, "", "utf8");
    const absent = discoverReleaseNotePlan({
      channel: "stable",
      releaseVersion: "1.2.3",
      sourceRoot: root,
    });
    const warned: string[] = [];
    const restore = console.warn;
    console.warn = (message: string) => void warned.push(message);
    try {
      reportReleaseNotePolicyWarnings(reviewReleaseNotePlanPolicy(absent, "stable"), summaryPath);
    } finally {
      console.warn = restore;
    }

    expect(warned).toHaveLength(1);
    expect(warned[0]).toMatch(/^::warning title=Release notes missing::/);
    expect(warned[0]).not.toContain("\n");
    expect(await readFile(summaryPath, "utf8")).toContain("### :warning: Release notes");
  });

  it("stays quiet and leaves the summary untouched when there is nothing to report", async () => {
    const root = await temporaryRoot();
    const summaryPath = join(root, "step-summary.md");
    await writeFile(summaryPath, "", "utf8");
    const warned: string[] = [];
    const restore = console.warn;
    console.warn = (message: string) => void warned.push(message);
    try {
      reportReleaseNotePolicyWarnings([], summaryPath);
    } finally {
      console.warn = restore;
    }

    expect(warned).toEqual([]);
    expect(await readFile(summaryPath, "utf8")).toBe("");
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

  // A stable release that skipped its notes must produce a whole artifact, not
  // half of one: an absent publication, no releaseNote metadata block, and a
  // verification pass that agrees with both.
  it("projects an absent stable plan into an absent publication carrying no metadata", async () => {
    const root = await temporaryRoot();
    const plan = discoverReleaseNotePlan({
      channel: "stable",
      releaseVersion: "1.2.3",
      sourceRoot: root,
    });
    const publication = createReleaseNotePublication(plan, {
      publicOrigin: "https://releases.example.test",
      published: true,
      versionPrefix: "stable/versions/1.2.3",
    });

    expect(publication.state).toBe("absent");
    expect(publication.entries).toEqual([]);
    expect(releaseNoteMetadataFromPublication(publication)).toBeNull();
    expect(() => verifyReleaseNotePublication(plan, publication, { requirePublished: true })).not.toThrow();
    expect(() => parseReleaseNotePublication(JSON.parse(JSON.stringify(publication)) as unknown)).not.toThrow();
  });

  it("projects a partial stable plan into a publication carrying only the locales that exist", async () => {
    const root = await temporaryRoot();
    await writeNote(root, "1.2.3", "en");
    const plan = discoverReleaseNotePlan({
      channel: "stable",
      releaseVersion: "1.2.3",
      sourceRoot: root,
    });
    const publication = createReleaseNotePublication(plan, {
      publicOrigin: "https://releases.example.test",
      published: true,
      versionPrefix: "stable/versions/1.2.3",
    });

    expect(publication.state).toBe("published");
    expect(publication.entries.map((entry) => entry.locale)).toEqual(["en"]);
    expect(Object.keys(releaseNoteMetadataFromPublication(publication)?.content.locales ?? {})).toEqual(["en"]);
    expect(() => verifyReleaseNotePublication(plan, publication, { requirePublished: true })).not.toThrow();
    expect(() => parseReleaseNotePublication(JSON.parse(JSON.stringify(publication)) as unknown)).not.toThrow();
  });
});
