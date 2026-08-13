import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { decodeReleaseFeishuBot } from "../src/notifications/bot-codec.js";
import {
  buildReleaseFeishuCard,
  loadReleaseNotificationDetails,
  releaseNotificationInternals,
  type ReleaseNotificationInput,
} from "../src/notifications/release-card.js";

function input(overrides: Partial<ReleaseNotificationInput> = {}): ReleaseNotificationInput {
  return {
    branch: "feat/standalone-closure",
    channel: "beta",
    changelogFile: "",
    commit: "0123456789abcdef0123456789abcdef01234567",
    macArm64Smoke: "success",
    macArm64Url: "https://releases.example/mac-arm64.dmg",
    macX64Smoke: "success",
    macX64Url: "https://releases.example/mac-x64.dmg",
    metadataUrl: "https://releases.example/beta/versions/0.19.1-beta.4/metadata.json",
    previousCommit: "abcdef0123456789abcdef0123456789abcdef01",
    releaseMode: "publish",
    releaseResult: "success",
    releaseState: "complete",
    repository: "nexu-io/open-design",
    runUrl: "https://github.com/nexu-io/open-design/actions/runs/1",
    stream: "release",
    version: "0.19.1-beta.4",
    winX64Smoke: "success",
    winX64Url: "https://releases.example/win.exe",
    ...overrides,
  };
}

const digest = (character: string) => `sha256:${character.repeat(64)}`;

function metadata() {
  const body = digest("a");
  const launcher = digest("b");
  const native = digest("c");
  return {
    closure: {
      blobs: {
        [body]: { digest: body, mediaType: "application/zip", size: 19_000_000, url: "https://example/body" },
        [launcher]: { digest: launcher, mediaType: "application/zip", size: 40_000, url: "https://example/launcher" },
        [native]: { digest: native, mediaType: "application/zip", size: 2_000_000, url: "https://example/native" },
      },
      required: {
        body: { blob: body },
        launcher: { blob: launcher },
        targets: { "darwin-arm64": { native: { blob: native } } },
      },
    },
  };
}

const emptyDetails = {
  coldStarts: [],
  failures: [],
  warnings: [],
};

describe("release Feishu notification", () => {
  it("decodes one compact secret and rejects ambiguous bot declarations", () => {
    expect(decodeReleaseFeishuBot('["v1","https://open.feishu.cn/open-apis/bot/v2/hook/abc_123",""]'))
      .toEqual({ signSecret: "", webhook: "https://open.feishu.cn/open-apis/bot/v2/hook/abc_123" });
    expect(decodeReleaseFeishuBot("")).toBeNull();
    expect(() => decodeReleaseFeishuBot('["v2","https://open.feishu.cn/open-apis/bot/v2/hook/a",""]'))
      .toThrow(/tuple codec/u);
  });

  it("derives the unique cold-start set and attaches public acceptance timing", async () => {
    const fetchImpl = async (request: string | URL | Request) => {
      const url = String(request);
      if (url.endsWith("metadata.json")) return Response.json(metadata());
      if (url.endsWith("acceptance/mac_arm64.json")) return Response.json({
        coldStart: {
          timing: { readinessBudgetMs: 90_000, readinessDurationMs: 2_000, totalDurationMs: 3_000 },
        },
      });
      return new Response(null, { status: 404 });
    };
    const details = await loadReleaseNotificationDetails(
      input({ releaseState: "partial" }),
      fetchImpl as typeof fetch,
    );
    expect(details.coldStarts).toEqual([expect.objectContaining({
      bodyBytes: 19_000_000,
      launcherBytes: 40_000,
      nativeBytes: 2_000_000,
      requiredBytes: 21_040_000,
      target: "darwin-arm64",
      timing: { readinessBudgetMs: 90_000, readinessDurationMs: 2_000, totalDurationMs: 3_000 },
    })]);
  });

  it("keeps successful cards compact and formats a bounded changelog", async () => {
    const root = mkdtempSync(join(tmpdir(), "release-card-"));
    const changelogFile = join(root, "changelog.txt");
    writeFileSync(changelogFile, [
      "feat: first change (1111111)",
      "fix: second change (2222222)",
      "refactor: third change (3333333)",
      "test: fourth change (4444444)",
      "docs: fifth change (5555555)",
      "chore: hidden sixth change (6666666)",
    ].join("\n"));
    try {
      const details = await loadReleaseNotificationDetails(input(), () => {
        throw new Error("successful notification must not fetch diagnostics");
      });
      const card = buildReleaseFeishuCard(input({ changelogFile }), details);
      const serialized = JSON.stringify(card);
      expect(card.header).toMatchObject({ template: "green" });
      expect(details).toEqual(emptyDetails);
      expect(serialized).toContain("feat/standalone-closure");
      expect(serialized).toContain("[0123456](https://github.com/nexu-io/open-design/commit/");
      expect(serialized).not.toContain("`0123456`");
      expect(serialized).not.toContain("渠道");
      expect(serialized).not.toContain("触发");
      expect(serialized).not.toContain("Closure 冷启动");
      expect(serialized).not.toContain("hidden sixth change");
      expect(serialized).toContain("Apple 芯片");
      expect(serialized).toContain("发布详情");
      expect(serialized).toContain("GitHub Actions");
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("loads failed jobs and suppresses unaccepted downloads on failure", async () => {
    const details = await loadReleaseNotificationDetails(
      input({ metadataUrl: "", releaseResult: "failure" }),
      (async (request: string | URL | Request) => {
        expect(String(request)).toContain("/actions/runs/1/jobs");
        return Response.json({
          jobs: [{
            conclusion: "failure",
            html_url: "https://github.com/nexu-io/open-design/actions/runs/1/job/2",
            name: "Distribute beta / Build beta mac_x64",
            steps: [{ conclusion: "failure", name: "Accept public mac_x64 beta artifacts" }],
          }],
        });
      }) as typeof fetch,
      "github-token",
    );
    const card = buildReleaseFeishuCard(input({ metadataUrl: "", releaseResult: "failure" }), details);
    const serialized = JSON.stringify(card);
    expect(card.header).toMatchObject({ template: "red" });
    expect(serialized).toContain("Accept public mac");
    expect(serialized).toContain("beta artifacts");
    expect(serialized).not.toContain("https://releases.example/mac-arm64.dmg");
    expect(serialized).toContain("https://github.com/nexu-io/open-design/actions/runs/1/job/2");
  });

  it("renders complete, partial, failed, and validation terminal states from one capability", () => {
    expect(releaseNotificationInternals.notificationState(input())).toBe("complete");
    expect(releaseNotificationInternals.notificationState(input({ releaseState: "partial" }))).toBe("partial");
    expect(releaseNotificationInternals.notificationState(input({ releaseResult: "failure" }))).toBe("failed");
    expect(releaseNotificationInternals.notificationState(input({ releaseMode: "prepublish" }))).toBe("validation");
    const card = buildReleaseFeishuCard(input({ winX64Smoke: "failure" }), {
      coldStarts: [],
      failures: [],
      warnings: [],
    });
    expect(card.header).toMatchObject({ template: "orange" });
    expect(JSON.stringify(card)).toContain("Windows x64 smoke 失败");
    expect(JSON.stringify(card)).toContain("https://releases.example/win.exe");
    expect(buildReleaseFeishuCard(input({ releaseMode: "validation" }), emptyDetails).header)
      .toMatchObject({ template: "blue" });
  });
});
