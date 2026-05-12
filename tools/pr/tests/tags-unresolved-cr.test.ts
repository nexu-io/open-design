/**
 * Pins the two emission paths of `unresolved-changes-requested` after the
 * primary `gh.latestReviews[].state` rule grew a `gh.reviewDecision` fallback.
 *
 * Patrol on the live 102-PR queue surfaced three PRs (#1101, #1127, #1163)
 * where GitHub's PR-level `reviewDecision` was CHANGES_REQUESTED but the
 * latest-per-author reduction of fetched reviews carried none — the primary
 * rule alone missed them. The fallback now picks them up, and these cases
 * make sure a future refactor of either path can't silently regress that
 * coverage.
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

describe("unresolved-changes-requested — primary path", () => {
  it("fires with gh.latestReviews[].state source when a reviewer's latest review is CHANGES_REQUESTED", () => {
    const facts = makeFacts({
      reviewDecision: "CHANGES_REQUESTED",
      reviews: [
        {
          author: { login: "bob" },
          body: "needs changes",
          state: "CHANGES_REQUESTED",
          submittedAt: "2026-05-10T01:00:00Z",
        },
      ],
    });
    const tags = classifyPr(facts, EMPTY_CTX);
    const tag = tags.find((t) => t.name === "unresolved-changes-requested");
    assert.ok(tag, "unresolved-changes-requested should fire");
    assert.equal(tag?.source, "gh.latestReviews[].state");
    assert.match(tag?.reason ?? "", /bob/);
  });
});

describe("unresolved-changes-requested — fallback path", () => {
  it("fires with gh.reviewDecision source when reviewDecision is CHANGES_REQUESTED but no per-reviewer CR survives reduction", () => {
    const facts = makeFacts({
      reviewDecision: "CHANGES_REQUESTED",
      // bob's latest is COMMENTED — GitHub's reviewDecision still reports
      // CHANGES_REQUESTED (only APPROVED / DISMISSED supersedes per-reviewer
      // CR), but the per-reviewer rule sees no CR after reduction.
      reviews: [
        {
          author: { login: "bob" },
          body: "",
          state: "COMMENTED",
          submittedAt: "2026-05-10T02:00:00Z",
        },
      ],
    });
    const tags = classifyPr(facts, EMPTY_CTX);
    const tag = tags.find((t) => t.name === "unresolved-changes-requested");
    assert.ok(tag, "fallback should fire");
    assert.equal(tag?.source, "gh.reviewDecision");
  });

  it("fires with gh.reviewDecision source when reviews array is empty and reviewDecision is CHANGES_REQUESTED (e.g. CR outside the reviews(last:30) window)", () => {
    const facts = makeFacts({
      reviewDecision: "CHANGES_REQUESTED",
      reviews: [],
    });
    const tags = classifyPr(facts, EMPTY_CTX);
    const tag = tags.find((t) => t.name === "unresolved-changes-requested");
    assert.ok(tag, "fallback should fire on empty reviews");
    assert.equal(tag?.source, "gh.reviewDecision");
  });
});

describe("unresolved-changes-requested — primary wins when both paths qualify", () => {
  it("emits the per-reviewer-source tag, not the fallback, when both signals are present", () => {
    const facts = makeFacts({
      reviewDecision: "CHANGES_REQUESTED",
      reviews: [
        {
          author: { login: "bob" },
          body: "needs changes",
          state: "CHANGES_REQUESTED",
          submittedAt: "2026-05-10T01:00:00Z",
        },
      ],
    });
    const tags = classifyPr(facts, EMPTY_CTX);
    const matches = tags.filter((t) => t.name === "unresolved-changes-requested");
    assert.equal(matches.length, 1, "tag should be emitted exactly once");
    assert.equal(matches[0]?.source, "gh.latestReviews[].state");
  });
});

describe("unresolved-changes-requested — negative cases", () => {
  it("does not fire when reviewDecision is empty and no per-reviewer CR exists", () => {
    const facts = makeFacts({
      reviewDecision: "",
      reviews: [
        {
          author: { login: "bob" },
          body: "looks good",
          state: "COMMENTED",
          submittedAt: "2026-05-10T01:00:00Z",
        },
      ],
    });
    const tags = classifyPr(facts, EMPTY_CTX);
    assert.equal(
      tags.find((t) => t.name === "unresolved-changes-requested"),
      undefined,
    );
  });

  it("does not fire when reviewDecision is APPROVED", () => {
    const facts = makeFacts({
      reviewDecision: "APPROVED",
      reviews: [
        {
          author: { login: "bob" },
          body: "lgtm",
          state: "APPROVED",
          submittedAt: "2026-05-10T01:00:00Z",
          commit: { oid: "abc1234" },
        },
      ],
    });
    const tags = classifyPr(facts, EMPTY_CTX);
    assert.equal(
      tags.find((t) => t.name === "unresolved-changes-requested"),
      undefined,
    );
  });
});
