// Brand engine — public API consumed by brand-routes.ts.
//
// A "brand" = brand metadata (brand.json + meta.json under
// `<brandsRoot>/<id>/`) PLUS a generated user design system. Extraction is now
// AGENT-DRIVEN, not an in-place deterministic pipeline:
//
//   1. startBrandExtraction — reserve the brand record, create a backing
//      `brand` project with the target site open in an in-app browser tab, and
//      seed a pending prompt that walks an agent through the full extraction
//      chain (measure → synthesize → build the design system). The web/CLI
//      caller navigates in and auto-sends, so the agent runs the extraction
//      live in front of the user (who can clear anti-bot walls by hand).
//   2. finalizeBrand — once the agent has written `brand.json` (+ BRAND.md,
//      logos, fonts) into the project, validate the kit, derive tokens +
//      brand-system artifacts, and register the `user:<id>` design system so
//      selecting the brand in the composer reuses the EXISTING designSystemId
//      apply flow (no parallel brandId path).

import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

import type {
  Brand,
  BrandDetailResponse,
  BrandFinalizeResponse,
  BrandMeta,
  BrandSummary,
  ProjectMetadata,
} from '@open-design/contracts';

import {
  createUserDesignSystem,
  deleteUserDesignSystem,
  linkUserDesignSystemProject,
  updateUserDesignSystem,
  type UserDesignSystemInput,
} from '../design-systems/index.js';
import {
  getProject,
  insertConversation,
  insertProject,
  setTabs,
  updateProject,
} from '../db.js';
import { readProjectFile, resolveProjectDir, writeProjectFile } from '../projects.js';
import { brandGuideMd, brandToDesignMd } from './design-md.js';
import { reflowBrandToMemory } from './memory.js';
import { brandSystemDir, rebuildSystem } from './system.js';
import { extractJsonBlock, validateBrand } from './validate.js';
import { brandFromMaterial } from './provisional.js';
import { prefetchBrand, type PrefetchResult } from './prefetch.js';
import { BRAND_KIT_FILE, writeBrandKitPreview } from './kit-render.js';
import { selfHostGoogleFonts } from './fonts.js';
import { adoptExistingLogos, ensureLogoFallback, type LogoFallbackFn, type LogoSlot } from './logo-fallback.js';
import { ensureImageryFallback, type ImageryFallbackFn, type ImagerySlot } from './imagery-fallback.js';
import { ensureBrandSeed, type SeedFallbackFn, type SeedSlot } from './seed-fallback.js';
import {
  createBrandDir,
  deleteBrandDir,
  listBrandIds,
  newBrandId,
  patchMeta,
  readBrand,
  readBrandGuide,
  readMeta,
  resolveBrandFile,
  writeBrand,
  writeBrandGuide,
} from './store.js';

/** The in-app browser tab id the extraction project opens to the target site.
 *  Matches the web `FileWorkspace` BROWSER_TAB_PREFIX numbering. */
const BRAND_BROWSER_TAB_ID = '__browser__:1';

export type {
  ColorCandidate,
  FontCandidate,
  LogoCandidate,
  PrefetchResult,
} from './prefetch.js';
export { brandFromMaterial } from './provisional.js';
export { brandToDesignMd, brandGuideMd } from './design-md.js';
export { extractJsonBlock, validateBrand } from './validate.js';

export interface StartBrandExtractionOptions {
  url: string;
  brandsRoot: string;
  projectsRoot: string;
  /** Skills root so the seeded `brand.html` can be rendered from the bundled
   *  brand-extract template. */
  skillsRoot: string;
  db: Parameters<typeof insertProject>[0];
  randomId?: () => string;
  /** Override the deterministic logo harvester (tests inject a no-op / stub to
   *  avoid real network calls). Defaults to the live icon-fetching fallback. */
  logoFallback?: LogoFallbackFn;
  /** Override the deterministic palette/typography seed harvester (tests inject
   *  a no-op to avoid real network calls). Defaults to the live CSS harvester
   *  so the first paint already shows a real palette + fonts. */
  seedFallback?: SeedFallbackFn;
  /** Override the deterministic imagery harvester (tests inject a no-op to avoid
   *  real network calls). Defaults to the live cover/hero-image fallback so the
   *  first paint already shows representative images. */
  imageryFallback?: ImageryFallbackFn;
  /** `<dataDir>/design-systems` — registry root. Required to run the
   *  programmatic-first extraction (which registers a `user:<id>` design system
   *  synchronously). When omitted, no programmatic finalize runs and the brand
   *  stays `extracting` for the agent to drive (the legacy behavior tests use). */
  userDesignSystemsRoot?: string;
  /** Runtime data dir so the programmatically-built design system is sedimented
   *  into memory. Optional. */
  dataDir?: string;
  /** Override the deterministic site harvester used by the programmatic-first
   *  extraction (tests inject a stub to stay offline). Defaults to the live
   *  network prefetch. */
  prefetch?: PrefetchFn;
  /** Upper bound on how long the start response will WAIT for the synchronous
   *  programmatic finalize before returning and letting it finish in the
   *  background. Fast origins still finalize within the budget (the instant
   *  "aha"); slow / blocked origins return immediately on a skeleton and the
   *  finalize continues in the background. Defaults to
   *  `BRAND_PROGRAMMATIC_SYNC_BUDGET_MS`. */
  programmaticSyncBudgetMs?: number;
  /** Test/observability hook invoked with the background programmatic-extraction
   *  promise whenever the start response returns before that work settles, so
   *  callers (tests) can await completion deterministically. */
  onBackgroundExtraction?: (settled: Promise<unknown>) => void;
}

export interface StartBrandExtractionResult {
  id: string;
  projectId: string;
  conversationId: string;
  sourceUrl: string;
}

/** Normalize a user-typed URL: prepend https:// when no scheme is present;
 *  reject anything that isn't http(s). Returns null when unusable. */
function normalizeUrl(raw: string): string | null {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let parsed: URL;
  try {
    parsed = new URL(withScheme);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  return parsed.href;
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, '');
  } catch {
    return url;
  }
}

/**
 * Reserve a brand and stand up the agent-driven extraction project. Throws on
 * an invalid URL (the route maps that to a 400). The caller navigates into the
 * returned project and auto-sends the seeded prompt to start the agent.
 */
export async function startBrandExtraction(
  opts: StartBrandExtractionOptions,
): Promise<StartBrandExtractionResult> {
  const url = normalizeUrl(opts.url);
  if (!url) throw new Error('Enter a valid http(s) website URL.');

  const {
    brandsRoot,
    projectsRoot,
    skillsRoot,
    db,
    randomId = randomUUID,
    logoFallback = ensureLogoFallback,
    seedFallback = ensureBrandSeed,
    imageryFallback = ensureImageryFallback,
  } = opts;
  const id = newBrandId(url);
  const projectId = brandProjectId(id);
  const host = hostnameOf(url);
  const now = Date.now();

  const meta: BrandMeta = {
    id,
    sourceUrl: url,
    createdAt: now,
    updatedAt: now,
    status: 'extracting',
    projectId,
  };
  createBrandDir(brandsRoot, id, meta);

  const metadata: ProjectMetadata = {
    kind: 'brand',
    importedFrom: 'brand-extraction',
    sourceFileName: host,
    nameSource: 'generated',
    skipDiscoveryBrief: true,
    brandId: id,
    brandSourceUrl: url,
  };
  const name = `${host} Design System`;
  const runProgrammatic = Boolean(opts.userDesignSystemsRoot);
  const pendingPrompt = runProgrammatic
    ? brandExtractionFallbackPrompt({ url, brandId: id, host })
    : brandExtractionPrompt({ url, brandId: id, host });
  insertProject(db, {
    id: projectId,
    name,
    skillId: null,
    designSystemId: null,
    pendingPrompt,
    metadata,
    customInstructions: null,
    createdAt: now,
    updatedAt: now,
  });
  const conversationId = randomId();
  insertConversation(db, {
    id: conversationId,
    projectId,
    title: null,
    sessionMode: 'design',
    createdAt: now,
    updatedAt: now,
  });

  // Seed the design-system page immediately so the user sees a real, on-brand
  // scaffold the moment the project opens — not just a scrolling chat. It
  // starts as skeletons + "Extracting…" and is replaced by the programmatic
  // first paint (below) or filled in by the agent's `od brand preview` passes.
  //
  // When programmatic-first extraction is going to run (the common path —
  // `userDesignSystemsRoot` is wired by the route), skip the legacy seed
  // harvest entirely: the synchronous programmatic finalize re-fetches the
  // same material and produces a complete, ready page anyway, so a second
  // network harvest here would only add latency. Otherwise (legacy / tests),
  // run the bounded parallel seed harvest so the first paint already shows a
  // real logo / palette / fonts / cover imagery before the agent measures.
  const seedBrand: Record<string, unknown> = { name: host, sourceUrl: url, colors: [], typography: {} };
  if (!runProgrammatic) {
    try {
      const projectDir = resolveProjectDir(projectsRoot, projectId, metadata);
      const logo = { primary: null as string | null, alternates: [] as string[], notes: '' };
      const seedSlot: SeedSlot = {};
      const imagery: ImagerySlot = { samples: [] };
      const noChange = () => ({ changed: false });
      const [logoRes] = await Promise.all([
        logoFallback(url, path.join(projectDir, 'logos'), logo).catch(noChange),
        seedFallback(url, seedSlot).catch(noChange),
        imageryFallback(url, path.join(projectDir, 'imagery'), imagery).catch(noChange),
      ]);
      if (logoRes.changed) seedBrand.logo = logo;
      if (seedSlot.colors && seedSlot.colors.length) seedBrand.colors = seedSlot.colors;
      if (seedSlot.typography) seedBrand.typography = seedSlot.typography;
      if (imagery.samples && imagery.samples.length) seedBrand.imagery = { samples: imagery.samples };
    } catch {
      // Best-effort only — never block project creation on the seed harvest.
    }
  }
  await writeBrandKitPreview({
    skillsRoot,
    projectsRoot,
    projectId,
    brand: seedBrand,
    status: 'extracting',
    host,
    metadata,
  });

  // brand.html is the star of the workspace (active tab). The target site stays
  // available as a secondary in-app browser tab so the user can glance at it /
  // clear an anti-bot wall by hand when the agent asks.
  setTabs(db, projectId, {
    tabs: [BRAND_KIT_FILE],
    active: BRAND_KIT_FILE,
    browserTabs: [{ id: BRAND_BROWSER_TAB_ID, label: 'Browser', url, title: host }],
  });

  // Programmatic-first: synchronously harvest + synthesize + finalize a usable
  // design system before returning, so the caller navigates into a project whose
  // design system is ALREADY registered and applyable (the instant "aha"). The
  // agent's auto-sent prompt then runs as the async AI enrichment pass. Bounded
  // and best-effort: a slow / blocked site (or any failure) leaves the brand
  // `extracting` and the agent drives the extraction from the scaffold instead.
  if (runProgrammatic && opts.userDesignSystemsRoot) {
    const programmaticOptions: RunProgrammaticExtractionOptions = {
      id,
      meta,
      projectId,
      brandsRoot,
      userDesignSystemsRoot: opts.userDesignSystemsRoot,
      projectsRoot,
      skillsRoot,
      db,
      logoFallback,
      imageryFallback,
    };
    if (opts.dataDir) programmaticOptions.dataDir = opts.dataDir;
    if (opts.prefetch) programmaticOptions.prefetch = opts.prefetch;

    // The full programmatic finalize (harvest + synthesize + register) keeps
    // running to completion — but the start response only WAITS for it up to a
    // short budget. A fast origin finalizes within the budget so the caller
    // still lands on a ready, applyable design system (the instant "aha"); a
    // slow / blocked origin returns immediately on the "Extracting…" skeleton
    // and the finalize sediments the design system in the background, after
    // which the next `GET /api/brands/:id` (or a `preview`/`finalize` call)
    // reflects it. Best-effort: a failure leaves the brand `extracting` for the
    // agent to drive. PROGRAMMATIC_EXTRACT_TIMEOUT_MS still caps the background
    // work so a hanging origin can never leak a forever-pending promise.
    const settled = withTimeout(
      runProgrammaticExtraction(programmaticOptions),
      PROGRAMMATIC_EXTRACT_TIMEOUT_MS,
    ).catch((err) => {
      console.warn(`[brand] programmatic extraction failed for ${id} — falling back to agent`, err);
      return null;
    });
    const budget = opts.programmaticSyncBudgetMs ?? BRAND_PROGRAMMATIC_SYNC_BUDGET_MS;
    const finishedInBudget = await Promise.race([
      settled.then(() => true),
      sleep(budget).then(() => false),
    ]);
    if (!finishedInBudget) opts.onBackgroundExtraction?.(settled);
  }

  return { id, projectId, conversationId, sourceUrl: url };
}

/** How long `startBrandExtraction` waits for the synchronous programmatic
 *  finalize before returning and letting it complete in the background. Tuned
 *  to keep navigation snappy: fast sites still finalize in time for the instant
 *  "aha", slow ones never block the user from entering the project. */
const BRAND_PROGRAMMATIC_SYNC_BUDGET_MS = 1_200;

/** Resolve after `ms`. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Upper bound on the synchronous programmatic-first extraction so a slow or
 *  hanging origin can never block the start response indefinitely; on timeout
 *  the brand simply stays `extracting` for the agent to finish. */
const PROGRAMMATIC_EXTRACT_TIMEOUT_MS = 45_000;

/** Resolve `p`, or reject once `ms` elapses. The underlying work keeps running
 *  (and may still mark the brand ready) — we only stop awaiting it. */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms);
    p.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

export interface FinalizeBrandOptions {
  id: string;
  brandsRoot: string;
  userDesignSystemsRoot: string;
  projectsRoot: string;
  /** Skills root so the final `brand.html` re-render can read the template. */
  skillsRoot: string;
  db: Parameters<typeof insertProject>[0];
  /** Runtime data dir (`<dataDir>/memory` lives under it). When provided, the
   *  finalized brand is sedimented into the memory store so future chats can
   *  ground vague requests in the brand's palette, type, voice and rules.
   *  Omitted in unit tests that only exercise design-system registration. */
  dataDir?: string;
  /** Overrides the brand's recorded backing project. */
  projectId?: string;
  randomId?: () => string;
  /** Override the deterministic logo harvester (tests inject a no-op / stub to
   *  avoid real network calls). Defaults to the live icon-fetching fallback. */
  logoFallback?: LogoFallbackFn;
  /** Override the deterministic imagery harvester (tests inject a no-op / stub
   *  to avoid real network calls). Defaults to the live cover/hero-image
   *  fallback that runs when the agent captured too few `imagery.samples`. */
  imageryFallback?: ImageryFallbackFn;
}

/**
 * Finalize an agent-extracted brand: read `brand.json` (+ optional BRAND.md,
 * logos, fonts) the agent wrote into the backing project, validate it, derive
 * the deterministic brand-system artifacts, and register the `user:<id>`
 * design system. Marks the brand `ready`. Throws with a precise message when
 * the agent output is missing or invalid.
 */
export async function finalizeBrand(
  opts: FinalizeBrandOptions,
): Promise<BrandFinalizeResponse> {
  const { id, brandsRoot, projectsRoot } = opts;
  const meta = readMeta(brandsRoot, id);
  if (!meta) throw new Error(`brand not found: ${id}`);
  const projectId = opts.projectId ?? meta.projectId ?? brandProjectId(id);

  const brandJsonRaw = await readProjectTextOrNull(projectsRoot, projectId, 'brand.json');
  if (brandJsonRaw === null) {
    throw new Error(
      'brand.json not found in the extraction project — the agent has not written the design system yet.',
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(brandJsonRaw);
  } catch {
    const block = extractJsonBlock(brandJsonRaw);
    if (block === null) throw new Error('brand.json is not valid JSON.');
    parsed = block;
  }
  let brand: Brand;
  try {
    brand = validateBrand(parsed, meta.sourceUrl);
  } catch (err) {
    throw new Error(`brand.json failed validation: ${errorMessage(err)}`);
  }

  // Pull the agent's downloaded assets into the brand workspace so the
  // deterministic builder and the design system see them.
  copyProjectDirToBrand(projectsRoot, projectId, brandsRoot, id, 'logos');
  copyProjectDirToBrand(projectsRoot, projectId, brandsRoot, id, 'fonts');
  copyProjectDirToBrand(projectsRoot, projectId, brandsRoot, id, 'imagery');

  const guideMd =
    (await readProjectTextOrNull(projectsRoot, projectId, 'BRAND.md')) ?? brandGuideMd(brand);

  return finalizeBrandCore({ ...opts, id, projectId, meta, brand, guideMd });
}

interface FinalizeBrandCoreOptions extends FinalizeBrandOptions {
  /** Backing project to sync the finalized design system into. */
  projectId: string;
  /** Lifecycle record (already loaded by the caller). */
  meta: BrandMeta;
  /** The validated design system to register — already in memory, so this is
   *  shared by both the programmatic-first path (brandFromMaterial) and the
   *  agent enrichment path (brand.json from the project). */
  brand: Brand;
  /** Prose guide markdown to persist alongside the design system. */
  guideMd: string;
}

/**
 * Shared finalize body: persist the design system, run the deterministic logo /
 * imagery / font safety nets over the brand workspace, build the token system +
 * artifacts, register the reusable `user:<id>` design system, sync everything
 * into the backing project, and mark the brand `ready`. Assumes the caller has
 * already populated the brand workspace assets (logos / fonts / imagery).
 */
async function finalizeBrandCore(opts: FinalizeBrandCoreOptions): Promise<BrandFinalizeResponse> {
  const {
    id,
    brandsRoot,
    userDesignSystemsRoot,
    projectsRoot,
    db,
    meta,
    projectId,
    brand,
    guideMd,
    logoFallback = ensureLogoFallback,
    imageryFallback = ensureImageryFallback,
  } = opts;

  writeBrand(brandsRoot, id, brand);
  writeBrandGuide(brandsRoot, id, guideMd);

  // Deterministic logo safety net: if the agent saved no logo and left
  // `logo.primary` empty, fetch the site's icon assets server-side so the kit
  // almost never shows "No logo found". Best-effort — offline just leaves it
  // empty. Re-persist brand.json so the populated logo flows into the design
  // system, the synced project files, and memory below.
  try {
    const brandDir = resolveBrandFile(brandsRoot, id, []);
    if (brandDir) {
      const result = await logoFallback(meta.sourceUrl, path.join(brandDir, 'logos'), brand.logo);
      if (result.changed) writeBrand(brandsRoot, id, brand);
    }
  } catch {
    // Offline / unreachable origin — keep the (empty) logo and continue.
  }

  // Deterministic imagery safety net: if the agent captured too few
  // representative images, harvest the site's real cover/hero images
  // server-side so the kit's Images gallery actually populates. It first
  // adopts any files already saved into imagery/ (offline), then harvests the
  // live site only when still short. Best-effort — offline just leaves the
  // gallery as the agent left it. Re-persist brand.json so the new samples
  // flow into the synced project files and the rendered kit page below.
  try {
    const brandDir = resolveBrandFile(brandsRoot, id, []);
    if (brandDir) {
      const result = await imageryFallback(meta.sourceUrl, path.join(brandDir, 'imagery'), brand.imagery);
      if (result.changed) writeBrand(brandsRoot, id, brand);
    }
  } catch {
    // Offline / unreachable origin — keep whatever imagery the agent saved.
  }

  // Self-host any Google Fonts the agent declared (typography.*.googleFontsUrl)
  // into the brand's fonts/ + manifest.json so the component kit, the exported
  // brandpack, and the brand.html specimens render in the real typefaces rather
  // than a fallback. Best-effort: network failures leave the fallback stacks.
  try {
    const brandDir = resolveBrandFile(brandsRoot, id, []);
    if (brandDir) await selfHostGoogleFonts(brand, brandDir);
  } catch {
    // Offline / unreachable font CSS — keep going with whatever the agent saved.
  }

  const systemBuild = await rebuildSystem(brandsRoot, id);

  const body = brandToDesignMd(brand);
  const summary = await registerBrandDesignSystem(userDesignSystemsRoot, meta.designSystemId, {
    title: brand.name,
    category: 'Brands',
    surface: 'web',
    status: 'published',
    artifactMode: 'agent-managed',
    body,
    provenance: {
      ...(brand.description ? { companyBlurb: brand.description } : {}),
      sourceNotes: `Extracted from ${meta.sourceUrl}`,
    },
  });
  const designSystemId = summary.id;
  syncBrandSystemToUserDesignSystem(userDesignSystemsRoot, designSystemId, brandsRoot, id, body);

  const finalizeMetadata: ProjectMetadata = {
    kind: 'brand',
    importedFrom: 'brand-extraction',
    entryFile: 'system/index.html',
    sourceFileName: brand.name,
    nameSource: 'generated',
    skipDiscoveryBrief: true,
    brandId: id,
    brandSourceUrl: meta.sourceUrl,
    brandDesignSystemId: designSystemId,
  };
  await syncBrandFilesToProject({
    brandsRoot,
    projectsRoot,
    brandId: id,
    projectId,
    brand,
    metadata: finalizeMetadata,
  });

  // Re-render the kit page now that the brand is complete and the six system
  // artifacts exist in the project, so the Brand Assets tiles light up with
  // live previews and the status flips to "Brand ready".
  await writeBrandKitPreview({
    skillsRoot: opts.skillsRoot,
    projectsRoot,
    projectId,
    brand: brand as unknown as Record<string, unknown>,
    status: 'ready',
    metadata: finalizeMetadata,
  });

  await linkUserDesignSystemProject(userDesignSystemsRoot, designSystemId, projectId);

  const existing = getProject(db, projectId);
  if (existing) {
    updateProject(db, projectId, {
      name: `${brand.name || meta.sourceUrl} Design System`,
      skillId: existing.skillId ?? null,
      designSystemId,
      pendingPrompt: existing.pendingPrompt ?? null,
      metadata: { ...(existing.metadata ?? {}), ...finalizeMetadata },
      customInstructions: existing.customInstructions ?? null,
      updatedAt: Date.now(),
    });
  }

  patchMeta(brandsRoot, id, {
    status: 'ready',
    error: undefined,
    extractionTerminalRunId: undefined,
    extractionTerminalError: undefined,
    designSystemId,
    systemFiles: systemBuild.files,
    projectId,
  });

  // Sediment the brand into memory so future chats can ground a vague request
  // ("做个落地页") in this brand's palette, type, voice and enforceable rules.
  // Best-effort and gated on the master memory switch inside the reflow — a
  // failure here must never fail an otherwise-successful finalize.
  if (opts.dataDir) {
    try {
      await reflowBrandToMemory(opts.dataDir, brand);
    } catch (err) {
      console.warn(`[brand] memory reflow failed for ${id}`, err);
    }
  }

  return { id, brand, designSystemId, projectId, files: systemBuild.files };
}

/** Deterministic harvester that downloads a site's brand material into the
 *  brand workspace. Injectable so tests run offline. */
export type PrefetchFn = (url: string, brandDir: string) => Promise<PrefetchResult | null>;

export interface RunProgrammaticExtractionOptions {
  id: string;
  meta: BrandMeta;
  projectId: string;
  brandsRoot: string;
  userDesignSystemsRoot: string;
  projectsRoot: string;
  skillsRoot: string;
  db: Parameters<typeof insertProject>[0];
  dataDir?: string;
  /** Deterministic material harvester; defaults to the live network prefetch. */
  prefetch?: PrefetchFn;
  logoFallback?: LogoFallbackFn;
  imageryFallback?: ImageryFallbackFn;
}

/**
 * Programmatic-first extraction: harvest the site deterministically (logo,
 * palette, typography, copy, cover imagery, source URL), synthesize a valid
 * design system with `brandFromMaterial` (NO LLM), and finalize it immediately
 * so the user lands on a usable, applyable design system within seconds — the
 * "aha". The async AI enrichment pass then refines it to full fidelity and
 * re-finalizes in place (reusing the same `user:<id>` design system).
 *
 * Best-effort: a blocked, too-thin, or unreachable origin yields `null` and
 * the brand stays `extracting`, so the AI pass can take over.
 */
export async function runProgrammaticExtraction(
  opts: RunProgrammaticExtractionOptions,
): Promise<BrandFinalizeResponse | null> {
  const { id, meta, brandsRoot, prefetch = prefetchBrand } = opts;
  const brandDir = resolveBrandFile(brandsRoot, id, []);
  if (!brandDir) return null;

  const material = await prefetch(meta.sourceUrl, brandDir);
  if (!material) return null;
  if (material.blocked || material.thin) return null;

  const brand = brandFromMaterial(material, meta.sourceUrl);
  const guideMd = brandGuideMd(brand);
  const finalized = await finalizeBrandCore({ ...opts, brand, guideMd });
  updateProject(opts.db, opts.projectId, {
    pendingPrompt: brandExtractionPrompt({
      url: meta.sourceUrl,
      brandId: id,
      host: hostnameOf(meta.sourceUrl),
    }),
  });
  return finalized;
}

export interface RenderBrandPreviewOptions {
  id: string;
  brandsRoot: string;
  skillsRoot: string;
  projectsRoot: string;
  /** Overrides the brand's recorded backing project. */
  projectId?: string;
}

export interface RenderBrandPreviewResult {
  id: string;
  projectId: string;
  file: string;
  /** True when a brand.json was found and rendered; false means an empty
   *  scaffold was (re)written so the page still shows progress. */
  rendered: boolean;
}

/**
 * Re-render `brand.html` from whatever the agent has written into the project's
 * `brand.json` so far. Lenient by design — partial / in-progress brand data
 * renders with skeletons for the missing modules, which is exactly the live
 * "filling in" experience. Called after each measurement pass via
 * `POST /api/brands/:id/preview` (`od brand preview`).
 */
export async function renderBrandPreviewIntoProject(
  opts: RenderBrandPreviewOptions,
): Promise<RenderBrandPreviewResult> {
  const { id, brandsRoot, skillsRoot, projectsRoot } = opts;
  const meta = readMeta(brandsRoot, id);
  if (!meta) throw new Error(`brand not found: ${id}`);
  const projectId = opts.projectId ?? meta.projectId ?? brandProjectId(id);
  const status: 'extracting' | 'ready' = meta.status === 'ready' ? 'ready' : 'extracting';

  const raw = await readProjectTextOrNull(projectsRoot, projectId, 'brand.json');
  let brand: Record<string, unknown> = { sourceUrl: meta.sourceUrl, colors: [], typography: {} };
  let rendered = false;
  if (raw !== null) {
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = extractJsonBlock(raw);
    }
    if (parsed && typeof parsed === 'object') {
      brand = parsed as Record<string, unknown>;
      if (typeof brand.sourceUrl !== 'string' || !brand.sourceUrl) brand.sourceUrl = meta.sourceUrl;
      rendered = true;
    }
  }

  // Keep the live page logo-complete: when brand.json carries no `logo.primary`
  // yet (the agent overwrote the seed or hasn't saved a mark), adopt whatever
  // logo files already sit in the project's `logos/` dir so the page shows a
  // real mark instead of "No logo found". Non-destructive — enriches only the
  // render payload; finalize is what persists the adopted primary to brand.json.
  try {
    const projectDir = resolveProjectDir(projectsRoot, projectId, {
      kind: 'brand',
      brandId: id,
      brandSourceUrl: meta.sourceUrl,
    });
    const logoSlot = brandLogoSlot(brand.logo);
    if (!logoSlot.primary) {
      const adopted = adoptExistingLogos(path.join(projectDir, 'logos'), logoSlot);
      if (adopted.changed) brand.logo = logoSlot;
    }
  } catch {
    // Best-effort enrichment — never block the preview render on logo adoption.
  }

  await writeBrandKitPreview({
    skillsRoot,
    projectsRoot,
    projectId,
    brand,
    status,
    metadata: { kind: 'brand', brandId: id, brandSourceUrl: meta.sourceUrl },
  });
  return { id, projectId, file: BRAND_KIT_FILE, rendered };
}

/** The first prompt the enrichment agent auto-runs. Self-sufficient (does not
 *  rely on the brand-extract skill auto-loading) but names it so a runtime that
 *  surfaces skills can pull in the longer methodology + craft guides. */
function brandExtractionPrompt(input: { url: string; brandId: string; host: string }): string {
  return [
    `This is a DESIGN SYSTEM ENRICHMENT task for ${input.host}.`,
    `Source URL: ${input.url}`,
    `Brand id: ${input.brandId}`,
    '',
    'A usable design system has ALREADY been extracted programmatically and registered — the daemon harvested the site deterministically (logo, palette, typography, a one-line description, cover imagery, source URL) and the design-system page (`brand.html`) is open as the active tab, already in the `ready` state and applyable everywhere RIGHT NOW. Your job is to ENRICH that provisional design system into the full, precise version: re-measure anything the deterministic pass got approximately, add what it could not infer (voice & tone, imagery direction, layout posture, accent-secondary), and replace any weak guesses with measured truth. The target site is also open in a secondary in-app Browser tab. Use the `brand-extract` skill and the `agent-browser` tool to drive and observe the site. Do not guess — measure.',
    '',
    'Work the branding-agent chain, optimizing for PROGRESSIVE fill-in (never batch everything to the end). The page is already populated from the programmatic pass — refine it module by module so the user watches it sharpen:',
    '',
    '1. MEASURE — drive the site with agent-browser. Snapshot it, then harvest the real design language: frequency-ranked color literals (background / surface / foreground / muted / border / accent / accent-secondary), the @font-face + font-family declarations, and representative headings + copy for voice.',
    '   - LOGO (extract MULTIPLE candidates): save every logo you can find as a file under `logos/` — the inline header/nav SVG (write the literal `<svg>…</svg>` markup verbatim to `logos/header.svg`, do NOT just reference it), any `<img>` logo, the `apple-touch-icon`, the `favicon`, and the `og:image`. Set `logo.primary` to the best vector/transparent lockup and list the rest in `logo.alternates` (the kit page shows them as switchable thumbnails). NEVER leave `logo.primary` empty when the site has any mark — fetch the asset URLs directly and save real files. (The daemon also auto-fetches a favicon/og:image fallback so the page is never logo-less, but that is a safety net, not a substitute for the real wordmark.)',
    '   - FONTS: record each real family in `typography` with its `fallbacks` and `weights`. When the family is on Google Fonts, set `googleFontsUrl` so finalize self-hosts it and specimens render for real; otherwise note it is proprietary. The kit page renders a big "Ag" specimen tile per family, so a correct `family` + `googleFontsUrl` makes them show in the real typeface.',
    '   - IMAGERY (save 6–8 of the site’s LARGE / COVER / HERO images): this is the Images module. Harvest the site’s actual big representative pictures — the `og:image`/`twitter:image` social card, the hero/banner art, the largest `<img>` (use the highest-res `srcset`/`<picture>` source), CSS `background-image` hero blocks, product/app screenshots, and illustration/photography samples. Filter by RENDERED size: keep only big images (roughly ≥320px on the long edge) and DROP icons, sprites, logos, avatars, and tracking pixels. Save each as a file under `imagery/` and list them in `brand.json` as `imagery.samples: [{ "file": "imagery/<file>", "kind": "cover|hero|product|illustration|photo", "caption": "short label" }]`. The kit page renders these as a clean labeled Images gallery (a thumbnail grid). Fetch the asset URLs directly; pick 6–8 varied, on-brand images — never UI chrome or icons. (The daemon also runs a deterministic cover/hero-image fallback at finalize so the gallery is rarely empty, but that safety net is no substitute for picking the real hero images yourself.)',
    '   - ANTI-BOT WALL: if the page is a Cloudflare / DataDome / "Just a moment…" / "Verify you are human" interstitial instead of the real site, STOP and emit a `<question-form>` asking the user to complete the verification in the browser, then Continue. Do NOT try to bypass it yourself. When the user submits the form, re-snapshot and resume.',
    '',
    '2. SYNTHESIZE INCREMENTALLY — write `brand.json` AS SOON AS you have the name, a couple of colors, and a logo candidate (do not wait for everything), then run `od brand preview ' + input.brandId + '` and tell the user it is filling in. It must parse as JSON and use exactly the seven color roles (background, surface, foreground, muted, border, accent, accent-secondary), each with `hex` (#rrggbb), `oklch`, `name`, `usage`; plus `name`, `tagline`, `description`, `sourceUrl`, `logo` ({ primary, alternates, notes } with `logos/<file>` paths), `typography` ({ display, body, mono? } each { family, fallbacks[], weights[], googleFontsUrl? }), `voice`, `imagery` (incl. `samples` — the `imagery/<file>` images you saved), and `layout`. Never invent colors from memory — pick them from what you measured.',
    '   - PREVIEW AFTER EACH FIELD GROUP, do not batch to the end. The kit fills in live, so after you measure and add each group — (a) colors, (b) typography/fonts, (c) logo candidates, (d) cover/hero imagery samples, (e) voice & tone, (f) imagery/layout posture — update `brand.json` and re-run `od brand preview ' + input.brandId + '`. Partial data renders the filled modules and keeps skeletons for the rest, which is exactly the progressive "filling in" the user should watch. Also write `BRAND.md`, a prose brand guide an autonomous design agent can follow.',
    '',
    '3. REBUILD & RE-REGISTER — when `brand.json` is enriched, run `od brand finalize ' + input.brandId + '` (add `--json` for machine output). That re-validates it, re-derives the light/dark/compact design tokens and the six design-system artifacts (landing, deck, poster, email, newsletter, form), and UPDATES the already-registered design system in place (same id — never a duplicate), so every template that already uses it picks up the sharper result. Fix `brand.json` and re-run if it reports a validation error.',
    '',
    'Finish by pointing the user at the enriched brand.html (logo, palette, typography, voice) and the design-system assets they can now preview, and confirm the design system was updated.',
  ].join('\n');
}

/** Prompt used while the programmatic harvest is not known-good yet. It must
 * not claim the design system is already ready: blocked/thin sites stay on
 * this path and need the agent to do the initial extraction from the scaffold. */
function brandExtractionFallbackPrompt(input: { url: string; brandId: string; host: string }): string {
  return [
    `This is a DESIGN SYSTEM EXTRACTION task for ${input.host}.`,
    `Source URL: ${input.url}`,
    `Brand id: ${input.brandId}`,
    '',
    'The daemon opened a live extraction scaffold (`brand.html`) in the project, but a ready design system is NOT guaranteed yet. Treat the page as an empty/in-progress workspace until you have measured the target site and written `brand.json`; do not assume a registered `brand.json` or design system already exists.',
    '',
    'Use the `brand-extract` skill and the `agent-browser` tool to drive and observe the target site. Measure before you synthesize: capture the real colors, fonts, logo candidates, representative imagery, voice, and layout posture. If the page is an anti-bot verification interstitial, emit a `<question-form>` asking the user to complete verification in the browser, then continue after they respond.',
    '',
    'Write `brand.json` as soon as you have the name, a couple of measured colors, and a logo candidate, then run `od brand preview ' + input.brandId + '` so the scaffold fills in progressively. Keep updating `brand.json`, `BRAND.md`, saved `logos/`, fonts, and `imagery/` samples as you measure each field group.',
    '',
    'When the kit is complete and validates, run `od brand finalize ' + input.brandId + '` (add `--json` for machine output). Fix validation errors and re-run finalize until the brand is registered and the design-system assets are ready.',
    '',
    'Finish by pointing the user at the completed brand.html and the reusable design-system assets.',
  ].join('\n');
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Coerce a loose brand.json `logo` value into a mutable {@link LogoSlot} the
 *  on-disk logo adopter can fill in. Tolerates missing / malformed input. */
function brandLogoSlot(raw: unknown): LogoSlot {
  const o = (raw ?? {}) as Record<string, unknown>;
  return {
    primary: typeof o.primary === 'string' && o.primary ? o.primary : null,
    alternates: Array.isArray(o.alternates) ? o.alternates.filter((a): a is string => typeof a === 'string') : [],
    notes: typeof o.notes === 'string' ? o.notes : '',
  };
}

function brandProjectId(brandId: string): string {
  return `brand-${brandId}`;
}

/**
 * Register the brand's reusable `user:<id>` design system, reusing the one the
 * brand already owns when finalize runs more than once.
 *
 * Invariant: a brand owns exactly ONE user design system for its whole
 * lifetime. Finalize is not a one-shot — the live extraction agent re-runs
 * `od brand finalize` after fixing a validation error or enriching the kit, and
 * `createUserDesignSystem` allocates a fresh unique slug on every call. Without
 * this reuse, each re-finalize left an orphaned duplicate behind (the brand
 * only tracks its latest design system id, so the older one was never cleaned
 * up), and the brand surfaced twice in every design-system picker.
 */
async function registerBrandDesignSystem(
  userDesignSystemsRoot: string,
  existingDesignSystemId: string | undefined,
  input: UserDesignSystemInput,
): Promise<Awaited<ReturnType<typeof createUserDesignSystem>>> {
  if (existingDesignSystemId) {
    const updated = await updateUserDesignSystem(userDesignSystemsRoot, existingDesignSystemId, input);
    if (updated) return updated;
  }
  return createUserDesignSystem(userDesignSystemsRoot, input);
}

/** Read a UTF-8 project file, returning null when it is absent. */
async function readProjectTextOrNull(
  projectsRoot: string,
  projectId: string,
  name: string,
): Promise<string | null> {
  try {
    const file = await readProjectFile(projectsRoot, projectId, name);
    const buf = file?.buffer;
    if (buf === null || buf === undefined) return null;
    return Buffer.isBuffer(buf) ? buf.toString('utf8') : String(buf);
  } catch {
    return null;
  }
}

/** Copy a top-level project subdirectory (logos / fonts) into the brand dir. */
function copyProjectDirToBrand(
  projectsRoot: string,
  projectId: string,
  brandsRoot: string,
  brandId: string,
  dirName: string,
): void {
  let projectDir: string;
  try {
    projectDir = resolveProjectDir(projectsRoot, projectId);
  } catch {
    return;
  }
  const source = path.join(projectDir, dirName);
  if (!isDirectory(source)) return;
  const target = resolveBrandFile(brandsRoot, brandId, [dirName]);
  if (!target) return;
  copyDirectorySync(source, target);
}

async function syncBrandFilesToProject(input: {
  brandsRoot: string;
  projectsRoot: string;
  brandId: string;
  projectId: string;
  brand: Brand;
  metadata: ProjectMetadata;
}): Promise<void> {
  const brandRoot = resolveBrandFile(input.brandsRoot, input.brandId, []);
  if (!brandRoot) throw new Error(`invalid brand id: ${input.brandId}`);
  const write = async (name: string, body: string | Buffer) => {
    await writeProjectFile(input.projectsRoot, input.projectId, name, body, { overwrite: true }, input.metadata);
  };
  await write('brand.json', JSON.stringify(input.brand, null, 2));
  await write('DESIGN.md', brandToDesignMd(input.brand));
  await writeOptionalFileToProject(input.projectsRoot, input.projectId, input.metadata, brandRoot, 'guide.md');
  await copyDirectoryToProject(input.projectsRoot, input.projectId, input.metadata, brandSystemDir(input.brandsRoot, input.brandId), 'system');
  await copyOptionalDirectoryToProject(input.projectsRoot, input.projectId, input.metadata, path.join(brandRoot, 'logos'), 'logos');
  await copyOptionalDirectoryToProject(input.projectsRoot, input.projectId, input.metadata, path.join(brandRoot, 'fonts'), 'fonts');
  await copyOptionalDirectoryToProject(input.projectsRoot, input.projectId, input.metadata, path.join(brandRoot, 'imagery'), 'imagery');
  await copyOptionalDirectoryToProject(input.projectsRoot, input.projectId, input.metadata, path.join(brandRoot, 'prefetch'), 'prefetch');
}

async function writeOptionalFileToProject(
  projectsRoot: string,
  projectId: string,
  metadata: ProjectMetadata,
  root: string,
  rel: string,
): Promise<void> {
  const abs = path.join(root, rel);
  if (!isFile(abs)) return;
  await writeProjectFile(projectsRoot, projectId, rel, fs.readFileSync(abs), { overwrite: true }, metadata);
}

async function copyOptionalDirectoryToProject(
  projectsRoot: string,
  projectId: string,
  metadata: ProjectMetadata,
  sourceDir: string,
  targetPrefix: string,
): Promise<void> {
  if (!isDirectory(sourceDir)) return;
  await copyDirectoryToProject(projectsRoot, projectId, metadata, sourceDir, targetPrefix);
}

async function copyDirectoryToProject(
  projectsRoot: string,
  projectId: string,
  metadata: ProjectMetadata,
  sourceDir: string,
  targetPrefix: string,
): Promise<void> {
  for (const file of collectFiles(sourceDir)) {
    const projectPath = toPosixPath(path.join(targetPrefix, file.rel));
    await writeProjectFile(projectsRoot, projectId, projectPath, fs.readFileSync(file.abs), { overwrite: true }, metadata);
  }
}

function syncBrandSystemToUserDesignSystem(
  userDesignSystemsRoot: string,
  designSystemId: string,
  brandsRoot: string,
  brandId: string,
  designMd: string,
): void {
  const dir = userDesignSystemDir(userDesignSystemsRoot, designSystemId);
  if (!dir) throw new Error(`invalid design system id: ${designSystemId}`);
  const brandRoot = resolveBrandFile(brandsRoot, brandId, []);
  if (!brandRoot) throw new Error(`invalid brand id: ${brandId}`);

  fs.writeFileSync(path.join(dir, 'DESIGN.md'), designMd, 'utf8');
  copyDirectorySync(brandSystemDir(brandsRoot, brandId), path.join(dir, 'system'));
  copyOptionalDirectorySync(path.join(brandRoot, 'logos'), path.join(dir, 'logos'));
  copyOptionalDirectorySync(path.join(brandRoot, 'fonts'), path.join(dir, 'fonts'));
  copyOptionalDirectorySync(path.join(brandRoot, 'imagery'), path.join(dir, 'imagery'));
  copyOptionalDirectorySync(path.join(brandRoot, 'prefetch'), path.join(dir, 'prefetch'));
  const brandJson = resolveBrandFile(brandsRoot, brandId, ['brand.json']);
  if (brandJson && isFile(brandJson)) {
    fs.copyFileSync(brandJson, path.join(dir, 'brand.json'));
  }
}

function userDesignSystemDir(root: string, id: string): string | null {
  if (!id.startsWith('user:')) return null;
  const dirId = id.slice('user:'.length);
  if (!/^[a-z0-9][a-z0-9-]*$/u.test(dirId)) return null;
  const base = path.resolve(root);
  const target = path.resolve(base, dirId);
  if (target !== base && target.startsWith(`${base}${path.sep}`)) return target;
  return null;
}

function copyOptionalDirectorySync(sourceDir: string, targetDir: string): void {
  if (!isDirectory(sourceDir)) return;
  copyDirectorySync(sourceDir, targetDir);
}

function copyDirectorySync(sourceDir: string, targetDir: string): void {
  fs.rmSync(targetDir, { recursive: true, force: true });
  fs.mkdirSync(targetDir, { recursive: true });
  for (const file of collectFiles(sourceDir)) {
    const target = path.join(targetDir, file.rel);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(file.abs, target);
  }
}

function collectFiles(root: string): Array<{ abs: string; rel: string }> {
  const out: Array<{ abs: string; rel: string }> = [];
  const walk = (dir: string, prefix: string) => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const abs = path.join(dir, entry.name);
      const rel = prefix ? path.join(prefix, entry.name) : entry.name;
      if (entry.isDirectory()) {
        walk(abs, rel);
      } else if (entry.isFile()) {
        out.push({ abs, rel: toPosixPath(rel) });
      }
    }
  };
  walk(root, '');
  return out.sort((a, b) => a.rel.localeCompare(b.rel));
}

function toPosixPath(value: string): string {
  return value.split(path.sep).join('/');
}

/** List every stored brand as a summary (meta + provisional brand). */
export function listBrandSummaries(brandsRoot: string): BrandSummary[] {
  const out: BrandSummary[] = [];
  for (const id of listBrandIds(brandsRoot)) {
    const meta = readMeta(brandsRoot, id);
    if (!meta) continue;
    out.push({ meta, brand: readBrand(brandsRoot, id) });
  }
  return out;
}

/** Full detail for one brand, or null when it is missing. */
export function readBrandDetail(brandsRoot: string, id: string): BrandDetailResponse | null {
  const meta = readMeta(brandsRoot, id);
  if (!meta) return null;
  return {
    meta,
    brand: readBrand(brandsRoot, id),
    guide: readBrandGuide(brandsRoot, id),
  };
}

/**
 * Remove a brand and its registered user design system. Returns false when the
 * brand dir did not exist.
 */
export async function removeBrand(
  brandsRoot: string,
  userDesignSystemsRoot: string,
  id: string,
): Promise<boolean> {
  const meta = readMeta(brandsRoot, id);
  if (meta?.designSystemId) {
    try {
      await deleteUserDesignSystem(userDesignSystemsRoot, meta.designSystemId);
    } catch {
      // Best-effort — still remove the brand dir below.
    }
  }
  return deleteBrandDir(brandsRoot, id);
}

const LOGO_EXT_PRIORITY = ['.svg', '.png', '.webp', '.jpg', '.jpeg', '.gif', '.ico'];

/**
 * Absolute path to the brand's primary logo file, or null when none exists.
 * Prefers brand.logo.primary, then the first logo in `logos/` by extension
 * priority (vector/raster before icon).
 */
export function resolveBrandLogoPath(brandsRoot: string, id: string): string | null {
  const brand = readBrand(brandsRoot, id);
  const primary = brand?.logo?.primary;
  if (primary) {
    const rel = primary.replace(/^\.?\/+/, '').split('/').filter(Boolean);
    const abs = resolveBrandFile(brandsRoot, id, rel);
    if (abs && isFile(abs)) return abs;
  }

  const logosDir = resolveBrandFile(brandsRoot, id, ['logos']);
  if (!logosDir) return null;
  let names: string[];
  try {
    names = fs.readdirSync(logosDir);
  } catch {
    return null;
  }
  const ranked = names
    .filter((n) => isFile(path.join(logosDir, n)))
    .sort((a, b) => extRank(a) - extRank(b) || a.localeCompare(b));
  const pick = ranked[0];
  return pick ? path.join(logosDir, pick) : null;
}

function extRank(name: string): number {
  const i = LOGO_EXT_PRIORITY.indexOf(path.extname(name).toLowerCase());
  return i === -1 ? LOGO_EXT_PRIORITY.length : i;
}

function isFile(p: string): boolean {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

function isDirectory(p: string): boolean {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}
