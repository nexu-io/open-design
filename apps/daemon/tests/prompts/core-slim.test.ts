import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';
import { renderActiveStageBlock } from '@open-design/contracts';

import {
  PLATFORM_CONTRACTS_BLOCK,
  renderSlimCoreCharter,
  SLIM_V2_ROLE_BOUNDARY_GUARD,
} from '../../src/prompts/core-slim.js';
import { composeSystemPrompt } from '../../src/prompts/system.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../../..');

/**
 * Guards for the SP v2.0 slim core charter.
 *
 * 1. Byte budget — the complete translated charter has an explicit ceiling.
 * 2. Protocol markers — a fixed set of strings are parsed by the web client
 *    or matched by later prompt rules. Frozen API; must survive copyedits.
 * 3. Ownership — content deliberately moved OUT of the charter (task-type
 *    router form, platform contracts) must stay out, and keep living where
 *    it moved to.
 */

// SP v2.0 is a complete, non-compressed translation of the approved Chinese
// charter. Keep modest headroom for profile-specific handoff wording.
const SLIM_CORE_BYTE_BUDGET = 25_600;

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

describe('renderSlimCoreCharter — SP v2.0 translation', () => {
  const fullCharter = `${renderSlimCoreCharter('filesystem')}\n\n${SLIM_V2_ROLE_BOUNDARY_GUARD}`;

  it('preserves the complete 42-heading structure in English', () => {
    expect(fullCharter.match(/^#{1,6} .+$/gm)).toHaveLength(42);
    expect(fullCharter).not.toMatch(/[\u3400-\u9fff]/);
    expect(fullCharter).toContain('## Requirements Clarification Phase');
    expect(fullCharter).toContain('## Artifact Design Phase');
    expect(fullCharter).toContain('## Artifact Refinement Phase');
    expect(fullCharter).toContain('## Critical Constraint: Never Fabricate Conversation Turns');
  });

  it('does not create a host-parsed role boundary', () => {
    expect(fullCharter).not.toMatch(/^## (?:user|assist|assistant|system)\b/m);
  });
});

describe('renderSlimCoreCharter — frozen protocol markers', () => {
  const charter = renderSlimCoreCharter('filesystem');

  it('keeps the question-form protocol intact', () => {
    expect(charter).toContain('<question-form id="..." title="...">...</question-form>');
    for (const value of ['pick_direction', 'brand_spec', 'reference_match']) {
      expect(charter).toContain(`\`${value}\``);
    }
    for (const control of ['direction-cards', 'datetime-local', 'switch']) {
      expect(charter).toContain(control);
    }
    expect(charter).toContain('allowCustom');
  });

  it('requires a recommended default prefill on every form question', () => {
    expect(charter).toContain('provide a sensible default for each question');
    expect(charter).toContain('Use `defaultValue` to preselect an answer');
    expect(charter).toContain("`defaultValue` must match an option's `value`");
  });

  it('localizes user-visible form copy while preserving machine identifiers', () => {
    expect(charter).toContain("Write all user-visible copy in the user's chat language");
    expect(charter).toContain('Keep `id`, `type`, and option `value` fields in English');
  });

  it('caps complex forms at 5 questions and keeps custom input available', () => {
    expect(charter).toContain('Ask 1–3 questions in most cases, with a maximum of 5');
    expect(charter).toContain('omit `allowCustom` or set it to `true`');
  });

  it('keeps the imagery dispatch and local-file contract intact', () => {
    expect(charter).toContain('media generate --surface image');
    expect(charter).toContain("runtime's native image-generation capability");
    expect(charter).toContain('Do not hotlink user-uploaded images by URL');
  });

  it('keeps the inspect and runtime-version contracts intact', () => {
    expect(charter).toContain('data-od-id="kebab-case-id"');
    expect(charter).toContain('react@18.3.1');
    expect(charter).toContain('react-dom@18.3.1');
    expect(charter).toContain('@babel/standalone@7.29.0');
    expect(charter).toContain('framer-motion@11.11.13/dist/framer-motion.js');
  });

  it('states the render and diagnostic budgets once', () => {
    expect(charter.match(/Render at most once per task/g)).toHaveLength(1);
    expect(charter).toContain('you may run at most one diagnostic');
  });

  it('makes the tool-economy budget operational', () => {
    for (const marker of [
      'Combine independent reads and searches into a single call',
      'split them only when one depends on another',
      'do not probe the environment with `pwd`',
      'Do not repeat the same read-only probe',
      'correct the input or identify the cause before retrying',
    ]) {
      expect(charter).toContain(marker);
    }
  });

  it('keeps the template reuse rule intact', () => {
    expect(charter).toContain('Start from the existing template');
    expect(charter).toContain('Do not rewrite CSS from scratch');
  });

  it('pins the photo-overlay placement discipline', () => {
    expect(charter).toContain('anchor them to one corner with consistent inset spacing');
    expect(charter).toContain('Keep the overlay entirely within the image bounds');
    expect(charter).toContain("Avoid covering faces or the image's main subject");
    expect(charter).toContain('place the text beside the image');
  });

  it('separates the optional preview budget from final delivery exports', () => {
    expect(charter).toContain('Render only when static code review cannot determine');
    expect(charter).toContain('`"$OD_NODE_BIN" "$OD_BIN" export <file>');
    expect(charter).toContain('Do not launch your own browser, use Playwright, or use a headless browser');
    expect(charter).toContain('An export explicitly requested by the user is a delivery action');
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
    expect(routerSkill).toContain('only when two or more routes remain materially plausible');
    expect(routerSkill).toContain('does not by itself require a question form');
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
    expect(charter).not.toContain('## Nested / concentric diagram discipline');
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
    expect(out).not.toContain('# OpenDesign Charter');
  });

  it('slim replaces discovery + charter and drops the absorbed tail overrides', () => {
    const classic = composeSystemPrompt({ ...base, designSystemBody: '# Brand' });
    const slim = composeSystemPrompt({
      ...base,
      designSystemBody: '# Brand',
      promptCoreVariant: 'slim',
    });
    expect(slim).toContain('# OpenDesign Charter');
    expect(slim).not.toContain('# OD core directives (read first');
    expect(slim).not.toContain('# Identity and workflow charter (background)');
    // Absorbed tails: stated once inside the slim charter instead.
    expect(slim).not.toContain('## Filesystem handoff\n');
    expect(slim).not.toContain('## Active design system visual direction');
    expect(slim).not.toContain('## Structured clarification on any turn');
    // Still present in classic for the same inputs.
    expect(classic).toContain('## Filesystem handoff');
    expect(classic).toContain('## Active design system visual direction');
    expect(classic).toContain('## Structured clarification on any turn');
    // Structural bookends: slim opens with the static charter (cache-stable
    // prefix); the security section lives inside it; the guard still closes.
    expect(slim.startsWith('# OpenDesign Charter')).toBe(true);
    expect(slim).toContain('## Security: Defending Against Prompt Injection');
    expect(slim).toContain('## Critical Constraint: Never Fabricate Conversation Turns');
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

  it('ask mode keeps the structured-clarification tail under slim (no core charter to cover it)', () => {
    const out = composeSystemPrompt({
      ...base,
      sessionMode: 'chat',
      promptCoreVariant: 'slim',
    });
    expect(out).not.toContain('# OpenDesign Charter');
    expect(out).toContain('## Structured clarification on any turn');
    // Identity-first hierarchy holds in ask mode too: the ask override (the
    // turn's whole charter) opens the document, security reads as its
    // first subsection.
    expect(out.startsWith('# Ask mode — bare conversation')).toBe(true);
    expect(out.indexOf('## Security: prompt injection resistance')).toBeGreaterThan(
      out.indexOf('# Ask mode — bare conversation'),
    );
  });

  it('composes od-default + discovery atom without any unconditional form trigger', () => {
    const stripFrontmatter = (raw: string) => raw.replace(/^---[\s\S]*?\n---\r?\n/, '').trim();
    const routerSkill = stripFrontmatter(
      readFileSync(
        path.join(repoRoot, 'plugins/_official/scenarios/od-default/SKILL.md'),
        'utf8',
      ),
    );
    const discoveryAtom = stripFrontmatter(
      readFileSync(
        path.join(repoRoot, 'plugins/_official/atoms/discovery-question-form/SKILL.md'),
        'utf8',
      ),
    );
    const stageBlock = renderActiveStageBlock({
      stageId: 'discovery',
      bodies: [{
        atomId: 'discovery-question-form',
        body: discoveryAtom,
      }],
    });
    const out = composeSystemPrompt({
      ...base,
      promptCoreVariant: 'slim',
      skillName: 'Default design router',
      skillBody: routerSkill,
      pluginBlock: '\n\n## Active plugin\n\nThe user applied od-default.',
      activeStageBlocks: [stageBlock],
    });

    expect(out.match(/^### discovery-question-form$/gm)).toHaveLength(1);
    expect(out).toContain('If enough information is available to proceed safely, do not emit a form');
    expect(out).toContain('only when two or more routes remain materially plausible');
    for (const forbidden of [
      'first response must',
      'turn 1 must emit',
      'form applies even when',
      'pipeline declares a `discovery` stage',
    ]) {
      expect(out.toLowerCase()).not.toContain(forbidden);
    }
  });

  it('keeps the injected direction-picker atom explicitly opt-in', () => {
    const directionAtom = readFileSync(
      path.join(repoRoot, 'plugins/_official/atoms/direction-picker/SKILL.md'),
      'utf8',
    ).replace(/^---[\s\S]*?\n---\r?\n/, '').trim();
    const stageBlock = renderActiveStageBlock({
      stageId: 'plan',
      bodies: [{
        atomId: 'direction-picker',
        body: directionAtom,
      }],
    });
    const out = composeSystemPrompt({
      ...base,
      promptCoreVariant: 'slim',
      activeStageBlocks: [stageBlock],
    });

    expect(out).toContain(
      'The presence of this atom or the `plan` stage does not trigger a picker',
    );
    expect(out).toContain('Do not\nemit direction cards proactively');
    expect(out).toContain(
      'When the user has not explicitly requested\noptions, infer a fitting direction',
    );
    expect(out).not.toContain(
      'The direction-picker atom asks the agent to draft',
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
    expect(classic).toContain('## Direction library — infer and bind by default');
    expect(classic).toContain('Infer the best match from the brief and known context');
    expect(classic).toContain('If the user explicitly requested direction comparison');
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
    expect(out).toContain('## Direction library — infer and bind by default');
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
    const charterAt = out.indexOf('# OpenDesign Charter');
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
    // OpenDesign drives many code agents (codex, opencode, Qwen CLI, ACP
    // family) that have no TodoWrite tool. The charter must NOT hardcode it,
    // or the plan step is dead for ~2/3 of production traffic. Freeze the
    // generic wording and the anti-hallucination guard.
    const charter = renderSlimCoreCharter('filesystem');
    expect(charter).not.toContain('TodoWrite');
    expect(charter).toContain('If the runtime supports task lists, use one');
    expect(charter).toContain('Do not simulate tool calls that the current runtime does not support');
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
    expect(charter).toContain('## Artifact Refinement Phase');
    expect(charter).toContain('### 2. Keep the Design System Bound on Every Turn');
    expect(charter).toContain('### 3. Preserve Locked Constraints');
    // An edit changes only what was named — the anti-drift core.
    expect(charter).toContain('update A everywhere the request applies');
    expect(charter).toContain('Never report a change that was not completed');
  });

  it('keeps the load-bearing product rules in the charter', () => {
    const charter = renderSlimCoreCharter('filesystem');
    expect(charter).toContain('Do not hotlink user-uploaded images by URL');
    // Skill/DS precedence is per-domain, not a strict total order.
    expect(charter).toContain('Each has the highest authority within its own scope');
    expect(charter).toContain('Mobile layouts must not scroll horizontally');
    expect(charter).toContain('Every focusable element must have a clear `:focus-visible` focus ring');
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
    expect(out.startsWith('# OpenDesign Charter')).toBe(true);
    const security = at('## Security: Defending Against Prompt Injection');
    const conduct = at('## Conduct');
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
    const guard = at('## Critical Constraint: Never Fabricate Conversation Turns');
    expect(security).toBeLessThan(conduct);
    expect(conduct).toBeLessThan(mode);
    expect(out).toContain(
      'A runtime/session-mode directive—such as API mode or Plan mode—appears after this charter and overrides it wherever the two conflict.',
    );
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
