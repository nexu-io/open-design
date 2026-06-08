// Walks `.od/projects/<id>/` and reports four kinds of issues that arise
// from the editor's append-only workflow:
//   - dead cross-page references in HTML
//   - multiple artifact.json files claiming primary:true
//   - artifact.json `entry` pointing to a non-existent HTML file
//   - orphan HTML files that no other file references
//
// `proposeFixes` is an opt-in fallback that rewrites dead cross-page
// references in place to the current numbered sibling of the target.
// It is NOT a substitute for an editor-level post-write check (see
// upstream nexu-io/open-design#3345); it is a defense-in-depth tool
// for the gap until that lands.

import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

import type {
  DeadRef,
  EntryMiss,
  FixProposal,
  FixReason,
  FixSummary,
  Orphan,
  PrimaryEntry,
  ProjectScanResult,
  ScanResult,
  SchemaIssue,
} from "./types.js";

const REF_RE =
  /(?:location\.href\s*=\s*['"]([^'"]+)['"]|href\s*=\s*['"]([^'"]+)['"])/g;

const SKIP_DIR_PREFIX = "_";

interface FileEntry {
  rel: string;
  full: string;
}

function walk(dir: string, prefix = ""): FileEntry[] {
  let entries: import("node:fs").Dirent[];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out: FileEntry[] = [];
  for (const entry of entries) {
    const name = entry.name;
    if (name.startsWith(SKIP_DIR_PREFIX) || name.startsWith(".")) continue;
    const full = join(dir, name);
    const rel = prefix === "" ? name : `${prefix}/${name}`;
    if (entry.isDirectory()) {
      out.push(...walk(full, rel));
    } else if (entry.isFile()) {
      out.push({ rel, full });
    }
  }
  return out;
}

function readText(path: string): string {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return "";
  }
}

function isExternalRef(ref: string): boolean {
  return /^(https?:|data:|javascript:|mailto:|#|\?)/.test(ref);
}

interface HtmlScanPass {
  deadRefs: DeadRef[];
  refTargets: Set<string>;
  inbound: Set<string>;
}

function scanHtmlFiles(html: FileEntry[], htmlBasenames: Set<string>): HtmlScanPass {
  const deadRefs: DeadRef[] = [];
  const refTargets = new Set<string>();
  const inbound = new Set<string>();
  for (const f of html) {
    const content = readText(f.full);
    REF_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = REF_RE.exec(content)) !== null) {
      const ref = m[1] ?? m[2] ?? "";
      if (!ref || isExternalRef(ref)) continue;
      const target = ref.split("?")[0].split("#")[0];
      if (!target) continue;
      refTargets.add(target);
      if (target.endsWith(".html")) {
        inbound.add(target);
        if (!htmlBasenames.has(target)) {
          const line = content.slice(0, m.index).split("\n").length;
          deadRefs.push({ file: f.rel, target, line });
        }
      }
    }
  }
  return { deadRefs, refTargets, inbound };
}

function scanArtifacts(artifacts: FileEntry[], htmlBasenames: Set<string>): SchemaIssue | null {
  if (artifacts.length === 0) return null;
  const primaries: PrimaryEntry[] = [];
  const entryMisses: EntryMiss[] = [];
  for (const f of artifacts) {
    const text = readText(f.full);
    let j: unknown;
    try {
      j = JSON.parse(text);
    } catch {
      continue;
    }
    if (!j || typeof j !== "object") continue;
    const obj = j as Record<string, unknown>;
    if (obj.primary === true) {
      primaries.push({
        file: f.rel,
        entry: typeof obj.entry === "string" ? obj.entry : "",
        updatedAt: typeof obj.updatedAt === "string" ? obj.updatedAt : "",
      });
    }
    if (typeof obj.entry === "string" && !htmlBasenames.has(obj.entry)) {
      entryMisses.push({ file: f.rel, entry: obj.entry });
    }
  }
  if (primaries.length <= 1 && entryMisses.length === 0) return null;
  primaries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return {
    primary: primaries,
    current: primaries[0]?.file ?? null,
    entryMisses,
  };
}

function scanProject(projectDir: string, projectId: string): ProjectScanResult {
  const all = walk(projectDir);
  const html = all.filter((f) => f.rel.endsWith(".html"));
  const artifacts = all.filter((f) => f.rel.endsWith(".artifact.json"));
  const htmlBasenames = new Set(html.map((f) => basename(f.rel)));

  const { deadRefs, refTargets, inbound } = scanHtmlFiles(html, htmlBasenames);
  const schema = scanArtifacts(artifacts, htmlBasenames);

  const orphans: Orphan[] = html
    .map((f) => f.rel)
    .filter((rel) => !inbound.has(rel) && rel !== "index.html")
    .map((file) => ({ file }));

  return {
    projectId,
    htmlCount: html.length,
    artifactCount: artifacts.length,
    uniqueRefCount: refTargets.size,
    deadRefs,
    schema,
    orphans,
  };
}

function computeTotals(projects: ProjectScanResult[]): ScanResult["totals"] {
  let html = 0;
  let artifact = 0;
  let refs = 0;
  let deadRefs = 0;
  let schemaProjects = 0;
  let orphanProjects = 0;
  for (const p of projects) {
    html += p.htmlCount;
    artifact += p.artifactCount;
    refs += p.uniqueRefCount;
    deadRefs += p.deadRefs.length;
    if (p.schema !== null) schemaProjects++;
    if (p.orphans.length > 0) orphanProjects++;
  }
  return { projects: projects.length, html, artifact, refs, deadRefs, schemaProjects, orphanProjects };
}

const ZERO_TOTALS: ScanResult["totals"] = {
  projects: 0,
  html: 0,
  artifact: 0,
  refs: 0,
  deadRefs: 0,
  schemaProjects: 0,
  orphanProjects: 0,
};

export function scanOdProjects(odRoot: string): ScanResult {
  let entries: import("node:fs").Dirent[];
  try {
    entries = readdirSync(odRoot, { withFileTypes: true });
  } catch {
    return { projects: [], totals: { ...ZERO_TOTALS } };
  }
  const projects: ProjectScanResult[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const result = scanProject(join(odRoot, entry.name), entry.name);
    if (result.htmlCount === 0) continue;
    projects.push(result);
  }
  return { projects, totals: computeTotals(projects) };
}

function isSiblingOf(name: string, base: string): boolean {
  if (name === base) return true;
  return name.startsWith(`${base}-`) || name.startsWith(`${base}_`);
}

function buildPrimaryIndex(artifacts: FileEntry[]): Map<string, string> {
  const byEntry = new Map<string, string>();
  for (const a of artifacts) {
    const text = readText(a.full);
    let j: unknown;
    try {
      j = JSON.parse(text);
    } catch {
      continue;
    }
    if (!j || typeof j !== "object") continue;
    const obj = j as Record<string, unknown>;
    if (obj.primary === true && typeof obj.entry === "string") {
      byEntry.set(obj.entry, typeof obj.updatedAt === "string" ? obj.updatedAt : "");
    }
  }
  return byEntry;
}

function pickLatestSibling(
  deadTarget: string,
  html: FileEntry[],
  primaryByEntry: Map<string, string>
): { file: FileEntry; reason: FixReason } | null {
  const base = deadTarget.replace(/\.html$/, "");
  const candidates = html.filter((f) => isSiblingOf(basename(f.rel).replace(/\.html$/, ""), base));
  if (candidates.length === 0) return null;

  const primary = candidates.find((c) => primaryByEntry.has(basename(c.rel)));
  if (primary) return { file: primary, reason: "primary" };

  const byMtime = [...candidates].sort((a, b) => statSync(b.full).mtimeMs - statSync(a.full).mtimeMs);
  return { file: byMtime[0], reason: "mtime" };
}

function rewriteFile(
  content: string,
  oldTarget: string,
  newTarget: string
): { content: string; changed: boolean } {
  const re = new RegExp(REF_RE.source, "g");
  let changed = false;
  const next = content.replace(re, (match, grp1: string | undefined, grp2: string | undefined) => {
    const captured = grp1 ?? grp2 ?? "";
    const qIdx = captured.search(/[?#]/);
    const bare = qIdx === -1 ? captured : captured.slice(0, qIdx);
    const tail = qIdx === -1 ? "" : captured.slice(qIdx);
    if (bare !== oldTarget) return match;
    changed = true;
    return match.replace(captured, newTarget + tail);
  });
  return { content: next, changed };
}

function applyProposals(proposals: FixProposal[], odRoot: string): number {
  const byFile = new Map<string, FixProposal[]>();
  for (const p of proposals) {
    const key = `${p.projectId}/${p.file}`;
    const list = byFile.get(key);
    if (list) list.push(p);
    else byFile.set(key, [p]);
  }
  let mutated = 0;
  for (const [key, props] of byFile) {
    const [projectId, ...rest] = key.split("/");
    const rel = rest.join("/");
    const fullPath = join(odRoot, projectId, rel);
    let content: string;
    try {
      content = readFileSync(fullPath, "utf8");
    } catch {
      continue;
    }
    let fileChanged = false;
    for (const prop of props) {
      const { content: next, changed } = rewriteFile(content, prop.oldTarget, prop.newTarget);
      if (changed) {
        content = next;
        fileChanged = true;
      }
    }
    if (fileChanged) {
      try {
        writeFileSync(fullPath, content, "utf8");
        mutated++;
      } catch {
        // best-effort: skip files we can't write
      }
    }
  }
  return mutated;
}

export function proposeFixes(odRoot: string, apply: boolean): FixSummary {
  const scan = scanOdProjects(odRoot);
  const proposals: FixProposal[] = [];
  for (const project of scan.projects) {
    if (project.deadRefs.length === 0) continue;
    const projectDir = join(odRoot, project.projectId);
    const all = walk(projectDir);
    const html = all.filter((f) => f.rel.endsWith(".html"));
    const artifacts = all.filter((f) => f.rel.endsWith(".artifact.json"));
    const primaryByEntry = buildPrimaryIndex(artifacts);
    for (const dead of project.deadRefs) {
      const pick = pickLatestSibling(dead.target, html, primaryByEntry);
      if (!pick) continue;
      const newTarget = basename(pick.file.rel);
      if (newTarget === dead.target) continue;
      proposals.push({
        projectId: project.projectId,
        file: dead.file,
        line: dead.line,
        oldTarget: dead.target,
        newTarget,
        reason: pick.reason,
      });
    }
  }
  const mutatedFiles = apply && proposals.length > 0 ? applyProposals(proposals, odRoot) : 0;
  return { proposals, applied: apply, mutatedFiles };
}
