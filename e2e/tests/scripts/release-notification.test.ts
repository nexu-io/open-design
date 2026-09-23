import { describe, expect, it } from "vitest";

import { decodeReleaseFeishuBot } from "../../../.github/scripts/lib/feishu/client.js";
import {
  buildReleaseFeishuCard,
  loadReleaseNotificationDetails,
  releaseNotificationInternals,
  type ReleaseNotificationInput,
} from "../../../.github/scripts/lib/feishu/release.js";

function input(overrides: Partial<ReleaseNotificationInput> = {}): ReleaseNotificationInput {
  return {
    activationCompletedAt: "2026-08-17T03:47:30Z",
    actor: "alice",
    branch: "feat/standalone-closure",
    channel: "beta",
    commit: "0123456789abcdef0123456789abcdef01234567",
    eventName: "workflow_dispatch",
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
    runAttempt: "1",
    runNumber: "123",
    runUrl: "https://github.com/nexu-io/open-design/actions/runs/1",
    stream: "release",
    version: "0.19.1-beta.4",
    winX64Smoke: "success",
    winX64Url: "https://releases.example/win.exe",
    triggeringActor: "alice",
    workflowName: "release-beta",
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
  changelog: [],
  coldStarts: [],
  execution: null,
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
    const details = await loadReleaseNotificationDetails(input(), (async (request: string | URL | Request) => {
      const url = String(request);
      if (url.includes("/compare/")) return Response.json({
        commits: [
          { commit: { message: "chore: hidden oldest change" }, parents: [{}], sha: "0".repeat(40) },
          { commit: { message: "feat: first change\n\nbody" }, parents: [{}], sha: "1".repeat(40) },
          { commit: { message: "fix: second change" }, parents: [{}], sha: "2".repeat(40) },
          { commit: { message: "refactor: third change" }, parents: [{}], sha: "3".repeat(40) },
          { commit: { message: "test: fourth change" }, parents: [{}], sha: "4".repeat(40) },
          { commit: { message: "docs: fifth change" }, parents: [{}], sha: "5".repeat(40) },
          { commit: { message: "merge: hidden" }, parents: [{}, {}], sha: "6".repeat(40) },
        ],
      });
      expect(url).toContain("/actions/runs/1");
      return Response.json({
        created_at: "2026-08-17T03:45:00Z",
        pull_requests: [{ number: 6956 }],
        run_started_at: "2026-08-17T03:45:00Z",
      });
    }) as typeof fetch, "github-token");
    const card = buildReleaseFeishuCard(input({ releaseMode: "promote" }), details);
      const serialized = JSON.stringify(card);
      expect(card.header).toMatchObject({ template: "green" });
      expect(details).toEqual({
        changelog: [
          `docs: fifth change (${"5".repeat(40)})`,
          `test: fourth change (${"4".repeat(40)})`,
          `refactor: third change (${"3".repeat(40)})`,
          `fix: second change (${"2".repeat(40)})`,
          `feat: first change (${"1".repeat(40)})`,
          `chore: hidden oldest change (${"0".repeat(40)})`,
        ],
        coldStarts: [],
        execution: expect.objectContaining({
          durationMs: expect.any(Number),
          observedAtMs: expect.any(Number),
          pullRequest: {
            number: 6956,
            url: "https://github.com/nexu-io/open-design/pull/6956",
          },
          queueDurationMs: 0,
          runStartedAtMs: expect.any(Number),
        }),
        failures: [],
        warnings: [],
      });
      expect(serialized).toContain("feat/standalone-closure");
      expect(serialized).toContain("[0123456](https://github.com/nexu-io/open-design/commit/");
      expect(serialized).not.toContain("`0123456`");
      expect(serialized).not.toContain("渠道");
      expect(serialized).toContain("触发");
      expect(serialized).toContain("[@alice](https://github.com/alice)");
      expect(serialized).toContain("手动");
      expect(serialized).toContain("publish=true · 晋升 latest");
      expect(serialized).toContain("release-beta #123");
      expect(serialized).toContain("[PR #6956](https://github.com/nexu-io/open-design/pull/6956)");
      expect(serialized).toContain("发布");
      expect(serialized).toContain("通知");
      expect(serialized).not.toContain("Closure 冷启动");
      expect(serialized).not.toContain("hidden oldest change");
      expect(serialized).toContain("Mac Arm");
      expect(serialized).toContain("Mac x64");
      expect(serialized).toContain("Win x64");
      expect(serialized).toContain("发布详情");
      expect(serialized).toContain("GitHub Actions");
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
    expect(releaseNotificationInternals.notificationState(input())).toBe("published");
    expect(releaseNotificationInternals.notificationState(input({ releaseMode: "promote" }))).toBe("promoted");
    expect(releaseNotificationInternals.notificationState(input({ releaseMode: "candidate" }))).toBe("candidate");
    const candidate = JSON.stringify(buildReleaseFeishuCard(input({ releaseMode: "candidate" }), emptyDetails));
    expect(candidate).toContain("distribution-exact-accept.yml");
    expect(candidate).toContain("publish=false · 公开候选 / 无 latest 入口");
    expect(releaseNotificationInternals.notificationState(input({ releaseState: "partial" }))).toBe("partial");
    expect(releaseNotificationInternals.notificationState(input({ releaseResult: "failure" }))).toBe("failed");
    expect(releaseNotificationInternals.notificationState(input({ releaseMode: "prepublish" }))).toBe("validation");
    const card = buildReleaseFeishuCard(input({ winX64Smoke: "failure" }), {
      changelog: [],
      coldStarts: [],
      execution: null,
      failures: [],
      warnings: [],
    });
    expect(card.header).toMatchObject({ template: "orange" });
    expect(JSON.stringify(card)).toContain("Windows x64 smoke 失败");
    expect(JSON.stringify(card)).toContain("https://releases.example/win.exe");
    expect(buildReleaseFeishuCard(input({ releaseMode: "validation" }), emptyDetails).header)
      .toMatchObject({ template: "blue" });
  });

  it("renders arbitrary validated exact names without workspace dependencies", () => {
    expect(JSON.stringify(buildReleaseFeishuCard(input({ channel: "qa2", version: "0.19.1-qa2.1" }), emptyDetails)))
      .toContain("Qa2 0.19.1-qa2.1");
    expect(() => buildReleaseFeishuCard(input({ channel: "Preview-2" }), emptyDetails))
      .toThrow("unsupported release notification channel");
  });

  it("distinguishes the original actor from a rerun operator", () => {
    const card = buildReleaseFeishuCard(input({ runAttempt: "2", triggeringActor: "bob" }), emptyDetails);
    const serialized = JSON.stringify(card);
    expect(serialized).toContain("[@alice](https://github.com/alice)");
    expect(serialized).toContain("重跑 [@bob](https://github.com/bob)");
    expect(serialized).toContain("第 2 次执行");
  });
});
