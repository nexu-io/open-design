/*
 * youtube-tutorials/lib — shared core for backfilling and the daily cron that
 * keeps `app/content/tutorials/*.md` in sync with the latest community YouTube
 * tutorials about Open Design.
 *
 * Two entry points consume this module:
 *   - backfill-tutorials.ts      one-off, reads pre-fetched yt-dlp JSON lines
 *   - fetch-youtube-tutorials.ts daily cron, queries the YouTube Data API v3
 *
 * Both share the same relevance gate, LLM copy generation, slug rules, and
 * markdown writer so the backfilled entries and the cron-authored entries are
 * indistinguishable.
 */
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Absolute path to `app/content/tutorials`, resolved from this file. */
export const TUTORIALS_DIR = path.resolve(__dirname, '../../app/content/tutorials');

export const CATEGORIES = [
  'Getting started',
  'Tutorial',
  'Demo',
  'Review',
  'Community',
] as const;
export type Category = (typeof CATEGORIES)[number];

/** Normalized video record both fetch paths converge on before generation. */
export interface VideoInput {
  videoId: string;
  title: string;
  author: string;
  /** ISO date (YYYY-MM-DD). */
  date: string;
  durationSeconds: number;
  description: string;
  /** Best-effort BCP-47 language hint from the source ('en', 'zh', 'pt', ...). */
  language?: string;
  viewCount?: number;
}

/** Editorial copy produced by the LLM for one tutorial. */
export interface GeneratedCopy {
  summary: string;
  category: Category;
  body: string;
  /** Short kebab topic used to build the slug, e.g. 'full-walkthrough'. */
  slugTopic: string;
}

// ---------- env ----------

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var ${name}`);
  return v;
}

/**
 * Anthropic token + base URL. Supports both a direct Anthropic key and the
 * OpenRouter gateway Joey runs locally (ANTHROPIC_AUTH_TOKEN + ANTHROPIC_BASE_URL).
 */
function anthropicConfig(): { token: string; baseUrl: string } {
  const token = process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN;
  if (!token) {
    throw new Error('Missing ANTHROPIC_API_KEY or ANTHROPIC_AUTH_TOKEN');
  }
  const baseUrl = (process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com').replace(/\/$/, '');
  return { token, baseUrl };
}

const LLM_MODEL = process.env.TUTORIALS_LLM_MODEL || 'claude-haiku-4-5-20251001';

// ---------- slug helpers ----------

export function kebab(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

/** Build a unique slug, falling back to the video id if topic+author collide. */
export function buildSlug(slugTopic: string, author: string, taken: Set<string>, videoId: string): string {
  const authorPart = kebab(author) || 'community';
  let base = `open-design-${kebab(slugTopic) || 'tutorial'}-${authorPart}`.replace(/-{2,}/g, '-');
  let slug = base;
  if (taken.has(slug)) slug = `${base}-${videoId.toLowerCase().slice(0, 6)}`;
  let n = 2;
  while (taken.has(slug)) slug = `${base}-${n++}`;
  taken.add(slug);
  return slug;
}

// ---------- existing content ----------

/** youtubeId set already present in the content dir, so we never duplicate. */
export async function readExistingVideoIds(dir = TUTORIALS_DIR): Promise<Set<string>> {
  const ids = new Set<string>();
  let files: string[] = [];
  try {
    files = await readdir(dir);
  } catch {
    return ids;
  }
  for (const f of files) {
    if (!f.endsWith('.md') || f.startsWith('_')) continue;
    const raw = await readFile(path.join(dir, f), 'utf8');
    const m = raw.match(/^youtubeId:\s*([\w-]{11})\s*$/m);
    if (m) ids.add(m[1]);
  }
  return ids;
}

export async function readExistingSlugs(dir = TUTORIALS_DIR): Promise<Set<string>> {
  const slugs = new Set<string>();
  let files: string[] = [];
  try {
    files = await readdir(dir);
  } catch {
    return slugs;
  }
  for (const f of files) {
    if (f.endsWith('.md') && !f.startsWith('_')) slugs.add(f.replace(/\.md$/, ''));
  }
  return slugs;
}

// ---------- LLM ----------

interface AnthropicMessageResponse {
  content?: { type: string; text?: string }[];
}

async function callLLM(system: string, user: string, maxTokens = 1024): Promise<string> {
  const { token, baseUrl } = anthropicConfig();
  const res = await fetch(`${baseUrl}/v1/messages`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': token,
      authorization: `Bearer ${token}`,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: LLM_MODEL,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: user }],
    }),
  });
  if (!res.ok) {
    throw new Error(`LLM HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  const data = (await res.json()) as AnthropicMessageResponse;
  return (data.content ?? [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text ?? '')
    .join('')
    .trim();
}

function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error(`No JSON object in LLM output: ${text.slice(0, 200)}`);
  return JSON.parse(candidate.slice(start, end + 1));
}

/**
 * Relevance gate for the cron. YouTube search for "open design" surfaces many
 * lookalikes (OpenCode, OpenClaude, a separate "Open Codesign" repo, generic
 * AI-agent roundups). Returns true only when the video is specifically about
 * nexu-io's Open Design product.
 */
export async function isAboutOpenDesign(video: VideoInput): Promise<boolean> {
  const system =
    'You decide whether a YouTube video is specifically about the open-source product "Open Design" ' +
    'by nexu-io (github.com/nexu-io/open-design) — a self-evolving design agent that runs on coding ' +
    'agents (Claude Code, Codex, etc.) and is positioned as a free/open-source alternative to Claude Design. ' +
    'It has ~50k GitHub stars. Reject videos that are actually about different products that merely sound ' +
    'similar: "OpenCode", "OpenClaude", a smaller "Open Codesign" repo (a few thousand stars), Google Stitch, ' +
    'Figma, or generic "AI agents / AI coding" roundups that do not focus on Open Design. ' +
    'Reply with strict JSON: {"isOpenDesign": boolean, "reason": string}.';
  const user = JSON.stringify({
    title: video.title,
    channel: video.author,
    description: video.description.slice(0, 1500),
  });
  try {
    const out = extractJson(await callLLM(system, user, 256)) as { isOpenDesign?: boolean };
    return out.isOpenDesign === true;
  } catch {
    // On parse/LLM failure, be conservative and exclude.
    return false;
  }
}

export interface CandidateScore {
  isOpenDesign: boolean;
  /** Suggested 0-100 priority score (completeness 40 + relevance 40 + reach 20). */
  overall: number;
  /** Is it a complete, followable tutorial (5) vs a short/teaser/mention (0-1). */
  completeness: number; // 0-5
  /** How precisely the video is about Open Design specifically. */
  relevance: number; // 0-5
  /** Audience reach tier derived from view count. */
  reach: number; // 0-5
  /** Suggested verdict: worth adding to the catalogue or not. */
  recommend: boolean;
  /** One short line explaining the score. */
  reason: string;
}

/**
 * Suggested "add it" verdict: a candidate is worth recommending only when it is
 * an actual (at least partial) tutorial that is squarely about Open Design.
 * Filters out teasers/Shorts (low completeness) and passing mentions (low
 * relevance) regardless of view count. Reach never rescues a non-tutorial.
 */
export function isRecommended(score: Pick<CandidateScore, 'completeness' | 'relevance'>): boolean {
  return score.completeness >= 2 && score.relevance >= 3;
}

/** Map a view count to a 0-5 reach tier (log-ish buckets). */
export function reachScore(viewCount?: number): number {
  const v = viewCount ?? 0;
  if (v >= 50000) return 5;
  if (v >= 10000) return 4;
  if (v >= 3000) return 3;
  if (v >= 800) return 2;
  if (v >= 100) return 1;
  return 0;
}

const clamp05 = (n: unknown): number => {
  const x = Math.round(Number(n));
  return Number.isFinite(x) ? Math.min(5, Math.max(0, x)) : 0;
};

/**
 * Gate + score a candidate in a single LLM call. The model judges relevance
 * (is it Open Design) plus two 0-5 axes — completeness (is it a real, followable
 * tutorial) and relevance precision (how squarely it's about Open Design). The
 * reach axis is computed from view count, not the model. The 0-100 overall is a
 * suggestion to help a maintainer prioritise; final say stays human.
 */
export async function scoreCandidate(video: VideoInput): Promise<CandidateScore> {
  const system =
    'You gate and score a YouTube video for the Open Design tutorials catalogue. ' +
    'Open Design (github.com/nexu-io/open-design, ~50k stars) is an open-source self-evolving design ' +
    'agent that runs on coding agents (Claude Code, Codex, etc.), positioned as a free/open-source ' +
    'alternative to Claude Design. Reject lookalikes that merely sound similar: OpenCode, OpenClaude, a ' +
    'smaller "Open Codesign" repo, Google Stitch, Figma, or generic AI-agent/AI-coding roundups not ' +
    'focused on Open Design. Score two axes 0-5: ' +
    '"completeness" = is this a complete, followable tutorial (5 = full step-by-step setup/walkthrough/demo; ' +
    '3 = partial or overview; 1 = short/teaser/Shorts/news mention; 0 = not instructional); ' +
    '"relevance" = how squarely the video is specifically about Open Design (5 = dedicated to it; ' +
    '3 = significant segment; 1 = passing mention). ' +
    'Reply with STRICT JSON: {"isOpenDesign": boolean, "completeness": 0-5, "relevance": 0-5, "reason": string (<=120 chars)}.';
  const user = JSON.stringify({
    title: video.title,
    channel: video.author,
    durationSeconds: video.durationSeconds,
    description: video.description.slice(0, 1800),
  });
  let isOpenDesign = false;
  let completeness = 0;
  let relevance = 0;
  let reason = '';
  try {
    const out = extractJson(await callLLM(system, user, 320)) as Partial<CandidateScore>;
    isOpenDesign = out.isOpenDesign === true;
    completeness = clamp05(out.completeness);
    relevance = clamp05(out.relevance);
    reason = (out.reason ?? '').toString().trim().slice(0, 160);
  } catch {
    // On parse/LLM failure, be conservative: exclude and zero the score.
    return { isOpenDesign: false, overall: 0, completeness: 0, relevance: 0, reach: 0, recommend: false, reason: 'score failed' };
  }
  const reach = reachScore(video.viewCount);
  const overall = completeness * 8 + relevance * 8 + reach * 4; // 0-100
  const recommend = isRecommended({ completeness, relevance });
  return { isOpenDesign, overall, completeness, relevance, reach, recommend, reason };
}

/**
 * Extract an 11-char YouTube id from text containing a YouTube URL of any common
 * shape — watch (`v=`, incl. m.youtube), `youtu.be/`, `embed/`, `shorts/`,
 * `live/`. Shared by the submission-issue parser and the manual generator so
 * both accept the same URL shapes. Returns null if none found.
 */
const YT_HOSTS = new Set(['youtu.be', 'youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com']);

export function extractYouTubeId(text: string): string | null {
  // Parse candidate URLs and validate the real hostname (not a substring), so
  // lookalikes like notyoutube.com / evil-youtube.com are rejected. Scans free
  // text (e.g. an issue body) for YouTube-ish URL tokens, with or without scheme.
  const tokens = text.match(/(?:https?:\/\/)?[\w.-]*(?:youtube\.com|youtu\.be)\/[^\s"'<>)]+/gi) ?? [];
  for (const tok of tokens) {
    let u: URL;
    try {
      u = new URL(tok.startsWith('http') ? tok : `https://${tok}`);
    } catch {
      continue;
    }
    if (!YT_HOSTS.has(u.hostname.toLowerCase())) continue;
    const id =
      u.hostname.toLowerCase() === 'youtu.be'
        ? u.pathname.match(/^\/([\w-]{11})/)?.[1]
        : (u.searchParams.get('v') ?? u.pathname.match(/\/(?:shorts|embed|live|v)\/([\w-]{11})/)?.[1] ?? undefined);
    if (id && /^[\w-]{11}$/.test(id)) return id;
  }
  return null;
}

/**
 * Generate the editorial summary, body, category, and slug topic for a video,
 * matching the hand-written voice of the existing 12 entries: a tight summary
 * plus a short bulleted body, written in the video's own language.
 */
export async function generateCopy(video: VideoInput): Promise<GeneratedCopy> {
  const system =
    'You write catalogue entries for the Open Design tutorials page (open-design.ai/tutorials). ' +
    'Open Design is an open-source self-evolving design agent by nexu-io. Each entry describes one ' +
    'community YouTube video. Match this editorial voice: factual, concise, no hype, no first/second ' +
    'person, no "in this video". Write the summary and body in the SAME language as the video title ' +
    '(English title -> English; Chinese -> Chinese; Portuguese -> Portuguese; etc.). ' +
    'Pick exactly one category from: "Getting started", "Tutorial", "Demo", "Review", "Community". ' +
    'Use "Getting started" for install/setup intros, "Tutorial" for how-to walkthroughs, "Demo" for ' +
    'feature showcases, "Review" for opinion/evaluation, "Community" for news/roundups. ' +
    'Reply with STRICT JSON only: {"summary": string (<=240 chars, one sentence), ' +
    '"category": string, "body": string (2-4 short markdown bullet lines prefixed with "- ", ' +
    'optionally one intro sentence before the bullets), "slugTopic": string (2-4 kebab words ' +
    'summarizing the angle, ascii only, e.g. "full-walkthrough" or "vs-claude-design")}.';
  const user = JSON.stringify({
    title: video.title,
    channel: video.author,
    durationMinutes: Math.round(video.durationSeconds / 60),
    description: video.description.slice(0, 2500),
  });
  const out = extractJson(await callLLM(system, user, 900)) as Partial<GeneratedCopy>;
  let category = (out.category ?? 'Review') as Category;
  if (!CATEGORIES.includes(category)) category = 'Review';
  const summary = (out.summary ?? '').trim() || video.title;
  const body = (out.body ?? '').trim() || summary;
  const slugTopic = (out.slugTopic ?? 'tutorial').trim();
  return { summary, category, body, slugTopic };
}

// ---------- markdown ----------

/** YAML-escape a scalar that goes inside single quotes. */
function yamlSingle(s: string): string {
  return `'${s.replace(/'/g, "''")}'`;
}

export interface TutorialEntry extends GeneratedCopy {
  video: VideoInput;
  slug: string;
}

export function renderMarkdown(entry: TutorialEntry): string {
  const { video, summary, category, body } = entry;
  const fm = [
    '---',
    `title: ${yamlSingle(video.title)}`,
    `youtubeId: ${video.videoId}`,
    `summary: ${yamlSingle(summary)}`,
    `date: ${video.date}`,
    `category: ${category}`,
    `durationSeconds: ${video.durationSeconds}`,
    `author: ${yamlSingle(video.author)}`,
    'official: false',
    '---',
    '',
  ].join('\n');
  return `${fm}${body.trim()}\n`;
}

/**
 * Full pipeline for one video: generate copy, build a unique slug, write the
 * markdown file. Returns the slug written, or null if generation failed.
 */
export async function writeTutorial(
  video: VideoInput,
  takenSlugs: Set<string>,
  dir = TUTORIALS_DIR,
): Promise<string | null> {
  const copy = await generateCopy(video);
  const slug = buildSlug(copy.slugTopic, video.author, takenSlugs, video.videoId);
  const entry: TutorialEntry = { ...copy, video, slug };
  await writeFile(path.join(dir, `${slug}.md`), renderMarkdown(entry), 'utf8');
  return slug;
}

/** Parse an ISO-8601 duration (PT#H#M#S) from the YouTube API into seconds. */
export function iso8601ToSeconds(iso: string): number {
  const m = iso.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!m) return 0;
  const [, h, mi, s] = m;
  return (Number(h ?? 0) * 3600) + (Number(mi ?? 0) * 60) + Number(s ?? 0);
}
