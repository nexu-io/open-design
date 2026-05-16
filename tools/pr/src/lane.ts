/**
 * Lane derivation from touched paths, plus forbidden-surface and public-seam
 * detection. Rules track docs/code-review-guidelines.md §2 (Forbidden
 * surfaces) and §4 (review lanes).
 */

import type { ForbiddenHit, Lane } from "./types.js";

export const SKILL_DIR = /^skills\/[^/]+\//;
export const DESIGN_DIR = /^design-systems\/[^/]+\//;
export const CRAFT_DIR = /^craft\/[^/]+\.md$/;

const CONTRACT_PATHS = [
  /^packages\/contracts\//,
  /^packages\/sidecar-proto\//,
  /^apps\/daemon\/src\/.*\/(routes|api|sse)\b/,
];

const DOCS_ONLY = [
  /^README(\..+)?\.md$/,
  /^CONTRIBUTING(\..+)?\.md$/,
  /^QUICKSTART(\..+)?\.md$/,
  /^CHANGELOG\.md$/,
  /^TRANSLATIONS\.md$/,
  /^docs\//,
];

// Files we count toward changedFiles but suppress from the top-N preview.
const NOISY_FILE_PATTERNS = [
  /^pnpm-lock\.yaml$/,
  /^CHANGELOG\.md$/,
  /^README\.[a-zA-Z-]+\.md$/,
  /^CONTRIBUTING\.[a-zA-Z-]+\.md$/,
  /^QUICKSTART\.[a-zA-Z-]+\.md$/,
  /^generated\//,
  /^.*\.lock$/,
];

export function isNoisyFile(filePath: string): boolean {
  return NOISY_FILE_PATTERNS.some((rx) => rx.test(filePath));
}

export function deriveLane(paths: string[]): { lane: Lane; hits: Set<Lane> } {
  const hits = new Set<Lane>();
  let allDocs = paths.length > 0;
  for (const filePath of paths) {
    if (SKILL_DIR.test(filePath)) hits.add("skill");
    else if (DESIGN_DIR.test(filePath)) hits.add("design-system");
    else if (CRAFT_DIR.test(filePath)) hits.add("craft");
    else if (CONTRACT_PATHS.some((rx) => rx.test(filePath))) hits.add("contract");
    if (!DOCS_ONLY.some((rx) => rx.test(filePath))) allDocs = false;
  }
  if (hits.size === 0 && allDocs) return { lane: "docs", hits: new Set(["docs"]) };
  if (hits.size === 0) return { lane: "default", hits: new Set(["default"]) };
  if (hits.size === 1) {
    const [only] = [...hits];
    return { lane: (only ?? "default") as Lane, hits };
  }
  return { lane: "multi", hits };
}

// Path-only forbidden surfaces. We do NOT check root `package.json` here —
// AGENTS.md §Root command boundary forbids specific *lifecycle* aliases
// (pnpm dev / pnpm test / pnpm build / …), not the file itself, and
// tools-control-plane entrypoints like `pnpm tools-pr` are explicitly
// allowed. Distinguishing "forbidden alias added" from "allowed entry
// added" requires reading the diff content, which is the role of
// `pnpm guard` rather than a path-derived classify tag.
export function deriveForbidden(paths: string[]): ForbiddenHit[] {
  const hits: ForbiddenHit[] = [];
  if (paths.some((p) => p.startsWith("apps/nextjs/"))) hits.push("restores-apps/nextjs");
  if (paths.some((p) => p.startsWith("packages/shared/"))) hits.push("restores-packages/shared");
  return hits;
}

export function deriveSeams(paths: string[]): string[] {
  const seams: string[] = [];
  if (paths.some((p) => p.startsWith("packages/contracts/"))) seams.push("packages/contracts");
  if (paths.some((p) => p.startsWith("packages/sidecar-proto/"))) seams.push("packages/sidecar-proto");
  if (paths.some((p) => p.startsWith("apps/daemon/src/") && /(routes|api|sse|http)/i.test(p)))
    seams.push("daemon HTTP/SSE routes");
  if (paths.some((p) => /migration|schema|sql/i.test(p))) seams.push("persisted schema");
  if (paths.some((p) => p === "pnpm-workspace.yaml")) seams.push("workspace layout");
  if (paths.some((p) => p === "package.json")) seams.push("root package.json");
  return seams;
}
