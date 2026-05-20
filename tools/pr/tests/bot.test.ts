/**
 * Bot detection / marker stripping / latest-review reduction.
 *
 * These detectors gate `bot-only-approval` and the human-vs-bot split in the
 * `awaiting-*` timing rules; their behavior is consumed by `tags.ts` without
 * further sanity checks, so a regression here silently changes which PRs
 * land in `merge-ready`.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  condense,
  isBotAuthored,
  isBotOnlyApproval,
  reduceLatestReviewsByAuthor,
  stripBotMarkers,
} from "../src/bot.js";

describe("isBotAuthored", () => {
  it("matches actor login suffixed with [bot]", () => {
    assert.equal(isBotAuthored({ login: "dependabot[bot]" }, ""), true);
  });

  it("matches looper HTML-comment stamp in body", () => {
    const body = "<!-- looper: review v1 -->\nlgtm";
    assert.equal(isBotAuthored({ login: "mrcfps" }, body), true);
  });

  it("matches Powered by Looper footer in body", () => {
    const body = `Looks good.\n<sub>Powered by <a href="https://looper.dev">Looper</a></sub>`;
    assert.equal(isBotAuthored({ login: "mrcfps" }, body), true);
  });

  it("returns false for a human actor with a clean body", () => {
    assert.equal(isBotAuthored({ login: "alice" }, "please fix the typo"), false);
  });

  it("returns false when actor is null and body has no markers", () => {
    assert.equal(isBotAuthored(null, "no markers here"), false);
  });
});

describe("stripBotMarkers", () => {
  it("removes looper html-comment stamp", () => {
    const out = stripBotMarkers("<!-- looper: v1 -->\nhello");
    assert.equal(out, "hello");
  });

  it("removes Powered by Looper <sub> footer", () => {
    const out = stripBotMarkers("body\n<sub>Powered by <a>Looper</a></sub>");
    assert.equal(out, "body");
  });

  it("leaves unrelated content untouched", () => {
    const out = stripBotMarkers("just plain text");
    assert.equal(out, "just plain text");
  });
});

describe("condense", () => {
  it("returns the cleaned body unchanged when under the limit", () => {
    assert.equal(condense("hello   world", 50), "hello world");
  });

  it("truncates with an ellipsis when over the limit", () => {
    const out = condense("a".repeat(40), 10);
    assert.equal(out.length, 10);
    assert.equal(out.endsWith("…"), true);
  });

  it("strips bot markers before measuring length", () => {
    const out = condense("<!-- looper: v1 -->\nhello", 20);
    assert.equal(out, "hello");
  });
});

describe("isBotOnlyApproval", () => {
  it("returns false when reviewDecision is not APPROVED", () => {
    const reviews = [
      { author: { login: "looper[bot]" }, body: "", state: "APPROVED" },
    ];
    assert.equal(isBotOnlyApproval("CHANGES_REQUESTED", reviews), false);
  });

  it("returns false when at least one APPROVED review is human-authored", () => {
    const reviews = [
      { author: { login: "looper[bot]" }, body: "", state: "APPROVED" },
      { author: { login: "alice" }, body: "lgtm", state: "APPROVED" },
    ];
    assert.equal(isBotOnlyApproval("APPROVED", reviews), false);
  });

  it("returns true when every APPROVED review is bot-authored", () => {
    const reviews = [
      { author: { login: "looper[bot]" }, body: "", state: "APPROVED" },
      { author: { login: "mrcfps" }, body: "<!-- looper: v1 -->", state: "APPROVED" },
    ];
    assert.equal(isBotOnlyApproval("APPROVED", reviews), true);
  });

  it("returns false when there are no APPROVED reviews at all", () => {
    const reviews = [
      { author: { login: "looper[bot]" }, body: "", state: "COMMENTED" },
    ];
    assert.equal(isBotOnlyApproval("APPROVED", reviews), false);
  });
});

describe("reduceLatestReviewsByAuthor", () => {
  it("returns the latest review per author by submittedAt", () => {
    const history = [
      { author: { login: "alice" }, submittedAt: "2026-05-01T00:00:00Z", state: "COMMENTED" },
      { author: { login: "alice" }, submittedAt: "2026-05-10T00:00:00Z", state: "APPROVED" },
      { author: { login: "bob" }, submittedAt: "2026-05-05T00:00:00Z", state: "CHANGES_REQUESTED" },
    ];
    const reduced = reduceLatestReviewsByAuthor(history);
    const byLogin = new Map(reduced.map((r) => [r.author?.login, r]));
    assert.equal(reduced.length, 2);
    assert.equal(byLogin.get("alice")?.state, "APPROVED");
    assert.equal(byLogin.get("bob")?.state, "CHANGES_REQUESTED");
  });

  it("drops entries with a null author", () => {
    const history = [
      { author: null, submittedAt: "2026-05-01T00:00:00Z" },
      { author: { login: "alice" }, submittedAt: "2026-05-01T00:00:00Z" },
    ];
    const reduced = reduceLatestReviewsByAuthor(history);
    assert.equal(reduced.length, 1);
    assert.equal(reduced[0]?.author?.login, "alice");
  });

  it("returns an empty array for empty history", () => {
    assert.deepEqual(reduceLatestReviewsByAuthor([]), []);
  });
});
