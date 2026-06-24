import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  closeDatabase,
  getProject,
  listMessages,
  listTabs,
  openDatabase,
  upsertMessage,
} from '../src/db.js';
import {
  backfillBrandExtractionTranscriptForProject,
  finalizeBrand,
  readBrandDetail,
  renderBrandPreviewIntoProject,
  startBrandExtraction,
} from '../src/brands/index.js';
import { findChrome } from '../src/brands/chrome.js';
import { patchMeta } from '../src/brands/store.js';
import { ensureLogoFallback } from '../src/brands/logo-fallback.js';
import { brandFromMaterial } from '../src/brands/provisional.js';
import { listDesignSystems } from '../src/design-systems/index.js';
import {
  adoptExistingImagery,
  findImageRefs,
  imageSize,
  type ImagerySlot,
} from '../src/brands/imagery-fallback.js';
import { isChallengePage, type PrefetchResult } from '../src/brands/prefetch.js';

// Real repo skills root so the bundled brand-kit template resolves.
const SKILLS_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../skills',
);

// Injected logo harvester that does nothing — keeps the engine tests offline
// (the real fallback fetches the site's icon assets over the network).
const NO_LOGO_FALLBACK = async () => ({ changed: false });

// Injected imagery harvester that does nothing — keeps finalize offline (the
// real fallback fetches the site's cover/hero images over the network).
const NO_IMAGERY_FALLBACK = async () => ({ changed: false });

// Injected palette/typography harvester that does nothing — keeps the engine
// tests offline except for cases that explicitly stub a harvester behavior.
const NO_SEED_FALLBACK = async () => ({ changed: false });

function startOfflineBrandExtraction(
  opts: Parameters<typeof startBrandExtraction>[0],
): ReturnType<typeof startBrandExtraction> {
  return startBrandExtraction({
    seedFallback: NO_SEED_FALLBACK,
    imageryFallback: NO_IMAGERY_FALLBACK,
    ...opts,
  });
}

// Regression guard for the seeded brand-extraction prompts. The daemon folds a
// skill body into the SYSTEM prompt when a project has an active `skillId`; it
// does NOT register `skills/` as Claude-Code `Skill` / slash commands. A seeded
// prompt that tells the agent to "use the `brand-extract` skill" is therefore
// executed as a `Skill {"skill":"brand-extract"}` tool call that has no registry
// to resolve against and always fails — the red Skill card users hit mid-
// extraction. The seeded prompt must never instruct loading/invoking a skill.
function expectNoPhantomSkillCall(prompt: string): void {
  expect(prompt).not.toMatch(/use the `?brand-extract`? skill/i);
  expect(prompt).not.toMatch(/\buse the `[^`]+` skill\b/i);
  expect(prompt).not.toMatch(/\bload the `?brand-extract`? skill\b/i);
}

/** Build a tiny but structurally-valid PNG buffer with the given dimensions so
 *  the imagery size gate decodes a real width/height (header-only). */
function pngBuffer(width: number, height: number): Buffer {
  const buf = Buffer.alloc(33);
  buf.writeUInt32BE(0x89504e47, 0);
  buf.writeUInt32BE(0x0d0a1a0a, 4);
  buf.writeUInt32BE(13, 8);
  buf.write('IHDR', 12, 'ascii');
  buf.writeUInt32BE(width, 16);
  buf.writeUInt32BE(height, 20);
  return buf;
}

// A minimal-but-valid brand.json the agent is expected to have written into the
// backing project before finalize runs (seven roles, the three required ones).
const VALID_BRAND = {
  name: 'Acme',
  tagline: 'We make things',
  description: 'Acme makes excellent things for everyone.',
  colors: [
    { role: 'background', hex: '#f5f4ed', oklch: 'oklch(96% 0.01 90)', name: 'Parchment', usage: 'page background' },
    { role: 'surface', hex: '#ffffff', oklch: 'oklch(100% 0 0)', name: 'Card', usage: 'cards' },
    { role: 'foreground', hex: '#141413', oklch: 'oklch(17% 0.005 90)', name: 'Ink', usage: 'text' },
    { role: 'muted', hex: '#87867f', oklch: 'oklch(60% 0.01 90)', name: 'Stone', usage: 'secondary text' },
    { role: 'border', hex: '#e8e6dc', oklch: 'oklch(92% 0.01 90)', name: 'Hairline', usage: 'borders' },
    { role: 'accent', hex: '#d97757', oklch: 'oklch(67% 0.13 40)', name: 'Terracotta', usage: 'CTAs' },
    { role: 'accent-secondary', hex: '#3d7a4f', oklch: 'oklch(50% 0.09 150)', name: 'Moss', usage: 'success' },
  ],
  typography: {
    display: { family: 'Tiempos', fallbacks: ['Georgia', 'serif'], weights: [400, 600] },
    body: { family: 'Inter', fallbacks: ['system-ui'], weights: [400, 700] },
  },
};

const DESIGN_MD_INPUT = `---
name: Heritage
colors:
  primary: "#1A1C1E"
  secondary: "#6C7278"
  tertiary: "#B8422E"
  neutral: "#F7F5F2"
typography:
  h1:
    fontFamily: Public Sans
    fontSize: 3rem
  body-md:
    fontFamily: Public Sans
    fontSize: 1rem
rounded:
  sm: 4px
  md: 8px
components:
  button-primary:
    backgroundColor: "{colors.tertiary}"
---

# Heritage

## Overview
Architectural Minimalism meets Journalistic Gravitas.

## Colors
- **Tertiary (#B8422E):** Boston Clay for interaction.
`;

function programmaticPrefetchResult(url: string): PrefetchResult {
  return {
    url,
    finalUrl: url,
    siteName: 'Acme',
    title: 'Acme',
    description: 'Acme makes excellent things for everyone.',
    colors: [
      { hex: '#f5f4ed', count: 12 },
      { hex: '#141413', count: 9 },
      { hex: '#b8422e', count: 8 },
      { hex: '#3d7a4f', count: 3 },
    ],
    fonts: [{ family: 'Inter', count: 10 }],
    fontFaceFamilies: [],
    googleFontsUrls: [],
    fontFiles: [],
    logos: [],
    headings: ['Excellent things'],
    paragraphs: ['Acme makes useful products for careful teams.'],
    navLabels: ['Product', 'Pricing'],
    extraPages: [],
    screenshot: null,
    thin: false,
    blocked: false,
    materialMd: '# Acme\n\nExcellent things',
  };
}

describe('agent-driven brand extraction engine', () => {
  let tempDir: string;
  let brandsRoot: string;
  let projectsRoot: string;
  let userDesignSystemsRoot: string;

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), 'od-brand-engine-'));
    brandsRoot = path.join(tempDir, 'brands');
    projectsRoot = path.join(tempDir, 'projects');
    userDesignSystemsRoot = path.join(tempDir, 'user-design-systems');
    mkdirSync(brandsRoot, { recursive: true });
    mkdirSync(projectsRoot, { recursive: true });
    mkdirSync(userDesignSystemsRoot, { recursive: true });
  });

  afterEach(() => {
    closeDatabase();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('keeps the system Chrome fallback disabled unless explicitly opted in', () => {
    const previousAllow = process.env.OD_BRAND_ALLOW_SYSTEM_CHROME;
    const previousChrome = process.env.BRANDING_AGENT_CHROME;
    delete process.env.OD_BRAND_ALLOW_SYSTEM_CHROME;
    delete process.env.BRANDING_AGENT_CHROME;
    try {
      expect(findChrome()).toBeNull();
    } finally {
      if (previousAllow === undefined) delete process.env.OD_BRAND_ALLOW_SYSTEM_CHROME;
      else process.env.OD_BRAND_ALLOW_SYSTEM_CHROME = previousAllow;
      if (previousChrome === undefined) delete process.env.BRANDING_AGENT_CHROME;
      else process.env.BRANDING_AGENT_CHROME = previousChrome;
    }
  });

  it('prefers source-backed human brand tokens over script/debug color noise', () => {
    const brand = brandFromMaterial({
      url: 'https://open-design.ai/',
      finalUrl: 'https://open-design.ai/',
      siteName: 'Open Design',
      title: 'Open Design',
      description: 'Open Design design system.',
      colors: [
        { hex: '#262626', count: 19, sources: ['css-var:--ink'] },
        { hex: '#15140f', count: 15, sources: ['css-var:--shadow-ink'] },
        { hex: '#d8ffb5', count: 7, sources: ['selector:.hero-discord-pill:hover prop:background'] },
        { hex: '#ffa500', count: 6, sources: ['prop:fillStyle selector:matter-debug-canvas'] },
        { hex: '#83ff3b', count: 3, sources: ['css-var:--coral-soft'] },
        { hex: '#63fe13', count: 2, sources: ['css-var:--coral', 'css-var:--mustard'] },
        { hex: '#ffffff', count: 46, extreme: true, sources: ['css-var:--bone'] },
        { hex: '#000000', count: 15, extreme: true, sources: ['prop:box-shadow'] },
      ],
      fonts: [{ family: 'Albert Sans', count: 2 }],
      fontFaceFamilies: ['Albert Sans'],
      googleFontsUrls: [],
      fontFiles: [],
      logos: [],
      headings: ['Open Design The Open-source Claude Design alternative'],
      paragraphs: ['Open Design is a local-first design platform.'],
      navLabels: [],
      extraPages: [],
      screenshot: null,
      thin: false,
      blocked: false,
      materialMd: '',
    }, 'https://open-design.ai/');

    expect(brand.colors.find((color) => color.role === 'accent')?.hex).toBe('#63fe13');
    expect(brand.typography.body.family).toBe('Albert Sans');
  });

  it('allows a dominant near-black system to beat generic generated blue effects', () => {
    const brand = brandFromMaterial({
      url: 'https://refly.ai/',
      finalUrl: 'https://refly.ai/',
      siteName: 'Refly.ai-Vibe Workflow for Non-Technical Users',
      title: 'Refly.ai-Vibe Workflow for Non-Technical Users',
      description: 'Refly.ai empowers non-technical creators through natural language and a visual canvas.',
      colors: [
        { hex: '#d5dbe6', count: 191, sources: ['css-var:--token-f195ea74-7512-4096-8d91-0e7c7e10d0ab'] },
        { hex: '#cfe7ff', count: 123, sources: ['prop:box-shadow selector:.framer-card'] },
        { hex: '#0099ff', count: 117, sources: ['prop:background-color selector:.framer-generated-effect'] },
        { hex: '#10131c', count: 66, sources: ['css-var:--token-f213e283-24d0-40a3-a2dc-bca1da07b971'] },
        { hex: '#0e9f77', count: 18, sources: ['logo-svg:header-img-3.svg'] },
        { hex: '#04070d', count: 174, extreme: true, sources: ['css-var:--token-eb09dbbf-ef85-4b7f-81a5-44e9b062efb7'] },
        { hex: '#ffffff', count: 157, extreme: true, sources: ['css-var:--token-a85af9cb-7834-4006-a277-2dd1295ae376'] },
        { hex: '#000000', count: 156, extreme: true, sources: ['prop:background selector:footer'] },
      ],
      fonts: [{ family: 'Inter', count: 157 }],
      fontFaceFamilies: ['Inter'],
      googleFontsUrls: [],
      fontFiles: [],
      logos: [],
      headings: ['The World’s First Vibe Workflow Platform'],
      paragraphs: ['Refly.ai empowers non-technical creators through natural language and a visual canvas.'],
      navLabels: [],
      extraPages: [],
      screenshot: null,
      thin: false,
      blocked: false,
      materialMd: '',
    }, 'https://refly.ai/');

    expect(brand.colors.find((color) => color.role === 'accent')?.hex).toBe('#04070d');
    expect(brand.colors.find((color) => color.role === 'accent-secondary')?.hex).toBe('#0e9f77');
  });

  it('startBrandExtraction reserves the brand and seeds a live brand.html tab', async () => {
    const db = openDatabase(tempDir, { dataDir: tempDir });

    const result = await startOfflineBrandExtraction({
      url: 'acme.com',
      brandsRoot,
      projectsRoot,
      skillsRoot: SKILLS_ROOT,
      db,
      logoFallback: NO_LOGO_FALLBACK,
    });

    // URL is normalized to https and the brand starts in `extracting`.
    expect(result.sourceUrl).toBe('https://acme.com/');
    const detail = readBrandDetail(brandsRoot, result.id);
    expect(detail?.meta.status).toBe('extracting');
    expect(detail?.meta.projectId).toBe(result.projectId);

    // The backing project exists and carries the seeded extraction prompt.
    const project = getProject(db, result.projectId);
    expect(project).toBeTruthy();
    expect(project?.metadata?.kind).toBe('brand');
    expect(project?.pendingPrompt ?? '').toContain('DESIGN SYSTEM ENRICHMENT');
    expect(project?.pendingPrompt ?? '').toContain(`od brand preview ${result.id}`);

    // brand.html is seeded as the active tab; the site stays as a secondary
    // browser tab the user can use to clear an anti-bot wall by hand.
    const brandHtmlPath = path.join(projectsRoot, result.projectId, 'brand.html');
    expect(existsSync(brandHtmlPath)).toBe(true);
    const seeded = readFileSync(brandHtmlPath, 'utf8');
    expect(seeded).toContain('"status":"extracting"');
    expect(seeded).toContain('acme.com');

    const tabs = listTabs(db, result.projectId) as {
      active: string | null;
      browserTabs?: Array<{ url?: string }>;
    };
    expect(tabs.active).toBe('brand.html');
    expect(tabs.browserTabs?.[0]?.url).toBe('https://acme.com/');
  });

  it('localizes the seeded brand.html copy from the creation locale', async () => {
    const db = openDatabase(tempDir, { dataDir: tempDir });

    const result = await startOfflineBrandExtraction({
      url: 'acme.com',
      brandsRoot,
      projectsRoot,
      skillsRoot: SKILLS_ROOT,
      db,
      locale: 'zh-CN',
      logoFallback: NO_LOGO_FALLBACK,
    });

    const html = readFileSync(path.join(projectsRoot, result.projectId, 'brand.html'), 'utf8');
    expect(html).toContain('<html lang="zh-CN">');
    expect(html).toContain('<title>品牌设计体系</title>');
    expect(html).toContain('"logo":"标志"');
    expect(html).toContain('"brandReady":"设计体系已就绪"');
  });

  it('seeds a completed chat transcript when the programmatic pass returns ready', async () => {
    const db = openDatabase(tempDir, { dataDir: tempDir });
    const startedBeforeRequest = Date.now();

    const result = await startOfflineBrandExtraction({
      designMd: DESIGN_MD_INPUT,
      brandsRoot,
      projectsRoot,
      userDesignSystemsRoot,
      skillsRoot: SKILLS_ROOT,
      db,
      programmaticSyncBudgetMs: 10_000,
      logoFallback: NO_LOGO_FALLBACK,
      transcriptAgent: { agentId: 'claude', agentName: 'Claude' },
    });
    const endedAfterRequest = Date.now();

    expect(result.status).toBe('ready');
    expect(result.designSystemId).toBeTruthy();
    const messages = listMessages(db, result.conversationId);
    expect(messages.map((message) => message.role)).toEqual(['user', 'assistant']);
    expect(messages[0]?.content).toContain('pasted DESIGN.md');
    expect(messages[1]?.content).toContain('Programmatic extraction finished');
    expect(messages[1]?.agentId).toBe('claude');
    expect(messages[1]?.agentName).toBe('Claude');
    expect(messages[1]?.runStatus).toBe('succeeded');
    expect(messages[0]?.createdAt).toBe(messages[1]?.startedAt);
    expect(messages[1]?.startedAt).toBeGreaterThanOrEqual(startedBeforeRequest);
    expect(messages[1]?.endedAt).toBeLessThanOrEqual(endedAfterRequest);
    expect(messages[1]?.endedAt).toBeGreaterThanOrEqual(messages[1]?.startedAt ?? 0);
    const producedFiles = (Array.isArray(messages[1]?.producedFiles)
      ? messages[1].producedFiles
      : []) as Array<{ name?: unknown }>;
    const producedNames = producedFiles
      .map((file) => file.name)
      .filter((name): name is string => typeof name === 'string');
    expect(producedNames).toContain('brand.html');
    expect(producedNames.some((name: string) => name.startsWith('system/'))).toBe(true);
    expect(producedNames.length).toBeGreaterThan(1);
  });

  it('keeps the programmatic transcript when other messages arrive before background completion', async () => {
    const db = openDatabase(tempDir, { dataDir: tempDir });
    let releasePrefetch!: () => void;
    const prefetchGate = new Promise<void>((resolve) => {
      releasePrefetch = resolve;
    });
    let backgroundExtraction: Promise<unknown> | null = null;

    const result = await startOfflineBrandExtraction({
      url: 'acme.com',
      brandsRoot,
      projectsRoot,
      userDesignSystemsRoot,
      skillsRoot: SKILLS_ROOT,
      db,
      programmaticSyncBudgetMs: 0,
      logoFallback: NO_LOGO_FALLBACK,
      prefetch: async (url) => {
        await prefetchGate;
        return programmaticPrefetchResult(url);
      },
      onBackgroundExtraction: (settled) => {
        backgroundExtraction = settled;
      },
      transcriptAgent: { agentId: 'claude', agentName: 'Claude' },
    });

    expect(result.status).toBe('extracting');
    if (!backgroundExtraction) throw new Error('expected background extraction promise');
    const initialMessages = listMessages(db, result.conversationId);
    expect(initialMessages.map((message) => message.role)).toEqual(['user', 'assistant']);
    expect(initialMessages[0]?.content).toContain('https://acme.com/');
    expect(initialMessages[1]?.content).toContain('Programmatic design-system extraction started');
    expect(initialMessages[1]?.agentId).toBe('claude');
    expect(initialMessages[1]?.runStatus).toBe('running');
    expect(initialMessages[1]?.startedAt).toBe(initialMessages[0]?.createdAt);

    upsertMessage(db, result.conversationId, {
      id: 'manual-user-message',
      role: 'user',
      content: 'hello while extraction is still running',
    });

    releasePrefetch();
    await backgroundExtraction;
    for (let i = 0; i < 20; i += 1) {
      const messages = listMessages(db, result.conversationId);
      if (messages.some((message) => message.content.includes('Programmatic extraction finished'))) break;
      await new Promise((resolve) => setTimeout(resolve, 5));
    }

    const messages = listMessages(db, result.conversationId);
    expect(messages.some((message) => message.content === 'hello while extraction is still running')).toBe(true);
    const assistant = messages.find((message) => message.content.includes('Programmatic extraction finished'));
    expect(assistant?.role).toBe('assistant');
    expect(assistant?.agentId).toBe('claude');
    expect(assistant?.runStatus).toBe('succeeded');
    expect(assistant?.producedFiles?.length).toBeGreaterThan(1);
  });

  it('backfills a programmatic transcript for empty legacy brand conversations', async () => {
    const db = openDatabase(tempDir, { dataDir: tempDir });
    const result = await startOfflineBrandExtraction({
      url: 'acme.com',
      brandsRoot,
      projectsRoot,
      skillsRoot: SKILLS_ROOT,
      db,
      logoFallback: NO_LOGO_FALLBACK,
    });
    expect(listMessages(db, result.conversationId)).toEqual([]);
    const project = getProject(db, result.projectId);
    if (!project) throw new Error('expected project');
    let seq = 0;

    await backfillBrandExtractionTranscriptForProject({
      db,
      conversationId: result.conversationId,
      randomId: () => `backfill-message-${seq += 1}`,
      brandsRoot,
      projectsRoot,
      project,
      transcriptAgent: { agentId: 'claude', agentName: 'Claude' },
    });

    const messages = listMessages(db, result.conversationId);
    expect(messages.map((message) => message.role)).toEqual(['user', 'assistant']);
    expect(messages[1]?.content).toContain('Programmatic design-system extraction started');
    expect(messages[1]?.agentId).toBe('claude');
    expect(messages[1]?.runStatus).toBe('running');
  });

  it('rejects a non-http(s) URL', async () => {
    const db = openDatabase(tempDir, { dataDir: tempDir });
    await expect(
      startOfflineBrandExtraction({ url: 'ftp://nope', brandsRoot, projectsRoot, skillsRoot: SKILLS_ROOT, db }),
    ).rejects.toThrow(/valid http/i);
  });

  // The bug: an extraction run opened with a seeded prompt that said "use the
  // `brand-extract` skill", which the agent ran as a `Skill {"skill":
  // "brand-extract"}` tool call that always fails (the daemon does not expose
  // `skills/` as Claude-Code slash skills). These tests pin every seeded prompt
  // the agent can actually receive so the inducement can never come back.
  it('website ENRICHMENT prompt never tells the agent to invoke a brand-extract skill', async () => {
    const db = openDatabase(tempDir, { dataDir: tempDir });
    // No userDesignSystemsRoot → no programmatic pass → the enrichment prompt is
    // seeded directly (matches the "reserves the brand" baseline test).
    const result = await startOfflineBrandExtraction({
      url: 'acme.com',
      brandsRoot,
      projectsRoot,
      skillsRoot: SKILLS_ROOT,
      db,
      logoFallback: NO_LOGO_FALLBACK,
    });
    const prompt = getProject(db, result.projectId)?.pendingPrompt ?? '';
    expect(prompt).toContain('DESIGN SYSTEM ENRICHMENT');
    // Workflow stays inline and the real measurement tool is still named.
    expect(prompt).toContain('agent-browser');
    expectNoPhantomSkillCall(prompt);
    // And it positively steers the agent away from the phantom call.
    expect(prompt).toContain('Do NOT try to load or invoke a `brand-extract` skill');
  });

  it('website EXTRACTION fallback prompt never tells the agent to invoke a brand-extract skill', async () => {
    const db = openDatabase(tempDir, { dataDir: tempDir });
    // userDesignSystemsRoot + a fully blocked origin → the programmatic pass
    // bails and the agent drives from the scaffold on the fallback prompt.
    const result = await startOfflineBrandExtraction({
      url: 'blocked.example',
      brandsRoot,
      projectsRoot,
      skillsRoot: SKILLS_ROOT,
      db,
      userDesignSystemsRoot,
      prefetch: async () => null,
      logoFallback: NO_LOGO_FALLBACK,
      imageryFallback: NO_IMAGERY_FALLBACK,
    });
    const prompt = getProject(db, result.projectId)?.pendingPrompt ?? '';
    expect(prompt).toContain('DESIGN SYSTEM EXTRACTION');
    expect(prompt).toContain('agent-browser');
    expectNoPhantomSkillCall(prompt);
    expect(prompt).toContain('Do NOT try to load or invoke a `brand-extract` skill');
  });

  it('DESIGN.md enrichment prompt never tells the agent to invoke a brand-extract skill', async () => {
    const db = openDatabase(tempDir, { dataDir: tempDir });
    // Pasted DESIGN.md (no website) → the programmatic parser registers a system
    // and seeds the DESIGN.md enrichment prompt. This branch never used the skill
    // phrasing, but the guard keeps it that way as the prompts evolve.
    const result = await startOfflineBrandExtraction({
      designMd: DESIGN_MD_INPUT,
      description: 'A custom newsroom system for sharp editorial tools.',
      brandsRoot,
      projectsRoot,
      skillsRoot: SKILLS_ROOT,
      db,
      userDesignSystemsRoot,
      prefetch: async () => {
        throw new Error('website prefetch should not run for DESIGN.md-only input');
      },
      logoFallback: NO_LOGO_FALLBACK,
      imageryFallback: NO_IMAGERY_FALLBACK,
    });
    const prompt = getProject(db, result.projectId)?.pendingPrompt ?? '';
    expect(prompt).toContain('context/input-DESIGN.md');
    expectNoPhantomSkillCall(prompt);
  });

  it('renderBrandPreviewIntoProject re-renders brand.html from a partial brand.json', async () => {
    const db = openDatabase(tempDir, { dataDir: tempDir });
    const started = await startOfflineBrandExtraction({
      url: 'acme.com',
      brandsRoot,
      projectsRoot,
      skillsRoot: SKILLS_ROOT,
      db,
      logoFallback: NO_LOGO_FALLBACK,
    });

    // Agent writes a partial kit (name + a couple colors, no fonts yet).
    const projectDir = path.join(projectsRoot, started.projectId);
    writeFileSync(
      path.join(projectDir, 'brand.json'),
      JSON.stringify({
        name: 'Acme',
        sourceUrl: started.sourceUrl,
        colors: [VALID_BRAND.colors[0], VALID_BRAND.colors[5]],
      }),
      'utf8',
    );

    const preview = await renderBrandPreviewIntoProject({
      id: started.id,
      brandsRoot,
      skillsRoot: SKILLS_ROOT,
      projectsRoot,
    });
    expect(preview.rendered).toBe(true);
    expect(preview.file).toBe('brand.html');

    const html = readFileSync(path.join(projectDir, 'brand.html'), 'utf8');
    // The partial palette flowed into the embedded payload, still "extracting".
    expect(html).toContain('"status":"extracting"');
    expect(html).toContain('#d97757');
  });

  it('finalizeBrand registers the kit, marks it ready, and lights up the assets', async () => {
    const db = openDatabase(tempDir, { dataDir: tempDir });
    const started = await startOfflineBrandExtraction({
      url: 'acme.com',
      brandsRoot,
      projectsRoot,
      skillsRoot: SKILLS_ROOT,
      db,
      logoFallback: NO_LOGO_FALLBACK,
    });
    patchMeta(brandsRoot, started.id, {
      status: 'failed',
      error: 'Old extraction failed.',
      extractionTerminalRunId: 'run-old-failed',
      extractionTerminalError: 'Old extraction failed.',
    });

    // Simulate the agent writing the complete kit into the backing project.
    const projectDir = path.join(projectsRoot, started.projectId);
    writeFileSync(
      path.join(projectDir, 'brand.json'),
      JSON.stringify({ ...VALID_BRAND, sourceUrl: started.sourceUrl }, null, 2),
      'utf8',
    );
    writeFileSync(path.join(projectDir, 'BRAND.md'), '# Acme Brand Guide\n', 'utf8');

    const finalized = await finalizeBrand({
      id: started.id,
      brandsRoot,
      userDesignSystemsRoot,
      projectsRoot,
      skillsRoot: SKILLS_ROOT,
      db,
      logoFallback: NO_LOGO_FALLBACK,
      imageryFallback: NO_IMAGERY_FALLBACK,
    });

    expect(finalized.brand.name).toBe('Acme');
    expect(finalized.designSystemId.startsWith('user:')).toBe(true);
    expect(finalized.files.length).toBeGreaterThan(0);

    const detail = readBrandDetail(brandsRoot, started.id);
    expect(detail?.meta.status).toBe('ready');
    expect(detail?.meta.error).toBeUndefined();
    expect(detail?.meta.extractionTerminalRunId).toBeUndefined();
    expect(detail?.meta.extractionTerminalError).toBeUndefined();
    expect(detail?.meta.designSystemId).toBe(finalized.designSystemId);

    const project = getProject(db, started.projectId);
    expect(project?.designSystemId).toBe(finalized.designSystemId);

    // brand.html re-rendered as ready, and the six artifacts exist so the
    // Brand Assets tiles resolve.
    const html = readFileSync(path.join(projectDir, 'brand.html'), 'utf8');
    expect(html).toContain('"status":"ready"');
    expect(existsSync(path.join(projectDir, 'system', 'artifacts', 'landing.html'))).toBe(true);
    // The design-system module is wired up: the kit iframe + derived tokens.
    expect(html).toContain('system/kit.html');
    expect(existsSync(path.join(projectDir, 'system', 'kit.html'))).toBe(true);
    expect(html).toMatch(/"colorPrimary":"#/);
  });

  it('finalizeBrand is idempotent — re-finalizing reuses the brand design system', async () => {
    const db = openDatabase(tempDir, { dataDir: tempDir });
    const started = await startOfflineBrandExtraction({
      url: 'acme.com',
      brandsRoot,
      projectsRoot,
      skillsRoot: SKILLS_ROOT,
      db,
      logoFallback: NO_LOGO_FALLBACK,
    });

    const projectDir = path.join(projectsRoot, started.projectId);
    writeFileSync(
      path.join(projectDir, 'brand.json'),
      JSON.stringify({ ...VALID_BRAND, sourceUrl: started.sourceUrl }, null, 2),
      'utf8',
    );

    const finalizeOnce = () =>
      finalizeBrand({
        id: started.id,
        brandsRoot,
        userDesignSystemsRoot,
        projectsRoot,
        skillsRoot: SKILLS_ROOT,
        db,
        logoFallback: NO_LOGO_FALLBACK,
        imageryFallback: NO_IMAGERY_FALLBACK,
      });

    // The live extraction agent may re-run `od brand finalize` (e.g. after
    // fixing a validation error or enriching the kit). A second finalize must
    // reuse the brand's existing design system, not register a duplicate.
    const first = await finalizeOnce();
    const second = await finalizeOnce();

    expect(second.designSystemId).toBe(first.designSystemId);

    // Exactly one `user:<id>` design system exists for the brand, so it never
    // shows up twice in any design-system picker.
    const systems = await listDesignSystems(userDesignSystemsRoot, {
      idPrefix: 'user:',
      source: 'user',
      isEditable: true,
      defaultStatus: 'draft',
    });
    expect(systems.filter((s) => s.title === 'Acme')).toHaveLength(1);

    const detail = readBrandDetail(brandsRoot, started.id);
    expect(detail?.meta.designSystemId).toBe(first.designSystemId);
  });

  it('finalizeBrand fails clearly when the agent has not written brand.json yet', async () => {
    const db = openDatabase(tempDir, { dataDir: tempDir });
    const started = await startOfflineBrandExtraction({
      url: 'acme.com',
      brandsRoot,
      projectsRoot,
      skillsRoot: SKILLS_ROOT,
      db,
      logoFallback: NO_LOGO_FALLBACK,
    });

    await expect(
      finalizeBrand({
        id: started.id,
        brandsRoot,
        userDesignSystemsRoot,
        projectsRoot,
        skillsRoot: SKILLS_ROOT,
        db,
      }),
    ).rejects.toThrow(/brand\.json not found/i);
  });

  it('preview renders the imagery gallery + font tiles from imagery.samples', async () => {
    const db = openDatabase(tempDir, { dataDir: tempDir });
    const started = await startOfflineBrandExtraction({
      url: 'acme.com',
      brandsRoot,
      projectsRoot,
      skillsRoot: SKILLS_ROOT,
      db,
      logoFallback: NO_LOGO_FALLBACK,
    });

    const projectDir = path.join(projectsRoot, started.projectId);
    writeFileSync(
      path.join(projectDir, 'brand.json'),
      JSON.stringify({
        name: 'Acme',
        sourceUrl: started.sourceUrl,
        colors: [VALID_BRAND.colors[0], VALID_BRAND.colors[2], VALID_BRAND.colors[5]],
        typography: VALID_BRAND.typography,
        imagery: {
          style: 'bold gradients',
          samples: [
            { file: 'imagery/hero.png', kind: 'hero', caption: 'Homepage hero' },
            { file: 'imagery/product.webp', kind: 'product', caption: 'Product screenshot' },
          ],
        },
      }),
      'utf8',
    );

    const preview = await renderBrandPreviewIntoProject({
      id: started.id,
      brandsRoot,
      skillsRoot: SKILLS_ROOT,
      projectsRoot,
    });
    expect(preview.rendered).toBe(true);

    const html = readFileSync(path.join(projectDir, 'brand.html'), 'utf8');
    // The harvested image paths flow into the embedded payload so the gallery
    // <img src> resolve under the FileViewer raw route.
    expect(html).toContain('imagery/hero.png');
    expect(html).toContain('imagery/product.webp');
    // The kit template ships the gallery + font-specimen-tile renderers.
    expect(html).toContain('<div class="gallery">');
    expect(html).toContain('<div class="fonts">');
  });

  it('preview falls back to a logo alternate when logo.primary is empty', async () => {
    const db = openDatabase(tempDir, { dataDir: tempDir });
    const started = await startOfflineBrandExtraction({
      url: 'acme.com',
      brandsRoot,
      projectsRoot,
      skillsRoot: SKILLS_ROOT,
      db,
      logoFallback: NO_LOGO_FALLBACK,
    });

    const projectDir = path.join(projectsRoot, started.projectId);
    writeFileSync(
      path.join(projectDir, 'brand.json'),
      JSON.stringify({
        name: 'Acme',
        sourceUrl: started.sourceUrl,
        colors: [VALID_BRAND.colors[0], VALID_BRAND.colors[2], VALID_BRAND.colors[5]],
        logo: { primary: null, alternates: ['logos/favicon.ico'], notes: '' },
      }),
      'utf8',
    );

    await renderBrandPreviewIntoProject({
      id: started.id,
      brandsRoot,
      skillsRoot: SKILLS_ROOT,
      projectsRoot,
    });

    const html = readFileSync(path.join(projectDir, 'brand.html'), 'utf8');
    // The alternate path is embedded so the page can render it instead of the
    // "No logo found" empty state.
    expect(html).toContain('logos/favicon.ico');
  });

  it('startBrandExtraction seeds the deterministic logo fallback into the page', async () => {
    const db = openDatabase(tempDir, { dataDir: tempDir });
    // Stub harvester: writes a mark into logos/ and populates logo.primary,
    // exactly as the real network fallback would, but offline.
    const stubFallback = async (
      _url: string,
      logosDir: string,
      logo: { primary: string | null; alternates: string[]; notes: string },
    ) => {
      mkdirSync(logosDir, { recursive: true });
      writeFileSync(path.join(logosDir, 'apple-touch-icon.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
      logo.primary = 'logos/apple-touch-icon.png';
      logo.notes = 'Auto-fetched site icon.';
      return { changed: true };
    };

    const started = await startOfflineBrandExtraction({
      url: 'acme.com',
      brandsRoot,
      projectsRoot,
      skillsRoot: SKILLS_ROOT,
      db,
      logoFallback: stubFallback,
    });

    const projectDir = path.join(projectsRoot, started.projectId);
    expect(existsSync(path.join(projectDir, 'logos', 'apple-touch-icon.png'))).toBe(true);
    const html = readFileSync(path.join(projectDir, 'brand.html'), 'utf8');
    // The seeded page already carries a real mark, not "No logo found".
    expect(html).toContain('logos/apple-touch-icon.png');
  });

  it('finalizeBrand adopts on-disk logo files when the agent left logo.primary empty', async () => {
    const db = openDatabase(tempDir, { dataDir: tempDir });
    const started = await startOfflineBrandExtraction({
      url: 'acme.com',
      brandsRoot,
      projectsRoot,
      skillsRoot: SKILLS_ROOT,
      db,
      logoFallback: NO_LOGO_FALLBACK,
    });

    // The agent (or the seed harvester) saved real logo files into the project,
    // but the agent's brand.json left `logo.primary` empty. The finalize logo
    // safety net must wire the existing files into logo.primary so the kit page
    // never reports "No logo found" while real marks sit in logos/.
    const projectDir = path.join(projectsRoot, started.projectId);
    mkdirSync(path.join(projectDir, 'logos'), { recursive: true });
    writeFileSync(
      path.join(projectDir, 'logos', 'header.svg'),
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 40"><rect width="120" height="40" /></svg>',
      'utf8',
    );
    writeFileSync(
      path.join(projectDir, 'logos', 'apple-touch-icon.png'),
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    );
    writeFileSync(
      path.join(projectDir, 'brand.json'),
      JSON.stringify(
        { ...VALID_BRAND, sourceUrl: started.sourceUrl, logo: { primary: null, alternates: [], notes: '' } },
        null,
        2,
      ),
      'utf8',
    );

    // Use the REAL fallback: with files already on disk it must adopt them
    // offline (no network), not bail out.
    const finalized = await finalizeBrand({
      id: started.id,
      brandsRoot,
      userDesignSystemsRoot,
      projectsRoot,
      skillsRoot: SKILLS_ROOT,
      db,
      logoFallback: ensureLogoFallback,
      imageryFallback: NO_IMAGERY_FALLBACK,
    });

    expect(finalized.brand.logo.primary).toBe('logos/header.svg');

    const html = readFileSync(path.join(projectDir, 'brand.html'), 'utf8');
    expect(html).toContain('"status":"ready"');
    expect(html).toContain('logos/header.svg');
    // The adopted primary is embedded in the page payload, so the kit renders a
    // real mark instead of the empty "No logo found" state.
    expect(html).toContain('"primary":"logos/header.svg"');

    // The synced project brand.json carries the adopted primary too, so the
    // Brands tab and the opened project render an identical, complete logo.
    const projectBrandJson = JSON.parse(
      readFileSync(path.join(projectDir, 'brand.json'), 'utf8'),
    ) as { logo?: { primary?: string | null } };
    expect(projectBrandJson.logo?.primary).toBe('logos/header.svg');
  });

  it('preview adopts on-disk project logos so the live page is never logo-less', async () => {
    const db = openDatabase(tempDir, { dataDir: tempDir });
    const started = await startOfflineBrandExtraction({
      url: 'acme.com',
      brandsRoot,
      projectsRoot,
      skillsRoot: SKILLS_ROOT,
      db,
      logoFallback: NO_LOGO_FALLBACK,
    });

    // Seed harvester wrote a mark into logos/, but the agent then overwrote
    // brand.json with an empty logo while still measuring the rest.
    const projectDir = path.join(projectsRoot, started.projectId);
    mkdirSync(path.join(projectDir, 'logos'), { recursive: true });
    writeFileSync(
      path.join(projectDir, 'logos', 'apple-touch-icon.png'),
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    );
    writeFileSync(
      path.join(projectDir, 'brand.json'),
      JSON.stringify({
        name: 'Acme',
        sourceUrl: started.sourceUrl,
        colors: [VALID_BRAND.colors[0], VALID_BRAND.colors[2], VALID_BRAND.colors[5]],
        logo: { primary: null, alternates: [], notes: '' },
      }),
      'utf8',
    );

    await renderBrandPreviewIntoProject({
      id: started.id,
      brandsRoot,
      skillsRoot: SKILLS_ROOT,
      projectsRoot,
    });

    const html = readFileSync(path.join(projectDir, 'brand.html'), 'utf8');
    expect(html).toContain('logos/apple-touch-icon.png');
    // Embedded as the payload primary, so the live page shows the seed mark.
    expect(html).toContain('"primary":"logos/apple-touch-icon.png"');
  });

  it('finalizeBrand mirrors imagery/ and renders the gallery on the ready page', async () => {
    const db = openDatabase(tempDir, { dataDir: tempDir });
    const started = await startOfflineBrandExtraction({
      url: 'acme.com',
      brandsRoot,
      projectsRoot,
      skillsRoot: SKILLS_ROOT,
      db,
      logoFallback: NO_LOGO_FALLBACK,
    });

    const projectDir = path.join(projectsRoot, started.projectId);
    // Agent saved a real image + referenced it from imagery.samples.
    mkdirSync(path.join(projectDir, 'imagery'), { recursive: true });
    writeFileSync(path.join(projectDir, 'imagery', 'hero.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    writeFileSync(
      path.join(projectDir, 'brand.json'),
      JSON.stringify(
        {
          ...VALID_BRAND,
          sourceUrl: started.sourceUrl,
          imagery: {
            style: 'bold gradients',
            subjects: ['product'],
            treatment: 'high contrast',
            avoid: [],
            samples: [{ file: 'imagery/hero.png', kind: 'hero', caption: 'Homepage hero' }],
          },
        },
        null,
        2,
      ),
      'utf8',
    );

    const finalized = await finalizeBrand({
      id: started.id,
      brandsRoot,
      userDesignSystemsRoot,
      projectsRoot,
      skillsRoot: SKILLS_ROOT,
      db,
      logoFallback: NO_LOGO_FALLBACK,
      imageryFallback: NO_IMAGERY_FALLBACK,
    });

    // Samples survive validation and the image is mirrored into the brand dir
    // and synced back to the project so the gallery still resolves.
    expect(finalized.brand.imagery.samples?.[0]?.file).toBe('imagery/hero.png');
    expect(existsSync(path.join(brandsRoot, started.id, 'imagery', 'hero.png'))).toBe(true);
    expect(existsSync(path.join(projectDir, 'imagery', 'hero.png'))).toBe(true);

    const html = readFileSync(path.join(projectDir, 'brand.html'), 'utf8');
    expect(html).toContain('"status":"ready"');
    expect(html).toContain('imagery/hero.png');
  });

  it('findImageRefs harvests large cover/hero images and drops icons/logos', () => {
    const html = [
      '<html><head>',
      '<meta property="og:image" content="https://cdn.site.com/cover.jpg">',
      '<link rel="preload" as="image" href="/img/hero.png">',
      '</head><body>',
      '<picture><source srcset="/img/big-800.webp 800w, /img/big-400.webp 400w"></picture>',
      '<img src="/img/photo.jpg" width="900" height="600">',
      '<img src="/icons/favicon.png" width="32" height="32">',
      '<img src="/img/logo.svg">',
      '<div style="background-image:url(\'/img/bg-hero.jpg\')"></div>',
      '</body></html>',
    ].join('\n');

    const refs = findImageRefs(html, 'https://site.com/');
    const urls = refs.map((r) => r.url);

    // og:image is the strongest representative candidate.
    const cover = refs.find((r) => r.url.endsWith('/cover.jpg'));
    expect(cover?.rank).toBe(0);
    expect(cover?.kind).toBe('cover');

    // Hero preload, the largest srcset source, the big <img>, and the CSS hero
    // background all survive.
    expect(urls).toContain('https://site.com/img/hero.png');
    expect(urls).toContain('https://site.com/img/big-800.webp');
    expect(urls).not.toContain('https://site.com/img/big-400.webp');
    expect(urls).toContain('https://site.com/img/photo.jpg');
    expect(urls).toContain('https://site.com/img/bg-hero.jpg');

    // Chrome is dropped: a 32px favicon, and an SVG logo.
    expect(urls.some((u) => u.includes('favicon'))).toBe(false);
    expect(urls.some((u) => u.includes('logo.svg'))).toBe(false);
  });

  it('imageSize decodes PNG and GIF header dimensions', () => {
    expect(imageSize(pngBuffer(1200, 630))).toEqual({ w: 1200, h: 630 });

    const gif = Buffer.alloc(24);
    gif.write('GIF89a', 0, 'ascii');
    gif.writeUInt16LE(640, 6);
    gif.writeUInt16LE(480, 8);
    expect(imageSize(gif)).toEqual({ w: 640, h: 480 });

    // A buffer too short to carry a header decodes to null (size gate rejects).
    expect(imageSize(Buffer.from([0x00, 0x01, 0x02]))).toBeNull();
  });

  it('adoptExistingImagery wires on-disk images into imagery.samples offline', () => {
    const imageryDir = path.join(tempDir, 'adopt-imagery');
    mkdirSync(imageryDir, { recursive: true });
    writeFileSync(path.join(imageryDir, 'hero.png'), pngBuffer(1600, 900));
    writeFileSync(path.join(imageryDir, 'screenshot.png'), pngBuffer(1280, 720));

    const imagery: ImagerySlot = { samples: [] };
    const result = adoptExistingImagery(imageryDir, imagery);

    expect(result.changed).toBe(true);
    const files = (imagery.samples ?? []).map((s) => s.file).sort();
    expect(files).toEqual(['imagery/hero.png', 'imagery/screenshot.png']);
  });

  it('finalizeBrand runs the imagery fallback when the agent saved no samples', async () => {
    const db = openDatabase(tempDir, { dataDir: tempDir });
    const started = await startOfflineBrandExtraction({
      url: 'acme.com',
      brandsRoot,
      projectsRoot,
      skillsRoot: SKILLS_ROOT,
      db,
      logoFallback: NO_LOGO_FALLBACK,
    });

    const projectDir = path.join(projectsRoot, started.projectId);
    // Agent wrote a complete kit but captured ZERO imagery samples — exactly the
    // case the displayed pre-imagery brand was stuck in.
    writeFileSync(
      path.join(projectDir, 'brand.json'),
      JSON.stringify({ ...VALID_BRAND, sourceUrl: started.sourceUrl }, null, 2),
      'utf8',
    );

    // Stub harvester mirrors the real one offline: it saves cover/hero images
    // into imagery/ and records them in imagery.samples.
    const stubImageryFallback = async (
      _url: string,
      imageryDir: string,
      imagery: ImagerySlot,
    ) => {
      mkdirSync(imageryDir, { recursive: true });
      writeFileSync(path.join(imageryDir, 'cover-0.jpg'), pngBuffer(1200, 630));
      writeFileSync(path.join(imageryDir, 'hero-1.png'), pngBuffer(1600, 900));
      writeFileSync(path.join(imageryDir, 'hero-2.png'), pngBuffer(1440, 810));
      imagery.samples = [
        { file: 'imagery/cover-0.jpg', kind: 'cover', caption: 'Social cover image' },
        { file: 'imagery/hero-1.png', kind: 'hero', caption: 'Hero image' },
        { file: 'imagery/hero-2.png', kind: 'hero', caption: 'Hero image 2' },
      ];
      return { changed: true };
    };

    const finalized = await finalizeBrand({
      id: started.id,
      brandsRoot,
      userDesignSystemsRoot,
      projectsRoot,
      skillsRoot: SKILLS_ROOT,
      db,
      logoFallback: NO_LOGO_FALLBACK,
      imageryFallback: stubImageryFallback,
    });

    // The harvested samples flow into the validated brand and the saved files
    // land in BOTH the brand dir and the synced project dir.
    expect(finalized.brand.imagery.samples?.length).toBe(3);
    expect(finalized.brand.imagery.samples?.[0]?.file).toBe('imagery/cover-0.jpg');
    expect(existsSync(path.join(brandsRoot, started.id, 'imagery', 'cover-0.jpg'))).toBe(true);
    expect(existsSync(path.join(projectDir, 'imagery', 'hero-1.png'))).toBe(true);

    // The synced project brand.json carries the samples so the Brands tab
    // gallery resolves identically to the kit page.
    const projectBrandJson = JSON.parse(
      readFileSync(path.join(projectDir, 'brand.json'), 'utf8'),
    ) as { imagery?: { samples?: Array<{ file: string }> } };
    expect(projectBrandJson.imagery?.samples?.map((s) => s.file)).toContain('imagery/cover-0.jpg');

    // The ready kit page renders the Images gallery with the harvested files.
    const html = readFileSync(path.join(projectDir, 'brand.html'), 'utf8');
    expect(html).toContain('"status":"ready"');
    expect(html).toContain('<div class="gallery">');
    expect(html).toContain('imagery/cover-0.jpg');
  });

  it('startBrandExtraction finalizes a usable design system programmatically before returning', async () => {
    const db = openDatabase(tempDir, { dataDir: tempDir });

    // Stub the network harvest: write a real logo into the brand dir and return
    // measured material, exactly as the live prefetch would, but offline.
    const stubPrefetch = async (_url: string, brandDir: string) => {
      const logosDir = path.join(brandDir, 'logos');
      mkdirSync(logosDir, { recursive: true });
      writeFileSync(
        path.join(logosDir, 'header.svg'),
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 40"><rect width="120" height="40" /></svg>',
        'utf8',
      );
      return {
        url: 'https://acme.com/',
        finalUrl: 'https://acme.com/',
        siteName: 'Acme',
        title: 'Acme — we make things',
        description: 'Acme makes excellent things for everyone.',
        colors: [
          { hex: '#ffffff', count: 50 },
          { hex: '#1a1a18', count: 30 },
          { hex: '#d97757', count: 18 },
        ],
        fonts: [{ family: 'Inter', count: 22 }],
        fontFaceFamilies: [],
        googleFontsUrls: [],
        fontFiles: [],
        logos: [
          { file: 'header.svg', sourceUrl: 'https://acme.com/', kind: 'inline-svg' as const, bytes: 120 },
        ],
        headings: ['We make things'],
        paragraphs: ['Acme makes excellent things for everyone.'],
        navLabels: [],
        extraPages: [],
        screenshot: null,
        thin: false,
        blocked: false,
        materialMd: '',
      };
    };

    const result = await startOfflineBrandExtraction({
      url: 'acme.com',
      brandsRoot,
      projectsRoot,
      skillsRoot: SKILLS_ROOT,
      db,
      // Switch on the programmatic-first path; keep the safety-net fallbacks
      // offline so the test never touches the network.
      userDesignSystemsRoot,
      prefetch: stubPrefetch,
      logoFallback: NO_LOGO_FALLBACK,
      imageryFallback: NO_IMAGERY_FALLBACK,
    });

    // The design system is registered + ready the moment startBrandExtraction
    // returns — no agent run required (the instant "aha").
    const detail = readBrandDetail(brandsRoot, result.id);
    expect(detail?.meta.status).toBe('ready');
    expect(detail?.meta.designSystemId?.startsWith('user:')).toBe(true);
    expect(detail?.brand?.name).toBe('Acme');
    expect(detail?.brand?.tagline).toBe('We make things');
    expect(detail?.brand?.logo.primary).toBe('logos/header.svg');
    expect(result.status).toBe('ready');
    expect(result.designSystemId).toBe(detail?.meta.designSystemId);
    expect(result.brandName).toBe('Acme');

    // The backing project's design system page renders ready, with the six
    // artifacts built, so it is immediately applyable.
    const projectDir = path.join(projectsRoot, result.projectId);
    const html = readFileSync(path.join(projectDir, 'brand.html'), 'utf8');
    expect(html).toContain('"status":"ready"');
    expect(existsSync(path.join(projectDir, 'system', 'artifacts', 'landing.html'))).toBe(true);

    // Exactly one reusable design system was registered for the brand.
    const systems = await listDesignSystems(userDesignSystemsRoot, {
      idPrefix: 'user:',
      source: 'user',
      isEditable: true,
      defaultStatus: 'draft',
    });
    expect(systems.filter((s) => s.title === 'Acme')).toHaveLength(1);

    // The agent prompt is still seeded so the async AI enrichment pass can run.
    const project = getProject(db, result.projectId);
    expect(project?.pendingPrompt ?? '').toContain('DESIGN SYSTEM ENRICHMENT');
    expect(project?.designSystemId).toBe(detail?.meta.designSystemId);
  });

  it('startBrandExtraction registers directly from a pasted DESIGN.md without a website', async () => {
    const db = openDatabase(tempDir, { dataDir: tempDir });

    const result = await startOfflineBrandExtraction({
      designMd: DESIGN_MD_INPUT,
      description: 'A custom newsroom system for sharp editorial tools.',
      brandsRoot,
      projectsRoot,
      skillsRoot: SKILLS_ROOT,
      db,
      userDesignSystemsRoot,
      prefetch: async () => {
        throw new Error('website prefetch should not run for DESIGN.md-only input');
      },
      logoFallback: NO_LOGO_FALLBACK,
      imageryFallback: NO_IMAGERY_FALLBACK,
    });

    const detail = readBrandDetail(brandsRoot, result.id);
    expect(detail?.meta.status).toBe('ready');
    expect(detail?.meta.sourceUrl).toBe('designmd://heritage');
    expect(detail?.meta.designSystemId?.startsWith('user:')).toBe(true);
    expect(detail?.brand?.name).toBe('Heritage');
    expect(detail?.brand?.description).toContain('custom newsroom');
    expect(detail?.brand?.colors.find((color) => color.role === 'accent')?.hex).toBe('#b8422e');
    expect(detail?.brand?.typography.display.family).toBe('Public Sans');
    expect(result.status).toBe('ready');
    expect(result.designSystemId).toBe(detail?.meta.designSystemId);

    const projectDir = path.join(projectsRoot, result.projectId);
    expect(readFileSync(path.join(projectDir, 'context', 'input-DESIGN.md'), 'utf8')).toContain('name: Heritage');
    expect(existsSync(path.join(projectDir, 'system', 'scripts', 'apply-design-tokens.mjs'))).toBe(true);
    const project = getProject(db, result.projectId);
    expect(project?.pendingPrompt ?? '').toContain('context/input-DESIGN.md');
    expect(project?.designSystemId).toBe(detail?.meta.designSystemId);
    const tabs = listTabs(db, result.projectId);
    expect('browserTabs' in tabs ? tabs.browserTabs ?? [] : []).toHaveLength(0);
  });

  it('startBrandExtraction stays in extracting when the programmatic harvest fails', async () => {
    const db = openDatabase(tempDir, { dataDir: tempDir });

    // Prefetch returns null (fully blocked / unreachable origin) → no design
    // system is built and the agent takes over from the scaffold.
    const result = await startOfflineBrandExtraction({
      url: 'acme.com',
      brandsRoot,
      projectsRoot,
      skillsRoot: SKILLS_ROOT,
      db,
      userDesignSystemsRoot,
      prefetch: async () => null,
      logoFallback: NO_LOGO_FALLBACK,
      imageryFallback: NO_IMAGERY_FALLBACK,
    });

    const detail = readBrandDetail(brandsRoot, result.id);
    expect(detail?.meta.status).toBe('extracting');
    expect(detail?.meta.designSystemId).toBeUndefined();

    const html = readFileSync(path.join(projectsRoot, result.projectId, 'brand.html'), 'utf8');
    expect(html).toContain('"status":"extracting"');
  });

  it('does not finalize blocked or thin programmatic harvests as ready', async () => {
    const db = openDatabase(tempDir, { dataDir: tempDir });

    for (const [host, flags] of [
      ['blocked.example', { blocked: true, thin: true }],
      ['thin.example', { blocked: false, thin: true }],
    ] as const) {
      const result = await startOfflineBrandExtraction({
        url: host,
        brandsRoot,
        projectsRoot,
        skillsRoot: SKILLS_ROOT,
        db,
        userDesignSystemsRoot,
        prefetch: async () => ({
          url: `https://${host}/`,
          finalUrl: `https://${host}/`,
          siteName: 'Fallback',
          title: '',
          description: '',
          colors: [
            { hex: '#ffffff', count: 50, extreme: true },
            { hex: '#111111', count: 30, extreme: true },
          ],
          fonts: [],
          fontFaceFamilies: [],
          googleFontsUrls: [],
          fontFiles: [],
          logos: [],
          headings: [],
          paragraphs: [],
          navLabels: [],
          extraPages: [],
          screenshot: null,
          materialMd: '',
          ...flags,
        }),
        logoFallback: NO_LOGO_FALLBACK,
        imageryFallback: NO_IMAGERY_FALLBACK,
      });

      const detail = readBrandDetail(brandsRoot, result.id);
      expect(detail?.meta.status).toBe('extracting');
      expect(detail?.meta.designSystemId).toBeUndefined();
      const html = readFileSync(path.join(projectsRoot, result.projectId, 'brand.html'), 'utf8');
      expect(html).toContain('"status":"extracting"');

      const project = getProject(db, result.projectId);
      expect(project?.pendingPrompt ?? '').toContain('DESIGN SYSTEM EXTRACTION');
      expect(project?.pendingPrompt ?? '').toContain('ready design system is NOT guaranteed yet');
      expect(project?.pendingPrompt ?? '').not.toContain('DESIGN SYSTEM ENRICHMENT');
      expect(project?.pendingPrompt ?? '').not.toContain('ALREADY been extracted programmatically');
    }

    const systems = await listDesignSystems(userDesignSystemsRoot, {
      idPrefix: 'user:',
      source: 'user',
      isEditable: true,
      defaultStatus: 'draft',
    });
    expect(systems).toHaveLength(0);
  });

  it('classifies EO_Bot_Ssid verification pages as anti-bot challenges', () => {
    expect(isChallengePage(`
      <!doctype html>
      <html>
        <head><title>旺旺集团</title></head>
        <body>
          <script>
            document.cookie = "EO_Bot_Ssid=abc123";
            window.__tst_status = "verify";
            location.reload();
          </script>
        </body>
      </html>
    `)).toBe(true);
  });

  it('returns fast without blocking on a slow programmatic harvest, then finalizes in the background', async () => {
    const db = openDatabase(tempDir, { dataDir: tempDir });

    // A slow origin: the harvest takes far longer than the start response should
    // ever wait. The user must still land in the project promptly.
    const SLOW_MS = 1_500;
    const stubPrefetch = async (_url: string, brandDir: string) => {
      await new Promise((resolve) => setTimeout(resolve, SLOW_MS));
      const logosDir = path.join(brandDir, 'logos');
      mkdirSync(logosDir, { recursive: true });
      writeFileSync(
        path.join(logosDir, 'header.svg'),
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 40"><rect width="120" height="40" /></svg>',
        'utf8',
      );
      return {
        url: 'https://slow.com/',
        finalUrl: 'https://slow.com/',
        siteName: 'Slow',
        title: 'Slow — eventually',
        description: 'Slow makes things, eventually.',
        colors: [
          { hex: '#ffffff', count: 50 },
          { hex: '#1a1a18', count: 30 },
          { hex: '#d97757', count: 18 },
        ],
        fonts: [{ family: 'Inter', count: 22 }],
        fontFaceFamilies: [],
        googleFontsUrls: [],
        fontFiles: [],
        logos: [
          { file: 'header.svg', sourceUrl: 'https://slow.com/', kind: 'inline-svg' as const, bytes: 120 },
        ],
        headings: ['Eventually'],
        paragraphs: ['Slow makes things, eventually.'],
        navLabels: [],
        extraPages: [],
        screenshot: null,
        thin: false,
        blocked: false,
        materialMd: '',
      };
    };

    let background: Promise<unknown> | null = null;
    const startedAt = Date.now();
    const result = await startOfflineBrandExtraction({
      url: 'slow.com',
      brandsRoot,
      projectsRoot,
      skillsRoot: SKILLS_ROOT,
      db,
      userDesignSystemsRoot,
      prefetch: stubPrefetch,
      logoFallback: NO_LOGO_FALLBACK,
      imageryFallback: NO_IMAGERY_FALLBACK,
      // Keep the test snappy: a short sync budget, well under the slow harvest.
      programmaticSyncBudgetMs: 200,
      onBackgroundExtraction: (settled) => {
        background = settled;
      },
    });
    const elapsed = Date.now() - startedAt;

    // The start response returned long before the slow harvest could finish.
    expect(elapsed).toBeLessThan(SLOW_MS);
    expect(background).not.toBeNull();

    // At return time the brand is still extracting (skeleton page), so the user
    // sees a progress state rather than waiting on the network.
    expect(result.status).toBe('extracting');
    expect(result.designSystemId).toBeUndefined();
    expect(readBrandDetail(brandsRoot, result.id)?.meta.status).toBe('extracting');

    // Once the background harvest settles, the brand finalizes to ready.
    await background;
    const detail = readBrandDetail(brandsRoot, result.id);
    expect(detail?.meta.status).toBe('ready');
    expect(detail?.meta.designSystemId?.startsWith('user:')).toBe(true);
  });
});
