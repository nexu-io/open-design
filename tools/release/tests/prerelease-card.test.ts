import { describe, expect, it } from "vitest";

import {
  PLATFORM_LABELS,
  allPlatformsFailed,
  formatDuration,
  formatElapsed,
  headerTemplate,
  headerTitle,
  isTerminal,
  renderPrereleaseCard,
  undiscoveredLaneStatus,
} from "../src/notifications/prerelease-card.ts";
import type { LaneStatus, PlatformKey, PlatformLane, PrereleaseCardState } from "../src/notifications/prerelease-card.ts";

const R2 = "https://releases.example/prerelease/versions/0.21.1-prerelease.3";

const MINUTE = 60_000;
/** A fixed clock, so every duration the card renders is an exact expectation. */
const NOW = Date.UTC(2026, 8, 9, 12, 0, 0);

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
    timing: { startedAt: null, completedAt: null },
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
    now: NOW,
    runCreatedAt: null,
    publishCompletedAt: null,
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

function platformBlock(card: RenderedCard): string {
  return texts(card).find((text) => text.startsWith("**平台产物**")) ?? "";
}

function platformRow(card: RenderedCard, label: string): string {
  return platformBlock(card)
    .split("\n")
    .find((line) => line.includes(label)) ?? "";
}

function noteText(card: RenderedCard): string {
  return card.elements.at(-1)?.elements?.[0]?.content ?? "";
}

describe("prerelease progress card", () => {
  it("opens on the pipeline, not on the first artifact", () => {
    // The card is posted the moment the watcher starts, so "nothing has
    // shipped yet" is its NORMAL opening state rather than an incident. The
    // header must say so: an opening card is a blue 构建中, whatever mixture of
    // queued, running and skipped lanes the run happens to start with.
    const opening = state({
      platforms: [
        platform("mac_arm64", "running"),
        platform("mac_x64", "pending"),
        platform("win_x64", "pending"),
        // Terminal from the first poll: build_linux is opt-in behind
        // vars.ENABLE_STABLE_LINUX and is therefore skipped on every run.
        platform("linux_x64", "skipped"),
      ],
    });
    const card = render(opening);
    expect(card.header.template).toBe("blue");
    expect(card.header.title?.content).toContain("构建中");
    expect(card.header.title?.content).not.toContain("全部平台构建失败");
    expect(platformRow(card, "macOS (Apple Silicon)")).toContain("构建中");
    expect(platformRow(card, "Windows")).toContain("排队中");
    expect(platformRow(card, "Linux")).toContain("本次未构建");
    // Nothing has published, so there is nothing to download yet.
    expect(buttonUrls(card)).toEqual([]);
  });

  it("never calls a release dead while another platform is still building", () => {
    // "Some platform has reported and none of them shipped" only ever meant
    // "they all have" because the card did not exist before that point. Now it
    // does, so the red verdict has to wait for every expected lane.
    const oneDown = state({
      platforms: [
        platform("mac_arm64", "failure"),
        platform("mac_x64", "running"),
        platform("win_x64", "pending"),
      ],
    });
    expect(headerTitle(oneDown)).not.toContain("全部平台构建失败");
    expect(headerTitle(oneDown)).toContain("构建中");
    expect(headerTemplate(oneDown)).toBe("blue");
    expect(allPlatformsFailed(oneDown)).toBe(false);
    // The row still shows the failure — the header withholds the verdict, it
    // does not hide the lane.
    expect(platformRow(render(oneDown), "macOS (Apple Silicon)")).toContain("❌");
  });

  it("adds the first download button as soon as one platform publishes", () => {
    const firstReady = state({
      platforms: [
        platform("mac_arm64", "success"),
        platform("mac_x64", "running"),
        platform("win_x64", "pending"),
      ],
    });
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

  it("turns the standing card red once every expected platform has failed", () => {
    // The card is already in the chat by now, so this is an edit rather than a
    // post — but it is still the one state where the header has to shout, and
    // silence must never hide a total failure.
    const dead = state({
      platforms: [
        platform("mac_arm64", "failure"),
        platform("mac_x64", "failure"),
        platform("win_x64", "failure"),
      ],
      finished: true,
    });
    expect(allPlatformsFailed(dead)).toBe(true);
    const card = render(dead);
    expect(card.header.template).toBe("red");
    expect(card.header.title?.content).toContain("全部平台构建失败");
    expect(buttonUrls(card)).toEqual([]);
  });

  it("does not wait on a platform that was never requested", () => {
    // A skipped platform is a decision, not a pending result: it must not keep
    // the verdict from landing when everything else died.
    const dead = state({
      platforms: [
        platform("mac_arm64", "failure"),
        platform("mac_x64", "skipped"),
        platform("win_x64", "failure"),
      ],
    });
    expect(allPlatformsFailed(dead)).toBe(true);
    expect(headerTemplate(dead)).toBe("red");
    expect(texts(render(dead)).join("\n")).toContain("⚪️ macOS (Intel) · 本次未构建");
  });

  it("keeps a run of nothing but skipped platforms out of the red", () => {
    // Every lane switched off is a configuration, not a failure: there is no
    // package because none was asked for, and there is nobody to page.
    const nothingRequested = state({
      platforms: [platform("mac_arm64", "skipped"), platform("win_x64", "skipped")],
    });
    expect(headerTemplate(nothingRequested)).toBe("blue");
    expect(allPlatformsFailed(nothingRequested)).toBe(false);
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

  // "How long did mac Intel take this time" is the question the person cutting
  // a release actually asks, and the answer is already in the job list the
  // watcher polls — `started_at` / `completed_at` — so the card can carry it
  // without a single extra API.
  describe("how long each lane took", () => {
    it("counts up while a lane runs and freezes the number when it finishes", () => {
      const card = render(
        state({
          platforms: [
            platform("mac_arm64", "success", {
              timing: { startedAt: NOW - 40 * MINUTE, completedAt: NOW - 40 * MINUTE + 11 * MINUTE + 42_000 },
            }),
            platform("mac_x64", "running", {
              timing: { startedAt: NOW - 18 * MINUTE - 30_000, completedAt: null },
            }),
            platform("win_x64", "success", {
              timing: { startedAt: NOW - 30 * MINUTE, completedAt: NOW - 30 * MINUTE + 14 * MINUTE + 3_000 },
            }),
            platform("linux_x64", "skipped"),
          ],
        }),
      );
      expect(platformRow(card, "macOS (Apple Silicon)")).toBe("✅ macOS (Apple Silicon) · 已发布 · 用时 11m42s");
      expect(platformRow(card, "macOS (Intel)")).toBe("⏳ macOS (Intel) · 构建中 · 已用 18m");
      expect(platformRow(card, "Windows")).toBe("✅ Windows · 已发布 · 用时 14m03s");
      expect(platformRow(card, "Linux")).toBe("⚪️ Linux · 本次未构建");
    });

    it("says nothing about a queued lane, because its timestamp measures the queue", () => {
      // GitHub stamps `started_at` on a job the moment it is QUEUED, so a
      // pending lane always carries one. Reading it as work would report the
      // queue as build time, which is why the lane's STATUS decides whether a
      // duration is shown at all — never the presence of a timestamp.
      const queued = render(
        state({
          platforms: [
            platform("win_x64", "pending", { timing: { startedAt: NOW - 6 * MINUTE, completedAt: null } }),
          ],
        }),
      );
      expect(platformRow(queued, "Windows")).toBe("⏳ Windows · 排队中");
    });

    it("says nothing about a lane that did no work", () => {
      // A skipped job carries started_at == completed_at, and a never-started
      // lane has no job at all. "用时 0s" would be noise on the first and a
      // fabrication on the second.
      const idle = render(
        state({
          platforms: [
            platform("mac_x64", "skipped", { timing: { startedAt: NOW - MINUTE, completedAt: NOW - MINUTE } }),
            platform("win_x64", "never_started", { timing: { startedAt: NOW - MINUTE, completedAt: NOW - MINUTE } }),
          ],
        }),
      );
      expect(idle).toBeDefined();
      expect(platformRow(idle, "macOS (Intel)")).toBe("⚪️ macOS (Intel) · 本次未构建");
      expect(platformRow(idle, "Windows")).toBe("🚨 Windows · 未触发");
    });

    it("reports how long a cancelled lane ran before it was stopped", () => {
      const cancelledMidBuild = render(
        state({
          platforms: [
            platform("mac_arm64", "cancelled", {
              timing: { startedAt: NOW - 9 * MINUTE, completedAt: NOW - 2 * MINUTE },
            }),
            // Cancelled before it ever started: no work, so no number.
            platform("win_x64", "cancelled", { timing: { startedAt: null, completedAt: NOW - 2 * MINUTE } }),
          ],
        }),
      );
      expect(platformRow(cancelledMidBuild, "macOS (Apple Silicon)")).toBe("⚠️ macOS (Apple Silicon) · 已取消 · 用时 7m00s");
      expect(platformRow(cancelledMidBuild, "Windows")).toBe("⚠️ Windows · 已取消");
    });

    it("keeps a still-running lane's clock when the watch times out", () => {
      // The watcher gave up, but the build did not: the honest thing is the
      // elapsed time as of the last poll, next to the note that says these
      // numbers are not final.
      const timedOut = state({
        platforms: [
          platform("mac_arm64", "success", {
            timing: { startedAt: NOW - 100 * MINUTE, completedAt: NOW - 88 * MINUTE },
          }),
          platform("win_x64", "running", { timing: { startedAt: NOW - 95 * MINUTE, completedAt: null } }),
        ],
        timedOut: true,
      });
      const card = render(timedOut);
      expect(platformRow(card, "macOS (Apple Silicon)")).toBe("✅ macOS (Apple Silicon) · 已发布 · 用时 12m00s");
      expect(platformRow(card, "Windows")).toBe("⏳ Windows · 构建中 · 已用 1h35m");
      expect(texts(card).join("\n")).toContain("看板任务已达到时间上限");
    });

    it("formats a duration so two rows can be compared at a glance", () => {
      expect(formatDuration(42_000)).toBe("42s");
      expect(formatDuration(11 * MINUTE + 42_000)).toBe("11m42s");
      expect(formatDuration(14 * MINUTE + 3_000)).toBe("14m03s");
      expect(formatDuration(3 * 60 * MINUTE + 4 * MINUTE + 5_000)).toBe("3h04m05s");
      // Clock skew between GitHub's stamps must not print a negative duration.
      expect(formatDuration(-1_000)).toBe("0s");
    });

    it("quantizes a live number to the minute so the card does not rewrite itself every poll", () => {
      // The watcher re-renders every 30 seconds and PATCHes whenever the render
      // changed. A second-by-second number would edit the message on every
      // single poll for the whole two-hour watch.
      expect(formatElapsed(30_000)).toBe("<1m");
      expect(formatElapsed(18 * MINUTE + 59_000)).toBe("18m");
      expect(formatElapsed(61 * MINUTE)).toBe("1h01m");
    });

    it("puts the whole round's clock at the bottom of the card", () => {
      const midFlight = render(
        state({
          runCreatedAt: NOW - 22 * MINUTE,
          platforms: [platform("mac_arm64", "running")],
        }),
      );
      expect(noteText(midFlight)).toContain("本轮已用 22m");

      const shipped = render(
        state({
          runCreatedAt: NOW - 60 * MINUTE,
          publishCompletedAt: NOW - 60 * MINUTE + 47 * MINUTE + 9_000,
          platforms: [platform("mac_arm64", "success")],
          finished: true,
        }),
      );
      expect(noteText(shipped)).toContain("本轮总耗时 47m09s");
      // Still next to the links it has always sat beside.
      expect(noteText(shipped)).toContain("[打包运行](https://github.com/nexu-io/open-design/actions/runs/1)");
    });

    it("says nothing about the round when it does not know when the run started", () => {
      const unknownStart = render(state({ runCreatedAt: null, platforms: [platform("mac_arm64", "running")] }));
      expect(noteText(unknownStart)).not.toContain("本轮");
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
