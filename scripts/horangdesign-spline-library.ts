import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export type MotionSignals = {
  libraries: string[];
  motionVocabulary: string[];
};

export type MotionSourceInput = {
  url: string;
  title?: string;
  html: string;
  notes?: string;
};

export type MotionLibraryEntry = {
  id: string;
  source: {
    url: string;
    title: string;
    notes?: string;
  };
  libraries: string[];
  motionVocabulary: string[];
  applicationPrompts: string[];
};

export type MotionLibrary = {
  schemaVersion: 'horangdesign-motion-library/v1';
  generatedAt: string;
  policy: {
    sourceScope: string;
    blockedScope: string;
    usage: string;
  };
  entries: MotionLibraryEntry[];
};

const LIBRARY_PATTERNS: Array<[RegExp, string]> = [
  [/gsap/iu, 'gsap'],
  [/scrolltrigger/iu, 'scrolltrigger'],
  [/three(?:\.module|\.min|js|d)?/iu, 'three'],
  [/spline|splinetool|data-spline/iu, 'spline'],
  [/lottie/iu, 'lottie'],
  [/lenis/iu, 'lenis'],
  [/locomotive/iu, 'locomotive'],
  [/<canvas\b|webgl/iu, 'canvas'],
  [/framer-motion|motion\./iu, 'framer-motion'],
];

const MOTION_PATTERNS: Array<[RegExp, string]> = [
  [/cinematic|immersive|scene|chapter|full[-\s]?screen|scroll/iu, 'cinematic-scroll'],
  [/parallax|depth|z[-\s]?axis|layer/iu, 'parallax'],
  [/orbit|rotate|tilt|turntable/iu, 'orbit'],
  [/cursor|pointer|mouse/iu, 'cursor-responsive'],
  [/hover|magnetic/iu, 'hover-magnetic'],
  [/reveal|mask|clip-path|wipe/iu, 'reveal-mask'],
  [/lottie|timeline|keyframe/iu, 'timeline-animation'],
  [/shader|fluid|noise|particles|field/iu, 'motion-field'],
  [/spline|3d|webgl|three/iu, '3d-scene'],
];

function unique(values: string[]): string[] {
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
}

function slug(input: string): string {
  return input
    .toLowerCase()
    .replace(/^https?:\/\//u, '')
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-|-$/gu, '')
    .slice(0, 72) || 'motion-source';
}

export function normalizeSplineSourceUrl(raw: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) return null;
  const host = parsed.hostname.toLowerCase();
  if (host === 'app.spline.design') return null;
  if (host === 'spline.design' || host.endsWith('.spline.design')) return parsed.toString();
  return parsed.toString();
}

export function extractMotionSignals(html: string): MotionSignals {
  const libraries = unique(
    LIBRARY_PATTERNS.flatMap(([pattern, label]) => (pattern.test(html) ? [label] : [])),
  );
  const motionVocabulary = unique(
    MOTION_PATTERNS.flatMap(([pattern, label]) => (pattern.test(html) ? [label] : [])),
  );
  return { libraries, motionVocabulary };
}

export function buildMotionLibrary(sources: MotionSourceInput[], generatedAt = new Date().toISOString()): MotionLibrary {
  return {
    schemaVersion: 'horangdesign-motion-library/v1',
    generatedAt,
    policy: {
      sourceScope: 'Public webpages and user-provided reference URLs only.',
      blockedScope: 'Do not crawl app.spline.design or private/login/paid scenes; robots for app.spline.design disallows crawling.',
      usage: 'Store reusable motion vocabulary, interaction patterns, and implementation prompts. Do not copy private scene files or protected assets.',
    },
    entries: sources.flatMap((source) => {
      const normalized = normalizeSplineSourceUrl(source.url);
      if (!normalized) return [];
      const signals = extractMotionSignals(source.html);
      const title = source.title?.trim() || new URL(normalized).hostname;
      const vocab = signals.motionVocabulary.length > 0 ? signals.motionVocabulary : ['reference-posture'];
      return [{
        id: slug(`${title}-${normalized}`),
        source: {
          url: normalized,
          title,
          ...(source.notes ? { notes: source.notes } : {}),
        },
        libraries: signals.libraries,
        motionVocabulary: vocab,
        applicationPrompts: [
          `Use ${vocab.join(', ')} as motion vocabulary; recreate the feeling with HTML/CSS/Three.js/Spline-inspired code, not by copying protected assets.`,
          'Prefer full-viewport scenes, scroll-linked depth, cursor-responsive lighting, reveal masks, and one coherent camera/motion path when they fit the brief.',
          'Audit the artifact against the reference at feel level: section rhythm, depth, motion timing, interaction model, and 16:9/21:9 composition.',
        ],
      } satisfies MotionLibraryEntry];
    }),
  };
}

async function fetchHtml(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: { 'user-agent': 'Horangdesign motion-library collector (public metadata only)' },
  });
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
  return await response.text();
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const outputIndex = args.indexOf('--output');
  const outputArg = outputIndex >= 0 ? args[outputIndex + 1] : undefined;
  const output: string = outputArg || 'skills/horang-design-pro/references/spline-motion-library.json';
  const inputIndex = args.indexOf('--input');
  const input = inputIndex >= 0 ? args[inputIndex + 1] : undefined;
  const urls = args.filter((arg, index) => !arg.startsWith('--') && index !== outputIndex + 1 && index !== inputIndex + 1);
  const records: MotionSourceInput[] = [];
  if (input) {
    const parsed = JSON.parse(await readFile(input, 'utf8')) as Array<{ url: string; title?: string; html?: string; notes?: string }>;
    for (const item of parsed) {
      const normalized = normalizeSplineSourceUrl(item.url);
      if (!normalized) continue;
      try {
        records.push({ ...item, url: normalized, html: item.html ?? await fetchHtml(normalized) });
      } catch (error) {
        console.warn(`SKIP ${normalized}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
  for (const url of urls) {
    const normalized = normalizeSplineSourceUrl(url);
    if (!normalized) continue;
    try {
      records.push({ url: normalized, html: await fetchHtml(normalized) });
    } catch (error) {
      console.warn(`SKIP ${normalized}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  const library = buildMotionLibrary(records);
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(library, null, 2)}\n`, 'utf8');
  console.log(`WROTE ${output}`);
  console.log(`ENTRIES ${library.entries.length}`);
}

const entrypoint = process.argv[1];
if (entrypoint && import.meta.url === `file://${entrypoint}`) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
