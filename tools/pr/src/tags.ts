/**
 * `tools-pr classify` tag detectors.
 *
 * Every detector returns either a Tag (fact + reason + source token) or
 * null. Rules track this repo's AGENTS.md and code-review-guidelines.md;
 * no judgment language enters the output. See
 * `tools/pr/AGENTS.md` for the v1 tag dictionary.
 */

import { isBotAuthored, isBotOnlyApproval } from "./bot.js";
import { deriveForbidden, deriveLane, DESIGN_DIR } from "./lane.js";
import type { ClassifyContext, PrFacts, Tag } from "./types.js";

const AWAITING_THRESHOLD_HOURS = 24;
const HOUR_MS = 60 * 60 * 1000;

// ---- detectors ----------------------------------------------------------

function tagBotOnlyApproval(facts: PrFacts): Tag | null {
  if (!isBotOnlyApproval(facts.reviewDecision, facts.reviews)) return null;
  return {
    name: "bot-only-approval",
    reason: "reviewDecision=APPROVED; every APPROVED review is bot-authored",
    source: "gh.reviewDecision+latestReviews",
  };
}

function tagNeedsRebase(facts: PrFacts): Tag | null {
  if (facts.mergeStateStatus === "DIRTY" || facts.mergeStateStatus === "BEHIND") {
    return {
      name: "needs-rebase",
      reason: `mergeStateStatus=${facts.mergeStateStatus}`,
      source: "gh.mergeStateStatus",
    };
  }
  return null;
}

function tagForbiddenSurface(facts: PrFacts): Tag | null {
  const hits = deriveForbidden(facts.filePaths);
  if (hits.length === 0) return null;
  return {
    name: "forbidden-surface",
    reason: `path matches AGENTS.md §Forbidden surfaces: ${hits.join(", ")}`,
    source: "files+lane.deriveForbidden",
  };
}

function tagUnlabeled(facts: PrFacts): Tag | null {
  const names = facts.labels.map((label) => label.name);
  const missing: string[] = [];
  if (!names.some((n) => n.startsWith("size/"))) missing.push("size/");
  if (!names.some((n) => n.startsWith("risk/"))) missing.push("risk/");
  if (!names.some((n) => n.startsWith("type/"))) missing.push("type/");
  if (missing.length === 0) return null;
  return {
    name: "unlabeled",
    reason: `missing label prefixes: ${missing.join(", ")}`,
    source: "gh.labels",
  };
}

function tagDuplicateTitle(facts: PrFacts, ctx: ClassifyContext): Tag | null {
  const key = `${facts.author}\u0000${facts.title}`;
  const siblings = ctx.titleIndexByAuthor.get(key);
  if (!siblings || siblings.length < 2) return null;
  const others = siblings.filter((n) => n !== facts.number);
  if (others.length === 0) return null;
  return {
    name: "duplicate-title",
    reason: `same author has another open PR(s) with byte-for-byte title: #${others.join(", #")}`,
    source: "cross-pr.titleIndexByAuthor",
  };
}

const ASCII_SLUG = /^[a-z0-9-]+$/;

function tagNonAsciiSlug(facts: PrFacts): Tag | null {
  const { lane, hits } = deriveLane(facts.filePaths);
  if (lane !== "design-system" && !hits.has("design-system")) return null;
  const slugs = new Set(
    facts.filePaths
      .filter((p) => DESIGN_DIR.test(p))
      .map((p) => p.split("/")[1])
      .filter((s): s is string => typeof s === "string"),
  );
  const offenders = [...slugs].filter((s) => !ASCII_SLUG.test(s));
  if (offenders.length === 0) return null;
  return {
    name: "non-ascii-slug",
    reason: `design-system slug fails /^[a-z0-9-]+$/: ${offenders.join(", ")}`,
    source: "files+lane.DESIGN_DIR",
  };
}

function tagMaintainerEditsDisabled(facts: PrFacts): Tag | null {
  if (facts.maintainerCanModify) return null;
  return {
    name: "maintainer-edits-disabled",
    reason: "maintainerCanModify=false on the fork — maintainers cannot push to the PR branch",
    source: "gh.maintainerCanModify",
  };
}

function tagOrgMember(facts: PrFacts): Tag | null {
  if (!facts.isOrgMember) return null;
  return {
    name: "org-member",
    reason: `author ${facts.author} is a member of the repo's org`,
    source: "gh api orgs/<org>/members",
  };
}

function tagUnresolvedChangesRequested(facts: PrFacts): Tag | null {
  const reviewers = facts.reviews
    .filter((r) => r.state === "CHANGES_REQUESTED" && r.author?.login)
    .map((r) => r.author?.login)
    .filter((login): login is string => typeof login === "string");
  if (reviewers.length === 0) return null;
  return {
    name: "unresolved-changes-requested",
    reason: `latestReviews carries CHANGES_REQUESTED from: ${[...new Set(reviewers)].join(", ")}`,
    source: "gh.latestReviews[].state",
  };
}

function tagStaleApproval(facts: PrFacts): Tag | null {
  if (!facts.headRefOid) return null;
  const stale = facts.reviews
    .filter((r) => r.state === "APPROVED")
    .map((r) => {
      const oid = r.commit?.oid;
      if (!oid || oid.length === 0) return null;
      if (oid === facts.headRefOid) return null;
      return { login: r.author?.login ?? "(unknown)", oid };
    })
    .filter((entry): entry is { login: string; oid: string } => entry !== null);
  if (stale.length === 0) return null;
  const summary = stale
    .map((entry) => `${entry.login}@${entry.oid.slice(0, 7)}`)
    .join(", ");
  return {
    name: "stale-approval",
    reason: `APPROVED review(s) at ${summary} predate current head ${facts.headRefOid.slice(0, 7)}`,
    source: "gh.latestReviews[].commit.oid+gh.headRefOid",
  };
}

// ---- timing detectors ---------------------------------------------------

function authorSignalAt(facts: PrFacts): number | null {
  const author = facts.author;
  let max: number | null = null;
  for (const c of facts.commits) {
    // On maintainerCanModify=true PRs a maintainer can push a follow-up
    // commit. Counting that as an author signal would flip
    // `awaiting-author-response-*` off even though the author never replied.
    if (c.authorLogin !== author) continue;
    const t = Date.parse(c.committedDate);
    if (Number.isFinite(t) && (max === null || t > max)) max = t;
  }
  for (const cmt of facts.comments) {
    if (cmt.author?.login !== author) continue;
    const t = Date.parse(cmt.createdAt);
    if (Number.isFinite(t) && (max === null || t > max)) max = t;
  }
  return max;
}

function humanReviewerSignalAt(facts: PrFacts): number | null {
  const author = facts.author;
  let max: number | null = null;
  for (const r of facts.reviews) {
    const login = r.author?.login;
    if (!login || login === author) continue;
    if (isBotAuthored(r.author, r.body)) continue;
    const t = Date.parse(r.submittedAt);
    if (Number.isFinite(t) && (max === null || t > max)) max = t;
  }
  for (const c of facts.comments) {
    const login = c.author?.login;
    if (!login || login === author) continue;
    if (isBotAuthored(c.author, c.body)) continue;
    const t = Date.parse(c.createdAt);
    if (Number.isFinite(t) && (max === null || t > max)) max = t;
  }
  return max;
}

function tagAwaitingAuthorResponse(facts: PrFacts): Tag | null {
  const reviewer = humanReviewerSignalAt(facts);
  const author = authorSignalAt(facts);
  if (reviewer === null || author === null) return null;
  if (reviewer <= author) return null;
  const gapHours = Math.floor((Date.now() - reviewer) / HOUR_MS);
  if (gapHours < AWAITING_THRESHOLD_HOURS) return null;
  return {
    name: `awaiting-author-response-${AWAITING_THRESHOLD_HOURS}h`,
    reason: `latest human-reviewer signal (${new Date(reviewer).toISOString()}) is ${gapHours}h ago and newer than latest author signal (${new Date(author).toISOString()})`,
    source: "latestReviews+comments+commits",
    awaitingHours: gapHours,
  };
}

function tagAwaitingReviewerResponse(facts: PrFacts): Tag | null {
  const reviewer = humanReviewerSignalAt(facts);
  const author = authorSignalAt(facts);
  if (reviewer === null || author === null) return null;
  if (author <= reviewer) return null;
  const gapHours = Math.floor((Date.now() - author) / HOUR_MS);
  if (gapHours < AWAITING_THRESHOLD_HOURS) return null;
  return {
    name: `awaiting-reviewer-response-${AWAITING_THRESHOLD_HOURS}h`,
    reason: `latest author signal (${new Date(author).toISOString()}) is ${gapHours}h ago and newer than latest human-reviewer signal (${new Date(reviewer).toISOString()})`,
    source: "latestReviews+comments+commits",
    awaitingHours: gapHours,
  };
}

function tagAwaitingFirstReview(facts: PrFacts): Tag | null {
  const reviewer = humanReviewerSignalAt(facts);
  if (reviewer !== null) return null;
  const createdAt = Date.parse(facts.createdAt);
  if (!Number.isFinite(createdAt)) return null;
  const ageHours = Math.floor((Date.now() - createdAt) / HOUR_MS);
  if (ageHours < AWAITING_THRESHOLD_HOURS) return null;
  return {
    name: `awaiting-first-review-${AWAITING_THRESHOLD_HOURS}h`,
    reason: `no human review or non-author non-bot comment exists; createdAt is ${ageHours}h ago`,
    source: "latestReviews+comments+createdAt",
    awaitingHours: ageHours,
  };
}

// ---- orchestrator -------------------------------------------------------

const DETECTORS: ReadonlyArray<(facts: PrFacts, ctx: ClassifyContext) => Tag | null> = [
  tagBotOnlyApproval,
  tagNeedsRebase,
  tagForbiddenSurface,
  tagUnlabeled,
  tagDuplicateTitle,
  tagNonAsciiSlug,
  tagMaintainerEditsDisabled,
  tagOrgMember,
  tagUnresolvedChangesRequested,
  tagStaleApproval,
  tagAwaitingAuthorResponse,
  tagAwaitingReviewerResponse,
  tagAwaitingFirstReview,
];

export function classifyPr(facts: PrFacts, ctx: ClassifyContext): Tag[] {
  const out: Tag[] = [];
  for (const detector of DETECTORS) {
    const tag = detector(facts, ctx);
    if (tag !== null) out.push(tag);
  }
  return out;
}

export function buildContext(allFacts: PrFacts[]): ClassifyContext {
  const titleIndexByAuthor = new Map<string, number[]>();
  for (const facts of allFacts) {
    const key = `${facts.author}\u0000${facts.title}`;
    const existing = titleIndexByAuthor.get(key);
    if (existing) existing.push(facts.number);
    else titleIndexByAuthor.set(key, [facts.number]);
  }
  return { titleIndexByAuthor };
}

export const KNOWN_TAGS: readonly string[] = [
  "bot-only-approval",
  "needs-rebase",
  "forbidden-surface",
  "unlabeled",
  "duplicate-title",
  "non-ascii-slug",
  "maintainer-edits-disabled",
  "org-member",
  "unresolved-changes-requested",
  "stale-approval",
  `awaiting-author-response-${AWAITING_THRESHOLD_HOURS}h`,
  `awaiting-reviewer-response-${AWAITING_THRESHOLD_HOURS}h`,
  `awaiting-first-review-${AWAITING_THRESHOLD_HOURS}h`,
] as const;
