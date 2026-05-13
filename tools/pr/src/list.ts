/**
 * `tools-pr list` — triage queue scan.
 *
 * Classifies open PRs into review-state buckets (merge-ready, needs-rebase,
 * changes-requested, new, stale, draft, approved-blocked) and lanes derived
 * from touched paths. Outputs a grouped human report or JSON.
 */

import { isBotOnlyApproval, reduceLatestReviewsByAuthor } from "./bot.js";
import { daysSince, fetchOpenPrs, labelByPrefix } from "./gh.js";
import { deriveForbidden, deriveLane } from "./lane.js";
import type {
  Bucket,
  GhFiles,
  GhMeta,
  GhReviewsLite,
  GhStats,
  Lane,
  Pr,
} from "./types.js";

const BUCKET_ORDER: Bucket[] = [
  "merge-ready",
  "approved-blocked",
  "needs-rebase",
  "changes-requested",
  "new",
  "stale",
  "draft",
];

const LANE_ORDER: Lane[] = [
  "contract",
  "default",
  "skill",
  "design-system",
  "craft",
  "docs",
  "multi",
  "unknown",
];

function deriveBucket(args: {
  isDraft: boolean;
  reviewDecision: GhMeta["reviewDecision"];
  mergeStateStatus: GhStats["mergeStateStatus"];
  staleDays: number;
}): Bucket {
  if (args.isDraft) return "draft";
  if (args.reviewDecision === "APPROVED") {
    if (args.mergeStateStatus === "CLEAN" || args.mergeStateStatus === "UNSTABLE") return "merge-ready";
    return "approved-blocked";
  }
  if (args.mergeStateStatus === "DIRTY" || args.mergeStateStatus === "BEHIND") return "needs-rebase";
  if (args.reviewDecision === "CHANGES_REQUESTED") return "changes-requested";
  if (args.staleDays > 14) return "stale";
  return "new";
}

function classify(input: {
  meta: GhMeta[];
  stats: GhStats[];
  files: GhFiles[];
  reviews: GhReviewsLite[];
}): Pr[] {
  const now = Date.now();
  const statsByNum = new Map(input.stats.map((row) => [row.number, row] as const));
  const filesByNum = new Map(input.files.map((row) => [row.number, row] as const));
  const reviewsByNum = new Map(input.reviews.map((row) => [row.number, row] as const));

  return input.meta.map((meta) => {
    const stats = statsByNum.get(meta.number);
    const filesRow = filesByNum.get(meta.number);
    const reviewsRow = reviewsByNum.get(meta.number);
    const paths = filesRow ? filesRow.files.map((file) => file.path) : [];
    const { lane, hits } = deriveLane(paths);
    const ageDays = daysSince(meta.createdAt, now);
    const staleDays = daysSince(meta.updatedAt, now);
    const bucket = deriveBucket({
      isDraft: meta.isDraft,
      reviewDecision: meta.reviewDecision,
      mergeStateStatus: stats?.mergeStateStatus ?? "UNKNOWN",
      staleDays,
    });
    const latestPerReviewer = reviewsRow
      ? reduceLatestReviewsByAuthor(reviewsRow.reviews)
      : [];
    const botOnlyApproval = isBotOnlyApproval(meta.reviewDecision, latestPerReviewer);
    return {
      number: meta.number,
      title: meta.title,
      author: meta.author.login,
      ageDays,
      staleDays,
      isDraft: meta.isDraft,
      reviewDecision: meta.reviewDecision,
      mergeStateStatus: stats?.mergeStateStatus ?? "UNKNOWN",
      size: labelByPrefix(meta.labels, "size/"),
      risk: labelByPrefix(meta.labels, "risk/"),
      type: labelByPrefix(meta.labels, "type/"),
      changedFiles: stats?.changedFiles ?? 0,
      additions: stats?.additions ?? 0,
      deletions: stats?.deletions ?? 0,
      headRefName: stats?.headRefName ?? "",
      baseRefName: stats?.baseRefName ?? "main",
      lane,
      laneHits: hits,
      forbidden: deriveForbidden(paths),
      bucket,
      botOnlyApproval,
    };
  });
}

function laneTag(lane: Lane): string {
  switch (lane) {
    case "contract": return "CONTRACT";
    case "skill": return "SKILL";
    case "design-system": return "DSGN-SYS";
    case "craft": return "CRAFT";
    case "docs": return "DOCS";
    case "multi": return "MULTI";
    case "default": return "DEFAULT";
    case "unknown": return "UNKNOWN";
  }
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : `${s.slice(0, n - 1)}…`;
}

function formatHumanRow(pr: Pr): string {
  const flags = [
    pr.risk ? `risk:${pr.risk[0]}` : null,
    pr.size ? `sz:${pr.size}` : null,
    pr.type ? `t:${pr.type}` : null,
    pr.forbidden.length > 0 ? `forbid:${pr.forbidden.length}` : null,
    pr.botOnlyApproval ? "bot-only" : null,
  ]
    .filter((v): v is string => v !== null)
    .join(" ");
  const num = String(pr.number).padStart(4, " ");
  const lane = laneTag(pr.lane).padEnd(8, " ");
  const age = `${String(pr.ageDays).padStart(2, " ")}d/${String(pr.staleDays).padStart(2, " ")}d`;
  const author = truncate(pr.author, 16).padEnd(16, " ");
  const title = truncate(pr.title, 64);
  return `  #${num}  ${lane}  ${age}  ${author}  ${flags.padEnd(34, " ")}  ${title}`;
}

function formatHumanReport(prs: Pr[], total: number): string {
  const byBucket = new Map<Bucket, Pr[]>();
  for (const pr of prs) {
    const list = byBucket.get(pr.bucket) ?? [];
    list.push(pr);
    byBucket.set(pr.bucket, list);
  }

  const lines: string[] = [];
  const countLine =
    prs.length === total
      ? `open-design PR triage — ${total} open PRs`
      : `open-design PR triage — showing ${prs.length} of ${total} open PRs`;
  lines.push(countLine);
  lines.push("");

  for (const bucket of BUCKET_ORDER) {
    const inBucket = byBucket.get(bucket);
    if (!inBucket || inBucket.length === 0) continue;
    lines.push(`▌ ${bucket}  (${inBucket.length})`);

    inBucket.sort((a, b) => {
      const laneDelta = LANE_ORDER.indexOf(a.lane) - LANE_ORDER.indexOf(b.lane);
      if (laneDelta !== 0) return laneDelta;
      return a.staleDays - b.staleDays;
    });

    for (const pr of inBucket) lines.push(formatHumanRow(pr));
    lines.push("");
  }

  const forbiddenPrs = prs.filter((pr) => pr.forbidden.length > 0);
  if (forbiddenPrs.length > 0) {
    lines.push(`▌ forbidden-surface hits  (${forbiddenPrs.length})`);
    for (const pr of forbiddenPrs) {
      lines.push(`  #${pr.number}  ${pr.forbidden.join(", ")}  ${truncate(pr.title, 60)}`);
    }
    lines.push("");
  }

  const botOnly = prs.filter((pr) => pr.botOnlyApproval);
  if (botOnly.length > 0) {
    lines.push(`▌ bot-only approval  (${botOnly.length})`);
    lines.push("  reviewDecision=APPROVED, but every APPROVED review is bot-authored");
    for (const pr of botOnly) {
      lines.push(`  #${pr.number}  ${truncate(pr.title, 70)}`);
    }
    lines.push("");
  }

  lines.push("legend:  age = created/updated days ago   lane = derived from touched paths");
  lines.push("         risk / sz / t = gh label values (size/, risk/, type/ prefixes)");
  lines.push("         forbid:N = N path matches against AGENTS.md §Forbidden surfaces");
  lines.push("         bot-only = reviewDecision=APPROVED and every APPROVED review is bot-authored");
  return lines.join("\n");
}

export type ListOptions = {
  json?: boolean;
  includeDrafts?: boolean;
  limit?: number | string;
  lane?: string;
  bucket?: string;
  author?: string;
};

type Filters = {
  lanes?: Set<Lane>;
  buckets?: Set<Bucket>;
  authors?: Set<string>;
  includeDrafts: boolean;
};

function normalizeFilters(options: ListOptions): Filters {
  const filters: Filters = { includeDrafts: Boolean(options.includeDrafts) };
  if (options.lane) filters.lanes = new Set(options.lane.split(",") as Lane[]);
  if (options.bucket) filters.buckets = new Set(options.bucket.split(",") as Bucket[]);
  if (options.author) filters.authors = new Set(options.author.split(","));
  return filters;
}

function applyFilters(prs: Pr[], filters: Filters): Pr[] {
  return prs.filter((pr) => {
    if (!filters.includeDrafts && pr.isDraft) return false;
    if (filters.lanes && !filters.lanes.has(pr.lane)) return false;
    if (filters.buckets && !filters.buckets.has(pr.bucket)) return false;
    if (filters.authors && !filters.authors.has(pr.author)) return false;
    return true;
  });
}

export async function runList(options: ListOptions): Promise<void> {
  const limitRaw = options.limit;
  // Default is large enough to cover this repo's open queue plus growth
  // headroom; `gh pr list --limit N` paginates internally so high values
  // are cheap. Users can pass `--limit <small>` for a truncated preview.
  const limit = Math.max(1, Number(limitRaw ?? 1000) || 1000);
  const filters = normalizeFilters(options);

  const raw = await fetchOpenPrs(limit);
  const classified = classify(raw);
  const filtered = applyFilters(classified, filters);

  if (options.json) {
    const payload = filtered.map((pr) => ({ ...pr, laneHits: [...pr.laneHits] }));
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    return;
  }
  process.stdout.write(`${formatHumanReport(filtered, classified.length)}\n`);
}
