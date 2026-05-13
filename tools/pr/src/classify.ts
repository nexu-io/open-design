/**
 * `tools-pr classify` — emit script-level tags for one PR or the full open
 * queue. Output is strictly factual: each tag carries a name + factual
 * reason + source token; no severity, no judgment, no merge guidance.
 *
 * Tag dictionary lives in `tools/pr/src/tags.ts` and is documented in
 * `tools/pr/AGENTS.md` §Tag dictionary.
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { reduceLatestReviewsByAuthor } from "./bot.js";
import {
  detectRepoSlug,
  fetchOpenPrs,
  fetchOrgMembers,
  fetchRateLimit,
  fetchView,
  type FetchOpenPrsResult,
  type RateLimitSnapshot,
} from "./gh.js";
import { buildContext, classifyPr, KNOWN_TAGS } from "./tags.js";
import type {
  ClassifyContext,
  ClassifyReport,
  GhView,
  PrFacts,
  Tag,
} from "./types.js";

// ---- fact bridging -------------------------------------------------------

function factsFromList(input: FetchOpenPrsResult, orgMembers: ReadonlySet<string>): PrFacts[] {
  const statsBy = new Map(input.stats.map((row) => [row.number, row] as const));
  const filesBy = new Map(input.files.map((row) => [row.number, row] as const));
  const reviewsBy = new Map(input.reviews.map((row) => [row.number, row] as const));
  const commitsBy = new Map((input.commits ?? []).map((row) => [row.number, row] as const));
  const commentsBy = new Map((input.comments ?? []).map((row) => [row.number, row] as const));

  return input.meta.map((meta) => {
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
}

function factsFromView(num: number, view: GhView, orgMembers: ReadonlySet<string>): PrFacts {
  return {
    number: num,
    author: view.author.login,
    title: view.title,
    createdAt: view.createdAt,
    updatedAt: view.updatedAt,
    isDraft: view.isDraft,
    reviewDecision: view.reviewDecision,
    mergeStateStatus: view.mergeStateStatus,
    maintainerCanModify: view.maintainerCanModify,
    isOrgMember: orgMembers.has(view.author.login),
    headRefOid: view.headRefOid,
    assignees: view.assignees.map((a) => a.login),
    labels: view.labels,
    filePaths: view.files.map((f) => f.path),
    reviews: reduceLatestReviewsByAuthor(view.reviews).map((r) => ({
      author: r.author,
      body: r.body,
      state: r.state,
      submittedAt: r.submittedAt,
      commit: r.commit ?? null,
    })),
    comments: view.comments.map((c) => ({
      author: c.author,
      body: c.body,
      createdAt: c.createdAt,
    })),
    commits: view.commits.map((c) => ({
      committedDate: c.committedDate,
      authorLogin: c.authors[0]?.login ?? null,
    })),
  };
}

// ---- output paths --------------------------------------------------------

function timestampStem(): string {
  // YYYY-MM-DDTHHmmssZ — colon-free for filesystem portability
  const d = new Date();
  const iso = d.toISOString().replace(/[-:]/g, "").replace(/\..+/, "");
  // iso is "20260511T034500Z"; reinsert dashes for readability
  return `${iso.slice(0, 4)}-${iso.slice(4, 6)}-${iso.slice(6, 8)}T${iso.slice(9, 15)}Z`;
}

function classifyOutputDir(): string {
  // Per AGENTS.md §Default runtime files convention:
  // <project-root>/.tmp/<source>/...; we own `tools-pr` as our source slot.
  // import.meta.dirname is the dist directory when bundled; walk up to repo
  // root via dist/.. = tools/pr -> tools -> root.
  const here = import.meta.dirname;
  // when bundled: tools/pr/dist/index.mjs -> dirname = tools/pr/dist
  // when tsx-run: tools/pr/src/classify.ts -> dirname = tools/pr/src
  const repoRoot = path.resolve(here, "..", "..", "..");
  return path.join(repoRoot, ".tmp", "tools-pr", "classify");
}

// ---- report assembly -----------------------------------------------------

function buildReport(
  allFacts: PrFacts[],
  ctx: ClassifyContext,
  rateBefore: RateLimitSnapshot,
  rateAfter: RateLimitSnapshot,
): ClassifyReport {
  const byTag: Record<string, number[]> = {};
  const byNumber: Record<string, Tag[]> = {};
  for (const tagName of KNOWN_TAGS) byTag[tagName] = [];

  for (const facts of allFacts) {
    const tags = classifyPr(facts, ctx);
    byNumber[String(facts.number)] = tags;
    for (const tag of tags) {
      const bucket = byTag[tag.name] ?? [];
      bucket.push(facts.number);
      byTag[tag.name] = bucket;
    }
  }

  // Drop tag buckets that ended up empty so the JSON stays tight.
  for (const tagName of Object.keys(byTag)) {
    if ((byTag[tagName] ?? []).length === 0) delete byTag[tagName];
  }

  const cost =
    rateBefore.resetAt === rateAfter.resetAt
      ? rateBefore.remaining - rateAfter.remaining
      : null;

  return {
    generatedAt: new Date().toISOString(),
    openPrTotal: allFacts.length,
    classifiedCount: allFacts.length,
    byTag,
    byNumber,
    rate: {
      before: rateBefore,
      after: rateAfter,
      cost,
    },
  };
}

// ---- human single-PR output ---------------------------------------------

function formatAwaitingDuration(hours: number): string {
  const days = Math.floor(hours / 24);
  const rem = hours - days * 24;
  if (days === 0) return `${rem}h`;
  if (rem === 0) return `${days}d`;
  return `${days}d ${rem}h`;
}

function formatSinglePr(num: number, tags: Tag[]): string {
  const lines: string[] = [];
  lines.push(`PR #${num} — ${tags.length} tag${tags.length === 1 ? "" : "s"}`);
  if (tags.length === 0) {
    lines.push("  (no tags matched)");
  } else {
    for (const tag of tags) {
      const suffix =
        tag.awaitingHours !== undefined
          ? `  (awaiting ${formatAwaitingDuration(tag.awaitingHours)})`
          : "";
      lines.push(`  • ${tag.name}${suffix}`);
      lines.push(`      reason: ${tag.reason}`);
      lines.push(`      source: ${tag.source}`);
    }
  }
  return lines.join("\n");
}

// ---- command entries -----------------------------------------------------

export type ClassifyOptions = {
  json?: boolean;
  all?: boolean;
  name?: string;
  print?: boolean;
  limit?: number | string;
};

export async function runClassifyOne(num: number, options: ClassifyOptions): Promise<void> {
  if (!Number.isFinite(num) || num <= 0) {
    throw new Error("classify <num> requires a positive PR number");
  }
  const { owner } = await detectRepoSlug();
  const [view, orgMembers] = await Promise.all([fetchView(num), fetchOrgMembers(owner)]);
  const facts = factsFromView(num, view, orgMembers);
  // Single-PR mode has no cross-PR title corpus; duplicate-title cannot fire.
  const ctx: ClassifyContext = { titleIndexByAuthor: new Map() };
  const tags = classifyPr(facts, ctx);

  if (options.json) {
    process.stdout.write(`${JSON.stringify({ number: num, tags }, null, 2)}\n`);
    return;
  }
  process.stdout.write(`${formatSinglePr(num, tags)}\n`);
}

export async function runClassifyAll(options: ClassifyOptions): Promise<void> {
  // Default covers the whole open queue with growth headroom; `gh pr list`
  // paginates internally so a high cap is cheap.
  const limit = Math.max(1, Number(options.limit ?? 1000) || 1000);
  const { owner } = await detectRepoSlug();
  const rateBefore = await fetchRateLimit();
  const [fetched, orgMembers] = await Promise.all([
    fetchOpenPrs(limit, { includeCommits: true, includeComments: true }),
    fetchOrgMembers(owner),
  ]);
  const rateAfter = await fetchRateLimit();
  const allFacts = factsFromList(fetched, orgMembers);
  const ctx = buildContext(allFacts);
  const report = buildReport(allFacts, ctx, rateBefore, rateAfter);

  const dir = classifyOutputDir();
  await mkdir(dir, { recursive: true });
  const stem = options.name && options.name.length > 0 ? options.name : timestampStem();
  const outPath = path.join(dir, `${stem}.json`);
  await writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  const tagSummary = Object.entries(report.byTag)
    .map(([name, nums]) => `${name}=${nums.length}`)
    .join(" ");
  const rateSummary =
    report.rate.cost !== null
      ? `rate cost=${report.rate.cost} remaining=${report.rate.after.remaining}/${report.rate.after.limit} reset=${report.rate.after.resetAt}`
      : `rate remaining=${report.rate.after.remaining}/${report.rate.after.limit} (window rolled over; cost N/A)`;
  process.stdout.write(
    `wrote ${report.openPrTotal} entries to ${outPath}` +
      (tagSummary ? `  [${tagSummary}]` : "  [no tags matched]") +
      `  ${rateSummary}\n`,
  );
  if (options.print) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  }
}
