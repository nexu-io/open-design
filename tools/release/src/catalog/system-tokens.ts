import { existsSync, readFileSync } from "node:fs";

import type {
  CatalogSystemPreviewTheme,
  CatalogSystemToken,
  CatalogSystemTokenGroup,
  CatalogSystemTokenGroupId,
  CatalogSystemTokenType,
  CatalogSystemTokens,
} from "./schema.ts";

const TOKEN_GROUP_IDS: ReadonlyArray<CatalogSystemTokenGroupId> = [
  "surface",
  "text",
  "border",
  "accent",
  "semantic",
  "fonts",
  "type",
  "spacing",
  "radius",
  "elevation",
  "focus",
  "motion",
  "layout",
  "other",
];

const VALID_TYPES: ReadonlySet<string> = new Set([
  "color",
  "dimension",
  "shadow",
  "fontFamily",
  "number",
  "duration",
  "cubicBezier",
]);

function groupOf(name: string): CatalogSystemTokenGroupId {
  if (name.startsWith("--bg") || name.startsWith("--surface")) return "surface";
  if (name.startsWith("--fg") || name.startsWith("--muted") || name.startsWith("--meta")) return "text";
  if (name.startsWith("--border")) return "border";
  if (name.startsWith("--accent")) return "accent";
  if (name.startsWith("--success") || name.startsWith("--warn") || name.startsWith("--danger")) return "semantic";
  if (name.startsWith("--font-")) return "fonts";
  if (name.startsWith("--text-") || name.startsWith("--leading-") || name.startsWith("--tracking-")) return "type";
  if (name.startsWith("--space-") || name.startsWith("--section-y")) return "spacing";
  if (name.startsWith("--radius")) return "radius";
  if (name.startsWith("--elev")) return "elevation";
  if (name.startsWith("--focus")) return "focus";
  if (name.startsWith("--motion") || name.startsWith("--ease")) return "motion";
  if (name.startsWith("--container")) return "layout";
  return "other";
}

/** Shape the canonical design-tokens.json contract for snapshot consumers. */
export function loadCatalogSystemTokens(file: string): CatalogSystemTokens | undefined {
  if (!existsSync(file)) return undefined;

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return undefined;
  }
  if (parsed == null || typeof parsed !== "object") return undefined;

  const data = parsed as {
    tokens?: unknown;
    summary?: { totalTokens?: unknown; grade?: unknown };
  };
  if (!Array.isArray(data.tokens)) return undefined;

  const buckets = new Map<CatalogSystemTokenGroupId, CatalogSystemToken[]>();
  const byName = new Map<string, string>();
  for (const raw of data.tokens) {
    if (raw == null || typeof raw !== "object") continue;
    const value = raw as Record<string, unknown>;
    if (typeof value.name !== "string" || typeof value.value !== "string") continue;
    if (typeof value.type !== "string" || !VALID_TYPES.has(value.type)) continue;

    const token: CatalogSystemToken = {
      name: value.name,
      value: value.value,
      type: value.type as CatalogSystemTokenType,
      layer: typeof value.layer === "string" ? value.layer : "",
    };
    byName.set(token.name, token.value);
    const group = groupOf(token.name);
    const existing = buckets.get(group);
    if (existing) existing.push(token);
    else buckets.set(group, [token]);
  }
  if (buckets.size === 0) return undefined;

  const groups: CatalogSystemTokenGroup[] = [];
  for (const id of TOKEN_GROUP_IDS) {
    const tokens = buckets.get(id);
    if (tokens?.length) groups.push({ id, tokens });
  }

  const bg = byName.get("--bg");
  const fg = byName.get("--fg");
  const accent = byName.get("--accent");
  const theme: CatalogSystemPreviewTheme | null = bg && fg && accent
    ? {
        bg,
        surface: byName.get("--surface") ?? bg,
        fg,
        muted: byName.get("--muted") ?? fg,
        border: byName.get("--border") ?? "rgba(0,0,0,0.12)",
        accent,
        accentOn: byName.get("--accent-on") ?? "#ffffff",
        fontDisplay: byName.get("--font-display") ?? "system-ui, sans-serif",
        fontBody: byName.get("--font-body") ?? "system-ui, sans-serif",
        radius: byName.get("--radius-md") ?? "10px",
      }
    : null;

  return {
    total: typeof data.summary?.totalTokens === "number"
      ? data.summary.totalTokens
      : groups.reduce((sum, group) => sum + group.tokens.length, 0),
    grade: typeof data.summary?.grade === "string" ? data.summary.grade : null,
    groups,
    theme,
  };
}
