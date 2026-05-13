#!/usr/bin/env node
/**
 * Export GitHub Issues + PRs for a repo into one Markdown file, suitable for uploading to NotebookLM.
 *
 * Usage:
 *   pnpm exec tsx scripts/notebooklm-export-github.ts --repo owner/name [--out path] [--issues open|closed|all] [--prs open|closed|all] [--limit 50]
 */

import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

type GhLabel = { name?: string };
type GhUser = { login?: string };

type GhItem = {
  number: number;
  title: string;
  url: string;
  labels?: GhLabel[];
  author?: GhUser;
  createdAt?: string;
  updatedAt?: string;
  body?: string;
};

type IssueStateFlag = "open" | "closed";
type PrStateFlag = "open" | "closed" | "merged";

type IssueMode = "open" | "closed" | "all" | "none";
type PrMode = "open" | "closed" | "merged" | "all";

function parseArgs(argv: string[]) {
  const args: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (typeof a !== "string" || !a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (typeof next !== "string" || next.startsWith("--")) {
      args[key] = true;
    } else {
      args[key] = next;
      i++;
    }
  }
  return args;
}

function fail(msg: string): never {
  process.stderr.write(`${msg}\n`);
  process.exit(1);
}

function mustString(v: unknown, name: string): string {
  if (typeof v === "string" && v.trim()) return v.trim();
  fail(`Missing required flag --${name}`);
}

function asIssueMode(v: unknown, dflt: IssueMode): IssueMode {
  if (typeof v !== "string") return dflt;
  const s = v.trim();
  if (s === "open" || s === "closed" || s === "all" || s === "none") return s;
  fail(`Invalid value '${s}' (expected open|closed|all|none)`);
}

function asPrMode(v: unknown, dflt: PrMode): PrMode {
  if (typeof v !== "string") return dflt;
  const s = v.trim();
  if (s === "open" || s === "closed" || s === "merged" || s === "all") return s;
  fail(`Invalid value '${s}' (expected open|closed|merged|all)`);
}

function asLimit(v: unknown, dflt: number): number {
  if (typeof v !== "string") return dflt;
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) fail(`Invalid --limit '${v}'`);
  return Math.floor(n);
}

function ensureGh() {
  try {
    execFileSync("gh", ["--version"], { stdio: "ignore" });
  } catch {
    fail("gh CLI not found. Install GitHub CLI: https://cli.github.com/");
  }
}

function runGhIssueJson(repo: string, state: IssueStateFlag, limit: number): GhItem[] {
  const baseArgs = ["issue", "list", "-R", repo, "--limit", String(limit), "--state", state];
  const jsonFields = [
    "number",
    "title",
    "url",
    "labels",
    "author",
    "createdAt",
    "updatedAt",
    "body"
  ];

  const result = spawnSync("gh", [...baseArgs, "--json", jsonFields.join(",")], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });

  if (result.status === 0) {
    const parsed = JSON.parse(result.stdout ?? "null") as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed as GhItem[];
  }

  const stderr = String(result.stderr ?? result.error?.message ?? "");
  // Some repos disable issues (e.g. github/.github). Treat that as an empty bucket
  // so PR-only exports can continue quietly.
  if (/disabled issues/i.test(stderr) || /has disabled issues/i.test(stderr)) return [];

  const err = new Error(`gh issue list failed for ${repo} (${state})`);
  (err as Error & { stderr?: string; stdout?: string; cause?: unknown }).stderr = stderr;
  (err as Error & { stderr?: string; stdout?: string; cause?: unknown }).stdout = String(result.stdout ?? "");
  (err as Error & { stderr?: string; stdout?: string; cause?: unknown }).cause = result.error ?? undefined;
  throw err;
}

function runGhPrJson(repo: string, state: PrStateFlag, limit: number): GhItem[] {
  const baseArgs = ["pr", "list", "-R", repo, "--limit", String(limit), "--state", state];
  const jsonFields = [
    "number",
    "title",
    "url",
    "labels",
    "author",
    "createdAt",
    "updatedAt",
    "body"
  ];

  const out = execFileSync("gh", [...baseArgs, "--json", jsonFields.join(",")], {
    encoding: "utf8"
  });
  const parsed = JSON.parse(out) as unknown;
  if (!Array.isArray(parsed)) return [];
  return parsed as GhItem[];
}

function getIssueStates(mode: IssueMode): IssueStateFlag[] {
  if (mode === "none") return [];
  if (mode === "all") return ["open", "closed"];
  return [mode];
}

function getPrStates(mode: PrMode): PrStateFlag[] {
  if (mode === "all") return ["open", "closed", "merged"];
  return [mode];
}

function safeLabelList(labels?: GhLabel[]): string {
  const names = (labels ?? [])
    .map((l) => (typeof l?.name === "string" ? l.name.trim() : ""))
    .filter(Boolean);
  return names.length ? names.join(", ") : "-";
}

function safeLogin(u?: GhUser): string {
  const login = typeof u?.login === "string" ? u.login.trim() : "";
  return login || "-";
}

function clipBody(body?: string, maxChars = 3000): string {
  const s = typeof body === "string" ? body : "";
  if (s.length <= maxChars) return s;
  return s.slice(0, maxChars).trimEnd() + "\n\n…(truncated)";
}

function slugOutPath(repo: string): string {
  const [owner, name] = repo.split("/");
  return path.join("notebooklm", `${owner}__${name}.md`);
}

function mdEscape(s: string): string {
  // For headings, keep it simple: trim and avoid CRs.
  return s.replace(/\r/g, "").trim();
}

function escapeMdLinkText(s: string): string {
  // Escape characters that can break Markdown link text, especially `[` and `]`.
  // We also escape backslashes first to avoid double-escaping.
  return s.replace(/\\/g, "\\\\").replace(/\[/g, "\\[").replace(/\]/g, "\\]");
}

function makeToc(items: { anchor: string; title: string }[]): string {
  return items
    .map((i) => `- [${escapeMdLinkText(i.title)}](#${i.anchor})`)
    .join("\n");
}

function anchorFor(prefix: string, n: number, title: string): string {
  // GitHub-ish anchor; good enough for NotebookLM/markdown viewers.
  const base = `${prefix}-${n}-${title}`
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80)
    .replace(/^-|-$/g, "");
  return base || `${prefix}-${n}`;
}

function renderItems(section: "Issue" | "PR", state: string, items: GhItem[]): string {
  const lines: string[] = [];
  for (const it of items) {
    const t = mdEscape(it.title ?? "(no title)");
    const anchor = anchorFor(section.toLowerCase(), it.number, t);
    // Explicit anchor so the generated TOC links work in common Markdown renderers.
    // (Relying on renderer-specific heading slug rules is fragile.)
    lines.push(`<a id="${anchor}"></a>`);
    lines.push(`### #${it.number} ${t}`);
    lines.push("");
    lines.push(`- Link: ${it.url}`);
    lines.push(`- Type: ${section}`);
    lines.push(`- State: ${state}`);
    lines.push(`- Author: ${safeLogin(it.author)}`);
    lines.push(`- Labels: ${safeLabelList(it.labels)}`);
    lines.push(`- Created: ${it.createdAt ?? "-"}`);
    lines.push(`- Updated: ${it.updatedAt ?? "-"}`);
    lines.push("");
    const body = clipBody(it.body);
    if (body.trim()) {
      lines.push("Body:");
      lines.push("");
      lines.push(body);
    } else {
      lines.push("Body: (empty)");
    }
    lines.push("");
    lines.push("---");
    lines.push("");
  }
  return lines.join("\n");
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const repo = mustString(args.repo, "repo");
  const issuesMode = asIssueMode(args.issues, "open");
  const prsMode = asPrMode(args.prs, "open");
  const limit = asLimit(args.limit, 50);

  const outPath = typeof args.out === "string" ? args.out : slugOutPath(repo);
  const absOut = path.isAbsolute(outPath)
    ? outPath
    : path.join(process.cwd(), outPath);

  ensureGh();

  const generatedAt = new Date().toISOString();

  const issueStates = getIssueStates(issuesMode);
  const prStates = getPrStates(prsMode);

  // `--limit` is a TOTAL budget across all exported items (issues + PRs),
  // even when multiple states are selected (e.g. `--issues all --prs all`).
  //
  // To avoid starving later selections (e.g. `--prs merged` yielding zero PRs
  // because issues consumed the whole budget), we fetch small batches for each
  // selected bucket and then interleave them round-robin up to the total limit.
  //
  // NOTE: We intentionally over-fetch up to `limit` from each selected bucket.
  // This avoids under-filling the snapshot when some buckets are empty/small.
  // (Example: issues disabled but `--issues all` was requested.)
  const perBucketFetch = limit;

  const issuesByState: Record<IssueStateFlag, GhItem[]> = { open: [], closed: [] };
  for (const st of issueStates) {
    issuesByState[st] = runGhIssueJson(repo, st, perBucketFetch);
  }

  const prsByState: Record<PrStateFlag, GhItem[]> = { open: [], closed: [], merged: [] };
  for (const st of prStates) {
    prsByState[st] = runGhPrJson(repo, st, perBucketFetch);
  }

  // Round-robin selection across requested buckets.
  type Bucket = { kind: "issue" | "pr"; state: string; items: GhItem[]; idx: number };
  const buckets: Bucket[] = [];
  for (const st of issueStates) buckets.push({ kind: "issue", state: st, items: issuesByState[st], idx: 0 });
  for (const st of prStates) buckets.push({ kind: "pr", state: st, items: prsByState[st], idx: 0 });

  const selectedIssuesByState: Record<IssueStateFlag, GhItem[]> = { open: [], closed: [] };
  const selectedPrsByState: Record<PrStateFlag, GhItem[]> = { open: [], closed: [], merged: [] };

  let picked = 0;
  while (picked < limit) {
    let advanced = false;
    for (const b of buckets) {
      if (picked >= limit) break;
      const it = b.items[b.idx];
      if (!it) continue;
      b.idx++;
      advanced = true;
      picked++;
      if (b.kind === "issue") {
        if (b.state === "open") selectedIssuesByState.open.push(it);
        else selectedIssuesByState.closed.push(it);
      } else {
        if (b.state === "open") selectedPrsByState.open.push(it);
        else if (b.state === "closed") selectedPrsByState.closed.push(it);
        else selectedPrsByState.merged.push(it);
      }
    }
    if (!advanced) break; // no more items anywhere
  }

  // Replace exported-by-state maps with the budgeted selections.
  for (const st of issueStates) issuesByState[st] = selectedIssuesByState[st];
  for (const st of prStates) prsByState[st] = selectedPrsByState[st];

  // Build TOC anchors.
  const tocIssues: { anchor: string; title: string }[] = [];
  for (const st of issueStates) {
    for (const it of issuesByState[st]) {
      const t = mdEscape(it.title ?? "(no title)");
      tocIssues.push({
        anchor: anchorFor("issue", it.number, t),
        title: `Issue #${it.number}: ${t}`
      });
    }
  }

  const tocPrs: { anchor: string; title: string }[] = [];
  for (const st of prStates) {
    for (const it of prsByState[st]) {
      const t = mdEscape(it.title ?? "(no title)");
      tocPrs.push({
        anchor: anchorFor("pr", it.number, t),
        title: `PR #${it.number}: ${t}`
      });
    }
  }

  const md: string[] = [];
  md.push(`repo: ${repo}`);
  md.push(`generatedAt: ${generatedAt}`);
  md.push(`issues: ${issuesMode}`);
  md.push(`prs: ${prsMode}`);
  md.push(`limit: ${limit}`);
  md.push("");
  md.push("# NotebookLM Export: GitHub Issues + PRs");
  md.push("");
  md.push("## Table of Contents");
  md.push("");
  md.push("### Issues");
  md.push("");
  md.push(tocIssues.length ? makeToc(tocIssues) : "- (none)");
  md.push("");
  md.push("### PRs");
  md.push("");
  md.push(tocPrs.length ? makeToc(tocPrs) : "- (none)");
  md.push("");
  md.push("---");
  md.push("");
  md.push("## Issues");
  md.push("");
  for (const st of issueStates) {
    md.push(`### State: ${st}`);
    md.push("");
    md.push(renderItems("Issue", st, issuesByState[st]));
  }

  md.push("## PRs");
  md.push("");
  for (const st of prStates) {
    md.push(`### State: ${st}`);
    md.push("");
    md.push(renderItems("PR", st, prsByState[st]));
  }

  fs.mkdirSync(path.dirname(absOut), { recursive: true });
  fs.writeFileSync(absOut, md.join("\n"), "utf8");

  process.stdout.write(`Wrote ${absOut}\n`);
}

main();
