import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  PLATFORM_CONTRACTS_BLOCK,
  renderSlimCoreCharter,
} from '../../src/prompts/core-slim.js';
import { composeSystemPrompt } from '../../src/prompts/system.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../../..');

/**
 * Guards for the rewritten slim core charter.
 *
 * 1. Byte budget — the whole point of the rewrite is that the always-on
 *    doctrine stays small. Anyone growing this file must consciously raise
 *    the budget in a reviewed diff, not drift past it.
 * 2. Protocol markers — a fixed set of strings are parsed by the web client
 *    or matched by later prompt rules. Frozen API; must survive copyedits.
 * 3. Ownership — content deliberately moved OUT of the charter (task-type
 *    router form, platform contracts) must stay out, and keep living where
 *    it moved to.
 */

// 12KB budget. History: 8KB doctrine core, +1KB absorbed security section,
// +0.7KB structure-review fixes, +0.5KB regression-audit restorations,
// +0.45KB form-tailoring/first-message fixes. The final headroom is the
// 2026-07-06 readability refactor (per-concern section split of the
// overloaded turn-1 form section into "Turn 1 — the discovery form",
// "Writing a <question-form>", and a "### Form contract" cross-cutting
// subsection): the budget was consciously expanded for human
// maintainability/readability at the maintainer's direction, since a
// write-only prompt only one author can safely edit is its own kind of debt.
// The 2026-07-06 second pass (heading-style consistency, self-check sub-list,
// split run-on sentences, precedence domain-collapse) plus the multi-turn
// adherence section ("## On an edit or tweak" — DS binding as a standing
// per-turn invariant and session constraints persisting across edits, from
// production feedback that both drift during multi-turn edits) fit inside
// this budget without a further raise.
// 13KB. The 2026-07-06 two-tier restructure (5 top-level H2 — 2 foundations
// + Discovery / Delivery / Craft & contracts pillars — with the lifecycle and
// form/reference content grouped under H3s) added pillar headings; budget
// raised to keep readability headroom, per the maintainer's direction.
// 14KB. Headroom for the edit-adherence strengthening (forceful
// do-exactly-what-was-asked + verify) and the constraint-override
// clarification (a later explicit user request overrides a conflicting
// earlier constraint — the blue->yellow example), per the maintainer's
// direction to prioritize followability over byte count here.
// Bumped from 14_336 to restore load-bearing production-value craft guidance
// (real imagery via the media tool, cohesive palette + interaction depth) whose
// absence caused visible slim regressions on visual-first pages (P1 hero, P5 buttons).
// Bumped from 15_360 to restore two quality instructions the tool-economy pass
// dropped as collateral: the seed-copy rule ("Copy the seed and paste its
// layouts") that keeps skills from writing CSS from scratch, and the
// unconditional own-browser ban on preview (the softened "probes first"
// wording let a run reach for Playwright after an export failure in the
// 2026-07-13 slim-tool-economy eval, v1_001 turn 3).
// Bumped from 15_616 for the form-prefill contract: every <question-form>
// question ships a brief-inferred recommended `default` so the user can
// submit the form unchanged (one bullet + `"default"` anchor in the example
// form + updated description copy).
// Bumped from 15_872 for the imagery fallback chain: when no image
// generation is wired up (or the generate call fails), the run falls back to
// web search / web fetch to pull a real photo into the project instead of
// shipping an empty slot or a schematic box.
// Bumped from 16_128 for the host-owned "Other" escape hatch: the web
// renderer injects a localized Other chip on finite-choice questions, so the
// contract now bans model-authored catch-all options (and the example drops
// "Other — I'll describe"); the form cap tightened from ≤7 to at most 5.
// Bumped from 16_384 for the localization quality pass: native-phrasing rule
// with the 快速确认/快速简报 wrong-vs-right anchor, the machine-readable
// top-level `"lang"` tag that keys the host's in-card controls, and the
// count-then-cut hard-cap wording that replaced "Ask at most 5".
// Bumped from 16_896 for the photo-overlay placement rule: real-imagery
// production value kept shipping badges/caption cards that straddle the
// image edge or sit on the photo's subject (2026-07-14 beta feedback,
// campus-open-day hero); overlays now pin inside one corner on a legible
// surface or move beside the image.
const SLIM_CORE_BYTE_BUDGET = 17_408;

describe('renderSlimCoreCharter — byte budget', () => {
  it('stays under the byte budget in both execution profiles', () => {
    for (const profile of ['filesystem', 'text_artifact'] as const) {
      const bytes = Buffer.byteLength(renderSlimCoreCharter(profile), 'utf8');
      expect(bytes, `${profile} charter must stay under ${SLIM_CORE_BYTE_BUDGET}B`).toBeLessThanOrEqual(
        SLIM_CORE_BYTE_BUDGET,
      );
    }
  });
});

describe('renderSlimCoreCharter — frozen protocol markers', () => {
  const charter = renderSlimCoreCharter('filesystem');

  it('keeps the question-form protocol intact', () => {
    expect(charter).toContain('<question-form id="discovery" title="Quick brief — 30 seconds">');
    // Branch values later rules match on — labels may localize, values may not.
    for (const value of ['pick_direction', 'brand_spec', 'reference_match']) {
      expect(charter).toContain(`"value": "${value}"`);
    }
    // The full control vocabulary the Questions tab renders.
    for (const control of ['direction-cards', 'datetime-local', 'switch']) {
      expect(charter).toContain(control);
    }
    expect(charter).toContain('allowCustom');
  });

  it('requires a recommended default prefill on every form question', () => {
    expect(charter).toContain('**Prefill a recommendation.**');
    expect(charter).toContain('a `default` inferred from the brief');
    // The example form anchors the pattern with a concrete default.
    expect(charter).toContain('"default": "pick_direction"');
    // Copy leads with "send as is works" — the benefit, not the mechanism.
    expect(charter).toContain('Prefilled for you — send as is, or tweak anything first.');
  });

  it('localizes like a native and declares the form language', () => {
    // Meaning-for-meaning translation (the 快速确认/快速简报 anchor keeps a
    // concrete wrong-vs-right example in front of the model), plus a
    // machine-readable `lang` tag so the host's own controls (Other chip,
    // custom-answer field) render in the form's language, not the UI locale.
    expect(charter).toContain('write what a native speaker would say, never word-for-word');
    expect(charter).toContain('快速确认');
    expect(charter).toContain('"lang": "en"');
    expect(charter).toContain('Set top-level `"lang"`');
  });

  it('delegates the Other escape hatch to the host and caps forms at 5 questions', () => {
    // The web renderer injects a localized "Other" chip (expanding into the
    // type-in field) on every finite-choice question, so model-authored
    // catch-all options would render as duplicates. And discovery forms stay
    // short: a hard 5-question cap with an explicit count-then-cut step.
    expect(charter).toContain('the host renders a localized "Other" escape hatch');
    expect(charter).not.toContain("Other — I'll describe");
    expect(charter).toContain('Hard cap: 5 questions');
    // The default-shape recipe must fit inside the cap: 2 fixed slots + a
    // pick-at-most-3 menu. The old prescriptive sequence ("Between `output`
    // and `brand`, in this order … After `brand`: …") implied 7 questions and
    // must not coexist with the hard cap (review: PR #5573).
    expect(charter).toContain('fill AT MOST 3 more from this menu');
    expect(charter).not.toContain('Between `output` and `brand`, in this order');
    expect(charter).not.toContain('After `brand`:');
  });

  it('keeps the imagery fallback chain intact', () => {
    // Production-value imagery resolves in order: OD media tool → the
    // runtime's native image generation → web search / web fetch pulling a
    // real photo into the project. The fallback exists so a run without any
    // image generation still ships real imagery instead of an empty slot,
    // and it must keep the no-hot-link file rule.
    expect(charter).toContain('media generate --surface image');
    expect(charter).toContain("your own runtime's native image generation");
    expect(charter).toContain('fall back to your web search / web fetch tools');
    expect(charter).toContain('reference it by relative path — never hot-link the remote URL');
  });

  it('keeps the inspect/tweaks contracts intact', () => {
    expect(charter).toContain('data-od-id="kebab-case-id"');
    expect(charter).toContain('/*EDITMODE-BEGIN*/');
    expect(charter).toContain('/*EDITMODE-END*/');
    expect(charter).toContain('react@18.3.1');
    expect(charter).toContain('babel/standalone@7.29.0');
  });

  it('states the verification budget once and without a re-score loop', () => {
    expect(charter.match(/One render is the whole budget/g)).toHaveLength(1);
    expect(charter).not.toContain('Two passes is normal');
  });

  it('makes the tool-economy budget operational', () => {
    for (const marker of [
      'Use the DESIGN.md included here',
      'read disk only if skill/project names an unincluded file',
      'active-skill-required seed/reference fully once',
      'Batch independent reads/searches into one call',
      'keep dependencies separate',
      'read minimal sufficient ranges',
      'search the whole file once for a global request',
      'Reuse returned results',
      'Never repeat a read-only probe on unchanged state',
      'after failure change the input, fix, or diagnostic before retry',
      'one batched check of changed ranges',
      'do not reopen unrelated ranges',
    ]) {
      expect(charter).toContain(marker);
    }
    expect(charter).not.toContain('Re-read the current file');
    expect(charter).not.toContain('Open the file you wrote');
  });

  it('keeps the seed-copy rule the tool-economy rewrite must not drop', () => {
    expect(charter).toContain("Copy the seed and paste its layouts — don't write CSS from scratch");
  });

  it('pins the photo-overlay placement discipline', () => {
    // Real-imagery production value without this rule shipped badges that
    // straddle the image edge or cover the photo's subject.
    expect(charter).toContain('**Overlays on photos are placements, not decoration.**');
    expect(charter).toContain('pins to ONE corner with a consistent inset');
    expect(charter).toContain('never straddling the edge or floating half-off');
    expect(charter).toContain("stays clear of faces and the photo's focal subject");
    expect(charter).toContain('No safe corner → put the label beside the image, not on it');
  });

  it('separates the optional preview budget from final delivery exports', () => {
    expect(charter).toContain('ONE optional preview directly');
    expect(charter).toContain('`"$OD_NODE_BIN" "$OD_BIN" export <file>');
    expect(charter).toContain('never your own browser (no Playwright/headless), even after a failure');
    expect(charter).toContain('No help/env/path probes first');
    expect(charter).toContain('after failure, run at most one diagnostic');
    expect(charter).toContain('retry only after fixing the cause');
    expect(charter).toContain('A user-requested final export is delivery, outside this preview budget');
  });

  it('switches the handoff rule by execution profile', () => {
    expect(charter).not.toContain('<artifact identifier=');
    const textArtifact = renderSlimCoreCharter('text_artifact');
    expect(textArtifact).toContain('<artifact identifier="kebab-slug" type="text/html"');
    expect(textArtifact).not.toContain('Project files are the source of truth');
  });
});

describe('slim core — moved-out content stays out (ownership)', () => {
  it('carries no task-type router form; od-default SKILL.md owns it', () => {
    const charter = renderSlimCoreCharter('filesystem');
    expect(charter).not.toContain('<question-form id="task-type"');
    // The single source of truth ships with the router skill and reaches the
    // prompt via the `## Active skill` section when od-default is active.
    const routerSkill = readFileSync(
      path.join(repoRoot, 'plugins/_official/scenarios/od-default/SKILL.md'),
      'utf8',
    );
    expect(routerSkill).toContain('<question-form id="task-type"');
    expect(routerSkill).toContain('"HyperFrames"');
    // The charter still defers to skill-owned turn-1 forms generically.
    expect(charter).toContain('If the active skill defines its own turn-1 form');
  });

  it('carries no per-platform delivery contracts; the conditional block owns them', () => {
    const charter = renderSlimCoreCharter('filesystem');
    expect(charter).not.toContain('mobile-ios.html');
    expect(charter).not.toContain('1024/1366/1440/1920');
    expect(PLATFORM_CONTRACTS_BLOCK).toContain('mobile-ios.html');
    expect(PLATFORM_CONTRACTS_BLOCK).toContain('360/390/430/600/768/820/1024/1366/1440/1920px');
  });

  it('carries no deck framework rules; the deck-gated directive owns them', () => {
    const charter = renderSlimCoreCharter('filesystem');
    expect(charter).not.toContain('scale-to-fit');
    expect(charter).not.toContain('data-screen-label');
  });
});

describe('composeSystemPrompt — promptCoreVariant switch', () => {
  const base = {
    metadata: { kind: 'prototype' as const },
    executionProfile: 'filesystem' as const,
  };

  it('defaults to the classic layered stack', () => {
    const out = composeSystemPrompt(base);
    expect(out).toContain('# OD core directives (read first');
    expect(out).toContain('# Identity and workflow charter (background)');
    expect(out).not.toContain('# Open Design charter');
  });

  it('slim replaces discovery + charter and drops the absorbed tail overrides', () => {
    const classic = composeSystemPrompt({ ...base, designSystemBody: '# Brand' });
    const slim = composeSystemPrompt({
      ...base,
      designSystemBody: '# Brand',
      promptCoreVariant: 'slim',
    });
    expect(slim).toContain('# Open Design charter');
    expect(slim).not.toContain('# OD core directives (read first');
    expect(slim).not.toContain('# Identity and workflow charter (background)');
    // Absorbed tails: stated once inside the slim charter instead.
    expect(slim).not.toContain('## Filesystem handoff\n');
    expect(slim).not.toContain('## Active design system visual direction');
    expect(slim).not.toContain('## Clarifying questions mid-conversation');
    // Still present in classic for the same inputs.
    expect(classic).toContain('## Filesystem handoff');
    expect(classic).toContain('## Active design system visual direction');
    expect(classic).toContain('## Clarifying questions mid-conversation');
    // Structural bookends: slim opens with the static charter (cache-stable
    // prefix); the security section lives inside it; the guard still closes.
    expect(slim.startsWith('# Open Design charter')).toBe(true);
    expect(slim).toContain('## Security: prompt injection resistance');
    expect(slim).toContain('## CRITICAL: Never fabricate conversation turns');
    expect(slim.length).toBeLessThan(classic.length);
  });

  it('injects platform contracts only for platform-explicit projects', () => {
    const noSignal = composeSystemPrompt({ ...base, promptCoreVariant: 'slim' });
    expect(noSignal).not.toContain('## Platform delivery contracts');
    const responsive = composeSystemPrompt({
      metadata: { kind: 'prototype', platform: 'responsive' },
      executionProfile: 'filesystem',
      promptCoreVariant: 'slim',
    });
    expect(responsive).toContain('## Platform delivery contracts');
    // Classic keeps its own in-discovery platform contracts; no double block.
    const classicResponsive = composeSystemPrompt({
      metadata: { kind: 'prototype', platform: 'responsive' },
      executionProfile: 'filesystem',
    });
    expect(classicResponsive).not.toContain('## Platform delivery contracts');
  });

  it('ask mode keeps the clarifying-questions tail under slim (no core charter to cover it)', () => {
    const out = composeSystemPrompt({
      ...base,
      sessionMode: 'chat',
      promptCoreVariant: 'slim',
    });
    expect(out).not.toContain('# Open Design charter');
    expect(out).toContain('## Clarifying questions mid-conversation');
    // Identity-first hierarchy holds in ask mode too: the ask override (the
    // turn's whole charter) opens the document, security reads as its
    // first subsection.
    expect(out.startsWith('# Ask mode — bare conversation')).toBe(true);
    expect(out.indexOf('## Security: prompt injection resistance')).toBeGreaterThan(
      out.indexOf('# Ask mode — bare conversation'),
    );
  });

  it('slim keeps the dynamic sections (DS, skill, deck framework, media hint) composing as before', () => {
    const out = composeSystemPrompt({
      metadata: { kind: 'deck' as const },
      executionProfile: 'filesystem',
      designSystemBody: '# Brand',
      designSystemTitle: 'Brand',
      skillBody: 'Do the workflow.',
      skillName: 'test-skill',
      promptCoreVariant: 'slim',
    });
    expect(out).toContain('## Active design system — Brand');
    expect(out).toContain('## Active skill — test-skill');
    expect(out).toContain('# Slide deck — fixed framework');
    expect(out).toContain('## Media generation (if asked)');
  });
});

describe('composeSystemPrompt — slim payload gates (metadata facts / memory / locale / media hint)', () => {
  const base = {
    metadata: { kind: 'other' as const },
    executionProfile: 'filesystem' as const,
    promptCoreVariant: 'slim' as const,
  };

  it('renders the metadata block as a fact sheet under slim', () => {
    const slim = composeSystemPrompt(base);
    expect(slim).toContain('## Project metadata');
    expect(slim).toContain('- **screen files**:');
    expect(slim).toContain('- **product depth**:');
    // Classic doctrine bullets stay out of the facts variant…
    for (const rule of [
      'screen-file-first rule',
      'product-realism rule',
      'visual-system rule',
      'CJX-ready UX rule',
      'interaction-fidelity rule',
      'artifact-output rule',
      'responsive web contract',
    ]) {
      expect(slim, `${rule} must not render under slim`).not.toContain(rule);
    }
    // …and stay present in classic for the same inputs.
    const classic = composeSystemPrompt({ ...base, promptCoreVariant: undefined });
    expect(classic).toContain('screen-file-first rule');
    expect(classic).toContain('product-realism rule');
  });

  it('keeps media-kind metadata facts intact under slim', () => {
    const slim = composeSystemPrompt({
      metadata: { kind: 'image', imageModel: 'gpt-image-2', imageAspect: '1:1' },
      executionProfile: 'filesystem',
      promptCoreVariant: 'slim',
    });
    expect(slim).toContain('- **imageModel**: gpt-image-2');
    expect(slim).toContain('- **aspectRatio**: 1:1');
  });

  it('compresses the memory scaffolding under slim while keeping headings and card shapes', () => {
    const memoryInput = {
      ...base,
      memoryBody: '### Profile\n\nDense layouts.\n\n### Verified rules\n\n- No pure black.',
    };
    const slim = composeSystemPrompt(memoryInput);
    const classic = composeSystemPrompt({ ...memoryInput, promptCoreVariant: undefined });
    for (const marker of [
      '## Personal memory (auto-extracted from past chats)',
      '## Intent gateway — turn short asks into a brief',
      '## Self-verify against your verified rules',
      '## Propose new verified rules from corrections',
      '<od-card type="task-brief">',
      '<od-card type="memory-applied">',
      '<od-card type="verify-scorecard">',
      '<od-card type="rule-proposal">',
      '"status": "pass|partial|fail"',
    ]) {
      expect(slim, `slim memory must keep ${marker}`).toContain(marker);
      expect(classic, `classic memory must keep ${marker}`).toContain(marker);
    }
    const sectionSpan = (out: string) =>
      out.length - out.indexOf('## Personal memory');
    expect(sectionSpan(slim)).toBeLessThan(sectionSpan(classic));
  });

  it('drops the zh-CN quick-brief sample copy under slim but keeps the locale rule', () => {
    const slim = composeSystemPrompt({ ...base, locale: 'zh-CN' });
    expect(slim).toContain('# UI locale override');
    expect(slim).not.toContain('快速简报 — 30 秒');
    const classic = composeSystemPrompt({ ...base, locale: 'zh-CN', promptCoreVariant: undefined });
    expect(classic).toContain('快速简报 — 30 秒');
  });

  it('gates the media dispatch hint on the media-intent signal', () => {
    expect(composeSystemPrompt(base)).toContain('## Media generation (if asked)');
    expect(
      composeSystemPrompt({ ...base, mediaHintSignal: false }),
    ).not.toContain('## Media generation (if asked)');
    // Media surfaces keep the full contract regardless of the signal.
    const media = composeSystemPrompt({
      metadata: { kind: 'image' },
      executionProfile: 'filesystem',
      mediaHintSignal: false,
    });
    expect(media).toContain('## Media generation contract');
  });
});

describe('detectMediaIntentSignal', () => {
  it('fires on media vocabulary across languages and stays quiet otherwise', async () => {
    const { detectMediaIntentSignal } = await import('../../src/prompts/system.js');
    expect(detectMediaIntentSignal('generate a hero image for the landing')).toBe(true);
    expect(detectMediaIntentSignal('帮我配一段背景音乐')).toBe(true);
    expect(detectMediaIntentSignal('给产品页生成图')).toBe(true);
    expect(detectMediaIntentSignal('build a pricing page with three tiers')).toBe(false);
    expect(detectMediaIntentSignal('做一个电商后台')).toBe(false);
    expect(detectMediaIntentSignal('tweak the nav', '## user\n加个宣传视频')).toBe(true);
  });
});

describe('slim core — direction library becomes a pull layer', () => {
  it('slim composes the compact index; classic keeps the full inline library', async () => {
    const input = { metadata: { kind: 'prototype' as const }, executionProfile: 'filesystem' as const };
    const slim = composeSystemPrompt({ ...input, promptCoreVariant: 'slim' });
    expect(slim).toContain('## Direction library — index (pull the chosen one on demand)');
    expect(slim).toContain('tools directions --id <id>');
    expect(slim).toContain('do not probe CLI help or alternate paths first');
    expect(slim).toContain('retry only after materially changing the fix or input');
    expect(slim).toContain('- `editorial-monocle` — Editorial — Monocle / FT magazine');
    // No inline palette data under slim — that's the pull payload.
    expect(slim).not.toContain('**Palette (drop into `:root`):**');
    const classic = composeSystemPrompt(input);
    expect(classic).toContain('## Direction library — bind into `:root`');
    expect(classic).toContain('**Palette (drop into `:root`):**');
    expect(classic).not.toContain('## Direction library — index');
    // An active design system suppresses both variants.
    const withDs = composeSystemPrompt({
      ...input,
      promptCoreVariant: 'slim',
      designSystemBody: '# Brand',
    });
    expect(withDs).not.toContain('## Direction library');
  });

  it('formatDirectionSpecText resolves by id or label and returns the bindable spec', async () => {
    const { formatDirectionSpecText, DESIGN_DIRECTIONS } = await import(
      '../../src/prompts/directions.js'
    );
    const byId = formatDirectionSpecText('editorial-monocle');
    expect(byId).toContain('--font-display:');
    expect(byId).toContain('**Posture:**');
    const first = DESIGN_DIRECTIONS[0]!;
    expect(formatDirectionSpecText(first.label)).toContain(`(id: ${first.id})`);
    expect(formatDirectionSpecText('no-such-direction')).toBeNull();
  });

  it('keeps the index an order of magnitude smaller than the full library', async () => {
    const { renderDirectionIndexBlock, renderDirectionSpecBlock } = await import(
      '../../src/prompts/directions.js'
    );
    expect(renderDirectionIndexBlock().length).toBeLessThan(2000);
    expect(renderDirectionSpecBlock().length).toBeGreaterThan(5000);
  });
});

describe('slim core — regression-audit fixes vs classic', () => {
  it('text_artifact runs get the full inline direction library, not the un-pullable index', () => {
    const out = composeSystemPrompt({
      metadata: { kind: 'prototype' },
      executionProfile: 'text_artifact',
      promptCoreVariant: 'slim',
    });
    // No tools on this profile: an index telling the model to run the `od`
    // CLI is a promise it cannot keep. Classic inlined the palettes; slim
    // must too on this profile.
    expect(out).toContain('## Direction library — bind into `:root`');
    expect(out).toContain('**Palette (drop into `:root`):**');
    expect(out).not.toContain('## Direction library — index');
  });

  it('plain-stream runs compose the API-mode override BEFORE the charter (literal scope intact)', () => {
    const out = composeSystemPrompt({
      metadata: { kind: 'prototype' },
      streamFormat: 'plain',
      promptCoreVariant: 'slim',
    });
    expect(out.startsWith('# API mode — no tools available')).toBe(true);
    const overrideAt = out.indexOf('# API mode — no tools available');
    const charterAt = out.indexOf('# Open Design charter');
    expect(charterAt).toBeGreaterThan(overrideAt);
    // Composed exactly once — the head placement replaces the later push.
    expect(out.indexOf('# API mode — no tools available')).toBe(
      out.lastIndexOf('# API mode — no tools available'),
    );
  });

  it('platform contracts also gate on the conversation-text platform signal', () => {
    const base = {
      metadata: { kind: 'prototype' as const },
      executionProfile: 'filesystem' as const,
      promptCoreVariant: 'slim' as const,
    };
    expect(composeSystemPrompt(base)).not.toContain('## Platform delivery contracts');
    const signalled = composeSystemPrompt({ ...base, platformHintSignal: true });
    expect(signalled).toContain('## Platform delivery contracts');
    // Signal-only trigger is turn-variable: the block must land in the
    // deferred suffix (after the project-stable metadata block), so a
    // mid-session flip only invalidates the cached tail.
    expect(signalled.indexOf('\n## Platform delivery contracts')).toBeGreaterThan(
      signalled.indexOf('\n## Project metadata'),
    );
    // Metadata trigger is project-stable: the block stays in the early zone.
    const metadataGated = composeSystemPrompt({
      metadata: { kind: 'prototype', platform: 'responsive' },
      executionProfile: 'filesystem',
      promptCoreVariant: 'slim',
    });
    expect(metadataGated.indexOf('\n## Platform delivery contracts')).toBeLessThan(
      metadataGated.indexOf('\n## Project metadata'),
    );
  });

  it('ask mode on a plain stream leads with the API override (classic authority order)', () => {
    const out = composeSystemPrompt({
      metadata: { kind: 'prototype' },
      sessionMode: 'chat',
      streamFormat: 'plain',
      promptCoreVariant: 'slim',
    });
    expect(out.startsWith('# API mode — no tools available')).toBe(true);
    expect(out.indexOf('# Ask mode — bare conversation')).toBeGreaterThan(0);
    expect(out.indexOf('# API mode — no tools available')).toBe(
      out.lastIndexOf('# API mode — no tools available'),
    );
  });

  it('keeps the plan step agent-agnostic — no hardcoded TodoWrite in the charter', () => {
    // Open Design drives many code agents (codex, opencode, Qwen CLI, ACP
    // family) that have no TodoWrite tool. The charter must NOT hardcode it,
    // or the plan step is dead for ~2/3 of production traffic. Freeze the
    // generic wording and the anti-hallucination guard.
    const charter = renderSlimCoreCharter('filesystem');
    expect(charter).not.toContain('TodoWrite');
    expect(charter).toContain('structured plan / todo / task-list tool');
    expect(charter).toContain("never call a tool you don't have");
  });

  it('injects the concrete TodoWrite note only for Claude-family runs', () => {
    const base = { metadata: { kind: 'other' as const },
      executionProfile: 'filesystem' as const, promptCoreVariant: 'slim' as const };
    // Claude family (claude/codebuddy/amp) → named tool + live-card benefit.
    expect(composeSystemPrompt({ ...base, streamFormat: 'claude-stream-json' }))
      .toContain('Your plan tool is `TodoWrite`');
    // codex / opencode (json-event-stream) → generic charter only, no note.
    expect(composeSystemPrompt({ ...base, streamFormat: 'json-event-stream' }))
      .not.toContain('Your plan tool is');
  });

  it('carries the multi-turn edit-adherence invariants (DS binding + locked constraints)', () => {
    // Production feedback: DS tokens and explicit user constraints drift during
    // multi-turn edits. The charter must state, in the edit path, that (a) the
    // design system binds on EVERY turn (not just first build) and (b) locked
    // constraints persist across later turns. Freeze both so a later
    // compression pass cannot silently drop them.
    const charter = renderSlimCoreCharter('filesystem');
    expect(charter).toContain('### Editing an existing artifact');
    expect(charter).toContain('The design system stays bound on every turn');
    expect(charter).toContain('Locked constraints persist');
    // An edit changes only what was named — the anti-drift core.
    expect(charter).toContain('do exactly what was asked, in full');
    expect(charter).toContain('Never report a change you did not make');
  });

  it('keeps the restored classic product rules in the charter', () => {
    const charter = renderSlimCoreCharter('filesystem');
    // Never hot-link user-attached images (product constraint, not filler).
    expect(charter).toContain('Never hot-link user-attached images');
    // Skill/DS precedence is per-domain, not a strict total order.
    expect(charter).toContain('each highest in its own domain');
    // Expressive form controls + modern CSS encouragement survived.
    expect(charter).toContain('most expressive control');
    expect(charter).toContain('**Modern CSS welcome**');
  });
});

describe('detectPlatformIntentSignal', () => {
  it('fires on platform vocabulary across languages and stays quiet otherwise', async () => {
    const { detectPlatformIntentSignal } = await import('../../src/prompts/system.js');
    expect(detectPlatformIntentSignal('make me an iOS app prototype')).toBe(true);
    expect(detectPlatformIntentSignal('帮我做一个安卓端的应用原型')).toBe(true);
    expect(detectPlatformIntentSignal('需要响应式的落地页')).toBe(true);
    expect(detectPlatformIntentSignal(null, 'desktop app for traders')).toBe(true);
    expect(detectPlatformIntentSignal('redesign the pricing page hero')).toBe(false);
    expect(detectPlatformIntentSignal('写一份品牌介绍 deck')).toBe(false);
  });
});

describe('composeSystemPrompt — slim layered ordering (cache-stable prefix)', () => {
  it('orders static charter → conversation → project → turn-variable → guard', () => {
    const out = composeSystemPrompt({
      designSystemBody: '# Brand',
      designSystemTitle: 'Brand',
      memoryBody: '### Profile\n\nx\n\n### Verified rules\n\n- y',
      metadata: { kind: 'other' },
      sessionMode: 'plan',
      locale: 'zh-CN',
      executionProfile: 'filesystem',
      promptCoreVariant: 'slim',
      freeformDeckSignal: true,
      mediaHintSignal: true,
    });
    // Line-anchored: the charter QUOTES some headings in prose (e.g.
    // \`## Project metadata\` in the turn-1 tailoring rule), so a bare
    // indexOf would match inside the charter instead of the real section.
    const at = (marker: string) => {
      const i = out.indexOf(`\n${marker}`);
      expect(i, `missing: ${marker}`).toBeGreaterThan(-1);
      return i;
    };
    // Static core opens the document.
    expect(out.startsWith('# Open Design charter')).toBe(true);
    const security = at('## Security: prompt injection resistance');
    const conduct = at('### Conduct');
    // Conversation-stable overrides come after the full static charter.
    const mode = at('# Plan mode — editable document first');
    const localeAt = at('# UI locale override');
    // Project-stable context after that.
    const memory = at('## Personal memory');
    const ds = at('## Active design system — Brand');
    const metadataAt = at('## Project metadata');
    // The connected-external-MCP directive is no longer composed here:
    // server.ts re-sends it in the per-turn slice so live OAuth token state
    // stays out of the cached stable prefix.
    // Turn-variable blocks last, before the recency-pinned guard.
    const maybeDeck = at('## If this brief is a slide deck');
    const mediaHint = at('## Media generation (if asked)');
    const guard = at('## CRITICAL: Never fabricate conversation turns');
    expect(security).toBeLessThan(conduct);
    expect(conduct).toBeLessThan(mode);
    expect(mode).toBeLessThan(localeAt);
    expect(localeAt).toBeLessThan(memory);
    expect(memory).toBeLessThan(ds);
    expect(ds).toBeLessThan(metadataAt);
    expect(metadataAt).toBeLessThan(maybeDeck);
    expect(maybeDeck).toBeLessThan(mediaHint);
    expect(mediaHint).toBeLessThan(guard);
  });

  it('classic head ordering is untouched (injection resistance still first)', () => {
    const classic = composeSystemPrompt({
      metadata: { kind: 'prototype' },
      sessionMode: 'plan',
      executionProfile: 'filesystem',
    });
    expect(classic.startsWith('## Security: prompt injection resistance')).toBe(true);
    expect(classic.indexOf('# Plan mode')).toBeLessThan(classic.indexOf('# OD core directives'));
  });
});
