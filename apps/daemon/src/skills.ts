// Skill registry. Scans <projectRoot>/skills/* for SKILL.md files, parses
// front-matter, returns listing. No watching in this MVP — re-scans on every
// GET /api/skills, which is fine for dozens of skills.

import type { Dirent } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { parseFrontmatter } from "./frontmatter.js";
import { SKILLS_CWD_ALIAS } from "./cwd-aliases.js";

// Persisted skill ids on existing projects can outlive a folder rename.
// listSkills() derives the id from the SKILL.md frontmatter `name`, so once
// a skill is renamed the old id stops resolving and composeSystemPrompt
// silently drops the skill body for projects saved against the old id.
// This map forwards deprecated ids to their current canonical id; callers
// resolve through findSkillById() before scanning the listing. Leave entries
// here for at least one stable release after a rename so on-disk projects
// keep composing with the intended skill prompt.
export const SKILL_ID_ALIASES = Object.freeze({
  "editorial-collage": "open-design-landing",
  "editorial-collage-deck": "open-design-landing-deck",
});

type SkillMode = "image" | "video" | "audio" | "deck" | "design-system" | "template" | "prototype";
type SkillSurface = "web" | "image" | "video" | "audio";
type SkillPlatform = "desktop" | "mobile" | null;
type JsonRecord = Record<string, unknown>;

interface SkillFrontmatter extends JsonRecord {
  name?: unknown;
  description?: unknown;
  triggers?: unknown;
  od?: JsonRecord & { craft?: JsonRecord; preview?: JsonRecord; design_system?: JsonRecord };
}

export interface SkillInfo {
  id: string;
  name: string;
  description: string;
  triggers: unknown[];
  mode: SkillMode;
  surface: SkillSurface;
  craftRequires: string[];
  platform: SkillPlatform;
  scenario: string;
  previewType: string;
  designSystemRequired: boolean;
  defaultFor: string[];
  upstream: string | null;
  featured: number | null;
  fidelity: "wireframe" | "high-fidelity" | null;
  speakerNotes: boolean | null;
  animations: boolean | null;
  examplePrompt: string;
  aggregatesExamples: boolean;
  body: string;
  dir: string;
}

interface DerivedExample {
  key: string;
}

export interface DerivedSkillIdParts {
  parentId: string;
  childKey: string;
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object";
}

function asSkillFrontmatter(value: unknown): SkillFrontmatter {
  return isRecord(value) ? (value as SkillFrontmatter) : {};
}

export function resolveSkillId(id: unknown): unknown {
  if (typeof id !== "string" || id.length === 0) return id;
  return (SKILL_ID_ALIASES as Readonly<Record<string, string>>)[id] ?? id;
}

// Lookup helper that mirrors `skills.find((s) => s.id === id)` but first
// rewrites any deprecated id to its current canonical form. Use this at
// every site that resolves a stored or external skill id; calling
// `.find()` directly will silently miss aliased ids.
export function findSkillById(skills: unknown, id: unknown): SkillInfo | undefined {
  if (!Array.isArray(skills) || typeof id !== "string" || id.length === 0) {
    return undefined;
  }
  const canonical = resolveSkillId(id);
  return (skills as SkillInfo[]).find((s) => s.id === canonical);
}

export async function listSkills(skillsRoot: string): Promise<SkillInfo[]> {
  const out: SkillInfo[] = [];
  let entries: Dirent[] = [];
  try {
    entries = await readdir(skillsRoot, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(skillsRoot, entry.name);
    const skillPath = path.join(dir, "SKILL.md");
    try {
      const stats = await stat(skillPath);
      if (!stats.isFile()) continue;
      const raw = await readFile(skillPath, "utf8");
      const { data: parsedData, body } = parseFrontmatter(raw) as { data: unknown; body: string };
      const data = asSkillFrontmatter(parsedData);
      const hasAttachments = await dirHasAttachments(dir);
      const mode = normalizeMode(data.od?.mode, body, data.description);
      const surface = normalizeSurface(data.od?.surface, mode);
      const platform = normalizePlatform(
        data.od?.platform,
        mode,
        body,
        data.description
      );
      const scenario = normalizeScenario(
        data.od?.scenario,
        body,
        data.description
      );
      const designSystemRequired =
        typeof data.od?.design_system?.requires === "boolean"
          ? data.od.design_system.requires
          : true;
      const upstream =
        typeof data.od?.upstream === "string" ? data.od.upstream : null;
      const previewType =
        typeof data.od?.preview?.type === "string" ? data.od.preview.type : "html";
      const parentId = typeof data.name === "string" && data.name ? data.name : entry.name;
      const description = typeof data.description === "string" ? data.description : "";
      const parentBody = hasAttachments ? withSkillRootPreamble(body, dir) : body;
      // Pre-compute derived examples so the parent entry can advertise
      // `aggregatesExamples` in the same push. The frontend uses that
      // flag to hide the parent card from the gallery (its preview would
      // duplicate one of the derived cards), while the daemon keeps the
      // parent in the listing so `findSkillById` still resolves it for
      // system-prompt composition and id alias lookups.
      const derivedExamples = await collectDerivedExamples(dir);
      const aggregatesExamples = derivedExamples.length > 0;
      out.push({
        id: parentId,
        name: parentId,
        description,
        triggers: Array.isArray(data.triggers) ? data.triggers : [],
        mode,
        surface,
        craftRequires: normalizeCraftRequires(data.od?.craft?.requires),
        platform,
        scenario,
        previewType,
        designSystemRequired,
        defaultFor: normalizeDefaultFor(data.od?.default_for),
        upstream,
        featured: normalizeFeatured(data.od?.featured),
        // Optional metadata hints used by 'Use this prompt' fast-create so
        // the resulting project mirrors the shipped example.html. Each hint
        // is only consumed when its kind matches the skill mode; missing
        // hints fall back to the same defaults the new-project form uses.
        fidelity: normalizeFidelity(data.od?.fidelity),
        speakerNotes: normalizeBoolHint(data.od?.speaker_notes),
        animations: normalizeBoolHint(data.od?.animations),
        examplePrompt: derivePrompt(data),
        aggregatesExamples,
        body: parentBody,
        dir,
      });

      // Surface every example sitting next to a SKILL.md as its own card so
      // a single skill (e.g. live-artifact) can ship a small gallery of
      // hand-crafted samples without needing one SKILL.md per sample. Each
      // derived card inherits the parent's mode/platform/surface/scenario
      // so existing TYPE/SURFACE filters keep working; the synthetic id
      // `<parent>:<child>` lets `/api/skills/:id/example` resolve straight
      // to the matching HTML on disk. We deliberately do not inherit
      // `featured` so derived cards never crowd the magazine row.
      for (const example of derivedExamples) {
        out.push({
          id: `${parentId}:${example.key}`,
          name: humanizeExampleName(example.key),
          description,
          triggers: Array.isArray(data.triggers) ? data.triggers : [],
          mode,
          surface,
          craftRequires: [],
          platform,
          scenario,
          previewType,
          designSystemRequired,
          defaultFor: [],
          upstream,
          featured: null,
          fidelity: normalizeFidelity(data.od?.fidelity),
          speakerNotes: normalizeBoolHint(data.od?.speaker_notes),
          animations: normalizeBoolHint(data.od?.animations),
          examplePrompt: derivePrompt(data),
          aggregatesExamples: false,
          // Inherit the parent's full SKILL.md body so 'Use this prompt'
          // on a derived card seeds the agent with the same workflow the
          // parent describes. Without this, picking a derived card would
          // compose an empty system prompt and the agent would have no
          // skill instructions.
          body: parentBody,
          dir,
        });
      }
    } catch {
      // Skip unreadable entries — this is discovery, not validation.
    }
  }
  return out;
}

// Discover example artifacts that live alongside SKILL.md under
// `<dir>/examples/`. Only the single-file layout is surfaced:
//
//   `examples/<name>.html` — pre-baked, self-contained sample.
//
// We deliberately do not surface the subfolder layout (e.g. live-artifact's
// `examples/<name>/template.html` + `data.json`) because those templates
// still hold `{{data.x}}` placeholders that only the daemon-side renderer
// fills in. Showing the raw template would render visible placeholder
// braces in the gallery — worse than not surfacing the example at all.
// To ship a subfolder-style example, place the baked output beside the
// folder as `examples/<name>.html` (the canonical render) and keep the
// subfolder around as agent-readable source.
async function collectDerivedExamples(dir: string): Promise<DerivedExample[]> {
  const examplesDir = path.join(dir, "examples");
  let entries: Dirent[] = [];
  try {
    entries = await readdir(examplesDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out: DerivedExample[] = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!entry.name.toLowerCase().endsWith(".html")) continue;
    const key = entry.name.replace(/\.html$/i, "");
    if (!isSafeExampleKey(key)) continue;
    out.push({ key });
  }
  // Stable order so the gallery renders the same sequence on every reload.
  out.sort((a, b) => a.key.localeCompare(b.key));
  return out;
}

// Reject keys that could escape the examples folder or break the
// `<parent>:<child>` id format. Letters/digits/dash/dot/underscore only,
// and never the dotfile path-traversal patterns.
function isSafeExampleKey(key: string): boolean {
  if (!key || key.startsWith(".")) return false;
  if (key.includes(":")) return false;
  return /^[A-Za-z0-9._-]+$/.test(key);
}

// Turn a basename like `stock-portfolio-live` into a title-cased label
// (`Stock Portfolio Live`) so the gallery card has a readable heading
// without forcing every example to ship its own frontmatter.
function humanizeExampleName(key: string): string {
  return key
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map((word) =>
      word.length === 0
        ? word
        : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    )
    .join(" ");
}

// Used by `/api/skills/:id/example` to resolve a derived id back to its
// on-disk file. Returns null when the key is unsafe; the route checks
// `fs.existsSync` against the returned path before reading.
export function resolveDerivedExamplePath(parentDir: string, childKey: string): string | null {
  if (!isSafeExampleKey(childKey)) return null;
  return path.join(parentDir, "examples", `${childKey}.html`);
}

// Split a `<parent>:<child>` synthetic id into its two halves. Returns
// null for non-derived ids so the caller can fall through to the regular
// listing-based lookup.
export function splitDerivedSkillId(id: unknown): DerivedSkillIdParts | null {
  if (typeof id !== "string") return null;
  const idx = id.indexOf(":");
  if (idx <= 0 || idx === id.length - 1) return null;
  const parentId = id.slice(0, idx);
  const childKey = id.slice(idx + 1);
  if (!isSafeExampleKey(childKey)) return null;
  return { parentId, childKey };
}

// Skills that ship side files (e.g. `assets/template.html`, `references/*.md`)
// need the agent to know where the skill lives on disk — relative paths in the
// SKILL.md body would otherwise resolve against the agent's CWD, which is the
// project folder (`.od/projects/<id>/`), not the skill folder.
//
// We prepend a short preamble that advertises two paths:
//
//   1. A CWD-relative alias path (`.od-skills/<folder>/`) — the primary one.
//      Before spawning the agent the chat handler copies the active skill
//      into `<cwd>/.od-skills/<folder>/` (see `cwd-aliases.ts`), so this
//      path is inside the agent's working directory on every CLI and is
//      not blocked by directory-access policies (issue #430).
//   2. The absolute repo path — a fallback for the cases the staged copy
//      cannot exist for: `/api/runs` calls without a project (cwd falls
//      back to the repo root, where the absolute path *is* an in-cwd
//      path), or environments where staging fails. Claude/Copilot are
//      additionally given `--add-dir` for that absolute path, so the
//      fallback round-trips even under their permission policy.
//
// Authoring guidance lives in the preamble itself so an agent can pick
// the right form on its own without daemon-side feature detection.
function withSkillRootPreamble(body: string, dir: string): string {
  const referencedFiles = collectReferencedSideFiles(body);
  const folder = path.basename(dir);
  const skillRootRel = `${SKILLS_CWD_ALIAS}/${folder}`;
  const exampleFile = referencedFiles[0];
  const relativeGuidance = exampleFile
    ? "> below references side files such as `" + exampleFile + "`, prefer the\n" +
      "> relative form rooted at the first path above — e.g. open `" +
      skillRootRel + "/" + exampleFile + "`."
    : "> below references side files, prefer the relative form rooted at the\n" +
      "> first path above.";
  const absoluteGuidance = exampleFile
    ? "> back to the absolute path: `" + path.join(dir, exampleFile) + "`."
    : "> back to the absolute skill root above.";
  const preamble = [
    "> **Skill root (relative to project):** `" + skillRootRel + "/`",
    "> **Skill root (absolute fallback):** `" + dir + "`",
    ">",
    "> This skill ships side files alongside `SKILL.md`. When the workflow",
    relativeGuidance,
    "> If that path is not reachable from your working directory, fall",
    absoluteGuidance,
    "> Either form resolves to the same file; the relative form keeps you",
    "> inside the project working directory, which is preferred.",
    ...(referencedFiles.length > 0
      ? [
          ">",
          "> Known side files in this skill: " +
            referencedFiles.map((file) => "`" + file + "`").join(", ") +
            ".",
        ]
      : []),
    "",
    "",
  ].join("\n");
  return preamble + body;
}

function collectReferencedSideFiles(body: string): string[] {
  const files = new Set<string>();
  const matches = body.matchAll(/\b(?:assets|references)\/[A-Za-z0-9._-]+\b/g);
  for (const match of matches) files.add(match[0]);
  if (/\bexample\.html\b/.test(body)) files.add("example.html");
  return Array.from(files).sort();
}

async function dirHasAttachments(dir: string): Promise<boolean> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries.some(
      (e) =>
        e.name !== "SKILL.md" &&
        (e.isDirectory() || /\.(md|html|css|js|json|txt)$/i.test(e.name))
    );
  } catch {
    return false;
  }
}

// Craft sections live at <projectRoot>/craft/<name>.md. We accept any
// alphanumeric+dash slug here so adding a new section is as simple as
// dropping a file in craft/ and listing its name in the skill — no
// daemon-side allowlist to keep in sync. The compose path checks the
// file actually exists before injecting; missing files fall through
// silently. The frontend can render the requested list verbatim.
function normalizeCraftRequires(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of value) {
    if (typeof v !== "string") continue;
    const slug = v.trim().toLowerCase();
    if (!slug || !/^[a-z0-9][a-z0-9-]*$/.test(slug)) continue;
    if (seen.has(slug)) continue;
    seen.add(slug);
    out.push(slug);
  }
  return out;
}

function normalizeDefaultFor(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(String);
  return [String(value)];
}

// Optional `od.fidelity` hint for prototype skills. Only 'wireframe' and
// 'high-fidelity' are meaningful — anything else collapses to null so the
// caller falls back to the form default ('high-fidelity').
function normalizeFidelity(value: unknown): "wireframe" | "high-fidelity" | null {
  if (value === "wireframe" || value === "high-fidelity") return value;
  return null;
}

// Coerce truthy / falsy strings ("true", "yes", "false", "no") and booleans
// to a real boolean. Returns null for anything we can't interpret so the
// caller knows to fall back to the form default.
function normalizeBoolHint(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const v = value.trim().toLowerCase();
    if (v === "true" || v === "yes" || v === "1") return true;
    if (v === "false" || v === "no" || v === "0") return false;
  }
  return null;
}

// Coerce `od.featured` into a numeric priority. Lower numbers float to the
// top of the Examples gallery; `true` is treated as priority 1; anything
// missing/unrecognised becomes null so non-featured skills keep their
// natural alphabetical order.
function normalizeFeatured(value: unknown): number | null {
  if (value === true) return 1;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

// Prefer an explicitly authored `od.example_prompt`. Fall back to the
// skill description's first sentence — it's already written in actionable
// language ("Admin / analytics dashboard in a single HTML file…") so it
// serves as a passable starter prompt.
function derivePrompt(data: SkillFrontmatter): string {
  const explicit = data.od?.example_prompt;
  if (typeof explicit === "string" && explicit.trim()) return explicit.trim();
  const desc =
    typeof data.description === "string" ? data.description.trim() : "";
  if (!desc) return "";
  const collapsed = desc.replace(/\s+/g, " ").trim();
  const firstSentence = collapsed.match(/^.+?[.!?。！？](?:\s|$)/)?.[0]?.trim();
  return (firstSentence || collapsed).slice(0, 320);
}

function inferMode(body: unknown, description: unknown): SkillMode {
  const hay = `${description ?? ""}\n${body ?? ""}`.toLowerCase();
  if (/\bimage|poster|illustration|photography|图片|海报|插画/.test(hay)) return "image";
  if (/\bvideo|motion|shortform|animation|视频|动效|短片/.test(hay)) return "video";
  if (/\baudio|music|jingle|tts|sound|音频|音乐|配音|音效/.test(hay)) return "audio";
  if (/\bppt|deck|slide|presentation|幻灯|投影/.test(hay)) return "deck";
  if (/\bdesign[- ]system|\bdesign\.md|\bdesign tokens/.test(hay))
    return "design-system";
  if (/\btemplate\b/.test(hay)) return "template";
  return "prototype";
}

function normalizeMode(value: unknown, body: unknown, description: unknown): SkillMode {
  if (
    value === "image" || value === "video" || value === "audio" || value === "deck" ||
    value === "design-system" || value === "template" || value === "prototype"
  ) return value;
  return inferMode(body, description);
}

const KNOWN_SURFACES = new Set<SkillSurface>(["web", "image", "video", "audio"]);
function normalizeSurface(value: unknown, mode: SkillMode): SkillSurface {
  if (typeof value === "string") {
    const v = value.trim().toLowerCase();
    if (KNOWN_SURFACES.has(v as SkillSurface)) return v as SkillSurface;
  }
  if (mode === "image" || mode === "video" || mode === "audio") return mode;
  return "web";
}

// Validate platform tag — only desktop / mobile are meaningful for the
// Examples gallery. Falls back to autodetecting "mobile" from descriptions
// so legacy skills sort under the right pill without authoring changes.
function normalizePlatform(value: unknown, mode: SkillMode, body: unknown, description: unknown): SkillPlatform {
  if (value === "desktop" || value === "mobile") return value;
  if (mode !== "prototype") return null;
  const hay = `${description ?? ""}\n${body ?? ""}`.toLowerCase();
  if (/mobile|phone|ios|android|手机|移动端/.test(hay)) return "mobile";
  return "desktop";
}

// Normalise a scenario tag to a small fixed vocabulary so the filter pills
// stay tidy. Unknown values pass through verbatim so authors can experiment;
// missing values default to "general".
const KNOWN_SCENARIOS = new Set([
  "general",
  "engineering",
  "product",
  "design",
  "marketing",
  "sales",
  "finance",
  "hr",
  "operations",
  "support",
  "legal",
  "education",
  "personal",
]);
function normalizeScenario(value: unknown, body: unknown, description: unknown): string {
  if (typeof value === "string") {
    const v = value.trim().toLowerCase();
    if (v) return v;
  }
  const hay = `${description ?? ""}\n${body ?? ""}`.toLowerCase();
  if (/finance|invoice|expense|budget|p&l|revenue/.test(hay)) return "finance";
  if (/\bhr\b|onboarding|payroll|employee|人事/.test(hay)) return "hr";
  if (/marketing|campaign|brand|landing/.test(hay)) return "marketing";
  if (/runbook|incident|deploy|engineering|sre|api/.test(hay))
    return "engineering";
  if (/spec|prd|roadmap|product manager|product team/.test(hay))
    return "product";
  if (/design system|moodboard|mockup|ui kit/.test(hay)) return "design";
  if (/sales|quote|proposal|lead/.test(hay)) return "sales";
  if (/operations|ops|logistics|inventory/.test(hay)) return "operations";
  return "general";
}
// Surface the vocabulary so callers (frontend filter UI) could mirror it
// later if they want to. Not exported today, kept here for documentation.
void KNOWN_SCENARIOS;
