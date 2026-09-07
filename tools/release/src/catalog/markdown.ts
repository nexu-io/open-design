import { parse as parseYaml } from "yaml";

const FRONTMATTER_RE = /^---\s*\n([\s\S]*?)\n---(?:\s*\n|$)/;

export type ParsedMarkdown = {
  body: string;
  data: Record<string, unknown>;
};

export function parseMarkdownWithFrontmatter(raw: string): ParsedMarkdown {
  const match = FRONTMATTER_RE.exec(raw);
  if (!match) {
    return { body: raw, data: {} };
  }
  let data: Record<string, unknown> = {};
  try {
    const parsed = parseYaml(match[1] ?? "");
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      data = parsed as Record<string, unknown>;
    }
  } catch (error) {
    throw new Error(`invalid YAML frontmatter: ${error instanceof Error ? error.message : String(error)}`);
  }
  return {
    body: raw.slice(match[0].length),
    data,
  };
}

export function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

export function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function asLocaleMap(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const out: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (typeof entry === "string" && entry.length > 0) out[key] = entry;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

export function asI18nPayload(value: unknown): Record<string, Record<string, unknown>> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const out: Record<string, Record<string, unknown>> = {};
  for (const [locale, entry] of Object.entries(value as Record<string, unknown>)) {
    if (entry && typeof entry === "object" && !Array.isArray(entry)) {
      out[locale] = entry as Record<string, unknown>;
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

export function extractH1(body: string): string | undefined {
  for (const line of body.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("# ")) return trimmed.slice(2).trim();
  }
  return undefined;
}

export function stripMarkdownInline(text: string): string {
  return text
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractFirstProseParagraph(body: string): string {
  const lines = body.split("\n");
  let pastH1 = false;
  let inFence = false;
  const buf: string[] = [];

  for (const raw of lines) {
    const line = raw.trim();
    if (!pastH1) {
      if (line.startsWith("# ")) pastH1 = true;
      continue;
    }
    if (line.startsWith("```") || line.startsWith("~~~")) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    if (line.startsWith("#")) break;
    if (line.length === 0) {
      if (buf.length > 0) break;
      continue;
    }
    if (line.startsWith(">")) continue;
    if (/^([-*+]\s|\d+\.\s|\||---+$|\*\*\*+$|___+$)/.test(line)) {
      if (buf.length > 0) break;
      continue;
    }
    buf.push(line);
  }
  return stripMarkdownInline(buf.join(" "));
}

export function firstParagraph(text: string | undefined, fallback = ""): string {
  if (!text) return fallback;
  return text.split("\n").map((l) => l.trim()).find((l) => l.length > 0) ?? fallback;
}

export function titleizeSlug(slug: string): string {
  const overrides: Record<string, string> = { "rtl-and-bidi": "RTL & Bidi" };
  if (overrides[slug]) return overrides[slug]!;
  return slug
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function extractCategoryBlock(body: string): { category: string; tagline: string } {
  const lines = body.split("\n");
  let category = "";
  const taglineLines: string[] = [];
  let inBlock = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (!inBlock) {
      const m = /^>\s*Category:\s*(.+)$/i.exec(line);
      if (m?.[1]) {
        category = m[1].trim();
        inBlock = true;
      }
      continue;
    }
    if (line.startsWith(">")) {
      const text = line.replace(/^>\s?/, "").trim();
      if (text.length > 0) taglineLines.push(text);
    } else if (line.length === 0 && taglineLines.length === 0) {
      // tolerate blank
    } else {
      break;
    }
  }
  return { category, tagline: taglineLines.join(" ").trim() };
}

export function extractAtmosphere(body: string): string {
  const lines = body.split("\n");
  let inSection = false;
  const buf: string[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!inSection) {
      if (/^##\s+1\./.test(raw) || /^##\s+.*Atmosphere/i.test(raw)) {
        inSection = true;
      }
      continue;
    }
    if (line.startsWith("##")) break;
    if (line.length === 0 && buf.length > 0) break;
    if (line.length === 0) continue;
    buf.push(line);
  }
  return buf.join(" ").trim();
}

const HEX_RE = /#[0-9a-fA-F]{6}\b/g;

export function extractPalette(body: string, limit = 5): string[] {
  const seen = new Set<string>();
  for (const hex of body.match(HEX_RE) ?? []) {
    seen.add(hex.toLowerCase());
    if (seen.size >= limit) break;
  }
  return Array.from(seen);
}
