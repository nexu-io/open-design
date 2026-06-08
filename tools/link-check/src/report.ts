// Human-readable output is English-primary with Chinese mirror text in the
// same line — reviewers can read either, and CI tooling / Dependabot /
// semantic-release parsers still see English. JSON mode emits a single
// machine-readable object (English-only keys).

import type { FixSummary, ProjectScanResult, ScanResult } from "./types.js";

const LINE = "=".repeat(63);

const ICON_DEAD = "❌";
const ICON_SCHEMA = "⚠️";
const ICON_ORPHAN = "📁";
const ICON_OK = "✅";
const ICON_GOOD = "👍";
const ICON_FIX = "🔧";

function statusIcon(ok: boolean, fallback: string): string {
  return ok ? ICON_OK : fallback;
}

function renderTotals(result: ScanResult): string {
  const t = result.totals;
  const lines: string[] = [];
  lines.push(LINE);
  lines.push(
    `  OD Link Validator / OD 链接审计 — ${new Date().toISOString().slice(0, 19).replace("T", " ")}`
  );
  lines.push(LINE);
  lines.push(`  Projects scanned / 扫描项目数:  ${t.projects}`);
  lines.push(`  HTML files / HTML 文件数:        ${t.html}`);
  lines.push(`  artifact.json / 元数据侧车:      ${t.artifact}`);
  lines.push(`  Unique .html refs / 唯一引用:    ${t.refs}`);
  lines.push(
    `  Dead references / 死链:           ${t.deadRefs}  ${statusIcon(t.deadRefs === 0, ICON_DEAD)}`
  );
  lines.push(
    `  Schema issues / Schema 违规:     ${t.schemaProjects}  ${statusIcon(t.schemaProjects === 0, ICON_SCHEMA)}`
  );
  lines.push(
    `  Projects w/ orphans / 含孤立文件: ${t.orphanProjects}  ${statusIcon(t.orphanProjects === 0, ICON_GOOD)}`
  );
  lines.push("");
  return lines.join("\n");
}

function renderDead(projects: ProjectScanResult[]): string {
  const withDead = projects.filter((p) => p.deadRefs.length > 0);
  if (withDead.length === 0) return "";
  const out: string[] = [];
  out.push(`━━━ DEAD REFERENCES / 死链 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  for (const p of withDead) {
    out.push("");
    out.push(`${ICON_DEAD} ${p.projectId}`);
    for (const d of p.deadRefs) {
      out.push(`     ${d.file}:${d.line}`);
      out.push(`       → ${d.target}  (file not found / 文件不存在)`);
    }
  }
  out.push("");
  return out.join("\n");
}

function renderSchema(projects: ProjectScanResult[]): string {
  const withSchema = projects.filter((p) => p.schema !== null);
  if (withSchema.length === 0) return "";
  const out: string[] = [];
  out.push(`━━━ SCHEMA ISSUES / Schema 违规 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  for (const p of withSchema) {
    const s = p.schema!;
    out.push("");
    out.push(`${ICON_SCHEMA}  ${p.projectId}`);
    if (s.primary.length > 1) {
      out.push(
        `     ${s.primary.length} files claim primary:true (should be ≤ 1)`
      );
      out.push(
        `     ${s.primary.length} 个文件均声明 primary:true（应 ≤ 1）`
      );
      for (const entry of s.primary) {
        out.push(
          `       • ${entry.file}  (entry=${entry.entry}, updated=${entry.updatedAt})`
        );
      }
      if (s.current) {
        out.push(
          `     → by updatedAt, current should be: ${s.current} (按 updatedAt 应为当前)`
        );
      }
    }
    if (s.entryMisses.length > 0) {
      out.push(
        `     artifact.json entry → missing file / 元数据指向不存在的文件:`
      );
      for (const e of s.entryMisses) {
        out.push(`       • ${e.file} → ${e.entry}`);
      }
    }
  }
  out.push("");
  return out.join("\n");
}

function renderOrphans(projects: ProjectScanResult[]): string {
  const withOrphans = projects.filter((p) => p.orphans.length > 0);
  if (withOrphans.length === 0) return "";
  const out: string[] = [];
  out.push(`━━━ ORPHAN HTML FILES / 孤立 HTML ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  out.push(
    `   (no inbound reference; never linked from any other file)`
  );
  out.push(
    `   (无任何文件引用；不在导航图上)`
  );
  for (const p of withOrphans) {
    out.push("");
    out.push(`   ${ICON_ORPHAN} ${p.projectId}`);
    for (const o of p.orphans) {
      out.push(`       • ${o.file}`);
    }
  }
  out.push("");
  return out.join("\n");
}

function renderSummary(result: ScanResult): string {
  const t = result.totals;
  const totalIssues = t.deadRefs + t.schemaProjects + t.orphanProjects;
  const out: string[] = [];
  out.push(LINE);
  out.push(`  TOTAL ISSUES / 总问题数: ${totalIssues}  ${statusIcon(totalIssues === 0, ICON_DEAD)}`);
  out.push(LINE);
  out.push("");
  return out.join("\n");
}

export function renderHuman(result: ScanResult): string {
  const parts: string[] = [];
  parts.push(renderTotals(result));
  parts.push(renderDead(result.projects));
  parts.push(renderSchema(result.projects));
  parts.push(renderOrphans(result.projects));
  parts.push(renderSummary(result));
  return parts.join("");
}

export function renderJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

export function renderFixHuman(summary: FixSummary): string {
  const out: string[] = [];
  out.push(LINE);
  out.push(`  ${ICON_FIX} tools-link-check --fix / 重写建议`);
  out.push(LINE);
  if (summary.proposals.length === 0) {
    out.push(`  No dead refs to rewrite. / 无死链可重写.`);
    out.push(LINE);
    out.push("");
    return out.join("\n");
  }
  out.push(
    `  ${summary.proposals.length} proposal(s) found, ${summary.applied ? `applied to ${summary.mutatedFiles} file(s).` : "DRY-RUN. Pass --apply to write changes."}`
  );
  out.push(
    `  ${summary.proposals.length} 条建议，${summary.applied ? `已写入 ${summary.mutatedFiles} 个文件。` : "DRY-RUN 模式。加 --apply 才会真正写入。"}`
  );
  out.push("");
  for (const p of summary.proposals) {
    const reason = p.reason === "primary" ? "primary:true" : "latest mtime";
    out.push(`  ${p.projectId}/${p.file}:${p.line}`);
    out.push(`       ${p.oldTarget}  →  ${p.newTarget}  (${reason})`);
  }
  if (!summary.applied) {
    out.push("");
    out.push(`  Run with --apply to rewrite. / 加 --apply 真正改文件.`);
  }
  out.push(LINE);
  out.push("");
  return out.join("\n");
}
