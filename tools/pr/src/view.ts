/**
 * `tools-pr view <num>` — factual brief for a single PR.
 *
 * Output is strictly facts + repo-doc citations; no judgments, no directives.
 * Sections:
 *  - lane + forbidden-surface + public-seam observations
 *  - top files (lockfile, translations, generated dirs filtered as noise)
 *  - per-lane rules cited from code-review-guidelines.md / AGENTS.md /
 *    CONTRIBUTING.zh-CN.md with sources noted inline
 *  - validation commands derived from touched packages, per AGENTS.md
 *    §Validation strategy
 *  - bot-stripped review + comment summary (Looper-stamped reviews moved to
 *    the bot-only-approval fact line)
 *  - CI rollup grouped by workflow
 */

import {
  condense,
  isBotAuthored,
  isBotOnlyApproval,
  reduceLatestReviewsByAuthor,
} from "./bot.js";
import { daysSince, fetchView, labelByPrefix } from "./gh.js";
import { deriveForbidden, deriveLane, deriveSeams, isNoisyFile, SKILL_DIR, DESIGN_DIR } from "./lane.js";
import type {
  Brief,
  GhCheck,
  GhView,
  Lane,
  ValidationCommand,
} from "./types.js";

// --- validation derivation -----------------------------------------------

function deriveValidation(paths: string[]): ValidationCommand[] {
  const cmds: ValidationCommand[] = [];
  const seen = new Set<string>();
  const add = (command: string, reason: string): void => {
    if (seen.has(command)) return;
    seen.add(command);
    cmds.push({ command, reason });
  };

  add("pnpm guard", "TS-first + .js allowlist gate");
  add("pnpm typecheck", "workspace-wide typecheck (root)");

  const touched = (prefix: string): boolean => paths.some((p) => p.startsWith(prefix));
  const touchedAny = (prefixes: string[]): boolean => prefixes.some(touched);

  if (touched("apps/web/")) {
    add("pnpm --filter @open-design/web typecheck", "apps/web changed");
    add("pnpm --filter @open-design/web test", "apps/web changed");
    add("pnpm --filter @open-design/web build", "apps/web changed");
  }
  if (touched("apps/daemon/")) {
    add("pnpm --filter @open-design/daemon typecheck", "apps/daemon changed");
    add("pnpm --filter @open-design/daemon test", "apps/daemon changed");
    add("pnpm --filter @open-design/daemon build", "apps/daemon changed");
  }
  if (touched("apps/desktop/")) {
    add("pnpm --filter @open-design/desktop typecheck", "apps/desktop changed");
    add("pnpm --filter @open-design/desktop build", "apps/desktop changed");
  }
  if (touched("apps/packaged/")) {
    add("pnpm --filter @open-design/packaged typecheck", "apps/packaged changed");
    add("pnpm --filter @open-design/packaged build", "apps/packaged changed");
  }
  if (touched("packages/contracts/")) {
    add("pnpm --filter @open-design/contracts typecheck", "packages/contracts changed");
  }
  if (touched("packages/sidecar-proto/")) {
    add("pnpm --filter @open-design/sidecar-proto typecheck", "sidecar-proto changed");
    add("pnpm --filter @open-design/sidecar-proto test", "sidecar-proto changed");
  }
  if (touched("packages/sidecar/")) {
    add("pnpm --filter @open-design/sidecar typecheck", "packages/sidecar changed");
    add("pnpm --filter @open-design/sidecar test", "packages/sidecar changed");
  }
  if (touched("packages/platform/")) {
    add("pnpm --filter @open-design/platform typecheck", "packages/platform changed");
    add("pnpm --filter @open-design/platform test", "packages/platform changed");
  }
  if (touched("tools/dev/")) {
    add("pnpm --filter @open-design/tools-dev typecheck", "tools/dev changed");
    add("pnpm --filter @open-design/tools-dev build", "tools/dev changed");
  }
  if (touched("tools/pack/")) {
    add("pnpm --filter @open-design/tools-pack typecheck", "tools/pack changed");
    add("pnpm --filter @open-design/tools-pack build", "tools/pack changed");
  }
  if (touched("tools/pr/")) {
    add("pnpm --filter @open-design/tools-pr typecheck", "tools/pr changed");
    add("pnpm --filter @open-design/tools-pr build", "tools/pr changed");
  }
  if (touchedAny(["e2e/specs/", "e2e/tests/", "e2e/lib/"])) {
    add("pnpm --filter @open-design/e2e typecheck", "e2e/ changed");
    add("(cd e2e && pnpm test specs)", "e2e specs are the PR smoke gate");
  }
  if (touched("e2e/ui/")) {
    add("(cd e2e && pnpm exec playwright test -c playwright.config.ts)", "Playwright UI changed");
  }

  const stampRelated = paths.some((p) => /(sidecar|stamp|namespace|packaged|tools-pack)/i.test(p));
  if (stampRelated) {
    add(
      "# run inspect eval + screenshot for two concurrent namespaces (AGENTS.md)",
      "stamp/namespace surface touched",
    );
  }
  const pathLogRelated = paths.some((p) => /(tools-dev|tools-pack|log|logger|\.tmp)/i.test(p));
  if (pathLogRelated) {
    add(
      "pnpm tools-dev logs --namespace <name> --json",
      "path/log surface touched — confirm paths under .tmp/tools-dev/<namespace>/",
    );
  }
  return cmds;
}

// --- lane checklist ------------------------------------------------------

/**
 * Per-lane rule citations. Each line is either an observed fact about the
 * touched paths or a quotation/summary of an existing repo rule with its
 * source noted. No judgments, no directives.
 */
function laneRules(lane: Lane, paths: string[]): string[] {
  const items: string[] = [];
  const hasFile = (suffix: string): boolean => paths.some((p) => p.endsWith(suffix));
  const skillRoots = new Set(
    paths.filter((p) => SKILL_DIR.test(p)).map((p) => p.split("/").slice(0, 2).join("/")),
  );
  const designRoots = new Set(
    paths.filter((p) => DESIGN_DIR.test(p)).map((p) => p.split("/").slice(0, 2).join("/")),
  );

  switch (lane) {
    case "skill":
      items.push(`fact: skill roots touched — ${[...skillRoots].join(", ") || "(none)"}`);
      items.push(
        `fact: SKILL.md present at every touched root — ${[...skillRoots].every((root) => paths.includes(`${root}/SKILL.md`)) ? "yes" : "no"}`,
      );
      items.push(`fact: example.html present at a touched root — ${hasFile("/example.html") ? "yes" : "no"}`);
      items.push(`fact: references/checklist.md present at a touched root — ${hasFile("/references/checklist.md") ? "yes" : "no"}`);
      items.push("rule [CONTRIBUTING.zh-CN.md skill 硬线 1]: real hand-crafted example.html present");
      items.push("rule [CONTRIBUTING.zh-CN.md skill 硬线 2]: anti-AI-slop list — purple gradients, generic emoji icons, Inter-as-display, invented numbers");
      items.push("rule [CONTRIBUTING.zh-CN.md skill 硬线 4]: references/checklist.md with at least the P0 gate");
      items.push("rule [CONTRIBUTING.zh-CN.md skill 硬线 5]: featured skill ⇒ docs/screenshots/skills/<slug>.png");
      items.push("rule [CONTRIBUTING.zh-CN.md skill 硬线 6]: self-contained — CDN scope ≤ existing skills, no unlicensed fonts, assets ≲ 250 KB");
      break;
    case "design-system":
      items.push(`fact: design-system roots touched — ${[...designRoots].join(", ") || "(none)"}`);
      items.push(`fact: DESIGN.md present at a touched root — ${hasFile("/DESIGN.md") ? "yes" : "no"}`);
      items.push("rule [code-review-guidelines.md §4.3]: first H1 = picker title; '> Category:' line uses an existing dropdown group");
      items.push("rule [CONTRIBUTING.zh-CN.md design-system 硬线 1]: 9 sections present (visual / color / typography / spacing / layout / components / motion / voice / anti-patterns)");
      items.push("rule [CONTRIBUTING.zh-CN.md design-system 硬线 5]: ASCII slug only (linear.app → linear-app)");
      items.push("rule [CONTRIBUTING.zh-CN.md design-system 硬线 2-3]: hex sampled from real source; OKLch acceptable for accent ramps");
      break;
    case "craft":
      items.push("rule [code-review-guidelines.md §4.5]: universal brand-agnostic craft (not brand-specific, not artifact-shape)");
      items.push("rule [code-review-guidelines.md §4.5]: at least one shipping skill opts in via od.craft.requires, or follow-up named in PR description");
      items.push("reference: existing craft entry shapes — craft/typography.md, craft/color.md, craft/animation-discipline.md");
      break;
    case "contract":
      items.push("rule [AGENTS.md §Boundary constraints]: packages/contracts free of Next/Express/Node fs|process/browser APIs/SQLite/daemon internals/sidecar control-plane deps");
      items.push("rule [AGENTS.md §Boundary constraints]: stamp fields exactly five — app, mode, namespace, ipc, source");
      items.push("rule [code-review-guidelines.md §4.2]: contract change lands before consumers, or in same PR with both sides wired");
      items.push("rule [code-review-guidelines.md §4.2]: breaking persisted-format change requires explicit migration + one-release compat window");
      items.push("rule [code-review-guidelines.md §4.2]: producer and consumer both have type/test coverage of the new shape");
      break;
    case "docs":
      items.push("rule [code-review-guidelines.md §7 Documentation-only review]: internal link integrity (relative paths, anchors)");
      items.push("rule [code-review-guidelines.md §7]: no conflict with AGENTS.md chain (root > directory-level)");
      items.push("rule [AGENTS.md §Validation strategy]: pnpm guard + pnpm typecheck required");
      break;
    case "multi":
      items.push("rule [code-review-guidelines.md §3 In scope, Multi-area]: public seam motivates the cross-cut (HTTP API / contract / sidecar / command / persisted format)");
      items.push("rule [code-review-guidelines.md §3]: owning contract/protocol/primitive change lands first or in same PR");
      items.push("rule [code-review-guidelines.md §3]: one clear primary owner");
      break;
    case "default":
    case "unknown":
      items.push("rule [AGENTS.md §Boundary constraints]: tests live in sibling tests/ directories; no *.test.* under src/");
      items.push("rule [AGENTS.md §Boundary constraints]: shared logic in owning package; no cross-app private imports");
      items.push("rule [AGENTS.md §Boundary constraints]: shared web/daemon API DTOs in packages/contracts, not in app internals");
      items.push("reference: forbidden-surface scan in the Boundaries section above is authoritative");
      break;
  }
  return items;
}

// --- check rollup --------------------------------------------------------

function summarizeChecks(rollup: GhCheck[]): Brief["checks"] {
  const groups = new Map<
    string,
    { passing: number; failing: number; pending: number; total: number }
  >();
  for (const check of rollup) {
    const key = check.workflowName ?? check.name ?? check.context ?? "(unknown)";
    const bucket = groups.get(key) ?? { passing: 0, failing: 0, pending: 0, total: 0 };
    bucket.total += 1;
    const conclusion = (check.conclusion ?? check.state ?? "").toUpperCase();
    if (conclusion === "SUCCESS" || conclusion === "NEUTRAL" || conclusion === "SKIPPED") bucket.passing += 1;
    else if (
      conclusion === "FAILURE" ||
      conclusion === "CANCELLED" ||
      conclusion === "TIMED_OUT" ||
      conclusion === "ACTION_REQUIRED"
    )
      bucket.failing += 1;
    else bucket.pending += 1;
    groups.set(key, bucket);
  }
  return [...groups.entries()]
    .map(([workflow, stats]) => ({ workflow, ...stats }))
    .sort((a, b) => b.failing - a.failing || a.workflow.localeCompare(b.workflow));
}

// --- brief assembly + formatting -----------------------------------------

function buildBrief(num: number, view: GhView): Brief {
  const now = Date.now();
  const paths = view.files.map((file) => file.path);
  const { lane, hits } = deriveLane(paths);

  const topFiles = [...view.files]
    .filter((file) => !isNoisyFile(file.path))
    .sort((a, b) => b.additions + b.deletions - (a.additions + a.deletions))
    .slice(0, 8)
    .map((file) => ({
      path: file.path,
      additions: file.additions,
      deletions: file.deletions,
      changeType: file.changeType,
    }));
  const filterSuppressedFileCount = view.files.length - topFiles.length;

  const latestPerReviewer = reduceLatestReviewsByAuthor(view.reviews);
  const reviews = latestPerReviewer
    .filter((review) => !isBotAuthored(review.author, review.body))
    .map((review) => ({
      author: review.author?.login ?? "(unknown)",
      state: review.state,
      submittedAt: review.submittedAt,
      body: condense(review.body, 200),
    }))
    .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));

  const comments = view.comments
    .filter((comment) => !isBotAuthored(comment.author, comment.body))
    .map((comment) => ({
      author: comment.author?.login ?? "(unknown)",
      createdAt: comment.createdAt,
      body: condense(comment.body, 200),
    }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 3);

  return {
    number: num,
    url: view.url,
    title: view.title,
    state: view.state,
    reviewDecision: view.reviewDecision,
    mergeStateStatus: view.mergeStateStatus,
    isDraft: view.isDraft,
    author: view.author.login,
    branch: { head: view.headRefName, base: view.baseRefName },
    age: {
      createdAt: view.createdAt,
      updatedAt: view.updatedAt,
      ageDays: daysSince(view.createdAt, now),
      staleDays: daysSince(view.updatedAt, now),
    },
    labels: {
      size: labelByPrefix(view.labels, "size/"),
      risk: labelByPrefix(view.labels, "risk/"),
      type: labelByPrefix(view.labels, "type/"),
      all: view.labels.map((label) => label.name),
    },
    diff: {
      additions: view.additions,
      deletions: view.deletions,
      changedFiles: view.changedFiles,
    },
    lane,
    laneHits: [...hits],
    forbidden: deriveForbidden(paths),
    seamsTouched: deriveSeams(paths),
    topFiles,
    filterSuppressedFileCount,
    laneRules: laneRules(lane, paths),
    validation: deriveValidation(paths),
    reviews,
    reviewCountTotal: latestPerReviewer.length,
    botOnlyApproval: isBotOnlyApproval(view.reviewDecision, latestPerReviewer),
    comments,
    commentCountTotal: view.comments.length,
    checks: summarizeChecks(view.statusCheckRollup),
    bodyPreview: condense(view.body, 400),
    bodyChars: view.body.length,
  };
}

function formatBrief(brief: Brief): string {
  const lines: string[] = [];
  const labelTags = [
    brief.labels.size ? `size/${brief.labels.size}` : null,
    brief.labels.risk ? `risk/${brief.labels.risk}` : null,
    brief.labels.type ? `type/${brief.labels.type}` : null,
  ].filter((v): v is string => v !== null);

  lines.push(`PR #${brief.number} · ${brief.title}`);
  lines.push(`  url        ${brief.url}`);
  lines.push(`  author     ${brief.author}`);
  lines.push(`  branch     ${brief.branch.head} → ${brief.branch.base}`);
  lines.push(
    `  state      ${brief.state} · ${brief.reviewDecision || "REVIEW_REQUIRED"} · ${brief.mergeStateStatus}${brief.isDraft ? " · draft" : ""}`,
  );
  lines.push(`  age        created ${brief.age.ageDays}d ago · updated ${brief.age.staleDays}d ago`);
  lines.push(`  labels     ${labelTags.join(", ") || "(none)"}`);
  lines.push(
    `  diff       +${brief.diff.additions} −${brief.diff.deletions} across ${brief.diff.changedFiles} files`,
  );
  if (brief.botOnlyApproval) {
    lines.push("");
    lines.push("  fact: bot-only approval — reviewDecision=APPROVED, every APPROVED review is bot-authored.");
    lines.push("  fact: zero APPROVED reviews authored by a non-bot account.");
  }
  lines.push("");

  lines.push("── Boundaries (lane / forbidden / seams) ──");
  lines.push(
    `  lane       ${brief.lane}${brief.laneHits.length > 1 ? `  (hits: ${brief.laneHits.join(", ")})` : ""}`,
  );
  lines.push(`  forbidden  ${brief.forbidden.length === 0 ? "[none]" : brief.forbidden.join(", ")}`);
  lines.push(`  seams      ${brief.seamsTouched.length === 0 ? "[none]" : brief.seamsTouched.join(", ")}`);
  lines.push("");

  lines.push(`── Top files (${brief.topFiles.length} shown, ${brief.filterSuppressedFileCount} filtered by NOISY_FILE_PATTERNS in lane.ts) ──`);
  for (const file of brief.topFiles) {
    const delta = `+${file.additions} −${file.deletions}`.padEnd(10, " ");
    lines.push(`  ${delta} ${file.path}  (${file.changeType})`);
  }
  lines.push("");

  lines.push(`── Lane rules (${brief.lane}) ──`);
  for (const item of brief.laneRules) lines.push(`  • ${item}`);
  lines.push("");

  lines.push("── Validation (AGENTS.md §Validation strategy, derived from touched packages) ──");
  for (const cmd of brief.validation) {
    lines.push(`  $ ${cmd.command}`);
    lines.push(`      ↳ ${cmd.reason}`);
  }
  lines.push("");

  lines.push(`── Recent reviews (${brief.reviews.length} human-shown of ${brief.reviewCountTotal} total) ──`);
  if (brief.reviews.length === 0) lines.push("  (no human reviews yet)");
  for (const review of brief.reviews) {
    lines.push(`  @${review.author}  ${review.state}  ${review.submittedAt}`);
    lines.push(`      "${review.body}"`);
  }
  lines.push("");

  lines.push(`── Recent comments (${brief.comments.length} of ${brief.commentCountTotal}) ──`);
  if (brief.comments.length === 0) lines.push("  (no human comments)");
  for (const comment of brief.comments) {
    lines.push(`  @${comment.author}  ${comment.createdAt}`);
    lines.push(`      "${comment.body}"`);
  }
  lines.push("");

  lines.push("── CI ──");
  if (brief.checks.length === 0) lines.push("  (no checks reported)");
  for (const group of brief.checks) {
    const symbol = group.failing > 0 ? "✗" : group.pending > 0 ? "·" : "✓";
    lines.push(
      `  ${symbol} ${group.workflow.padEnd(28, " ")} ${group.passing}/${group.total} pass` +
        (group.failing ? `, ${group.failing} fail` : "") +
        (group.pending ? `, ${group.pending} pending` : ""),
    );
  }
  lines.push("");

  lines.push(`── PR body (preview, ${brief.bodyChars} chars total) ──`);
  lines.push(brief.bodyPreview ? `  ${brief.bodyPreview}` : "  (empty body)");

  return lines.join("\n");
}

export type ViewOptions = {
  json?: boolean;
};

export async function runView(num: number, options: ViewOptions): Promise<void> {
  if (!Number.isFinite(num) || num <= 0) {
    throw new Error("view requires a positive PR number, e.g. tools-pr view 1180");
  }
  const view = await fetchView(num);
  const brief = buildBrief(num, view);
  if (options.json) {
    process.stdout.write(`${JSON.stringify(brief, null, 2)}\n`);
    return;
  }
  process.stdout.write(`${formatBrief(brief)}\n`);
}
