import { describe, expect, it } from "vitest";

import {
  PLATFORM_LABELS,
  headerTemplate,
  headerTitle,
  isTerminal,
  renderPrereleaseCard,
  shouldPostFirstCard,
  undiscoveredLaneStatus,
} from "../src/notifications/prerelease-card.ts";
import type { LaneStatus, PlatformKey, PlatformLane, PrereleaseCardState } from "../src/notifications/prerelease-card.ts";

const R2 = "https://releases.example/prerelease/versions/0.21.1-prerelease.3";

function platform(
  key: PlatformKey,
  build: LaneStatus,
  overrides: Partial<PlatformLane> = {},
): PlatformLane {
  return {
    key,
    label: PLATFORM_LABELS[key],
    build,
    downloadUrl: build === "success" ? `${R2}/open-design-0.21.1-prerelease.3-${key}` : "",
    smoke: "skipped",
    ...overrides,
  };
}

function state(overrides: Partial<PrereleaseCardState> = {}): PrereleaseCardState {
  return {
    channelLabel: "Prerelease",
    version: "0.21.1-prerelease.3",
    branch: "release/v0.21.1",
    commit: "0123456789abcdef0123456789abcdef01234567",
    previousCommit: "fedcba9876543210fedcba9876543210fedcba98",
    repo: "nexu-io/open-design",
    originRunUrl: "https://github.com/nexu-io/open-design/actions/runs/1",
    testsRunUrl: "",
    smokeRunUrl: "",
    changelog: { lines: ["fix(web): keep the composer mounted (abc1234567)"], total: 1, truncated: false },
    platforms: [
      platform("mac_arm64", "pending"),
      platform("mac_x64", "pending"),
      platform("win_x64", "pending"),
    ],
    tests: [],
    expectTests: false,
    expectSmoke: false,
    finished: false,
    timedOut: false,
    ...overrides,
  };
}

type RenderedCard = {
  elements: Array<{ actions?: Array<{ url?: string }>; text?: { content?: string }; elements?: Array<{ content?: string }> }>;
  header: { template?: string; title?: { content?: string } };
};

function render(input: PrereleaseCardState): RenderedCard {
  return renderPrereleaseCard(input) as unknown as RenderedCard;
}

function texts(card: RenderedCard): string[] {
  return card.elements.map((element) => element.text?.content).filter((value): value is string => value != null);
}

function buttonUrls(card: RenderedCard): string[] {
  return card.elements.flatMap((element) => element.actions ?? []).map((action) => action.url ?? "");
}

describe("prerelease progress card", () => {
  it("withholds the first card until a platform actually publishes", () => {
    // A card posted at dispatch time becomes a permanent "构建中…" whenever the
    // build dies, which reads as "still coming" forever.
    expect(shouldPostFirstCard(state())).toBe(false);
    expect(
      shouldPostFirstCard(
        state({
          platforms: [
            platform("mac_arm64", "running"),
            platform("mac_x64", "pending"),
            platform("win_x64", "pending"),
          ],
        }),
      ),
    ).toBe(false);

    const firstReady = state({
      platforms: [
        platform("mac_arm64", "success"),
        platform("mac_x64", "running"),
        platform("win_x64", "pending"),
      ],
    });
    expect(shouldPostFirstCard(firstReady)).toBe(true);

    const card = render(firstReady);
    expect(card.header.template).toBe("blue");
    expect(card.header.title?.content).toContain("进行中");
    expect(texts(card).join("\n")).toContain("✅ macOS (Apple Silicon) · 已发布");
    expect(texts(card).join("\n")).toContain("⏳ Windows · 排队中");
    // Only the published platform gets a button; the others would 404.
    expect(buttonUrls(card)).toEqual([`${R2}/open-design-0.21.1-prerelease.3-mac_arm64`]);
  });

  it("adds a row and a button as each further platform publishes", () => {
    const later = render(
      state({
        platforms: [
          platform("mac_arm64", "success"),
          platform("mac_x64", "success"),
          platform("win_x64", "success"),
        ],
        finished: true,
      }),
    );
    expect(later.header.template).toBe("green");
    expect(later.header.title?.content).toBe("🚀 Open Design Prerelease 0.21.1-prerelease.3");
    expect(buttonUrls(later)).toEqual([
      `${R2}/open-design-0.21.1-prerelease.3-mac_arm64`,
      `${R2}/open-design-0.21.1-prerelease.3-mac_x64`,
      `${R2}/open-design-0.21.1-prerelease.3-win_x64`,
    ]);
    const platformBlock = texts(later).find((text) => text.startsWith("**平台产物**")) ?? "";
    expect(platformBlock.split("\n")).toHaveLength(4);
  });

  it("keeps a shipped release out of the red when a check fails", () => {
    // The whole point of the version_metadata_url rule, expressed on the
    // progressive card: a failed check colours the card orange, never red,
    // because the packages are downloadable from the buttons right below it.
    const partial = state({
      platforms: [
        platform("mac_arm64", "success", { smoke: "failure" }),
        platform("mac_x64", "success", { smoke: "success" }),
        platform("win_x64", "success", { smoke: "success" }),
      ],
      expectSmoke: true,
      expectTests: true,
      tests: [
        { key: "functional_e2e", label: "P0 Functional E2E", status: "success" },
        { key: "e2e_vitest", label: "E2E Vitest", status: "failure" },
      ],
      finished: true,
    });
    const card = render(partial);
    expect(card.header.template).toBe("orange");
    expect(card.header.title?.content).toContain("2 项未通过");
    expect(buttonUrls(card)).toHaveLength(3);
    const checks = texts(card).find((text) => text.startsWith("**验证**")) ?? "";
    expect(checks).toContain("❌ E2E Vitest · 未通过");
    expect(checks).toContain("✅ P0 Functional E2E · 通过");
    expect(checks).toContain("❌ macOS (Apple Silicon) packaged smoke · 未通过");
  });

  it("posts a failure card when every platform failed, so silence never hides an incident", () => {
    const dead = state({
      platforms: [
        platform("mac_arm64", "failure"),
        platform("mac_x64", "failure"),
        platform("win_x64", "failure"),
      ],
      finished: true,
    });
    expect(shouldPostFirstCard(dead)).toBe(true);
    const card = render(dead);
    expect(card.header.template).toBe("red");
    expect(card.header.title?.content).toContain("全部平台构建失败");
    expect(buttonUrls(card)).toEqual([]);
  });

  it("does not wait on a platform that was never requested", () => {
    // A skipped platform is a decision, not a pending result: it must not keep
    // the failure card from being posted when everything else died.
    const dead = state({
      platforms: [
        platform("mac_arm64", "failure"),
        platform("mac_x64", "skipped"),
        platform("win_x64", "failure"),
      ],
    });
    expect(shouldPostFirstCard(dead)).toBe(true);
    expect(headerTemplate(dead)).toBe("red");
    expect(texts(render(dead)).join("\n")).toContain("⚪️ macOS (Intel) · 本次未构建");
  });

  it("says so when the changelog is empty, and distinguishes empty from cold start", () => {
    const noBaseline = state({
      previousCommit: "",
      changelog: { lines: [], total: 0, truncated: false },
      platforms: [platform("mac_arm64", "success"), platform("win_x64", "success")],
    });
    expect(texts(render(noBaseline)).join("\n")).toContain("首个 Prerelease 包，无上个版本可对比。");

    const noCommits = state({
      changelog: { lines: [], total: 0, truncated: false },
      platforms: [platform("mac_arm64", "success"), platform("win_x64", "success")],
    });
    expect(texts(render(noCommits)).join("\n")).toContain("与上个 Prerelease 包之间没有新增提交。");
  });

  it("truncates a long changelog and says how much it dropped", () => {
    const lines = Array.from({ length: 30 }, (_, index) => `fix: change ${index}`);
    const card = render(
      state({
        changelog: { lines, total: 47, truncated: true },
        platforms: [platform("mac_arm64", "success")],
      }),
    );
    expect(texts(card).join("\n")).toContain("…还有 17 条提交（共 47 条）");
  });

  it("renders no check rows for lanes that were never dispatched", () => {
    const card = render(
      state({
        platforms: [platform("mac_arm64", "success")],
        expectTests: false,
        expectSmoke: false,
        tests: [{ key: "verify", label: "Verify build", status: "pending" }],
      }),
    );
    expect(texts(card).some((text) => text.startsWith("**验证**"))).toBe(false);
  });

  it("marks a timed-out watch instead of presenting a partial state as final", () => {
    const timedOut = state({
      platforms: [platform("mac_arm64", "success"), platform("win_x64", "running")],
      expectTests: true,
      tests: [{ key: "verify", label: "Verify build", status: "running" }],
      timedOut: true,
    });
    const card = render(timedOut);
    expect(card.header.title?.content).toContain("进行中");
    expect(texts(card).join("\n")).toContain("看板任务已达到时间上限");
  });

  it("reports a timeout with no package at all as red", () => {
    const nothing = state({ platforms: [platform("mac_arm64", "running")], timedOut: true });
    expect(headerTemplate(nothing)).toBe("red");
    expect(headerTitle(nothing)).toContain("等待产物超时");
  });

  // Regression cover for run 34149795952, the first real run of the split
  // prerelease pipeline: `publish` succeeded and published version metadata,
  // but `dispatch_smoke` was skipped, so release-prerelease-smoke.yml never
  // ran at all. The card carried three ⏳ 排队中 packaged-smoke rows that could
  // never resolve — a lie that reads as "a result is still coming".
  describe("a lane that was expected but never dispatched", () => {
    const neverDispatched = undiscoveredLaneStatus({
      runFound: false,
      runCompleted: false,
      discoveryExpired: true,
    });

    function smokeState(smoke: LaneStatus, overrides: Partial<PrereleaseCardState> = {}): PrereleaseCardState {
      return state({
        platforms: [
          platform("mac_arm64", "success", { smoke }),
          platform("mac_x64", "success", { smoke }),
          platform("win_x64", "success", { smoke }),
        ],
        expectSmoke: true,
        finished: true,
        ...overrides,
      });
    }

    function checkBlock(input: PrereleaseCardState): string {
      return texts(render(input)).find((text) => text.startsWith("**验证**")) ?? "";
    }

    it("is a terminal state, not a queue position", () => {
      // Identical watcher inputs either side of the discovery window. Before it
      // closes the lane genuinely is queued; after it closes with no run ever
      // found, nothing is coming and the card must stop waiting on it.
      const queued = undiscoveredLaneStatus({ runFound: false, runCompleted: false, discoveryExpired: false });
      expect(queued).toBe("pending");
      expect(isTerminal(queued)).toBe(false);

      expect(neverDispatched).not.toBe("pending");
      expect(isTerminal(neverDispatched)).toBe(true);
    });

    it("says 未触发 rather than 排队中", () => {
      const checks = checkBlock(smokeState(neverDispatched));
      expect(checks).not.toContain("排队中");
      expect(checks).toContain("macOS (Apple Silicon) packaged smoke · 未触发");
      expect(checks).toContain("Windows packaged smoke · 未触发");
    });

    it("is loud, because it is an anomaly rather than a decision", () => {
      const card = render(smokeState(neverDispatched));
      // A shipped package keeps the card out of the red, but a lane that should
      // have run and did not must never read as an all-clear.
      expect(card.header.template).toBe("orange");
      expect(card.header.title?.content).toContain("未触发");
      expect(card.header.title?.content).not.toBe("🚀 Open Design Prerelease 0.21.1-prerelease.3");
    });

    it("still reads 排队中 while the lane is genuinely queued", () => {
      const checks = checkBlock(smokeState("pending", { finished: false }));
      expect(checks).toContain("macOS (Apple Silicon) packaged smoke · 排队中");
      expect(checks).not.toContain("未触发");
    });

    it("says nothing at all when the switch turned the lane off", () => {
      // enable_smoke: false is a decision. It is not an anomaly and must not
      // colour the card or add rows a reader would wait on.
      const off = render(smokeState("skipped", { expectSmoke: false }));
      expect(texts(off).some((text) => text.startsWith("**验证**"))).toBe(false);
      expect(off.header.template).toBe("green");
    });

    it("applies the same rule to the code test lanes", () => {
      // release-prerelease-tests.yml is dispatched from a job with no skipped
      // ancestor, so it has not hit this in production — but the card must not
      // depend on that luck.
      const card = render(
        state({
          platforms: [platform("mac_arm64", "success")],
          expectTests: true,
          tests: [
            { key: "functional_e2e", label: "P0 Functional E2E", status: neverDispatched },
            { key: "verify", label: "Verify build", status: "success" },
          ],
          finished: true,
        }),
      );
      const checks = texts(card).find((text) => text.startsWith("**验证**")) ?? "";
      expect(checks).toContain("P0 Functional E2E · 未触发");
      expect(checks).not.toContain("排队中");
      expect(card.header.template).toBe("orange");
    });
  });

  it("links every run it is watching", () => {
    const card = render(
      state({
        platforms: [platform("mac_arm64", "success")],
        testsRunUrl: "https://github.com/nexu-io/open-design/actions/runs/2",
        smokeRunUrl: "https://github.com/nexu-io/open-design/actions/runs/3",
      }),
    );
    const note = card.elements.at(-1)?.elements?.[0]?.content ?? "";
    expect(note).toContain("[打包运行](https://github.com/nexu-io/open-design/actions/runs/1)");
    expect(note).toContain("[代码测试](https://github.com/nexu-io/open-design/actions/runs/2)");
    expect(note).toContain("[包 smoke](https://github.com/nexu-io/open-design/actions/runs/3)");
  });
});
