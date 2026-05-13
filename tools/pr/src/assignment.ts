/**
 * `tools-pr assignment` — assigner-perspective view of PR ownership.
 *
 * For each currently-assigned PR, surfaces who owns it, when they were
 * assigned (and by whom), how long it has been idle, and the assignment's
 * progress / blocker status as derived from the existing classify tag set.
 *
 * Read-only aggregation: no new tags, no new judgments. Status strings
 * compose existing tag facts (`needs-rebase`, `awaiting-*`, `bot-only-
 * approval`, etc.) — see `tools/pr/AGENTS.md` §Tag dictionary.
 */

import { reduceLatestReviewsByAuthor } from "./bot.js";
import {
  detectRepoSlug,
  fetchCurrentUser,
  fetchOpenPrAssignmentTimelines,
  fetchOpenPrs,
  fetchOrgMembers,
} from "./gh.js";
import { buildContext, classifyPr } from "./tags.js";
import type {
  ClassifyContext,
  GhAssignmentEvent,
  GhAssignmentTimeline,
  PrFacts,
  Tag,
} from "./types.js";

// ---- per-assignment derived shape ---------------------------------------

type AssignmentEntry = {
  number: number;
  title: string;
  assignee: string;
  assignedAt: string | null;
  assignedBy: string | null;
  selfAssigned: boolean;
  /** Hours since the assignment record (null if no event in fetched window). */
  assignedHoursAgo: number | null;
  /** Most recent moment the assignee took action on the PR (commit/comment/review),
   *  bounded below by assignedAt. Null when assignedAt is also null and there's
   *  no recorded activity. */
  idleSinceAt: string | null;
  idleHours: number | null;
  /** Compact state badges (REVIEW_REQUIRED, CHANGES_REQUESTED, DIRTY, etc.). */
  stateBadges: string[];
  /** Status line — one of "ready to merge", "blocked: ...", "in review". */
  status: string;
  /** Blocker bullet lines drawn from the tag set. Empty for non-blocked PRs. */
  blockers: string[];
  /** Raw tags present on the PR for downstream JSON consumption. */
  tags: Tag[];
  isDraft: boolean;
};

type AssignmentReport = {
  generatedAt: string;
  openPrTotal: number;
  assignedCount: number;
  unassignedCount: number;
  byAssignee: Record<string, AssignmentEntry[]>;
  unassigned: Array<{
    number: number;
    title: string;
    stateBadges: string[];
    status: string;
    blockers: string[];
    isDraft: boolean;
  }>;
};

// ---- derivation helpers -------------------------------------------------

const HOUR_MS = 60 * 60 * 1000;

function hoursBetween(fromIso: string, now: number): number {
  return Math.floor((now - Date.parse(fromIso)) / HOUR_MS);
}

function formatDuration(hours: number | null): string {
  if (hours === null) return "(unknown)";
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  const rem = hours - days * 24;
  return rem === 0 ? `${days}d` : `${days}d ${rem}h`;
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : `${s.slice(0, n - 1)}…`;
}

/**
 * Walks the timeline events chronologically and tracks the latest
 * ASSIGNED_EVENT per login that has not been superseded by an
 * UNASSIGNED_EVENT for that login. Returns a map keyed by assignee login.
 */
function indexAssignmentEvents(
  events: ReadonlyArray<GhAssignmentEvent>,
): Map<string, GhAssignmentEvent> {
  const sorted = [...events].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const map = new Map<string, GhAssignmentEvent>();
  for (const event of sorted) {
    const login = event.assignee?.login;
    if (!login) continue;
    if (event.kind === "ASSIGNED") {
      map.set(login, event);
    } else {
      map.delete(login);
    }
  }
  return map;
}

function lastAssigneeActivityAt(facts: PrFacts, assignee: string): string | null {
  let latest: number | null = null;
  const consider = (iso: string) => {
    const t = Date.parse(iso);
    if (Number.isFinite(t) && (latest === null || t > latest)) latest = t;
  };
  for (const c of facts.commits) {
    if (c.authorLogin === assignee) consider(c.committedDate);
  }
  for (const cmt of facts.comments) {
    if (cmt.author?.login === assignee) consider(cmt.createdAt);
  }
  for (const r of facts.reviews) {
    if (r.author?.login === assignee) consider(r.submittedAt);
  }
  return latest === null ? null : new Date(latest).toISOString();
}

function deriveStateBadges(facts: PrFacts): string[] {
  const badges: string[] = [];
  badges.push(facts.reviewDecision || "REVIEW_REQUIRED");
  if (facts.mergeStateStatus !== "CLEAN" && facts.mergeStateStatus !== "UNKNOWN") {
    badges.push(facts.mergeStateStatus);
  }
  if (facts.isDraft) badges.push("draft");
  return badges;
}

/**
 * Translates the existing tag set + PR metadata into a status line + blocker
 * bullets. Status precedence (when multiple apply): blockers → bot-only-
 * approval → ready-to-merge → in review.
 *
 * `ready to merge` requires `reviewDecision === "APPROVED"` and
 * `mergeStateStatus ∈ {CLEAN, UNSTABLE}` (UNSTABLE = mergeable but a non-
 * required check is failing — still actionable for the maintainer). Without
 * this branch, an APPROVED + CLEAN PR with a human reviewer renders the
 * same as a REVIEW_REQUIRED one, which drops the main triage signal.
 *
 * Each blocker bullet is a one-liner that carries the tag's `reason`
 * verbatim — no judgment language, no priority labels. The assigner can
 * scan the bullets and decide.
 */
function deriveStatus(
  tags: ReadonlyArray<Tag>,
  facts: PrFacts,
): { status: string; blockers: string[] } {
  const byName = new Map(tags.map((t) => [t.name, t] as const));
  const get = (name: string) => byName.get(name);

  const blockers: string[] = [];
  if (get("needs-rebase")) blockers.push("needs-rebase (main has moved)");
  const unresolved = get("unresolved-changes-requested");
  if (unresolved) blockers.push(unresolved.reason);
  const stale = get("stale-approval");
  if (stale) blockers.push(stale.reason);
  const awaitAuthor = get("awaiting-author-response-24h");
  if (awaitAuthor) blockers.push(`awaiting author for ${formatDuration(awaitAuthor.awaitingHours ?? null)}`);
  const awaitReviewer = get("awaiting-reviewer-response-24h");
  if (awaitReviewer) blockers.push(`awaiting reviewer for ${formatDuration(awaitReviewer.awaitingHours ?? null)}`);
  const awaitFirst = get("awaiting-first-review-24h");
  if (awaitFirst) blockers.push(`no human review yet (${formatDuration(awaitFirst.awaitingHours ?? null)} since createdAt)`);

  const mergeReadyState =
    facts.reviewDecision === "APPROVED" &&
    (facts.mergeStateStatus === "CLEAN" || facts.mergeStateStatus === "UNSTABLE");

  let status: string;
  if (blockers.length > 0) {
    status = "blocked";
  } else if (get("bot-only-approval")) {
    status = "approved (bot-only — no human formal sign-off)";
  } else if (mergeReadyState) {
    status = "ready to merge";
  } else {
    status = "in review";
  }
  return { status, blockers };
}

function buildAssignmentEntries(
  facts: PrFacts,
  events: ReadonlyArray<GhAssignmentEvent>,
  tags: ReadonlyArray<Tag>,
  now: number,
): AssignmentEntry[] {
  const eventIndex = indexAssignmentEvents(events);
  const stateBadges = deriveStateBadges(facts);
  const { status, blockers } = deriveStatus(tags, facts);

  return facts.assignees.map((assignee) => {
    const event = eventIndex.get(assignee) ?? null;
    const assignedAt = event?.createdAt ?? null;
    const assignedBy = event?.actor?.login ?? null;
    const selfAssigned = assignedBy !== null && assignedBy === assignee;
    const assignedHoursAgo = assignedAt === null ? null : hoursBetween(assignedAt, now);

    const lastActivity = lastAssigneeActivityAt(facts, assignee);
    let idleSinceAt: string | null = null;
    if (assignedAt !== null && lastActivity !== null) {
      idleSinceAt =
        Date.parse(assignedAt) > Date.parse(lastActivity) ? assignedAt : lastActivity;
    } else if (assignedAt !== null) {
      idleSinceAt = assignedAt;
    } else if (lastActivity !== null) {
      idleSinceAt = lastActivity;
    }
    const idleHours = idleSinceAt === null ? null : hoursBetween(idleSinceAt, now);

    return {
      number: facts.number,
      title: facts.title,
      assignee,
      assignedAt,
      assignedBy,
      selfAssigned,
      assignedHoursAgo,
      idleSinceAt,
      idleHours,
      stateBadges,
      status,
      blockers,
      tags: [...tags],
      isDraft: facts.isDraft,
    };
  });
}

// ---- report assembly ----------------------------------------------------

function buildReport(
  allFacts: PrFacts[],
  timelines: Map<number, ReadonlyArray<GhAssignmentEvent>>,
  ctx: ClassifyContext,
): AssignmentReport {
  const now = Date.now();
  const byAssignee: Record<string, AssignmentEntry[]> = {};
  const unassigned: AssignmentReport["unassigned"] = [];
  let assignedCount = 0;

  for (const facts of allFacts) {
    const events = timelines.get(facts.number) ?? [];
    const tags = classifyPr(facts, ctx);
    if (facts.assignees.length === 0) {
      const { status, blockers } = deriveStatus(tags, facts);
      unassigned.push({
        number: facts.number,
        title: facts.title,
        stateBadges: deriveStateBadges(facts),
        status,
        blockers,
        isDraft: facts.isDraft,
      });
      continue;
    }
    assignedCount += 1;
    const entries = buildAssignmentEntries(facts, events, tags, now);
    for (const entry of entries) {
      const bucket = byAssignee[entry.assignee] ?? [];
      bucket.push(entry);
      byAssignee[entry.assignee] = bucket;
    }
  }

  // Sort each assignee bucket by idle desc (most stale at top)
  for (const login of Object.keys(byAssignee)) {
    byAssignee[login]?.sort((a, b) => (b.idleHours ?? -1) - (a.idleHours ?? -1));
  }

  return {
    generatedAt: new Date().toISOString(),
    openPrTotal: allFacts.length,
    assignedCount,
    unassignedCount: unassigned.length,
    byAssignee,
    unassigned,
  };
}

// ---- formatting ---------------------------------------------------------

function formatHumanReport(
  report: AssignmentReport,
  options: { meLogin: string | null; showUnassignedDetail: boolean; userFilter: string | null },
): string {
  const lines: string[] = [];
  const header = `PR assignment overview — ${report.openPrTotal} open PRs · ${report.assignedCount} assigned · ${report.unassignedCount} unassigned`;
  lines.push(header);
  lines.push("");

  const buckets = Object.entries(report.byAssignee).sort((a, b) => {
    // me first, then by PR count desc, then alphabetic
    if (options.meLogin && a[0] === options.meLogin) return -1;
    if (options.meLogin && b[0] === options.meLogin) return 1;
    if (b[1].length !== a[1].length) return b[1].length - a[1].length;
    return a[0].localeCompare(b[0]);
  });

  for (const [login, entries] of buckets) {
    if (options.userFilter !== null && login !== options.userFilter) continue;
    const youTag = options.meLogin && login === options.meLogin ? " (you)" : "";
    lines.push(`▌ ${login}${youTag} · ${entries.length} PR${entries.length === 1 ? "" : "s"}`);
    lines.push("");
    for (const entry of entries) {
      const num = String(entry.number).padStart(5, " ");
      const title = truncate(entry.title, 64);
      const draftSuffix = entry.isDraft ? " [draft]" : "";
      lines.push(`  #${num}  ${title}${draftSuffix}`);
      const assignedAgo = entry.assignedHoursAgo === null
        ? "assignment > 20 timeline events ago (unknown exact time)"
        : `assigned ${formatDuration(entry.assignedHoursAgo)} ago`;
      const by = entry.assignedBy
        ? entry.selfAssigned
          ? " (self-assigned)"
          : ` by ${entry.assignedBy}`
        : "";
      const idle = entry.idleHours === null ? "" : ` · idle ${formatDuration(entry.idleHours)}`;
      lines.push(`         ${assignedAgo}${by}${idle}`);
      lines.push(`         state: ${entry.stateBadges.join(" · ")}`);
      lines.push(`         status: ${entry.status}`);
      for (const blocker of entry.blockers) lines.push(`           - ${blocker}`);
      lines.push("");
    }
  }

  if (options.userFilter === null) {
    if (options.showUnassignedDetail) {
      lines.push(`▌ (unassigned) · ${report.unassigned.length} PRs`);
      lines.push("");
      for (const entry of report.unassigned) {
        const num = String(entry.number).padStart(5, " ");
        const title = truncate(entry.title, 64);
        const draftSuffix = entry.isDraft ? " [draft]" : "";
        lines.push(`  #${num}  ${title}${draftSuffix}`);
        lines.push(`         state: ${entry.stateBadges.join(" · ")}  status: ${entry.status}`);
        for (const blocker of entry.blockers) lines.push(`           - ${blocker}`);
      }
      lines.push("");
    } else {
      lines.push(`▌ (unassigned) · ${report.unassignedCount} PRs`);
      lines.push("    → see \`tools-pr assignment --unassigned\` for the full list");
      lines.push("");
    }
  }

  return lines.join("\n");
}

// ---- command entry ------------------------------------------------------

export type AssignmentOptions = {
  json?: boolean;
  user?: string;
  unassigned?: boolean;
  includeDrafts?: boolean;
  limit?: number | string;
};

export async function runAssignment(options: AssignmentOptions): Promise<void> {
  // Default covers the whole open queue with growth headroom; `gh pr list`
  // paginates internally so a high cap is cheap.
  const limit = Math.max(1, Number(options.limit ?? 1000) || 1000);
  const { owner } = await detectRepoSlug();
  const userFilterRaw = options.user;
  const meLoginPromise = userFilterRaw === "me" ? fetchCurrentUser() : Promise.resolve(null);
  const [fetched, orgMembers, timelines, meLogin] = await Promise.all([
    fetchOpenPrs(limit, { includeCommits: true, includeComments: true }),
    fetchOrgMembers(owner),
    fetchOpenPrAssignmentTimelines(),
    meLoginPromise,
  ]);

  // Reuse classify's fact-building. Inline here to avoid a circular import.
  const statsBy = new Map(fetched.stats.map((row) => [row.number, row] as const));
  const filesBy = new Map(fetched.files.map((row) => [row.number, row] as const));
  const reviewsBy = new Map(fetched.reviews.map((row) => [row.number, row] as const));
  const commitsBy = new Map((fetched.commits ?? []).map((row) => [row.number, row] as const));
  const commentsBy = new Map((fetched.comments ?? []).map((row) => [row.number, row] as const));

  const allFacts: PrFacts[] = fetched.meta
    .filter((meta) => options.includeDrafts || !meta.isDraft)
    .map((meta) => {
      const stats = statsBy.get(meta.number);
      const filesRow = filesBy.get(meta.number);
      const reviewsRow = reviewsBy.get(meta.number);
      const commitsRow = commitsBy.get(meta.number);
      const commentsRow = commentsBy.get(meta.number);
      return {
        number: meta.number,
        author: meta.author.login,
        title: meta.title,
        createdAt: meta.createdAt,
        updatedAt: meta.updatedAt,
        isDraft: meta.isDraft,
        reviewDecision: meta.reviewDecision,
        mergeStateStatus: stats?.mergeStateStatus ?? "UNKNOWN",
        maintainerCanModify: meta.maintainerCanModify,
        isOrgMember: orgMembers.has(meta.author.login),
        headRefOid: stats?.headRefOid ?? "",
        assignees: meta.assignees.map((a) => a.login),
        labels: meta.labels,
        filePaths: filesRow ? filesRow.files.map((f) => f.path) : [],
        reviews: reviewsRow
          ? reduceLatestReviewsByAuthor(reviewsRow.reviews).map((r) => ({
              author: r.author,
              body: r.body,
              state: r.state,
              submittedAt: r.submittedAt,
              commit: r.commit ?? null,
            }))
          : [],
        comments: commentsRow ? commentsRow.comments : [],
        commits: commitsRow
          ? commitsRow.commits.map((c) => ({
              committedDate: c.committedDate,
              authorLogin: c.authors[0]?.login ?? null,
            }))
          : [],
      };
    });
  const ctx = buildContext(allFacts);

  const timelineMap = new Map<number, ReadonlyArray<GhAssignmentEvent>>();
  for (const t of timelines) timelineMap.set(t.number, t.events);

  const report = buildReport(allFacts, timelineMap, ctx);

  if (options.json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return;
  }

  // Resolve user filter for display: "me" expands to current login.
  let userFilter: string | null = null;
  if (userFilterRaw !== undefined) {
    userFilter = userFilterRaw === "me" ? meLogin : userFilterRaw;
  }

  process.stdout.write(
    `${formatHumanReport(report, {
      meLogin: meLogin,
      showUnassignedDetail: Boolean(options.unassigned),
      userFilter,
    })}\n`,
  );
}

