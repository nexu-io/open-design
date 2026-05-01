#!/usr/bin/env node
/**
 * Pulls down the upstream prompt corpora (CC BY 4.0) and emits curated
 * JSON files under `prompt-templates/{image,video}/`. Re-run anytime to
 * pick up new featured prompts.
 *
 * Usage:
 *   node scripts/import-prompt-templates.mjs
 *
 * Source READMEs:
 *   - https://github.com/YouMind-OpenLab/awesome-gpt-image-2 (CC BY 4.0)
 *   - https://github.com/YouMind-OpenLab/awesome-seedance-2-prompts (CC BY 4.0)
 *
 * Each upstream README is a structured catalog. Two patterns we care about:
 *
 *   Featured block:
 *     ### No. N: <Title>
 *     <badges>
 *     #### 📖 Description
 *     <description paragraph>
 *     #### 📝 Prompt
 *     ```
 *     <prompt body>
 *     ```
 *     #### 🎬 Video  (or 🖼️ Generated Images)
 *     <preview img / video link>
 *     #### 📌 Details
 *     - **Author:** [Name](url)
 *     - **Source:** [Twitter Post](url)
 *     - **Published:** ...
 *
 *   All-Prompts block:
 *     ### <Title>
 *     <badges>
 *     > <description>
 *     #### 📝 Prompt
 *     ```
 *     <prompt body>
 *     ```
 *     <img src="<thumb>"> | <a href=...>
 *     **Author:** [Name](url) | **Source:** [Link](url) | **Published:** ...
 *
 * We pick the featured 6 from each repo (always good) plus a sampled slice
 * of the All-Prompts head so the gallery has breadth across categories.
 *
 * All output JSON carries a `source` block so attribution stays intact.
 */

import { mkdir, writeFile, readdir, unlink } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT_IMAGE = path.join(ROOT, 'prompt-templates', 'image');
const OUT_VIDEO = path.join(ROOT, 'prompt-templates', 'video');

const SOURCES = [
  {
    surface: 'image',
    repo: 'YouMind-OpenLab/awesome-gpt-image-2',
    license: 'CC-BY-4.0',
    readmeUrl:
      'https://raw.githubusercontent.com/YouMind-OpenLab/awesome-gpt-image-2/main/README.md',
    defaultModel: 'gpt-image-2',
    defaultAspect: '1:1',
    // Cap how many entries we pull from the "All Prompts" tail to keep the
    // committed dataset reviewable. The featured block is always taken.
    sampleAllPrompts: 30,
  },
  {
    surface: 'video',
    repo: 'YouMind-OpenLab/awesome-seedance-2-prompts',
    license: 'CC-BY-4.0',
    readmeUrl:
      'https://raw.githubusercontent.com/YouMind-OpenLab/awesome-seedance-2-prompts/main/README.md',
    defaultModel: 'seedance-2.0',
    defaultAspect: '16:9',
    sampleAllPrompts: 30,
  },
];

async function fetchText(url) {
  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`failed ${url}: ${resp.status}`);
  }
  return resp.text();
}

function slugify(input) {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

// Featured blocks come between the "🔥 Featured Prompts" / "⭐ Featured" /
// "## 🔥 Featured Prompts" header and the next H2.
function sliceSection(md, headerRe) {
  const match = headerRe.exec(md);
  if (!match) return '';
  const start = match.index + match[0].length;
  const next = md.slice(start).search(/\n## /);
  if (next === -1) return md.slice(start);
  return md.slice(start, start + next);
}

function parseFeaturedBlock(block, ctx) {
  const out = [];
  // Each featured prompt starts at "### No. N: Title".
  const headerRe = /^### No\. \d+: (.+?)\s*$/gm;
  const headers = [];
  let m;
  while ((m = headerRe.exec(block)) !== null) {
    headers.push({ index: m.index, end: m.index + m[0].length, title: m[1] });
  }
  for (let i = 0; i < headers.length; i += 1) {
    const h = headers[i];
    const next = headers[i + 1]?.index ?? block.length;
    const body = block.slice(h.end, next);
    const entry = parseEntryBody(body, h.title, ctx, true);
    if (entry) out.push(entry);
  }
  return out;
}

function parseAllPromptsBlock(block, ctx) {
  const out = [];
  // The "All Prompts" section uses "### <Title>" headers — sometimes
  // prefixed with "No. N:" (gpt-image-2 README), sometimes bare
  // (seedance README). Both shapes route through parseEntryBody which
  // strips the "No. N:" prefix where present.
  const headerRe = /^### (.+?)\s*$/gm;
  const headers = [];
  let m;
  while ((m = headerRe.exec(block)) !== null) {
    const title = m[1].replace(/^No\.\s*\d+:\s*/, '').trim();
    headers.push({ index: m.index, end: m.index + m[0].length, title });
  }
  for (let i = 0; i < headers.length && out.length < ctx.sampleAllPrompts; i += 1) {
    const h = headers[i];
    const next = headers[i + 1]?.index ?? block.length;
    const body = block.slice(h.end, next);
    const entry = parseEntryBody(body, h.title, ctx, false);
    if (entry) out.push(entry);
  }
  return out;
}

function parseEntryBody(body, title, ctx, featured) {
  const promptMatch = /#### 📝 Prompt\s*\n+```[a-zA-Z0-9_-]*\n([\s\S]*?)```/m.exec(
    body,
  );
  if (!promptMatch) return null;
  const prompt = promptMatch[1].trim();
  if (prompt.length < 40) return null;

  // The image README structures every entry — featured AND in-list —
  // with a "#### 📖 Description" block. The seedance README only does
  // that for featured; in-list entries fall back to a leading blockquote.
  // Try the structured form first regardless, then fall back.
  const description =
    extractDescription(body) || extractBlockquoteSummary(body);
  const author = extractAuthor(body);
  const sourceUrl = extractSourceUrl(body) ?? null;
  const previewImage = extractFirstImage(body);
  const previewVideo = extractVideoLink(body);
  const category = inferCategory(title, ctx.surface);
  const tags = inferTags(title, prompt, ctx.surface);

  return {
    id: slugify(title),
    surface: ctx.surface,
    title: cleanTitle(title),
    summary: (description || cleanTitle(title)).slice(0, 200),
    category,
    tags,
    model: ctx.defaultModel,
    aspect: ctx.defaultAspect,
    prompt,
    previewImageUrl: previewImage ?? undefined,
    previewVideoUrl: previewVideo ?? undefined,
    source: {
      repo: ctx.repo,
      license: ctx.license,
      author: author ?? undefined,
      url: sourceUrl ?? undefined,
    },
  };
}

function extractDescription(body) {
  const m = /#### 📖 Description\s*\n+([\s\S]*?)(?=\n+####|\n+---)/m.exec(body);
  return m?.[1]?.trim().replace(/\s+/g, ' ') ?? '';
}

function extractBlockquoteSummary(body) {
  const m = /^>\s*(.+?)\s*$/m.exec(body);
  return m?.[1]?.trim() ?? '';
}

function extractAuthor(body) {
  // Featured: "- **Author:** [Name](url)"
  // All-prompts: "**Author:** [Name](url) | ..."
  const m = /\*\*Author:\*\*\s*\[([^\]]+)\]/.exec(body);
  return m?.[1]?.trim() ?? null;
}

function extractSourceUrl(body) {
  const m = /\*\*Source:\*\*\s*\[[^\]]+\]\(([^)]+)\)/.exec(body);
  return m?.[1]?.trim() ?? null;
}

function extractFirstImage(body) {
  const m = /<img[^>]*src=["']([^"']+)["']/.exec(body);
  if (!m) return null;
  return m[1];
}

function extractVideoLink(body) {
  // 1) Featured entries embed an explicit "<a href=...releases/.../<id>.mp4">"
  //    download link — prefer it. GitHub releases are stable and don't
  //    rely on a per-request signed redirect. Catches all 6 featured
  //    prompts in awesome-seedance-2-prompts.
  const releaseLink = /href=["']([^"']+\.mp4)["']/.exec(body);
  if (releaseLink) return releaseLink[1];
  // 2) All-prompts entries don't expose a static mp4 — they only embed
  //    the Cloudflare Stream thumbnail. Reconstruct the playable mp4
  //    from the Stream video id encoded in the thumbnail URL. The
  //    /downloads/default.mp4 endpoint 302s to a freshly-signed CDN
  //    URL on every request; the browser follows that transparently
  //    when set as <video src>. CORS is permissive (`*` on origin)
  //    and `accept-ranges: bytes` is honored, so seeking works too.
  //    This is what unlocks an actual video preview for the other
  //    ~30 sampled templates instead of a static thumbnail.
  const streamThumb =
    /https?:\/\/([a-z0-9-]+\.cloudflarestream\.com)\/([a-f0-9]{20,})\/thumbnails\/thumbnail\.jpg/i.exec(
      body,
    );
  if (streamThumb) {
    return `https://${streamThumb[1]}/${streamThumb[2]}/downloads/default.mp4`;
  }
  return null;
}

function cleanTitle(raw) {
  // "Profile / Avatar - Cyberpunk Anime …" → strip the leading category
  // prefix shared by every entry in the same gpt-image-2 bucket. Keeps
  // titles scannable on cards without losing meaning.
  return raw
    .replace(/\s*\(.*\)\s*$/, '')
    .replace(/^\s*[-–]\s*/, '')
    .trim();
}

function inferCategory(title, surface) {
  const lower = title.toLowerCase();
  if (surface === 'image') {
    if (/profile|avatar|portrait/.test(lower)) return 'Profile / Avatar';
    if (/social|post|carousel/.test(lower)) return 'Social Media Post';
    if (/info[ -]?graphic|chart|diagram/.test(lower)) return 'Infographic';
    if (/youtube|thumbnail/.test(lower)) return 'YouTube Thumbnail';
    if (/comic|storyboard|panel/.test(lower)) return 'Comic / Storyboard';
    if (/poster|flyer/.test(lower)) return 'Poster / Flyer';
    if (/ui|app|web design|mockup|landing/.test(lower)) return 'App / Web Design';
    if (/product|exploded|merch|packaging/.test(lower)) return 'Product Marketing';
    if (/anime|manga/.test(lower)) return 'Anime / Manga';
    if (/cinematic|film/.test(lower)) return 'Cinematic';
    if (/3d|render|isometric/.test(lower)) return '3D Render';
    if (/sketch|line art|pencil/.test(lower)) return 'Sketch / Line Art';
    if (/pixel/.test(lower)) return 'Pixel Art';
    if (/oil|water[- ]?color/.test(lower)) return 'Painterly';
    if (/cyberpunk|sci[- ]?fi|futuristic/.test(lower)) return 'Cyberpunk / Sci-Fi';
    if (/landscape|nature/.test(lower)) return 'Landscape';
    return 'Illustration';
  }
  // video
  if (/cinematic|film|movie|noir/.test(lower)) return 'Cinematic';
  if (/anime|manga/.test(lower)) return 'Anime';
  if (/ad|advert|commercial|brand/.test(lower)) return 'Advertising';
  if (/ugc|tutorial|vlog/.test(lower)) return 'UGC / Vlog';
  if (/meme|tiktok|viral/.test(lower)) return 'Social / Meme';
  if (/drama|short film|romance/.test(lower)) return 'Short Film / Drama';
  if (/intro|motion graphics|title sequence/.test(lower)) return 'Motion Graphics';
  if (/vfx|fantasy|magic/.test(lower)) return 'VFX / Fantasy';
  if (/race|action|combat|fight/.test(lower)) return 'Action';
  return 'General';
}

function inferTags(title, prompt, surface) {
  const set = new Set();
  const blob = `${title} ${prompt}`.toLowerCase();
  const checks = [
    ['portrait', /portrait|selfie|headshot/],
    ['anime', /anime|manga/],
    ['cinematic', /cinematic|filmic|grain|8k/],
    ['cyberpunk', /cyberpunk|neon/],
    ['fantasy', /fantasy|mage|elf|dragon/],
    ['3d-render', /3d render|unreal engine|render/],
    ['isometric', /isometric/],
    ['typography', /typography|kerning|font|lettering/],
    ['product', /product|packaging|exploded/],
    ['ugc', /ugc|vlog|selfie cam/],
    ['cinematic-romance', /romance|pure love|romantic/],
    ['action', /chase|action|combat|race/],
    ['food', /food|coffee|kitchen/],
    ['nature', /forest|river|mountain|landscape/],
  ];
  for (const [tag, re] of checks) {
    if (re.test(blob)) set.add(tag);
  }
  const lim = surface === 'image' ? 4 : 3;
  return Array.from(set).slice(0, lim);
}

async function clearDir(dir) {
  try {
    const files = await readdir(dir);
    for (const f of files) {
      if (f.endsWith('.json')) {
        await unlink(path.join(dir, f));
      }
    }
  } catch {
    // missing dir is fine — created below.
  }
}

async function writeAll(entries, outDir) {
  await mkdir(outDir, { recursive: true });
  await clearDir(outDir);
  // De-dup on slug; if two entries collide, keep the first (which is the
  // featured one — always parsed before "All Prompts").
  const seen = new Set();
  let count = 0;
  for (const entry of entries) {
    if (seen.has(entry.id)) continue;
    seen.add(entry.id);
    const filePath = path.join(outDir, `${entry.id}.json`);
    await writeFile(filePath, `${JSON.stringify(entry, null, 2)}\n`, 'utf8');
    count += 1;
  }
  return count;
}

async function main() {
  let totalImage = 0;
  let totalVideo = 0;
  for (const ctx of SOURCES) {
    const md = await fetchText(ctx.readmeUrl);
    const featuredBlock = sliceSection(md, /## 🔥 Featured Prompts/m)
      || sliceSection(md, /## ⭐ Featured Prompts/m)
      || sliceSection(md, /## Featured/m);
    const allPromptsBlock = sliceSection(md, /## (📋|🎬) All Prompts/m)
      || sliceSection(md, /## All Prompts/m);
    const featured = parseFeaturedBlock(featuredBlock, ctx);
    const sampled = parseAllPromptsBlock(allPromptsBlock, ctx);
    const entries = [...featured, ...sampled];
    if (entries.length === 0) {
      console.error(`No entries parsed for ${ctx.repo}; check headers.`);
      process.exitCode = 1;
      continue;
    }
    const outDir = ctx.surface === 'image' ? OUT_IMAGE : OUT_VIDEO;
    const written = await writeAll(entries, outDir);
    if (ctx.surface === 'image') totalImage += written;
    else totalVideo += written;
    console.log(
      `[${ctx.repo}] featured=${featured.length} sampled=${sampled.length} written=${written} → ${path.relative(ROOT, outDir)}`,
    );
  }
  console.log(`\nDone. ${totalImage} image + ${totalVideo} video templates.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
