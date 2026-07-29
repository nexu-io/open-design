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
// submit the form unchanged (schema rule + updated description copy).
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
// Bumped from 17_408 for the query-first discovery decision rule and the
// reviewed design-quality additions (CTA economy, state contrast, orphan
// prevention). This change intentionally prioritizes the new charter behavior
// over the previous size target; the guard still prevents accidental drift.
// Bumped to 22KiB after making source authority explicit in both active-DS
// and no-DS branches and preserving product realism without expanding the
// requested screen/module scope. The prior charter already exceeded 21KiB;
// this keeps a hard guard without compressing away the ambiguity fix.
const SLIM_CORE_BYTE_BUDGET = 22_528;

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
    expect(charter).toContain('opening `question-form` element');
    expect(charter).toContain('otherwise use `discovery`');
    expect(charter).toContain('</question-form>');
    expect(charter).not.toContain('id="<workflow-specific-id>"');
    // Branch values later rules match on — labels may localize, values may not.
    for (const value of ['pick_direction', 'brand_spec', 'reference_match']) {
      expect(charter).toContain(`\`${value}\``);
    }
    // The full control vocabulary the Questions tab renders.
    for (const control of ['direction-cards', 'datetime-local', 'switch']) {
      expect(charter).toContain(control);
    }
    expect(charter).toContain('allowCustom');
    expect(charter).toContain(
      'Use `required: true` only when the workflow cannot proceed meaningfully without the answer',
    );
  });

  it('keeps the translated design role concise and outcome-oriented', () => {
    for (const marker of [
      'senior digital product designer working with the user as your manager',
      'distinctive, highly polished work with mature judgment and strong fundamentals',
      'Every decision must serve the task, communication, brand, and usability',
      'Match your approach to the task',
    ]) {
      expect(charter).toContain(marker);
    }
    expect(charter).not.toMatch(/[\u3400-\u9fff]/);
  });

  it('asks only for query-derived material gaps', () => {
    expect(charter).toContain('If no unresolved material decision remains, skip the form');
    expect(charter).toContain('Every question must map to an unresolved material decision');
    expect(charter).toContain('Never emit a form merely because this is turn 1');
    expect(charter).toContain('skip the form for a clear local revision');
    expect(charter).toContain('If a local revision is materially ambiguous');
    expect(charter).toContain('minimally inspect relevant user-provided files, screenshots, or URLs');
    expect(charter).not.toContain('Do not read files, call tools, plan, or build before emitting it');
    expect(charter).toContain('never treat a fixed question bank as a checklist');
    expect(charter).not.toContain('Candidate fields, only when unresolved and material');
    expect(charter).not.toContain('Which brand source should I follow?');
    expect(charter).not.toContain('Prefilled for you — send as is');
    expect(charter).not.toContain('A rich brief still gets the form');
    expect(charter).not.toContain('that one always gets the form');
  });

  it('keeps ordinary references scoped when no design system is active', () => {
    expect(charter).toContain(
      'With no active design system, it owns visual direction only when it clearly supplies one',
    );
    expect(charter).toContain(
      'otherwise it constrains only requested aspects and the remaining direction comes from the Direction library',
    );
    expect(charter).not.toContain('If it owns visual direction or no design system exists');
  });

  it('defines clarification as a binding host gate above active-skill workflow', () => {
    expect(charter).toContain('Binding host/runtime contracts');
    expect(charter).toContain('clarification gate');
    expect(charter).toContain('cannot be overridden by an active skill');
  });

  it('requires a recommended default prefill on every form question', () => {
    expect(charter).toContain('honest query-derived `default`');
    expect(charter).toContain('unchanged submission is useful');
    expect(charter).toContain('place it before `options`');
  });

  it('localizes like a native and declares the form language', () => {
    expect(charter).toContain('write as a native speaker would');
    expect(charter).toContain('set `lang` to the matching BCP-47 tag');
    expect(charter).toContain('Keep machine ids, types, and option values in English');
  });

  it('delegates the Other escape hatch to the host and caps forms at 5 questions', () => {
    // The web renderer injects a localized "Other" chip (expanding into the
    // type-in field) on every finite-choice question, so model-authored
    // catch-all options would render as duplicates. And discovery forms stay
    // short: a hard 5-question cap with an explicit count-then-cut step.
    expect(charter).toContain('The host adds localized "Other"');
    expect(charter).not.toContain("Other — I'll describe");
    expect(charter).toContain('at most 5');
    expect(charter).toContain('Count before emitting');
    // Fixed field menus and prescriptive sequences imply unnecessary questions
    // and must not coexist with the query-derived gate.
    expect(charter).not.toContain('fill AT MOST 3 more from this menu');
    expect(charter).not.toContain('Candidate fields');
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
    expect(charter).toContain("runtime's native image generation");
    expect(charter).toContain('use web search / fetch');
    expect(charter).toContain('reference it by relative path — never hot-link it');
  });

  it('keeps the inspect/tweaks contracts intact', () => {
    expect(charter).toContain('data-od-id="kebab-case-id"');
    expect(charter).toContain('/*EDITMODE-BEGIN*/');
    expect(charter).toContain('/*EDITMODE-END*/');
    expect(charter).toContain('react@18.3.1');
    expect(charter).toContain('babel/standalone@7.29.0');
  });

  it('states the verification budget once and without a re-score loop', () => {
    expect(charter.match(/at most one successful preview/g)).toHaveLength(1);
    expect(charter).not.toContain('One render is the whole budget');
    expect(charter).not.toContain('Two passes is normal');
  });

  it('makes the tool-economy budget operational', () => {
    for (const marker of [
      'Use the included DESIGN.md',
      'read disk only for a named, unincluded project or skill resource',
      'Read each required seed/reference once',
      'reuse results',
      'batch independent reads',
      'inspect only the ranges needed for project edits',
      'After a failure, change the input, implementation, or diagnostic before retrying',
      'one batched check of changed ranges',
      'do not reopen unrelated ranges',
    ]) {
      expect(charter).toContain(marker);
    }
    expect(charter).not.toContain('Re-read the current file');
    expect(charter).not.toContain('Open the file you wrote');
  });

  it('keeps the seed-copy rule the tool-economy rewrite must not drop', () => {
    expect(charter).toContain('Copy required seeds instead of rebuilding their layouts');
    expect(charter).toContain('preserve skill-defined template/data bindings');
  });

  it('keeps metadata in flow and makes intentional media overlays safe', () => {
    // Metadata that is accidentally positioned over a later media sibling can
    // be hidden by normal paint order. Keep it in flow unless the overlap is
    // intentional, then make the media wrapper own the stacking contract.
    expect(charter).toContain('**Media and metadata placement.**');
    expect(charter).toContain('Keep metadata in normal flow beside or above media');
    expect(charter).toContain('overlay must live inside the media container');
    expect(charter).toContain('fully within one safe corner');
    expect(charter).toContain('explicit stacking');
    expect(charter).toContain('avoid the focal subject');
    expect(charter).toContain('If no corner is safe, place it beside the media');
  });

  it('makes positioned-element layout checks operational across view modes', () => {
    expect(charter).toContain('all absolute/fixed elements in each affected layout or view mode');
    expect(charter).toContain('correct containing block, reserved space, stacking order');
    expect(charter).toContain('clipping ancestor');
  });

  it('separates the optional preview budget from final delivery exports', () => {
    expect(charter).toContain('single optional preview');
    expect(charter).toContain('`"$OD_NODE_BIN" "$OD_BIN" export <file>');
    expect(charter).toContain('Never use your own browser or Playwright/headless');
    expect(charter).toContain(
      'after a failed invocation, make one targeted diagnosis/fix and retry once',
    );
    expect(charter).toContain('A user-requested final export is delivery, not preview');
    expect(charter).toContain('Deck verification is owned by the deck contract');
  });

  it('switches the handoff rule by execution profile', () => {
    expect(charter).not.toContain('<artifact identifier=');
    const textArtifact = renderSlimCoreCharter('text_artifact');
    expect(textArtifact).toContain('<artifact identifier="kebab-slug" type="text/html"');
    expect(textArtifact).not.toContain('Project files are the source of truth');
    for (const filesystemOnly of [
      'Write `brand-spec.md`',
      '`"$OD_NODE_BIN" "$OD_BIN" export <file>`',
      'media generate --surface image',
      'use web search / fetch',
      'copy them into the project',
      'read disk only for a named, unincluded project or skill resource',
    ]) {
      expect(textArtifact, `text_artifact must omit ${filesystemOnly}`).not.toContain(filesystemOnly);
    }
    expect(textArtifact).toContain('Build an internal brand spec');
    expect(textArtifact).toContain('Do not claim to have written `brand-spec.md`');
    expect(textArtifact).toContain('Do not claim to read disk');
  });

  it('keeps one canonical file policy without automatic versions or a hard line cap', () => {
    expect(charter).toContain('When a delivery contract requires multiple');
    expect(charter).toContain('edit canonical files in place');
    expect(charter).toContain('create a copy or version only when the user asks');
    expect(charter).toContain('split a standalone artifact');
    expect(charter).toContain('Never use `scrollIntoView()`');
    expect(charter).not.toContain('copy to `-v2`');
    expect(charter).not.toContain('≤ ~1000 lines per file');
  });

  it('keeps craft adaptable to semantic colors and flat design systems', () => {
    expect(charter).toContain('Use one dominant accent');
    expect(charter).toContain('secondary and status colours need distinct semantics');
    expect(charter).toContain('clear affordance appropriate to the direction');
    expect(charter).toContain('Never add elevation when the active design system is intentionally flat');
    expect(charter).not.toContain('One accent, at most twice per screen');
    expect(charter).not.toContain('elevation, not a flat fill');
  });

  it('raises quality without forcing a preamble or expanding scope', () => {
    expect(charter).toContain('Keep design-system reasoning internal unless a user decision depends on it');
    expect(charter).toContain('Raise execution quality without broadening the requested scope');
    expect(charter).not.toContain('state your system (background, type, layout) once before building');
    expect(charter).not.toContain('reach one notch more ambitious than asked');
  });
});

describe('slim core — moved-out content stays out (ownership)', () => {
  it('carries no task-type router form; od-default routes from the query first', () => {
    const charter = renderSlimCoreCharter('filesystem');
    expect(charter).not.toContain('<question-form id="task-type"');
    // The router skill reaches the prompt through the `## Active skill`
    // section, but it must not force a fixed task-type questionnaire when the
    // query already identifies the route.
    const routerSkill = readFileSync(
      path.join(repoRoot, 'plugins/_official/scenarios/od-default/SKILL.md'),
      'utf8',
    );
    expect(routerSkill).not.toContain('Your first response must be one short sentence plus this structured form');
    expect(routerSkill).toContain('Infer the task type from the current user query first');
    expect(routerSkill).toMatch(/ask only for\s+the\s+unresolved decisions/);
    expect(charter).toContain("An active skill's form ids, machine values, and routing rules");

    const discoveryAtom = readFileSync(
      path.join(repoRoot, 'plugins/_official/atoms/discovery-question-form/SKILL.md'),
      'utf8',
    );
    expect(discoveryAtom).not.toContain('## When to fire');
    expect(discoveryAtom).toContain('smallest query-derived');
    expect(discoveryAtom).toContain('cannot make discovery mandatory');
    expect(routerSkill).toContain('landing page, marketing site, brand website, or editorial page');
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

  it('defaults to slim and keeps classic as an explicit Design-only rollback', () => {
    const out = composeSystemPrompt(base);
    const classic = composeSystemPrompt({ ...base, promptCoreVariant: 'classic' });

    expect(out).toContain('# Open Design charter');
    expect(out).not.toContain('# OD core directives (read first');
    expect(classic).toContain('# OD core directives (read first');
    expect(classic).toContain('# Identity and workflow charter (background)');
    expect(classic).not.toContain('# Open Design charter');
  });

  it('does not let the classic Design rollback re-enable old Ask, Plan, or media stacks', () => {
    const ask = composeSystemPrompt({
      ...base,
      sessionMode: 'chat',
      promptCoreVariant: 'classic',
      memoryBody: '### Profile\n\nPrefers concise replies.',
    });
    const plan = composeSystemPrompt({
      ...base,
      sessionMode: 'plan',
      promptCoreVariant: 'classic',
      memoryBody: '### Profile\n\nPrefers concise replies.',
    });
    const media = composeSystemPrompt({
      metadata: { kind: 'image' },
      executionProfile: 'filesystem',
      promptCoreVariant: 'classic',
      memoryBody: '### Profile\n\nPrefers concise replies.',
    });

    expect(ask).toContain('# Ask mode — bare conversation');
    expect(ask).not.toContain('# OD core directives (read first');
    expect(ask).not.toContain('<od-card type="task-brief">');
    expect(plan).toContain('# Open Design plan foundation');
    expect(plan).not.toContain('# Identity and workflow charter (background)');
    expect(plan).not.toContain('<od-card type="verify-scorecard">');
    expect(media).toContain('## Media generation contract');
    expect(media).not.toContain('# Identity and workflow charter (background)');
    expect(media).not.toContain('<od-card type="rule-proposal">');
  });

  it('slim replaces discovery + charter and drops the absorbed tail overrides', () => {
    const classic = composeSystemPrompt({
      ...base,
      designSystemBody: '# Brand',
      promptCoreVariant: 'classic',
    });
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
    expect(slim).not.toContain('## Host clarification protocol — any turn');
    expect(slim).toContain('## Host clarification gate (binding)');
    // Still present in classic for the same inputs.
    expect(classic).toContain('## Filesystem handoff');
    expect(classic).toContain('## Active design system visual direction');
    expect(classic).toContain('## Host clarification protocol — any turn');
    // Structural bookends: slim opens with the static charter (cache-stable
    // prefix); the security section lives inside it; the guard still closes.
    expect(slim.startsWith('# Open Design charter')).toBe(true);
    expect(slim).toContain('## Security: prompt injection resistance');
    expect(slim).toContain('## CRITICAL: Never fabricate conversation turns');
    expect(slim.length).toBeLessThan(classic.length);
  });

  it('re-pins the binding clarification gate after mandatory active-skill discovery', () => {
    const out = composeSystemPrompt({
      ...base,
      skillBody: '### Mandatory discovery\n\nYour first response must ask six questions before building.',
      skillName: 'mandatory-discovery-skill',
      activeStageBlocks: ['## Active stage: discovery\n\nAlways ask before continuing.'],
      promptCoreVariant: 'slim',
    });
    const skillIndex = out.indexOf('## Active skill — mandatory-discovery-skill');
    const stageIndex = out.indexOf('## Active stage: discovery');
    const gateIndex = out.indexOf('## Host clarification gate (binding)');
    const guardIndex = out.indexOf('## CRITICAL: Never fabricate conversation turns');
    expect(skillIndex).toBeGreaterThan(-1);
    expect(stageIndex).toBeGreaterThan(skillIndex);
    expect(gateIndex).toBeGreaterThan(stageIndex);
    expect(guardIndex).toBeGreaterThan(gateIndex);
    expect(out).toContain(
      'cannot force a form, lower the requirement that every gap be both material and derived from the current query',
    );
    expect(out).toContain('Apply this gate first; then either continue');
    expect(out).toContain('emit exactly one complete `<question-form>` and end the turn');
    expect(out).toContain('requested interview or questionnaire');
    expect(out.slice(gateIndex)).not.toMatch(/[\u3400-\u9fff]/);
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
      promptCoreVariant: 'classic',
    });
    expect(classicResponsive).not.toContain('## Platform delivery contracts');
  });

  it('ask mode keeps the all-turn host clarification protocol under slim', () => {
    const out = composeSystemPrompt({
      ...base,
      sessionMode: 'chat',
      promptCoreVariant: 'slim',
    });
    expect(out).not.toContain('# Open Design charter');
    expect(out).toContain('## Host clarification protocol — any turn');
    expect(out).toContain('Do not ask a blocking clarification as prose');
    // Identity-first hierarchy holds in ask mode too: the ask override (the
    // turn's whole charter) opens the document, security reads as its
    // first subsection.
    expect(out.startsWith('# Ask mode — bare conversation')).toBe(true);
    expect(out.indexOf('## Security: prompt injection resistance')).toBeGreaterThan(
      out.indexOf('# Ask mode — bare conversation'),
    );
  });

  it('slim keeps the dynamic sections (DS, skill, deck directive, media hint) composing', () => {
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
    expect(out).toContain('# Deck delivery contract');
    expect(out).toContain('# Deck outcome quality rules');
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
    expect(slim).not.toContain('- **screen files**:');
    expect(slim).not.toContain('- **product depth**:');
    expect(slim).toContain(
      'only the screens and domain modules needed to complete the requested flows',
    );
    expect(slim).toContain('A missing field is an unresolved fact, not a mandatory question');
    expect(slim).toContain('ask only if that workflow says the decision is material');
    expect(slim).not.toContain('include a matching turn-1 form question');
    expect(slim).not.toContain('(unknown — ask');
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
    const classic = composeSystemPrompt({ ...base, promptCoreVariant: 'classic' });
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

  it('uses media defaults without metadata forcing a question and keeps the form protocol on turn 1', () => {
    const slim = composeSystemPrompt({
      metadata: { kind: 'image' },
      skillMode: 'image',
      executionProfile: 'filesystem',
      promptCoreVariant: 'slim',
    });
    expect(slim).toContain('- **imageModel**: (unknown)');
    expect(slim).toContain('- **aspectRatio**: (unknown)');
    expect(slim).not.toContain('(unknown — ask');
    expect(slim).toMatch(
      /Do not ask about model or aspect when\s+these defaults resolve the gap/,
    );
    expect(slim).toContain('## Host clarification protocol — any turn');
    expect(slim).toContain('It applies on turn 1 and every later turn');
  });

  it('compresses the memory scaffolding under slim while keeping headings and card shapes', () => {
    const memoryInput = {
      ...base,
      memoryBody: '### Profile\n\nDense layouts.\n\n### Verified rules\n\n- No pure black.',
    };
    const slim = composeSystemPrompt(memoryInput);
    const classic = composeSystemPrompt({ ...memoryInput, promptCoreVariant: 'classic' });
    for (const marker of [
      '## Personal memory (auto-extracted from past chats)',
      '## Intent gateway — turn short asks into a brief',
      '## Self-verify against your verified rules',
      '## Propose new verified rules from corrections',
      '<od-card type="task-brief">',
      '<od-card type="verify-scorecard">',
      '<od-card type="rule-proposal">',
      '"status": "pass|partial|fail"',
    ]) {
      expect(slim, `slim memory must keep ${marker}`).toContain(marker);
      expect(classic, `classic memory must keep ${marker}`).toContain(marker);
    }
    expect(slim).not.toContain('<od-card type="memory-applied">');
    expect(slim).toContain('The current turn and locked conversation decisions override it');
    expect(slim).toContain('request would otherwise need material clarification');
    expect(slim).toContain('The host validates rule coverage');
    expect(slim).toContain('Skip only when no artifact changed');
    const sectionSpan = (out: string) =>
      out.length - out.indexOf('## Personal memory');
    expect(sectionSpan(slim)).toBeLessThan(sectionSpan(classic));
  });

  it('drops the zh-CN quick-brief sample copy under slim but keeps the locale rule', () => {
    const slim = composeSystemPrompt({ ...base, locale: 'zh-CN' });
    expect(slim).toContain('# UI locale override');
    expect(slim).not.toContain('快速简报 — 30 秒');
    const classic = composeSystemPrompt({ ...base, locale: 'zh-CN', promptCoreVariant: 'classic' });
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
    const classic = composeSystemPrompt({ ...input, promptCoreVariant: 'classic' });
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
    expect(out.startsWith('# Plain API execution profile — no tools (binding)')).toBe(true);
    const overrideAt = out.indexOf('# Plain API execution profile — no tools (binding)');
    const charterAt = out.indexOf('# Open Design charter');
    expect(charterAt).toBeGreaterThan(overrideAt);
    // Composed exactly once — the head placement replaces the later push.
    expect(out.indexOf('# Plain API execution profile — no tools (binding)')).toBe(
      out.lastIndexOf('# Plain API execution profile — no tools (binding)'),
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
    expect(out.startsWith('# Plain API execution profile — no tools (binding)')).toBe(true);
    expect(out.indexOf('# Ask mode — bare conversation')).toBeGreaterThan(0);
    expect(out.indexOf('# Plain API execution profile — no tools (binding)')).toBe(
      out.lastIndexOf('# Plain API execution profile — no tools (binding)'),
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
    expect(charter).toContain('exactly what the user asked, in full');
    expect(charter).toContain('Never report a change you did not make');
  });

  it('keeps the restored classic product rules in the charter', () => {
    const charter = renderSlimCoreCharter('filesystem');
    // Never hot-link user-attached images (product constraint, not filler).
    expect(charter).toContain('Never hot-link user-attached images');
    // Skill/DS precedence is per-domain, not a strict total order.
    expect(charter).toContain('each highest in its own domain');
    // Expressive form controls survive; obvious platform capability hints do not
    // need dedicated prompt space.
    expect(charter).toContain('narrowest suitable type');
    expect(charter).not.toContain('**Modern CSS welcome**');
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
    const localeAt = at('# UI locale override');
    // Project-stable context after that.
    const memory = at('## Personal memory');
    const ds = at('## Active design system — Brand');
    const metadataAt = at('## Project metadata');
    // The connected-external-MCP directive is no longer composed here:
    // server.ts re-sends it in the per-turn slice so live OAuth token state
    // stays out of the cached stable prefix.
    // Turn-variable blocks last, before the recency-pinned guard.
    const deck = at('# Deck delivery contract');
    const mediaHint = at('## Media generation (if asked)');
    const guard = at('## CRITICAL: Never fabricate conversation turns');
    expect(security).toBeLessThan(conduct);
    expect(conduct).toBeLessThan(localeAt);
    expect(localeAt).toBeLessThan(memory);
    expect(memory).toBeLessThan(ds);
    expect(ds).toBeLessThan(metadataAt);
    expect(metadataAt).toBeLessThan(deck);
    expect(deck).toBeLessThan(mediaHint);
    expect(mediaHint).toBeLessThan(guard);
  });

  it('keeps classic Design head ordering untouched', () => {
    const classic = composeSystemPrompt({
      metadata: { kind: 'prototype' },
      executionProfile: 'filesystem',
      promptCoreVariant: 'classic',
    });
    expect(classic.startsWith('## Security: prompt injection resistance')).toBe(true);
    expect(classic).toContain('# OD core directives');
  });
});
