import { execFileSync, spawnSync } from "node:child_process";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import {
  WHATS_NEW_DOCUMENT_PATH,
  checkWhatsNewDocument,
} from "../../../scripts/check-whats-new-document.ts";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

// The daemon resolves a malformed What's New document to "no highlight"
// instead of an error, so every failure mode below is invisible at publish
// time: the upload succeeds and the card simply never appears. These cases
// exist to prove the guard can actually see each of them — a guard that only
// ever runs against the good document is an untested guard.
async function documentRoot(document: string): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "whats-new-guard-"));
  await mkdir(path.join(root, path.dirname(WHATS_NEW_DOCUMENT_PATH)), { recursive: true });
  await writeFile(path.join(root, WHATS_NEW_DOCUMENT_PATH), document, "utf8");
  return root;
}

const validDocument = {
  id: "1.2.3",
  title: "Headline",
  body: "First bullet.\nSecond bullet.",
  imageUrl: "https://whatsnew.open-design.ai/cover.webp",
  linkUrl: "https://open-design.ai/release/",
  locales: {
    "zh-CN": { title: "标题", body: "第一条。\n第二条。", linkUrl: "https://open-design.ai/zh/release/" },
  },
};

async function check(document: unknown): Promise<boolean> {
  return checkWhatsNewDocument(await documentRoot(JSON.stringify(document, null, 2)));
}

describe("what's new document guard", () => {
  let consoleError: ReturnType<typeof vi.spyOn>;
  let consoleLog: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    consoleLog = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleError.mockRestore();
    consoleLog.mockRestore();
  });

  test("the repository document is publishable", async () => {
    await expect(checkWhatsNewDocument(repoRoot)).resolves.toBe(true);
  });

  test("a well-formed document passes", async () => {
    await expect(check(validDocument)).resolves.toBe(true);
  });

  test("the empty retirement document passes", async () => {
    await expect(check({})).resolves.toBe(true);
  });

  test("invalid JSON fails", async () => {
    await expect(checkWhatsNewDocument(await documentRoot("{ not json }"))).resolves.toBe(false);
  });

  test("a missing document fails", async () => {
    await expect(checkWhatsNewDocument(await mkdtemp(path.join(tmpdir(), "whats-new-guard-")))).resolves.toBe(false);
  });

  test.each(["id", "title", "body"] as const)("a missing %s fails", async (field) => {
    const { [field]: _dropped, ...rest } = validDocument;
    await expect(check(rest)).resolves.toBe(false);
  });

  test("an empty required string fails", async () => {
    await expect(check({ ...validDocument, title: "   " })).resolves.toBe(false);
  });

  test("a misspelled field fails instead of being silently ignored", async () => {
    const { imageUrl: cover, ...rest } = validDocument;
    await expect(check({ ...rest, imageURL: cover })).resolves.toBe(false);
  });

  test("a non-https imageUrl fails", async () => {
    await expect(check({ ...validDocument, imageUrl: "http://whatsnew.open-design.ai/cover.webp" })).resolves.toBe(
      false,
    );
  });

  test("a non-https locale linkUrl fails", async () => {
    await expect(
      check({
        ...validDocument,
        locales: { "zh-CN": { ...validDocument.locales["zh-CN"], linkUrl: "open-design.ai/zh/" } },
      }),
    ).resolves.toBe(false);
  });

  test("a locale whose overrides are all invalid fails", async () => {
    await expect(check({ ...validDocument, locales: { "zh-CN": { title: "" } } })).resolves.toBe(false);
  });

  test("a blank bullet line fails", async () => {
    await expect(check({ ...validDocument, body: "First bullet.\n\nSecond bullet." })).resolves.toBe(false);
  });

  test("the check is registered in the public guard entrypoint", () => {
    const names = execFileSync("pnpm", ["--silent", "guard", "--list-checks"], {
      cwd: repoRoot,
      encoding: "utf8",
    })
      .trim()
      .split("\n");
    expect(names).toContain("what's new document");
  });
});

describe("what's new publisher", () => {
  // The publisher's own gate: a green upload means nothing unless the object
  // is read back from the origin the daemon fetches, and that read-back is
  // only evidence if a wrong body turns it red. The self-check asserts both
  // halves against a local origin.
  test("the read-back gate and the JSON gate can both fail", () => {
    const result = spawnSync("python3", [path.join(repoRoot, ".github/scripts/publish_whats_new.py"), "self-check"], {
      cwd: repoRoot,
      encoding: "utf8",
    });
    expect(result.stderr ?? "").toBe("");
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("self-check passed");
  });

  // A malformed document must be rejected before anything else happens, so a
  // bad edit cannot reach the bucket even if the credentials are present.
  test("an invalid document is rejected before credentials are considered", async () => {
    const root = await documentRoot("{ not json }");
    const result = spawnSync("python3", [path.join(repoRoot, ".github/scripts/publish_whats_new.py")], {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        WHATS_NEW_DOCUMENT: WHATS_NEW_DOCUMENT_PATH,
        WHATS_NEW_DRY_RUN: "false",
        WHATS_NEW_STORAGE_ENDPOINT: "",
        WHATS_NEW_STORAGE_BUCKET: "",
        WHATS_NEW_STORAGE_ACCESS_KEY_ID: "",
        WHATS_NEW_STORAGE_SECRET_ACCESS_KEY: "",
      },
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("not valid JSON");
  });
});
