// Brand engine — public API consumed by brand-routes.ts.
//
// A "brand" = brand metadata (brand.json + meta.json under
// `<brandsRoot>/<id>/`) PLUS a generated user design system. Extraction is
// programmatic-first, with the agent/browser path as fallback and enrichment:
//
//   1. startBrandExtraction — reserve the brand record, create a backing
//      `brand` project with the target site open in an in-app browser tab, seed
//      a real programmatic transcript, then run the deterministic harvest +
//      design-system registration in the background. The caller navigates
//      immediately, so the user sees the conversation while the kit extracts.
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
  deleteProject as deleteDbProject,
  getProject,
  insertConversation,
  insertProject,
  listConversations,
  listMessages,
  setTabs,
  upsertMessage,
  updateProject,
} from '../db.js';
import { listFiles, readProjectFile, resolveProjectDir, writeProjectFile } from '../projects.js';
import { brandFromDesignMd, sourceUrlForDesignMd } from './design-md-input.js';
import { brandGuideMd, brandToDesignMd } from './design-md.js';
import { reflowBrandToMemory } from './memory.js';
import { brandSystemDir, rebuildSystem } from './system.js';
import { extractJsonBlock, validateBrand } from './validate.js';
import { brandFromMaterial } from './provisional.js';
import { prefetchBrand, prefetchFromHtml, type PrefetchResult } from './prefetch.js';
import { BRAND_KIT_FILE, writeBrandKitPreview, type BrandKitStatus } from './kit-render.js';
import { normalizeBrandKitLocale } from './kit-i18n.js';
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
  /** Website/source URL. Optional when a pasted DESIGN.md is provided. */
  url?: string;
  /** Short human context; the fast path uses it as intro + voice. */
  description?: string;
  /** Pasted DESIGN.md content to parse locally before AI enrichment. */
  designMd?: string;
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
   *  in the background). When omitted, no programmatic finalize runs and the
   *  brand stays `extracting` for the agent to drive (the legacy behavior tests
   *  use). */
  userDesignSystemsRoot?: string;
  /** Runtime data dir so the programmatically-built design system is sedimented
   *  into memory. Optional. */
  dataDir?: string;
  /** Abort signal owned by the HTTP route Stop control for the programmatic
   *  first pass. Agent-driven finalize paths do not use it. */
  programmaticAbortSignal?: AbortSignal;
  /** Override the deterministic site harvester used by the programmatic-first
   *  extraction (tests inject a stub to stay offline). Defaults to the live
   *  network prefetch. */
  prefetch?: PrefetchFn;
  /** Deprecated no-op retained for older tests/callers. Brand starts now always
   *  return immediately after the project, transcript, and skeleton page are
   *  persisted; programmatic finalize settles in the background. */
  programmaticSyncBudgetMs?: number;
  /** Test/observability hook invoked with the background programmatic-extraction
   *  promise, so callers (tests) can await completion deterministically. */
  onBackgroundExtraction?: (settled: Promise<unknown>) => void;
  /** UI locale used to render static brand.html copy. */
  locale?: string;
  /** Agent identity to show on the programmatic transcript. No tokens are spent,
   *  but the synthetic turn should align with the user's selected code agent. */
  transcriptAgent?: {
    agentId?: string | null;
    agentName?: string | null;
  };
}

export interface StartBrandExtractionResult {
  id: string;
  projectId: string;
  conversationId: string;
  sourceUrl: string;
  status: BrandMeta['status'];
  designSystemId?: string;
  brandName?: string;
}

export interface ContinueBrandExtractionOptions {
  id: string;
  brandsRoot: string;
  projectsRoot: string;
  skillsRoot: string;
  db: Parameters<typeof insertProject>[0];
  userDesignSystemsRoot: string;
  dataDir?: string;
  randomId?: () => string;
  logoFallback?: LogoFallbackFn;
  imageryFallback?: ImageryFallbackFn;
  prefetch?: PrefetchFn;
  programmaticAbortSignal?: AbortSignal;
  onBackgroundExtraction?: (settled: Promise<unknown>) => void;
  locale?: string;
  transcriptAgent?: StartBrandExtractionOptions['transcriptAgent'];
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

const MAX_DESIGN_MD_INPUT_CHARS = 240_000;

function normalizeDesignMdInput(raw: string | undefined): string {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return '';
  return trimmed.slice(0, MAX_DESIGN_MD_INPUT_CHARS);
}

function writeDesignMdInput(brandsRoot: string, id: string, designMd: string): void {
  const dir = resolveBrandFile(brandsRoot, id, ['context']);
  if (!dir) return;
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'input-DESIGN.md'), designMd, 'utf8');
}

function readDesignMdInput(brandsRoot: string, id: string): string {
  const file = resolveBrandFile(brandsRoot, id, ['context', 'input-DESIGN.md']);
  if (!file) return '';
  try {
    return normalizeDesignMdInput(fs.readFileSync(file, 'utf8'));
  } catch {
    return '';
  }
}

async function rollbackBrandExtractionStartup(input: {
  db: Parameters<typeof insertProject>[0];
  brandsRoot: string;
  projectsRoot: string;
  brandId: string;
  projectId: string;
  metadata: ProjectMetadata;
  userDesignSystemsRoot?: string | undefined;
  draftDesignSystemId?: string | null;
}): Promise<void> {
  try {
    deleteDbProject(input.db, input.projectId);
  } catch (err) {
    if (!isClosedDatabaseError(err)) {
      console.warn(`[brand] failed to roll back project row for ${input.brandId}`, err);
    }
  }
  try {
    const projectDir = resolveProjectDir(input.projectsRoot, input.projectId, input.metadata);
    fs.rmSync(projectDir, { recursive: true, force: true });
  } catch (err) {
    console.warn(`[brand] failed to roll back project directory for ${input.brandId}`, err);
  }
  if (input.draftDesignSystemId && input.userDesignSystemsRoot) {
    try {
      await deleteUserDesignSystem(input.userDesignSystemsRoot, input.draftDesignSystemId);
    } catch (rollbackErr) {
      console.warn(`[brand] failed to roll back draft design system for ${input.brandId}`, rollbackErr);
    }
  }
  try {
    deleteBrandDir(input.brandsRoot, input.brandId);
  } catch (err) {
    console.warn(`[brand] failed to roll back brand directory for ${input.brandId}`, err);
  }
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
  const designMd = normalizeDesignMdInput(opts.designMd);
  const rawUrl = (opts.url ?? '').trim();
  const url = rawUrl ? normalizeUrl(rawUrl) : designMd ? sourceUrlForDesignMd(designMd, opts.description) : null;
  if (rawUrl && !url) throw new Error('Enter a valid http(s) website URL.');
  if (!url) throw new Error('Enter a valid http(s) website URL or paste a DESIGN.md.');
  const hasWebsiteSource = /^https?:\/\//i.test(url);
  const hasDesignMdSource = Boolean(designMd);

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
  const conversationId = randomId();
  const host = hostnameOf(url);
  const now = Date.now();
  const locale = normalizeBrandKitLocale(opts.locale);
  const extractionAttemptId = newBrandExtractionAttemptId();

  const meta: BrandMeta = {
    id,
    sourceUrl: url,
    createdAt: now,
    updatedAt: now,
    status: 'extracting',
    projectId,
    extractionConversationId: conversationId,
    locale,
    extractionAttemptId,
  };
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
  const fallbackPrompt = brandExtractionFallbackPrompt({
    url,
    brandId: id,
    host,
    hasWebsiteSource,
    hasDesignMdSource,
  });
  const pendingPrompt = runProgrammatic
    ? null
    : brandExtractionPrompt({ url, brandId: id, host, hasWebsiteSource, hasDesignMdSource });

  // Entity-first: register the `user:<id>` design system NOW, as a draft, so it
  // appears under "Your systems" the moment the project opens and stays editable
  // even if extraction fails or is stopped — instead of only materializing on a
  // successful finalize (the bug where a started extraction never showed up in
  // the list). finalizeBrandCore reuses this exact id (never duplicates),
  // enriching the draft in place. This is part of the start contract: if the
  // draft cannot be registered, the extraction should not create a project that
  // looks like a design system but has no backing editable system.
  let draftDesignSystemId: string | null = null;
  try {
    createBrandDir(brandsRoot, id, meta);
    if (designMd) writeDesignMdInput(brandsRoot, id, designMd);

    if (runProgrammatic && opts.userDesignSystemsRoot) {
      const draft = await createUserDesignSystem(opts.userDesignSystemsRoot, {
        title: host,
        category: 'Brands',
        surface: 'web',
        status: 'draft',
        artifactMode: 'agent-managed',
        provenance: {
          sourceUrls: [url],
          sourceNotes: `Extracting from ${url}`,
        },
      });
      draftDesignSystemId = draft.id;
      meta.designSystemId = draft.id;
      patchMeta(brandsRoot, id, { designSystemId: draft.id });
      metadata.brandDesignSystemId = draft.id;
    }

    insertProject(db, {
      id: projectId,
      name,
      skillId: null,
      designSystemId: draftDesignSystemId,
      pendingPrompt,
      metadata,
      customInstructions: null,
      createdAt: now,
      updatedAt: now,
    });
    if (draftDesignSystemId && opts.userDesignSystemsRoot) {
      try {
        await linkUserDesignSystemProject(opts.userDesignSystemsRoot, draftDesignSystemId, projectId);
      } catch (err) {
        console.warn(`[brand] failed to link draft design system to project for ${id}`, err);
      }
    }
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
      locale,
    });
    if (designMd) {
      await writeProjectFile(projectsRoot, projectId, 'context/input-DESIGN.md', designMd, { overwrite: true }, metadata);
    }

    // brand.html is the star of the workspace (active tab). The target site stays
    // available as a secondary in-app browser tab so the user can glance at it /
    // clear an anti-bot wall by hand when the agent asks.
    setTabs(db, projectId, {
      tabs: [BRAND_KIT_FILE],
      active: BRAND_KIT_FILE,
      ...(hasWebsiteSource
        ? { browserTabs: [{ id: BRAND_BROWSER_TAB_ID, label: 'Browser', url, title: host }] }
        : {}),
    });

    // Programmatic-first runs immediately, but never blocks the start response.
    // The caller should land in the project with a real user/assistant transcript
    // and the extracting skeleton already persisted while the deterministic
    // harvester finalizes the design system in the background. Best-effort: a
    // blocked, thin, or failing origin leaves the brand `extracting` for the
    // agent/browser fallback to drive from the scaffold instead.
    const programmaticStartedAt = Date.now();
    const programmaticTranscript = runProgrammatic && opts.userDesignSystemsRoot
      ? seedProgrammaticExtractionStartTranscript({
          db,
          conversationId,
          randomId,
          sourceUrl: url,
          sourceLabel: host,
          locale,
          startedAt: programmaticStartedAt,
          transcriptAgent: opts.transcriptAgent,
        })
      : null;
    // Persist the transcript handles so EVERY terminal point — finalize success,
    // soft-fail/blocked/timeout, and user stop — can reconcile the synthetic
    // "AMR · Working" row out of its perpetual `running` state, regardless of the
    // racy background timer. Without this the row stays "Working 13m…" forever
    // even after the brand finalizes `ready` in the background.
    if (programmaticTranscript) {
      patchMeta(brandsRoot, id, {
        conversationId,
        extractionTranscriptMessageId: programmaticTranscript.assistantMessageId,
        extractionTranscriptUserMessageId: programmaticTranscript.userMessageId,
        extractionStartedAt: programmaticStartedAt,
      });
    }
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
        hasWebsiteSource,
        locale,
        extractionAttemptId,
      };
      if (opts.dataDir) programmaticOptions.dataDir = opts.dataDir;
      if (opts.prefetch) programmaticOptions.prefetch = opts.prefetch;
      if (opts.description) programmaticOptions.description = opts.description;
      if (designMd) programmaticOptions.designMd = designMd;

      launchProgrammaticBackgroundExtraction({
        programmaticOptions,
        programmaticAbortSignal: opts.programmaticAbortSignal,
        fallbackPrompt,
        onBackgroundExtraction: opts.onBackgroundExtraction,
        locale,
      });
    }

    return {
      id,
      projectId,
      conversationId,
      sourceUrl: url,
      status: meta.status,
      ...(draftDesignSystemId ? { designSystemId: draftDesignSystemId } : {}),
    };
  } catch (err) {
    await rollbackBrandExtractionStartup({
      db,
      brandsRoot,
      projectsRoot,
      brandId: id,
      projectId,
      metadata,
      userDesignSystemsRoot: opts.userDesignSystemsRoot,
      draftDesignSystemId,
    });
    throw err;
  }
}

function launchProgrammaticBackgroundExtraction(input: {
  programmaticOptions: RunProgrammaticExtractionOptions;
  programmaticAbortSignal?: AbortSignal | undefined;
  fallbackPrompt: string;
  onBackgroundExtraction?: ((settled: Promise<unknown>) => void) | undefined;
  locale?: string | undefined;
}): Promise<BrandFinalizeResponse | null> {
  const { programmaticOptions, programmaticAbortSignal, fallbackPrompt, locale } = input;
  const { db, brandsRoot, projectsRoot, id, projectId } = programmaticOptions;
  const extractionAttemptId = programmaticOptions.extractionAttemptId;
  const attemptIsCurrent = () =>
    programmaticExtractionAttemptIsCurrent({ brandsRoot, id, extractionAttemptId });

  // Two independent clocks — never one that can kill a slow-but-succeeding
  // origin:
  //   - a 30s SOFT checkpoint flips the synthetic row to the actionable
  //     "taking longer than usual — open the page in Browser / retry / use AI"
  //     terminal WITHOUT aborting, so a heavy site can still finalize in the
  //     background and overwrite the card with success.
  //   - a generous HARD cap aborts only as a runaway backstop; the per-fetch
  //     timeouts already bound the real harvest, so this should rarely fire.
  const hardCap = new AbortController();
  const hardCapTimer = setTimeout(
    () => hardCap.abort(new ProgrammaticExtractionAbortError()),
    PROGRAMMATIC_EXTRACT_TIMEOUT_MS,
  );
  hardCapTimer.unref?.();
  const abortSignal = programmaticAbortSignal
    ? AbortSignal.any([programmaticAbortSignal, hardCap.signal])
    : hardCap.signal;

  let extractionSettled = false;
  const stallTimer = setTimeout(() => {
    if (extractionSettled) return;
    if (!attemptIsCurrent()) return;
    void reconcileProgrammaticExtractionTranscript({
      db,
      brandsRoot,
      projectsRoot,
      brandId: id,
      outcome: 'needs_attention',
      ...(locale ? { locale } : {}),
    }).catch(() => {});
  }, PROGRAMMATIC_STALL_CHECKPOINT_MS);
  stallTimer.unref?.();

  // Defer so the HTTP route returns the ids (making the transcript visible in
  // the left pane) before any synchronous extraction work — notably DESIGN.md
  // parsing — runs.
  const harvest = new Promise<BrandFinalizeResponse | null>((resolve) => {
    setTimeout(() => {
      runProgrammaticExtraction({ ...programmaticOptions, abortSignal }).then(resolve, (err) => {
        if (!isProgrammaticExtractionAbortError(err) && !programmaticAbortSignal?.aborted) {
          console.warn(`[brand] programmatic extraction failed for ${id} — falling back to agent`, err);
        }
        resolve(null);
      });
    }, 0);
  });

  const settled = harvest
    .then(async (result) => {
      // A deliberate user Stop is reconciled by the cancel route, which knows
      // the run was stopped (not given up on). Everything else settles here.
      if (programmaticAbortSignal?.aborted) return result;
      if (!attemptIsCurrent()) return null;
      // Success: finalizeBrandCore already flipped the row to `succeeded` from
      // the authoritative completion point, so there is nothing to do.
      if (result) return result;
      // Give-up (blocked / too thin / unreachable / hard-cap backstop): hand
      // the brand to the agent fallback and retire the synthetic row into the
      // actionable "needs a hand" terminal so it stops counting up forever.
      const latest = readMeta(brandsRoot, id);
      // An anti-bot wall is RECOVERABLE: the user clears it in the in-app Browser
      // tab and "Continue extraction" re-extracts from the rendered DOM. Marking
      // it `failed` here flashes the red "Extraction failed" kit before recovery
      // flips it to `ready` — confusing, because nothing has truly failed yet.
      // Keep blocked origins in the calm, retryable `needs_input` state (the
      // browser-assist card drives them to success) and reserve the terminal
      // `failed` for genuinely unrecoverable give-ups (too thin / unreachable),
      // which hand off to the agent fallback.
      const recoverable = latest?.blocked === true;
      const error = latest?.blockedReason
        ? `Programmatic extraction blocked by ${latest.blockedReason}.`
        : 'Programmatic extraction needs user assistance.';
      patchMeta(brandsRoot, id, {
        status: recoverable ? 'needs_input' : 'failed',
        error,
        extractionTerminalRunId: undefined,
        extractionTerminalError: recoverable ? undefined : error,
      });
      await renderBrandPreviewIntoProject({
        id,
        brandsRoot,
        skillsRoot: programmaticOptions.skillsRoot,
        projectsRoot,
        projectId,
        ...(locale ? { locale } : {}),
      }).catch((err) => {
        console.warn(`[brand] failed to render failed draft preview for ${id}`, err);
      });
      if (!attemptIsCurrent()) return null;
      updateProject(db, projectId, { pendingPrompt: fallbackPrompt });
      return reconcileProgrammaticExtractionTranscript({
        db,
        brandsRoot,
        projectsRoot,
        brandId: id,
        outcome: 'needs_attention',
        ...(locale ? { locale } : {}),
      }).then(() => null);
    })
    .catch((err) => {
      if (isClosedDatabaseError(err)) return null;
      console.warn(`[brand] failed to reconcile programmatic extraction transcript for ${id}`, err);
      return null;
    })
    .finally(() => {
      extractionSettled = true;
      clearTimeout(stallTimer);
      clearTimeout(hardCapTimer);
    });
  input.onBackgroundExtraction?.(settled);

  return settled;
}

export async function continueBrandExtraction(
  opts: ContinueBrandExtractionOptions,
): Promise<StartBrandExtractionResult> {
  const detail = readBrandDetail(opts.brandsRoot, opts.id);
  if (!detail) throw new Error(`brand not found: ${opts.id}`);
  const { meta } = detail;
  const sourceUrl = meta.sourceUrl;
  const projectId = meta.projectId ?? brandProjectId(opts.id);
  const project = getProject(opts.db, projectId);
  if (!project) throw new Error(`brand backing project not found: ${projectId}`);

  const randomId = opts.randomId ?? randomUUID;
  const locale = normalizeBrandKitLocale(opts.locale ?? meta.locale);
  const hasWebsiteSource = /^https?:\/\//i.test(sourceUrl);
  const designMd = readDesignMdInput(opts.brandsRoot, opts.id);
  const hasDesignMdSource = Boolean(designMd) || sourceUrl.startsWith('designmd://');
  const host = hostnameOf(sourceUrl);
  const now = Date.now();
  const extractionAttemptId = newBrandExtractionAttemptId();
  const conversationId = resolveBrandRetryConversationId({
    db: opts.db,
    projectId,
    preferredConversationId: meta.conversationId ?? null,
    randomId,
    now,
  });

  let nextMeta = patchMeta(opts.brandsRoot, opts.id, {
    status: 'extracting',
    error: undefined,
    blocked: false,
    blockedReason: undefined,
    extractionTerminalRunId: undefined,
    extractionTerminalError: undefined,
    conversationId,
    extractionConversationId: conversationId,
    extractionRunId: undefined,
    extractionAttemptId,
  }) ?? { ...meta, status: 'extracting', conversationId, extractionAttemptId, updatedAt: now };

  updateProject(opts.db, projectId, {
    pendingPrompt: null,
    designSystemId: nextMeta.designSystemId ?? project.designSystemId ?? null,
    metadata: {
      ...(project.metadata ?? {}),
      kind: 'brand',
      importedFrom: 'brand-extraction',
      entryFile: BRAND_KIT_FILE,
      brandId: opts.id,
      brandSourceUrl: sourceUrl,
      ...(nextMeta.designSystemId ? { brandDesignSystemId: nextMeta.designSystemId } : {}),
    },
    updatedAt: now,
  });

  await renderBrandPreviewIntoProject({
    id: opts.id,
    brandsRoot: opts.brandsRoot,
    skillsRoot: opts.skillsRoot,
    projectsRoot: opts.projectsRoot,
    projectId,
    locale,
  }).catch((err) => {
    console.warn(`[brand] failed to render continuing preview for ${opts.id}`, err);
  });

  const transcript = seedProgrammaticExtractionStartTranscript({
    db: opts.db,
    conversationId,
    randomId,
    sourceUrl,
    sourceLabel: host,
    locale,
    startedAt: now,
    transcriptAgent: opts.transcriptAgent,
  });
  nextMeta = patchMeta(opts.brandsRoot, opts.id, {
    conversationId,
    extractionTranscriptMessageId: transcript.assistantMessageId,
    extractionTranscriptUserMessageId: transcript.userMessageId,
    extractionStartedAt: now,
  }) ?? nextMeta;

  const fallbackPrompt = brandExtractionFallbackPrompt({
    url: sourceUrl,
    brandId: opts.id,
    host,
    hasWebsiteSource,
    hasDesignMdSource,
  });
  const programmaticOptions: RunProgrammaticExtractionOptions = {
    id: opts.id,
    meta: nextMeta,
    projectId,
    brandsRoot: opts.brandsRoot,
    userDesignSystemsRoot: opts.userDesignSystemsRoot,
    projectsRoot: opts.projectsRoot,
    skillsRoot: opts.skillsRoot,
    db: opts.db,
    hasWebsiteSource,
    locale,
    extractionAttemptId,
  };
  if (opts.dataDir) programmaticOptions.dataDir = opts.dataDir;
  if (opts.prefetch) programmaticOptions.prefetch = opts.prefetch;
  if (opts.logoFallback) programmaticOptions.logoFallback = opts.logoFallback;
  if (opts.imageryFallback) programmaticOptions.imageryFallback = opts.imageryFallback;
  if (designMd) programmaticOptions.designMd = designMd;

  launchProgrammaticBackgroundExtraction({
    programmaticOptions,
    programmaticAbortSignal: opts.programmaticAbortSignal,
    fallbackPrompt,
    onBackgroundExtraction: opts.onBackgroundExtraction,
    locale,
  });

  return {
    id: opts.id,
    projectId,
    conversationId,
    sourceUrl,
    status: 'extracting',
    ...(nextMeta.designSystemId ? { designSystemId: nextMeta.designSystemId } : {}),
    ...(detail.brand?.name ? { brandName: detail.brand.name } : {}),
  };
}

function resolveBrandRetryConversationId(input: {
  db: Parameters<typeof insertProject>[0];
  projectId: string;
  preferredConversationId?: string | null;
  randomId: () => string;
  now: number;
}): string {
  const conversations = listConversations(input.db, input.projectId);
  const preferredStillExists = input.preferredConversationId
    ? conversations.some((conversation) => conversation.id === input.preferredConversationId)
    : false;
  const existingConversationId = preferredStillExists
    ? input.preferredConversationId
    : conversations[0]?.id;
  if (existingConversationId) return existingConversationId;

  const conversationId = input.randomId();
  insertConversation(input.db, {
    id: conversationId,
    projectId: input.projectId,
    title: null,
    sessionMode: 'design',
    createdAt: input.now,
    updatedAt: input.now,
  });
  return conversationId;
}

export async function backfillBrandExtractionTranscriptForProject(input: {
  db: Parameters<typeof insertProject>[0];
  conversationId: string;
  randomId: () => string;
  brandsRoot: string;
  projectsRoot: string;
  project: {
    id: string;
    createdAt?: number | null;
    metadata?: ProjectMetadata | null;
  };
  transcriptAgent?: StartBrandExtractionOptions['transcriptAgent'];
}): Promise<void> {
  if (listMessages(input.db, input.conversationId).length > 0) return;
  const metadata = input.project.metadata;
  if (!metadata || metadata.kind !== 'brand' || metadata.importedFrom !== 'brand-extraction') return;
  const brandId = metadata.brandId;
  if (!brandId) return;
  const latest = readBrandDetail(input.brandsRoot, brandId);
  const sourceUrl = latest?.meta.sourceUrl || metadata.brandSourceUrl || '';
  if (!sourceUrl) return;
  const startedAt = typeof input.project.createdAt === 'number' && Number.isFinite(input.project.createdAt)
    ? input.project.createdAt
    : Date.now();
  const locale = normalizeBrandKitLocale(latest?.meta.locale);
  const sourceLabel = metadata.sourceFileName?.trim() || hostnameOf(sourceUrl);
  const transcriptInput = {
    db: input.db,
    conversationId: input.conversationId,
    randomId: input.randomId,
    sourceUrl,
    sourceLabel,
    locale,
    startedAt,
    transcriptAgent: input.transcriptAgent,
  };
  if (latest?.meta.status === 'ready' && latest.meta.designSystemId) {
    await seedProgrammaticExtractionTranscript({
      ...transcriptInput,
      brandName: latest.brand?.name ?? sourceLabel,
      designSystemId: latest.meta.designSystemId,
      projectsRoot: input.projectsRoot,
      projectId: input.project.id,
      metadata: {
        ...metadata,
        entryFile: BRAND_KIT_FILE,
        brandDesignSystemId: latest.meta.designSystemId,
      },
    });
    return;
  }
  seedProgrammaticExtractionStartTranscript(transcriptInput);
}

interface ProgrammaticExtractionTranscript {
  userMessageId: string;
  assistantMessageId: string;
}

/** The terminal outcomes the synthetic programmatic-extraction row settles into.
 *  `succeeded` overwrites any earlier card (a slow site that eventually lands);
 *  the others never clobber a recorded success. */
export type ProgrammaticExtractionOutcome = 'succeeded' | 'needs_attention' | 'stopped';

/**
 * Flip the seeded programmatic-extraction transcript row to a terminal run
 * status. This is the SINGLE authority that retires the synthetic
 * "AMR · Working 13m…" row, driven entirely by persisted brand meta + the
 * message itself, so it works from EVERY completion point — finalize success,
 * give-up / blocked / stall, and user stop — and survives a daemon restart.
 * Best-effort and idempotent; safe to call repeatedly.
 *
 * The bug this fixes: the row used to be reconciled only by a single racy timer
 * gated on re-reading `status === 'ready'`. A heavy site that finalized AFTER
 * the timer fired left the row "running" forever ("succeeded but never
 * terminated"); a blocked/failed origin left it "running" forever too ("stuck
 * running"). Anchoring the reconcile to the real terminal points removes the
 * race entirely.
 */
export async function reconcileProgrammaticExtractionTranscript(input: {
  db: Parameters<typeof insertProject>[0];
  brandsRoot: string;
  projectsRoot: string;
  brandId: string;
  outcome: ProgrammaticExtractionOutcome;
  locale?: string;
}): Promise<void> {
  const meta = readMeta(input.brandsRoot, input.brandId);
  const conversationId = meta?.conversationId;
  const assistantMessageId = meta?.extractionTranscriptMessageId;
  if (!meta || !conversationId || !assistantMessageId) return;

  const current = listMessages(input.db, conversationId).find((m) => m.id === assistantMessageId);
  if (!current) return;
  // Never downgrade a recorded success. A deliberate user Stop may still
  // supersede an earlier stall/needs-attention row for the same extraction.
  if (current.runStatus === 'succeeded') return;
  if (input.outcome === 'needs_attention' && current.runStatus && current.runStatus !== 'running') return;

  const locale = input.locale ?? meta.locale ?? undefined;
  const copy = brandExtractionTranscriptCopy(locale);
  const sourceLine = meta.sourceUrl.startsWith('designmd://') ? copy.sourceDesignMd : meta.sourceUrl;
  const startedAt = current.startedAt ?? meta.extractionStartedAt ?? current.createdAt ?? Date.now();
  const createdAt = current.createdAt ?? startedAt;
  const now = Date.now();
  const agentFields = {
    ...(current.agentId ? { agentId: current.agentId } : {}),
    ...(current.agentName ? { agentName: current.agentName } : {}),
  };

  if (input.outcome === 'succeeded') {
    const detail = readBrandDetail(input.brandsRoot, input.brandId);
    const designSystemId = meta.designSystemId ?? detail?.meta.designSystemId;
    // Defensive: only claim success once the system is actually registered.
    if (!designSystemId) return;
    const brandName = detail?.brand?.name?.trim() || hostnameOf(meta.sourceUrl);
    const title = copy.doneTitle(brandName);
    const body = copy.doneBody(designSystemId, sourceLine);
    const next = copy.next;
    const projectId = meta.projectId ?? brandProjectId(input.brandId);
    const producedFiles = await brandExtractionProducedFiles(input.projectsRoot, projectId, {
      kind: 'brand',
      importedFrom: 'brand-extraction',
      brandId: input.brandId,
      brandSourceUrl: meta.sourceUrl,
      entryFile: BRAND_KIT_FILE,
      brandDesignSystemId: designSystemId,
    });
    upsertMessage(input.db, conversationId, {
      id: assistantMessageId,
      role: 'assistant',
      content: [title, '', body, '', next].join('\n'),
      ...agentFields,
      events: [
        { kind: 'text', text: `${title}\n\n` },
        { kind: 'text', text: `${body}\n\n${next}` },
      ],
      producedFiles,
      runStatus: 'succeeded',
      createdAt,
      startedAt,
      endedAt: now,
    });
    return;
  }

  // needs_attention | stopped — an actionable terminal so the row stops counting
  // up. Browser-assist recovery belongs in this same transcript row so it cannot
  // race with the web-side status poll that also offers the recovery path.
  const stopped = input.outcome === 'stopped';
  const title = stopped ? copy.stoppedTitle : copy.stalledTitle;
  const body = stopped
    ? copy.stoppedBody(sourceLine)
    : copy.stalledBody(sourceLine, meta.blockedReason ?? null);
  const browserAssistCard =
    !stopped && /^https?:\/\//i.test(meta.sourceUrl)
      ? brandBrowserAssistOdCard({
          brandId: input.brandId,
          sourceUrl: meta.sourceUrl,
          ...(meta.blockedReason ? { reason: meta.blockedReason } : {}),
        })
      : null;
  const content = browserAssistCard
    ? [title, '', body, '', browserAssistCard].join('\n')
    : [title, '', body].join('\n');
  upsertMessage(input.db, conversationId, {
    id: assistantMessageId,
    role: 'assistant',
    content,
    ...agentFields,
    events: [{ kind: 'text', text: content }],
    runStatus: stopped ? 'canceled' : 'failed',
    createdAt,
    startedAt,
    endedAt: now,
  });
}

function brandBrowserAssistOdCard(input: {
  brandId: string;
  sourceUrl: string;
  reason?: string | null;
}): string {
  const payload = JSON.stringify({
    brandId: input.brandId,
    browserTabId: BRAND_BROWSER_TAB_ID,
    ...(input.sourceUrl ? { url: input.sourceUrl } : {}),
    ...(input.reason ? { reason: input.reason } : {}),
  });
  return `<od-card type="brand-browser-assist">${payload}</od-card>`;
}

async function seedProgrammaticExtractionTranscript(input: {
  db: Parameters<typeof insertProject>[0];
  conversationId: string;
  randomId: () => string;
  sourceUrl: string;
  sourceLabel: string;
  brandName: string;
  designSystemId: string;
  projectsRoot: string;
  projectId: string;
  locale: string;
  startedAt: number;
  transcript?: ProgrammaticExtractionTranscript | null | undefined;
  transcriptAgent?: StartBrandExtractionOptions['transcriptAgent'];
  metadata: ProjectMetadata;
}): Promise<void> {
  const now = Date.now();
  const brandName = input.brandName.trim() || input.sourceLabel;
  const copy = brandExtractionTranscriptCopy(input.locale);
  const sourceLine = input.sourceUrl.startsWith('designmd://')
    ? copy.sourceDesignMd
    : input.sourceUrl;
  const title = copy.doneTitle(brandName);
  const body = copy.doneBody(input.designSystemId, sourceLine);
  const next = copy.next;
  const assistantContent = [title, '', body, '', next].join('\n');
  const messages = listMessages(input.db, input.conversationId);
  const alreadySeeded = messages.some((message) =>
    message.role === 'assistant' && message.content === assistantContent
  );
  if (alreadySeeded) return;
  const transcript = input.transcript ?? {
    userMessageId: input.randomId(),
    assistantMessageId: input.randomId(),
  };
  upsertMessage(input.db, input.conversationId, {
    id: transcript.userMessageId,
    role: 'user',
    content: copy.user(sourceLine),
    createdAt: input.startedAt,
  });
  upsertMessage(input.db, input.conversationId, {
    id: transcript.assistantMessageId,
    role: 'assistant',
    content: assistantContent,
    ...(input.transcriptAgent?.agentId ? { agentId: input.transcriptAgent.agentId } : {}),
    ...(input.transcriptAgent?.agentName ? { agentName: input.transcriptAgent.agentName } : {}),
    events: [
      { kind: 'text', text: `${title}\n\n` },
      {
        kind: 'text',
        text: `${body}\n\n${next}`,
      },
    ],
    producedFiles: await brandExtractionProducedFiles(input.projectsRoot, input.projectId, input.metadata),
    runStatus: 'succeeded',
    createdAt: now,
    startedAt: input.startedAt,
    endedAt: now,
  });
}

function seedProgrammaticExtractionStartTranscript(input: {
  db: Parameters<typeof insertProject>[0];
  conversationId: string;
  randomId: () => string;
  sourceUrl: string;
  sourceLabel: string;
  locale: string;
  startedAt: number;
  transcriptAgent?: StartBrandExtractionOptions['transcriptAgent'];
}): ProgrammaticExtractionTranscript {
  const copy = brandExtractionTranscriptCopy(input.locale);
  const sourceLine = input.sourceUrl.startsWith('designmd://')
    ? copy.sourceDesignMd
    : input.sourceUrl;
  const userMessageId = input.randomId();
  const assistantMessageId = input.randomId();
  const startedText = copy.started(sourceLine);
  upsertMessage(input.db, input.conversationId, {
    id: userMessageId,
    role: 'user',
    content: copy.user(sourceLine),
    createdAt: input.startedAt,
  });
  upsertMessage(input.db, input.conversationId, {
    id: assistantMessageId,
    role: 'assistant',
    content: startedText,
    ...(input.transcriptAgent?.agentId ? { agentId: input.transcriptAgent.agentId } : {}),
    ...(input.transcriptAgent?.agentName ? { agentName: input.transcriptAgent.agentName } : {}),
    events: [{ kind: 'text', text: startedText }],
    runStatus: 'running',
    createdAt: input.startedAt,
    startedAt: input.startedAt,
  });
  return { userMessageId, assistantMessageId };
}

interface BrandExtractionTranscriptCopy {
  sourceDesignMd: string;
  next: string;
  user: (source: string) => string;
  started: (source: string) => string;
  doneTitle: (name: string) => string;
  doneBody: (designSystemId: string, source: string) => string;
  /** Actionable terminal shown when the programmatic pass stalls (30s) or hits
   *  a wall the deterministic harvest can't pass. */
  stalledTitle: string;
  stalledBody: (source: string, reason: string | null) => string;
  /** Terminal shown when the user stops the programmatic pass. */
  stoppedTitle: string;
  stoppedBody: (source: string) => string;
}

function brandExtractionTranscriptCopy(locale?: string | null): BrandExtractionTranscriptCopy {
  switch (normalizeBrandKitLocale(locale)) {
    case 'zh-CN':
      return {
        sourceDesignMd: '粘贴的 DESIGN.md',
        user: (source) => `从 ${source} 抽取一个设计系统。`,
        started: (source) => `正在从 ${source} 进行程序化设计系统抽取。`,
        doneTitle: (name) => `${name} 的程序化抽取已完成。`,
        doneBody: (designSystemId, source) =>
          `我已经从 ${source} 创建并注册了 ${designSystemId} 设计系统。现在可以预览，也可以直接用于新设计。`,
        next: '接下来，你可以运行 AI 优化做更深一轮抽取，或者用这个系统新建设计。',
        stalledTitle: '程序化抽取需要你帮一把。',
        stalledBody: (source, reason) =>
          `我没能自动从 ${source} 抽取完成${reason ? `（${reason}）` : ''}。请使用下方浏览器辅助卡片打开 Browser，必要时清掉人机验证，然后点击 More > 下载页面，等待页面快照保存成功，再回到左侧“下一步”卡片点击“继续提取”继续程序化抽取。如果下方卡片没有出现，也可以手动打开右侧 Browser tab，按同样的 More > 下载页面 > 继续提取路径操作；也可以直接用 AI 继续。`,
        stoppedTitle: '抽取已停止。',
        stoppedBody: (source) =>
          `你停止了从 ${source} 的抽取。已经抽到的内容会保留成一个可编辑的设计系统，你可以从这里继续编辑或重试。`,
      };
    case 'zh-TW':
      return {
        sourceDesignMd: '貼上的 DESIGN.md',
        user: (source) => `從 ${source} 抽取一個設計系統。`,
        started: (source) => `正在從 ${source} 進行程式化設計系統抽取。`,
        doneTitle: (name) => `${name} 的程式化抽取已完成。`,
        doneBody: (designSystemId, source) =>
          `我已經從 ${source} 建立並註冊了 ${designSystemId} 設計系統。現在可以預覽，也可以直接用於新設計。`,
        next: '接下來，你可以執行 AI 優化做更深一輪抽取，或者用這個系統建立新設計。',
        stalledTitle: '程式化抽取需要你幫一把。',
        stalledBody: (source, reason) =>
          `我沒能自動從 ${source} 抽取完成${reason ? `（${reason}）` : ''}。請使用下方瀏覽器輔助卡片開啟 Browser，必要時清掉人機驗證，然後點擊 More > 下載頁面，等待頁面快照儲存成功，再回到左側「下一步」卡片點擊「繼續擷取」繼續程式化擷取。如果下方卡片沒有出現，也可以手動開啟右側 Browser tab，按同樣的 More > 下載頁面 > 繼續擷取路徑操作；也可以直接用 AI 繼續。`,
        stoppedTitle: '抽取已停止。',
        stoppedBody: (source) =>
          `你停止了從 ${source} 的抽取。已經抽到的內容會保留成一個可編輯的設計系統，你可以從這裡繼續編輯或重試。`,
      };
    default:
      return {
        sourceDesignMd: 'pasted DESIGN.md',
        user: (source) => `Extract a design system from ${source}.`,
        started: (source) => `Programmatic design-system extraction started from ${source}.`,
        doneTitle: (name) => `Programmatic extraction finished for ${name}.`,
        doneBody: (designSystemId, source) =>
          `I created and registered the ${designSystemId} design system from ${source}. It is ready to preview and can be used in new designs now.`,
        next: 'Next, you can run AI Optimize for a deeper extraction pass, or create a new design with this system.',
        stalledTitle: 'The automatic pass needs a hand.',
        stalledBody: (source, reason) =>
          `I couldn't finish extracting ${source} automatically${reason ? ` (${reason})` : ''}. Use the browser assist card below to open Browser, clear any human check, click More > Download Page, wait for the saved snapshot success message, then use the left Next Step card and click Continue extraction to continue the programmatic extraction. If the card is not visible, manually open the Browser tab on the right and follow the same More > Download Page > Continue extraction path — or keep going with AI.`,
        stoppedTitle: 'Extraction stopped.',
        stoppedBody: (source) =>
          `You stopped extracting ${source}. Whatever was gathered is kept as an editable design system — pick up from there or retry.`,
      };
  }
}

function isClosedDatabaseError(err: unknown): boolean {
  return err instanceof Error && err.message.includes('database connection is not open');
}

async function brandExtractionProducedFiles(
  projectsRoot: string,
  projectId: string,
  metadata: ProjectMetadata,
): Promise<unknown[]> {
  const files = await listFiles(projectsRoot, projectId, { metadata }).catch(() => []);
  const visible = files.filter((file) => {
    if (!file || file.type === 'dir') return false;
    const name = String(file.name ?? file.path ?? '');
    if (!name || name.startsWith('.') || name.includes('/.')) return false;
    return !name.toLowerCase().endsWith('.sketch.json');
  });
  if (visible.length > 0) return visible;
  const filePath = path.join(resolveProjectDir(projectsRoot, projectId, metadata), BRAND_KIT_FILE);
  let size = 0;
  let mtime = Date.now();
  try {
    const stat = fs.statSync(filePath);
    size = stat.size;
    mtime = stat.mtimeMs;
  } catch {
    // The file is created just above; if a test stubs that path, keep the
    // transcript usable and let the live project file listing provide details.
  }
  return [{
    name: BRAND_KIT_FILE,
    path: BRAND_KIT_FILE,
    size,
    mtime,
    kind: 'html',
    mime: 'text/html',
  }];
}

/** Soft checkpoint: once the programmatic pass has run this long with no
 *  finalized system, flip the synthetic transcript row to the actionable
 *  "needs a hand" terminal so the user sees a next step instead of an
 *  ever-climbing "Working" clock. Does NOT abort the work — a slow-but-healthy
 *  origin still finalizes and overwrites the card with success. */
const PROGRAMMATIC_STALL_CHECKPOINT_MS = 30_000;

/** Hard runaway backstop: abort the background programmatic-first extraction so
 *  a pathological origin can never leak a forever-pending promise. Generous on
 *  purpose — the per-fetch 8s timeouts bound the real harvest, so a healthy
 *  (even heavy) site finalizes well before this. */
const PROGRAMMATIC_EXTRACT_TIMEOUT_MS = 180_000;

class ProgrammaticExtractionAbortError extends Error {
  constructor() {
    super('programmatic brand extraction aborted');
    this.name = 'ProgrammaticExtractionAbortError';
  }
}

function throwIfProgrammaticExtractionAborted(signal?: AbortSignal | null): void {
  if (signal?.aborted) throw new ProgrammaticExtractionAbortError();
}

function newBrandExtractionAttemptId(): string {
  return randomUUID();
}

function programmaticExtractionAttemptIsCurrent(input: {
  brandsRoot: string;
  id: string;
  extractionAttemptId?: string | undefined;
}): boolean {
  if (!input.extractionAttemptId) return true;
  return readMeta(input.brandsRoot, input.id)?.extractionAttemptId === input.extractionAttemptId;
}

function throwIfProgrammaticExtractionNotCurrent(input: {
  brandsRoot: string;
  id: string;
  extractionAttemptId?: string | undefined;
  abortSignal?: AbortSignal | undefined;
}): void {
  throwIfProgrammaticExtractionAborted(input.abortSignal);
  if (!programmaticExtractionAttemptIsCurrent(input)) throw new ProgrammaticExtractionAbortError();
}

export function isProgrammaticExtractionAbortError(err: unknown): boolean {
  return err instanceof ProgrammaticExtractionAbortError;
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
  /** Optional override; defaults to the locale stored in brand meta. */
  locale?: string;
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
  /** Optional cancellation hook for the background programmatic pass only. */
  abortSignal?: AbortSignal;
  /** Programmatic attempt that is allowed to commit terminal writes. */
  extractionAttemptId?: string;
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

  throwIfProgrammaticExtractionNotCurrent(opts);
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
      throwIfProgrammaticExtractionNotCurrent(opts);
      if (result.changed) writeBrand(brandsRoot, id, brand);
    }
  } catch (err) {
    if (isProgrammaticExtractionAbortError(err)) throw err;
    // Offline / unreachable origin — keep the (empty) logo and continue.
  }
  throwIfProgrammaticExtractionNotCurrent(opts);

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
      throwIfProgrammaticExtractionNotCurrent(opts);
      if (result.changed) writeBrand(brandsRoot, id, brand);
    }
  } catch (err) {
    if (isProgrammaticExtractionAbortError(err)) throw err;
    // Offline / unreachable origin — keep whatever imagery the agent saved.
  }
  throwIfProgrammaticExtractionNotCurrent(opts);

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
  throwIfProgrammaticExtractionNotCurrent(opts);

  const systemBuild = await rebuildSystem(brandsRoot, id);
  throwIfProgrammaticExtractionNotCurrent(opts);

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
  throwIfProgrammaticExtractionNotCurrent(opts);
  const designSystemId = summary.id;
  syncBrandSystemToUserDesignSystem(userDesignSystemsRoot, designSystemId, brandsRoot, id, body);
  throwIfProgrammaticExtractionNotCurrent(opts);

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
  throwIfProgrammaticExtractionNotCurrent(opts);

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
    locale: opts.locale ?? meta.locale,
  });
  throwIfProgrammaticExtractionNotCurrent(opts);

  await linkUserDesignSystemProject(userDesignSystemsRoot, designSystemId, projectId);
  throwIfProgrammaticExtractionNotCurrent(opts);

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
  throwIfProgrammaticExtractionNotCurrent(opts);

  patchMeta(brandsRoot, id, {
    status: 'ready',
    error: undefined,
    extractionTerminalRunId: undefined,
    extractionTerminalError: undefined,
    designSystemId,
    systemFiles: systemBuild.files,
    projectId,
    // Any anti-bot wall the programmatic pass flagged is moot now the brand is
    // finalized — clear it so the web stops prompting the browser fallback.
    blocked: false,
    blockedReason: undefined,
  });

  // Authoritatively retire the synthetic "Working" transcript row the moment
  // the brand is actually finalized `ready` + registered. This is the fix for
  // "succeeded but never terminated": it runs from the real completion point, so
  // it lands even when the brand finalizes long after the background stall timer
  // fired (heavy site) and regardless of which path (programmatic or agent
  // `od brand finalize`) drove the finalize. Best-effort — a reconcile failure
  // must never fail an otherwise-successful finalize.
  try {
    await reconcileProgrammaticExtractionTranscript({
      db,
      brandsRoot,
      projectsRoot,
      brandId: id,
      outcome: 'succeeded',
      ...(opts.locale ?? meta.locale ? { locale: opts.locale ?? meta.locale } : {}),
    });
  } catch (err) {
    if (!isClosedDatabaseError(err)) {
      console.warn(`[brand] failed to reconcile success transcript for ${id}`, err);
    }
  }

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
 *  brand workspace. Injectable so tests run offline. The optional signal lets a
 *  user Stop tear down in-flight fetches instead of waiting out their timeouts. */
export type PrefetchFn = (
  url: string,
  brandDir: string,
  opts?: { signal?: AbortSignal },
) => Promise<PrefetchResult | null>;

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
  description?: string;
  designMd?: string;
  hasWebsiteSource?: boolean;
  /** Deterministic material harvester; defaults to the live network prefetch. */
  prefetch?: PrefetchFn;
  logoFallback?: LogoFallbackFn;
  imageryFallback?: ImageryFallbackFn;
  locale?: string;
  abortSignal?: AbortSignal;
  extractionAttemptId?: string;
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
  throwIfProgrammaticExtractionNotCurrent(opts);
  const brandDir = resolveBrandFile(brandsRoot, id, []);
  if (!brandDir) return null;

  if (opts.designMd?.trim()) {
    throwIfProgrammaticExtractionNotCurrent(opts);
    const brand = brandFromDesignMd({
      markdown: opts.designMd,
      sourceUrl: meta.sourceUrl,
      description: opts.description,
      fallbackName: hostnameOf(meta.sourceUrl),
    });
    if (brand) {
      const guideMd = brandGuideMd(brand);
      throwIfProgrammaticExtractionNotCurrent(opts);
      const finalized = await finalizeBrandCore({ ...opts, brand, guideMd });
      throwIfProgrammaticExtractionNotCurrent(opts);
      updateProject(opts.db, opts.projectId, {
        pendingPrompt: brandExtractionPrompt({
          url: meta.sourceUrl,
          brandId: id,
          host: hostnameOf(meta.sourceUrl),
          hasWebsiteSource: opts.hasWebsiteSource === true,
          hasDesignMdSource: true,
        }),
      });
      return finalized;
    }
  }

  if (opts.hasWebsiteSource === false) return null;

  throwIfProgrammaticExtractionNotCurrent(opts);
  const material = await prefetch(
    meta.sourceUrl,
    brandDir,
    opts.abortSignal ? { signal: opts.abortSignal } : undefined,
  );
  throwIfProgrammaticExtractionNotCurrent(opts);
  if (!material) return null;
  if (material.blocked) {
    // Anti-bot wall: persist the signal so the web can prompt the user to clear
    // it in the in-app browser tab and re-extract from the rendered DOM. The
    // brand stays `extracting`, so the agent fallback still works either way.
    patchMeta(brandsRoot, id, { blocked: true, blockedReason: 'Cloudflare' });
    return null;
  }
  if (material.thin) return null;

  const brand = brandFromMaterial(material, meta.sourceUrl);
  const guideMd = brandGuideMd(brand);
  throwIfProgrammaticExtractionNotCurrent(opts);
  const finalized = await finalizeBrandCore({ ...opts, brand, guideMd });
  throwIfProgrammaticExtractionNotCurrent(opts);
  updateProject(opts.db, opts.projectId, {
    pendingPrompt: brandExtractionPrompt({
      url: meta.sourceUrl,
      brandId: id,
      host: hostnameOf(meta.sourceUrl),
      hasWebsiteSource: true,
      hasDesignMdSource: false,
    }),
  });
  return finalized;
}

export interface ExtractBrandFromHtmlOptions
  extends Omit<RunProgrammaticExtractionOptions, 'prefetch' | 'designMd' | 'projectId'> {
  /** Backing project to sync the finalized system into; defaults to the brand's
   *  recorded project. */
  projectId?: string;
  /** Rendered DOM (`document.documentElement.outerHTML`) the web read out of the
   *  in-app browser tab after the user cleared an anti-bot wall. */
  html: string;
  /** Stylesheet text + computed-style harvest collected from the rendered page. */
  css?: string;
  /** Page URL used as the asset base; defaults to the brand's `sourceUrl`. */
  baseUrl?: string;
}

/**
 * Whether a harvest of already-rendered browser DOM produced essentially
 * nothing a brand can be synthesized from. Used only by the post-wall
 * `extract-from-html` path, where the page is real (the user cleared the wall),
 * so this is intentionally far more permissive than `PrefetchResult.thin`:
 *
 *  - A sparse palette (`< 3` non-extreme colors) is NOT disqualifying on its
 *    own. Minimalist brands (black/white/red) and transient computed-style
 *    reads routinely land few chromatic colors yet still describe a real site.
 *  - Missing headings/description is NOT disqualifying on its own either.
 *
 * We bail only when the harvest is `blocked` (the serialized DOM still looked
 * like the bare anti-bot wall, e.g. read too early) or when both real page copy
 * AND a real palette are absent (a blank/"still loading" placeholder read). A
 * harvested logo is deliberately NOT counted as a usable signal here: the
 * favicon-service fallback returns an icon for essentially any hostname, so it
 * would wrongly rescue an empty/placeholder page.
 */
export function browserHarvestIsUnusable(material: PrefetchResult): boolean {
  if (material.blocked) return true;
  const hasColor = material.colors.some((c) => !c.extreme);
  const hasCopy =
    material.headings.length > 0 ||
    Boolean(material.description) ||
    material.paragraphs.length > 0 ||
    material.navLabels.length > 0;
  return !hasColor && !hasCopy;
}

/**
 * Re-run programmatic extraction against HTML the web already rendered (the
 * in-app browser tab the user unblocked), instead of fetching. Same
 * harvest → synthesize → finalize pipeline as `runProgrammaticExtraction`, but
 * fed the post-wall DOM via `prefetchFromHtml` (no network fetch, no Chrome).
 * On success the brand is finalized `ready` and its `user:<id>` design system
 * registered (reusing the existing id — never duplicated). Returns null when the
 * provided page is still too thin to synthesize a system.
 */
export async function extractBrandFromHtml(
  opts: ExtractBrandFromHtmlOptions,
): Promise<BrandFinalizeResponse | null> {
  const { id, meta, brandsRoot } = opts;
  const brandDir = resolveBrandFile(brandsRoot, id, []);
  if (!brandDir) return null;
  const projectId = opts.projectId ?? meta.projectId ?? brandProjectId(id);
  const baseUrl = opts.baseUrl?.trim() || meta.sourceUrl;
  const extractionAttemptId = opts.extractionAttemptId ?? newBrandExtractionAttemptId();
  const currentMeta = patchMeta(brandsRoot, id, {
    status: 'extracting',
    error: undefined,
    blocked: false,
    blockedReason: undefined,
    extractionTerminalRunId: undefined,
    extractionTerminalError: undefined,
    extractionAttemptId,
  }) ?? { ...meta, status: 'extracting', extractionAttemptId, updatedAt: Date.now() };

  const material = await prefetchFromHtml(opts.html, opts.css ?? '', baseUrl, brandDir);
  throwIfProgrammaticExtractionNotCurrent({ ...opts, extractionAttemptId });
  // This DOM was read out of the in-app browser tab AFTER the user cleared the
  // anti-bot wall, so it is a real page — be far more permissive than the
  // network prefetch's `thin` gate. A content-rich page with a sparse palette
  // (a minimalist black/white/red brand like the Economist, or a transiently
  // incomplete computed-style read) MUST still synthesize: `brandFromMaterial`
  // falls back to seed defaults for missing colors and the AI enrichment pass
  // refines later. Only bail when the harvest captured nothing a brand can be
  // built from — which in practice means the read grabbed the wall/blank page
  // (`blocked`) or an empty document, not the unblocked site.
  if (!material || browserHarvestIsUnusable(material)) return null;

  const brand = brandFromMaterial(material, currentMeta.sourceUrl);
  const guideMd = brandGuideMd(brand);
  const finalized = await finalizeBrandCore({
    ...opts,
    projectId,
    meta: currentMeta,
    brand,
    guideMd,
    extractionAttemptId,
  });
  throwIfProgrammaticExtractionNotCurrent({ ...opts, extractionAttemptId });
  // Flip the project to enrichment mode so a follow-up "AI Optimize" refines the
  // same design system in place rather than re-running the blocked extraction.
  updateProject(opts.db, projectId, {
    pendingPrompt: brandExtractionPrompt({
      url: currentMeta.sourceUrl,
      brandId: id,
      host: hostnameOf(currentMeta.sourceUrl),
      hasWebsiteSource: true,
      hasDesignMdSource: false,
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
  /** Explicit preview lifecycle for caller-known states such as user stop. */
  previewStatus?: BrandKitStatus;
  /** Optional override; defaults to the locale stored in brand meta. */
  locale?: string;
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
  const status: BrandKitStatus = opts.previewStatus ?? (meta.status === 'ready'
    ? 'ready'
    : meta.status === 'failed'
      ? 'failed'
      : meta.status === 'extracting' || meta.status === 'needs_input'
      ? 'extracting'
      : 'draft');

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
    locale: opts.locale ?? meta.locale,
  });
  return { id, projectId, file: BRAND_KIT_FILE, rendered };
}

/** The first prompt the enrichment agent auto-runs. Self-sufficient: it inlines
 *  the full brand-extract workflow so the agent never has to load anything.
 *
 *  The daemon surfaces its `skills/` by folding the skill body into the SYSTEM
 *  prompt (see composeSystemPrompt) when a project has an active `skillId` — it
 *  does NOT register them as Claude-Code `Skill` / slash commands. This backing
 *  project carries no active skill, so phrasing like "use the brand-extract
 *  skill" gets executed by the agent as a `Skill {"skill":"brand-extract"}`
 *  tool call that has no registry to resolve against and ALWAYS fails (it burns
 *  a turn and confuses the run). Keep this prompt describing the methodology
 *  inline and steer the agent away from invoking any skill / slash command. */
const SEED_AUTHORING_GUIDANCE =
  'Persist engine-level overrides such as control height in `brand.json.seed` (for example, `{ "controlHeight": 44 }`). Do not edit `system/seed.json` or other generated `system/` files directly; `od brand finalize` replaces them.';

function brandExtractionPrompt(input: {
  url: string;
  brandId: string;
  host: string;
  hasWebsiteSource?: boolean;
  hasDesignMdSource?: boolean;
}): string {
  if (input.hasDesignMdSource && !input.hasWebsiteSource) {
    return [
      `This is a DESIGN SYSTEM ENRICHMENT task for ${input.host}.`,
      `Source: pasted DESIGN.md (${input.url})`,
      `Brand id: ${input.brandId}`,
      '',
      'A usable design system has ALREADY been parsed from `context/input-DESIGN.md`, finalized programmatically, and registered. The design-system page (`brand.html`) is open as the active tab, already in the `ready` state and applyable everywhere RIGHT NOW. Your job is to ENRICH that provisional system in place: inspect `context/input-DESIGN.md`, `DESIGN.md`, `brand.json`, `system/variables.css`, `system/theme.json`, and the component kit pages; then replace weak guesses with clearer token roles, component guidance, voice, and implementation notes.',
      '',
      'Do not create a duplicate design system. Keep the same registered user design-system id. Update `brand.json` and `BRAND.md` incrementally, run `od brand preview ' + input.brandId + '` after field groups, then run `od brand finalize ' + input.brandId + '` when ready.',
      SEED_AUTHORING_GUIDANCE,
      '',
      'Focus areas:',
      '- Normalize color roles from the pasted DESIGN.md into background, surface, foreground, muted, border, accent, and accent-secondary.',
      '- Strengthen typography guidance, spacing/radius/layout posture, component kit coverage, and do/don\'t rules from the source prose.',
      '- Keep `DESIGN.md`, `brand.json`, `system/kit.html`, `system/kit.dark.html`, token JSON/CSS files, and artifact previews coherent.',
      '',
      'Finish by summarizing which tokens and component-kit files changed.',
    ].join('\n');
  }

  const designMdNote = input.hasDesignMdSource
    ? ' The user also pasted `context/input-DESIGN.md`; treat its machine-readable tokens and prose as source evidence and authoritative overrides when they conflict with rough website guesses.'
    : '';
  return [
    `This is a DESIGN SYSTEM ENRICHMENT task for ${input.host}.`,
    `Source URL: ${input.url}`,
    `Brand id: ${input.brandId}`,
    '',
    'A usable design system has ALREADY been extracted programmatically and registered — the daemon harvested the site deterministically (logo, palette, typography, a one-line description, cover imagery, source URL) and the design-system page (`brand.html`) is open as the active tab, already in the `ready` state and applyable everywhere RIGHT NOW. Your job is to ENRICH that provisional design system into the full, precise version: re-measure anything the deterministic pass got approximately, add what it could not infer (voice & tone, imagery direction, layout posture, accent-secondary), and replace any weak guesses with measured truth.' + designMdNote + ' The target site is also open in a secondary in-app Browser tab. This task already contains the full brand-extract workflow inline (the numbered steps below) — follow it directly. Do NOT try to load or invoke a `brand-extract` skill, `Skill`, or any slash command: none is registered here and the call will fail. Drive and observe the site with the `agent-browser` tool. Do not guess — measure.',
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
    SEED_AUTHORING_GUIDANCE,
    '',
    '3. REBUILD & RE-REGISTER — when `brand.json` is enriched, run `od brand finalize ' + input.brandId + '` (add `--json` for machine output). That re-validates it, re-derives the light/dark/compact design tokens and the six design-system artifacts (landing, deck, poster, email, newsletter, form), and UPDATES the already-registered design system in place (same id — never a duplicate), so every template that already uses it picks up the sharper result. Fix `brand.json` and re-run if it reports a validation error.',
    '',
    'Finish by pointing the user at the enriched brand.html (logo, palette, typography, voice) and the design-system assets they can now preview, and confirm the design system was updated.',
  ].join('\n');
}

/** Prompt used while the programmatic harvest is not known-good yet. It must
 * not claim the design system is already ready: blocked/thin sites stay on
 * this path and need the agent to do the initial extraction from the scaffold. */
function brandExtractionFallbackPrompt(input: {
  url: string;
  brandId: string;
  host: string;
  hasWebsiteSource?: boolean;
  hasDesignMdSource?: boolean;
}): string {
  if (input.hasDesignMdSource && !input.hasWebsiteSource) {
    return [
      `This is a DESIGN SYSTEM EXTRACTION task for ${input.host}.`,
      `Source: pasted DESIGN.md (${input.url})`,
      `Brand id: ${input.brandId}`,
      '',
      'The daemon created a live design-system scaffold and saved the pasted source at `context/input-DESIGN.md`. A ready design system may already be registered from the programmatic parser; if not, use the pasted file as the canonical source and complete it.',
      '',
      'Read `context/input-DESIGN.md`, then update `brand.json`, `BRAND.md`, and `DESIGN.md` progressively. Run `od brand preview ' + input.brandId + '` after meaningful field groups, then `od brand finalize ' + input.brandId + '` to register or update the same design system in place.',
      SEED_AUTHORING_GUIDANCE,
      '',
      'Finish by pointing the user at the completed brand.html and reusable design-system assets.',
    ].join('\n');
  }

  const designMdNote = input.hasDesignMdSource
    ? ' The user also pasted `context/input-DESIGN.md`; read it before drafting and let its tokens/prose override weaker URL-derived guesses.'
    : '';
  return [
    `This is a DESIGN SYSTEM EXTRACTION task for ${input.host}.`,
    `Source URL: ${input.url}`,
    `Brand id: ${input.brandId}`,
    '',
    'The daemon opened a live extraction scaffold (`brand.html`) in the project, but a ready design system is NOT guaranteed yet. Treat the page as an empty/in-progress workspace until you have measured the target site and written `brand.json`; do not assume a registered `brand.json` or design system already exists.' + designMdNote,
    '',
    'This task already contains the full brand-extract workflow inline — follow it directly. Do NOT try to load or invoke a `brand-extract` skill, `Skill`, or any slash command: none is registered here and the call will fail. Drive and observe the target site with the `agent-browser` tool. Measure before you synthesize: capture the real colors, fonts, logo candidates, representative imagery, voice, and layout posture. If the page is an anti-bot verification interstitial, emit a `<question-form>` asking the user to complete verification in the browser, then continue after they respond.',
    '',
    'Write `brand.json` as soon as you have the name, a couple of measured colors, and a logo candidate, then run `od brand preview ' + input.brandId + '` so the scaffold fills in progressively. Keep updating `brand.json`, `BRAND.md`, saved `logos/`, fonts, and `imagery/` samples as you measure each field group.',
    SEED_AUTHORING_GUIDANCE,
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
  await copyOptionalDirectoryToProject(input.projectsRoot, input.projectId, input.metadata, path.join(brandRoot, 'context'), 'context');
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
