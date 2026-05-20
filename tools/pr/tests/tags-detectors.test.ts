/**
 * Exercises the remaining `classifyPr` detectors that aren't already covered
 * by `tags-unresolved-cr.test.ts`: stale-approval, the three awaiting-*
 * timing tags, bot-only-approval, duplicate-title, unlabeled, and
 * non-ascii-slug.
 *
 * Detectors are pure functions of `PrFacts` + `ClassifyContext` — no
 * mocking is needed; we just shape the facts so the rule under test is the
 * one that emits.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { classifyPr } from "../src/tags.js";
import type { PrFacts } from "../src/types.js";

function makeFacts(overrides: Partial<PrFacts> = {}): PrFacts {
  return {
    number: 1,
    author: "alice",
    title: "test PR",
    createdAt: "2026-05-10T00:00:00Z",
    updatedAt: "2026-05-10T00:00:00Z",
    isDraft: false,
    reviewDecision: "",
    mergeStateStatus: "CLEAN",
    maintainerCanModify: true,
    isOrgMember: false,
    headRefOid: "abc1234",
    assignees: [],
    labels: [{ name: "size/S" }, { name: "risk/low" }, { name: "type/bugfix" }],
    filePaths: ["apps/web/src/foo.ts"],
    reviews: [],
    comments: [],
    commits: [],
    ...overrides,
  };
}

const EMPTY_CTX = { titleIndexByAuthor: new Map<string, number[]>() };

// All timing detectors compare against Date.now(); pick a baseline well in the
// past so a 24h-floor gap is unambiguous regardless of when the test runs.
const LONG_AGO = "2024-01-01T00:00:00Z";
const SLIGHTLY_AFTER_LONG_AGO = "2024-01-02T00:00:00Z";

describe("tagStaleApproval", () => {
  it("fires when an APPROVED review's commit oid predates headRefOid", () => {
    const facts = makeFacts({
      headRefOid: "ffffff7",
      reviews: [
        {
          author: { login: "bob" },
          body: "lgtm",
          state: "APPROVED",
          submittedAt: "2026-05-10T00:00:00Z",
          commit: { oid: "0000000" },
        },
      ],
    });
    const tag = classifyPr(facts, EMPTY_CTX).find((t) => t.name === "stale-approval");
    assert.ok(tag, "stale-approval should fire");
    assert.match(tag?.reason ?? "", /bob@0000000/);
    assert.match(tag?.reason ?? "", /ffffff7/);
  });

  it("does not fire when the APPROVED review's commit oid equals headRefOid", () => {
    const facts = makeFacts({
      headRefOid: "abc1234",
      reviews: [
        {
          author: { login: "bob" },
          body: "lgtm",
          state: "APPROVED",
          submittedAt: "2026-05-10T00:00:00Z",
          commit: { oid: "abc1234" },
        },
      ],
    });
    const tag = classifyPr(facts, EMPTY_CTX).find((t) => t.name === "stale-approval");
    assert.equal(tag, undefined);
  });
});

describe("tagAwaitingAuthorResponse", () => {
  it("fires when the latest human-reviewer signal is newer than the latest author signal and >=24h old", () => {
    const facts = makeFacts({
      author: "alice",
      reviews: [
        {
          author: { login: "bob" },
          body: "please fix",
          state: "COMMENTED",
          submittedAt: SLIGHTLY_AFTER_LONG_AGO,
        },
      ],
      commits: [
        { committedDate: LONG_AGO, authorLogin: "alice" },
      ],
    });
    const tag = classifyPr(facts, EMPTY_CTX).find((t) => t.name === "awaiting-author-response-24h");
    assert.ok(tag, "awaiting-author-response-24h should fire");
    assert.equal(typeof tag?.awaitingHours, "number");
    assert.equal((tag?.awaitingHours ?? 0) >= 24, true);
  });

  it("does not fire when the latest author signal is newer than the latest reviewer signal", () => {
    const facts = makeFacts({
      author: "alice",
      reviews: [
        {
          author: { login: "bob" },
          body: "please fix",
          state: "COMMENTED",
          submittedAt: LONG_AGO,
        },
      ],
      commits: [
        { committedDate: SLIGHTLY_AFTER_LONG_AGO, authorLogin: "alice" },
      ],
    });
    const tag = classifyPr(facts, EMPTY_CTX).find((t) => t.name === "awaiting-author-response-24h");
    assert.equal(tag, undefined);
  });
});

describe("tagAwaitingReviewerResponse", () => {
  it("fires when the latest author signal is newer than the latest human-reviewer signal and >=24h old", () => {
    const facts = makeFacts({
      author: "alice",
      reviews: [
        {
          author: { login: "bob" },
          body: "please fix",
          state: "COMMENTED",
          submittedAt: LONG_AGO,
        },
      ],
      commits: [
        { committedDate: SLIGHTLY_AFTER_LONG_AGO, authorLogin: "alice" },
      ],
    });
    const tag = classifyPr(facts, EMPTY_CTX).find((t) => t.name === "awaiting-reviewer-response-24h");
    assert.ok(tag, "awaiting-reviewer-response-24h should fire");
    assert.equal((tag?.awaitingHours ?? 0) >= 24, true);
  });

  it("ignores commits authored by someone other than the PR author", () => {
    // maintainerCanModify=true: a maintainer push must not count as an
    // author signal. Without an author signal the rule cannot fire.
    const facts = makeFacts({
      author: "alice",
      reviews: [
        {
          author: { login: "bob" },
          body: "please fix",
          state: "COMMENTED",
          submittedAt: LONG_AGO,
        },
      ],
      commits: [
        { committedDate: SLIGHTLY_AFTER_LONG_AGO, authorLogin: "maintainer" },
      ],
    });
    const tag = classifyPr(facts, EMPTY_CTX).find((t) => t.name === "awaiting-reviewer-response-24h");
    assert.equal(tag, undefined);
  });
});

describe("tagAwaitingFirstReview", () => {
  it("fires when there is no human-reviewer signal and the PR is >=24h old", () => {
    const facts = makeFacts({
      createdAt: LONG_AGO,
      reviews: [],
      comments: [],
    });
    const tag = classifyPr(facts, EMPTY_CTX).find((t) => t.name === "awaiting-first-review-24h");
    assert.ok(tag, "awaiting-first-review-24h should fire");
    assert.equal((tag?.awaitingHours ?? 0) >= 24, true);
  });

  it("does not fire when a human-reviewer signal already exists", () => {
    const facts = makeFacts({
      createdAt: LONG_AGO,
      reviews: [
        {
          author: { login: "bob" },
          body: "looking",
          state: "COMMENTED",
          submittedAt: LONG_AGO,
        },
      ],
    });
    const tag = classifyPr(facts, EMPTY_CTX).find((t) => t.name === "awaiting-first-review-24h");
    assert.equal(tag, undefined);
  });

  it("ignores bot reviews when deciding whether a first review exists", () => {
    const facts = makeFacts({
      createdAt: LONG_AGO,
      reviews: [
        {
          author: { login: "dependabot[bot]" },
          body: "",
          state: "COMMENTED",
          submittedAt: LONG_AGO,
        },
      ],
    });
    const tag = classifyPr(facts, EMPTY_CTX).find((t) => t.name === "awaiting-first-review-24h");
    assert.ok(tag, "awaiting-first-review-24h should still fire when only a bot has reviewed");
  });
});

describe("tagBotOnlyApproval", () => {
  it("fires when reviewDecision=APPROVED and every APPROVED review is bot-authored", () => {
    const facts = makeFacts({
      reviewDecision: "APPROVED",
      reviews: [
        {
          author: { login: "looper[bot]" },
          body: "",
          state: "APPROVED",
          submittedAt: "2026-05-10T00:00:00Z",
          commit: { oid: "abc1234" },
        },
      ],
    });
    const tag = classifyPr(facts, EMPTY_CTX).find((t) => t.name === "bot-only-approval");
    assert.ok(tag, "bot-only-approval should fire");
    assert.equal(tag?.source, "gh.reviewDecision+latestReviews");
  });

  it("does not fire when a human APPROVED review is present alongside the bot one", () => {
    const facts = makeFacts({
      reviewDecision: "APPROVED",
      reviews: [
        {
          author: { login: "looper[bot]" },
          body: "",
          state: "APPROVED",
          submittedAt: "2026-05-10T00:00:00Z",
          commit: { oid: "abc1234" },
        },
        {
          author: { login: "alice" },
          body: "lgtm",
          state: "APPROVED",
          submittedAt: "2026-05-10T00:01:00Z",
          commit: { oid: "abc1234" },
        },
      ],
    });
    const tag = classifyPr(facts, EMPTY_CTX).find((t) => t.name === "bot-only-approval");
    assert.equal(tag, undefined);
  });
});

describe("tagDuplicateTitle", () => {
  it("fires when the same author has another open PR with the byte-for-byte title", () => {
    const ctx = {
      titleIndexByAuthor: new Map<string, number[]>([
        ["alice test PR", [1, 7]],
      ]),
    };
    const facts = makeFacts({ number: 1, author: "alice", title: "test PR" });
    const tag = classifyPr(facts, ctx).find((t) => t.name === "duplicate-title");
    assert.ok(tag, "duplicate-title should fire");
    assert.match(tag?.reason ?? "", /#7/);
  });

  it("does not fire when the title appears only on the current PR", () => {
    const ctx = {
      titleIndexByAuthor: new Map<string, number[]>([
        ["alice test PR", [1]],
      ]),
    };
    const facts = makeFacts({ number: 1, author: "alice", title: "test PR" });
    const tag = classifyPr(facts, ctx).find((t) => t.name === "duplicate-title");
    assert.equal(tag, undefined);
  });
});

describe("tagUnlabeled", () => {
  it("fires when none of the required label prefixes are present", () => {
    const facts = makeFacts({ labels: [] });
    const tag = classifyPr(facts, EMPTY_CTX).find((t) => t.name === "unlabeled");
    assert.ok(tag, "unlabeled should fire");
    assert.match(tag?.reason ?? "", /size\//);
    assert.match(tag?.reason ?? "", /risk\//);
    assert.match(tag?.reason ?? "", /type\//);
  });

  it("fires when one of the required prefixes is missing", () => {
    const facts = makeFacts({
      labels: [{ name: "size/S" }, { name: "risk/low" }],
    });
    const tag = classifyPr(facts, EMPTY_CTX).find((t) => t.name === "unlabeled");
    assert.ok(tag, "unlabeled should fire for missing type/");
    assert.match(tag?.reason ?? "", /type\//);
  });

  it("does not fire when all three required prefixes are present", () => {
    const facts = makeFacts({
      labels: [
        { name: "size/M" },
        { name: "risk/medium" },
        { name: "type/feature" },
      ],
    });
    const tag = classifyPr(facts, EMPTY_CTX).find((t) => t.name === "unlabeled");
    assert.equal(tag, undefined);
  });
});

describe("tagNonAsciiSlug", () => {
  it("fires when a design-system slug contains non-ASCII characters", () => {
    const facts = makeFacts({
      filePaths: ["design-systems/品牌/DESIGN.md"],
    });
    const tag = classifyPr(facts, EMPTY_CTX).find((t) => t.name === "non-ascii-slug");
    assert.ok(tag, "non-ascii-slug should fire");
    assert.match(tag?.reason ?? "", /品牌/);
  });

  it("does not fire for an ASCII-only design-system slug", () => {
    const facts = makeFacts({
      filePaths: ["design-systems/nexu/DESIGN.md"],
    });
    const tag = classifyPr(facts, EMPTY_CTX).find((t) => t.name === "non-ascii-slug");
    assert.equal(tag, undefined);
  });

  it("does not fire when the PR has no design-system paths at all", () => {
    const facts = makeFacts({ filePaths: ["apps/web/src/foo.ts"] });
    const tag = classifyPr(facts, EMPTY_CTX).find((t) => t.name === "non-ascii-slug");
    assert.equal(tag, undefined);
  });
});
