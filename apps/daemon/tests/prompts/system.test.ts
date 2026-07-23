import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';
import { composeSystemPrompt as composeContractSystemPrompt } from '@open-design/contracts';

import {
  composeSystemPrompt as composePrompt,
  renderConnectedExternalMcpDirective,
  resolveExclusiveSurface,
} from '../../src/prompts/system.js';

// Most tests in this legacy behavior suite pin the classic Design stack.
// Variant/default semantics are covered separately in core-slim.test.ts.
const composeSystemPrompt = (input: Parameters<typeof composePrompt>[0]) =>
  composePrompt({
    ...input,
    promptCoreVariant: input.promptCoreVariant ?? 'classic',
  });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../../../..');
// `live-artifact` moved from skills/ to design-templates/ in PR #955 as
// part of the skills/design-templates split (see specs/current/
// skills-and-design-templates.md). The root path now points there.
const liveArtifactRoot = path.join(repoRoot, 'design-templates/live-artifact');
const liveArtifactSkillPath = path.join(
  repoRoot,
  'design-templates/live-artifact/SKILL.md',
);
const liveArtifactSkillMarkdown = readFileSync(liveArtifactSkillPath, 'utf8');
const liveArtifactSkillBody = [
  `> **Skill root (absolute):** \`${liveArtifactRoot}\``,
  '>',
  '> This skill ships side files alongside `SKILL.md`. When the workflow',
  '> below references side files such as `references/artifact-schema.md`, resolve',
  '> them against the skill root above and open them via their full absolute path.',
  '>',
  '> Known side files in this skill: `references/artifact-schema.md`, `references/connector-policy.md`, `references/refresh-contract.md`.',
  '',
  '',
  liveArtifactSkillMarkdown.replace(/^---[\s\S]*?---\n\n/, '').trim(),
].join('\n');

// `hyperframes` also moved to design-templates/ in PR #955 — same split
// as `live-artifact` above.
const hyperframesRoot = path.join(repoRoot, 'design-templates/hyperframes');
const hyperframesSkillPath = path.join(
  repoRoot,
  'design-templates/hyperframes/SKILL.md',
);
const officialHyperframesSkillPath = path.join(
  repoRoot,
  'plugins/_official/examples/hyperframes/SKILL.md',
);
const hyperframesSkillMarkdown = readFileSync(hyperframesSkillPath, 'utf8');
const officialHyperframesSkillMarkdown = readFileSync(officialHyperframesSkillPath, 'utf8');
const hyperframesSkillBody = [
  `> **Skill root (absolute):** \`${hyperframesRoot}\``,
  '>',
  '> This skill ships side files alongside `SKILL.md`. Resolve references',
  '> like `references/html-in-canvas.md` against the skill root above.',
  '',
  '',
  hyperframesSkillMarkdown.replace(/^---[\s\S]*?---\n\n/, '').trim(),
].join('\n');

describe('composeSystemPrompt — activeStageBlocks splice (spec §23.4)', () => {
  it('inserts every active stage block after the plugin block when supplied', () => {
    const stage1 = '\n\n## Active stage: discovery\n\n### discovery-question-form\n\nAsk audience.';
    const stage2 = '\n\n## Active stage: plan\n\n### todo-write\n\nCommit a plan.';
    const prompt = composeSystemPrompt({
      pluginBlock: '\n\n## Active plugin\n\nThe user applied test-plugin.',
      activeStageBlocks: [stage1, stage2],
    });
    expect(prompt).toContain('## Active plugin');
    expect(prompt.indexOf('## Active stage: discovery')).toBeGreaterThan(prompt.indexOf('## Active plugin'));
    expect(prompt.indexOf('## Active stage: plan')).toBeGreaterThan(prompt.indexOf('## Active stage: discovery'));
  });

  it('skips empty / whitespace-only blocks', () => {
    const prompt = composeSystemPrompt({
      activeStageBlocks: ['', '   ', '\n\n## Active stage: critique\n\n### critique-theater\n\nScore.'],
    });
    expect(prompt).toContain('## Active stage: critique');
    // Only one stage block means just one heading.
    expect((prompt.match(/## Active stage:/g) ?? []).length).toBe(1);
  });

  it('is a no-op when activeStageBlocks is undefined or empty', () => {
    const baseline = composeSystemPrompt({});
    const withUndefined = composeSystemPrompt({ activeStageBlocks: undefined });
    const withEmpty = composeSystemPrompt({ activeStageBlocks: [] });
    expect(withUndefined).toBe(baseline);
    expect(withEmpty).toBe(baseline);
  });
});

describe('composeSystemPrompt — daemon/contracts design-system parity', () => {
  it('renders the same portable design-system blocks in both composers', () => {
    const input = {
      promptCoreVariant: 'slim' as const,
      designSystemTitle: 'Parity Brand',
      designSystemBody: '# Parity Brand\n\n## Visual theme\n\nCobalt editorial.',
      designSystemUsageMd: '## Design Highlights\n\n- Cobalt editorial.',
      designSystemTokensCss: ':root { --accent: #174ea6; }',
      designSystemComponentsManifest: 'buttons: .btn-primary',
      designSystemImportMode: 'normalized' as const,
      streamFormat: 'plain',
    };
    const daemonPrompt = composeSystemPrompt(input);
    const contractPrompt = composeContractSystemPrompt(input);

    for (const marker of [
      '## How to use this design system — Parity Brand',
      '## Active design system — Parity Brand',
      '## Design system import mode — Parity Brand',
      '## Active design system tokens — Parity Brand',
      '## Reference component manifest — Parity Brand',
      '--accent: #174ea6',
      'buttons: .btn-primary',
    ]) {
      expect(daemonPrompt).toContain(marker);
      expect(contractPrompt).toContain(marker);
    }
  });

  it('keeps slim platform-contract gating aligned across both composers', () => {
    const metadataInput = {
      promptCoreVariant: 'slim' as const,
      metadata: { kind: 'prototype' as const, platform: 'responsive' as const },
    };
    const signalInput = {
      promptCoreVariant: 'slim' as const,
      metadata: { kind: 'prototype' as const },
      platformHintSignal: true,
    };

    for (const input of [metadataInput, signalInput]) {
      expect(composeSystemPrompt(input)).toContain('## Platform delivery contracts');
      expect(composeContractSystemPrompt(input)).toContain('## Platform delivery contracts');
    }
  });

  it('keeps text-artifact platform delivery aligned across both composers', () => {
    const input = {
      promptCoreVariant: 'slim' as const,
      streamFormat: 'plain' as const,
      metadata: {
        kind: 'prototype' as const,
        platformTargets: ['mobile-ios', 'mobile-android'] as Array<
          'mobile-ios' | 'mobile-android'
        >,
      },
    };

    for (const prompt of [
      composeSystemPrompt(input),
      composeContractSystemPrompt(input),
    ]) {
      expect(prompt).toContain('inside the one standalone artifact');
      expect(prompt).not.toContain('`mobile-ios.html`');
    }
  });
});

describe('composeSystemPrompt', () => {
  it('injects Chinese quick brief guidance when the UI locale is zh-CN', () => {
    const prompt = composeSystemPrompt({ locale: 'zh-CN' });

    expect(prompt).toContain('# UI locale override');
    expect(prompt).toContain('`zh-CN` (Simplified Chinese)');
    expect(prompt).toContain('快速简报 — 30 秒');
    expect(prompt).toContain('目标用户');
    expect(prompt).toContain('视觉调性');
    expect(prompt).toContain('Keep machine-readable ids and object option `value` fields exact and unlocalized');
  });

  it('keeps Plan mode tied to the real Todo card in filesystem runs', () => {
    const prompt = composeSystemPrompt({ sessionMode: 'plan' });

    expect(prompt).toContain('# Plan mode — editable document first');
    expect(prompt).toContain("For substantial plan-document work, start with the runtime's real TodoWrite/task-list tool");
    expect(prompt).toContain('show progress through the host UI');
  });

  it('injects the converged verification policy (no mid-build screenshot looping)', () => {
    const prompt = composeSystemPrompt({});

    // Verification must read as an end-of-turn, single-pass step.
    expect(prompt).toContain('## Verification — converge at the end, in one pass');
    // The hard cap on rendered visual checks — the lever against codex's
    // self-initiated 6-12x screenshot retry chains that balloon input tokens.
    expect(prompt).toContain('One render check is the budget');
    expect(prompt).toContain('Do not loop');
    // Safety valve: visual verification is converged, NOT removed.
    expect(prompt).toContain('these justify ONE rendered look');
    // Route to the official wrapper, not a self-launched browser.
    expect(prompt).toContain('Do NOT launch your own browser to do this');
  });

  it('preserves canonical default task-type options under locale overrides', () => {
    const prompt = composeSystemPrompt({ locale: 'zh-CN' });

    expect(prompt).toContain(
      'keep the `taskType` option labels as the canonical routing choices',
    );
    for (const option of [
      'Prototype',
      'Live artifact',
      'Slide deck',
      'Image',
      'Video',
      'HyperFrames',
      'Audio',
      'Other',
    ]) {
      expect(prompt).toContain(`"${option}"`);
    }
    expect(prompt).not.toContain('option labels as `原型`');
    expect(prompt).not.toContain('`实时作品`');
  });

  it('preserves canonical default task-type options for zh-TW locale overrides', () => {
    const prompt = composeSystemPrompt({ locale: 'zh-TW' });

    expect(prompt).toContain('# UI locale override');
    expect(prompt).toContain('`zh-TW` (Traditional Chinese)');
    expect(prompt).toContain(
      'keep the `taskType` option labels as the canonical routing choices',
    );
    for (const option of [
      'Prototype',
      'Live artifact',
      'Slide deck',
      'Image',
      'Video',
      'HyperFrames',
      'Audio',
      'Other',
    ]) {
      expect(prompt).toContain(`"${option}"`);
    }
    expect(prompt).not.toContain('快速简报 — 30 秒');
    expect(prompt).not.toContain('option labels as `原型`');
    expect(prompt).not.toContain('`实时作品`');
  });

  it('treats an active design system as the visual direction', () => {
    const prompt = composeSystemPrompt({
      designSystemTitle: 'ComfyUI',
      designSystemBody: '# ComfyUI\n\n--accent: #ffd500',
      metadata: { kind: 'prototype' } as any,
      activeStageBlocks: [
        '\n\n## Active stage: plan\n\n### direction-picker\n\nAsk for 3-5 directions.',
      ],
    });

    expect(prompt).toContain('## Active design system — ComfyUI');
    expect(prompt).toContain('Active design system exception');
    expect(prompt).toContain(
      'the active design system is the visual direction for this project',
    );
    expect(prompt).toContain('Do not ask the user to pick a separate theme color');
    expect(prompt).toContain('Do not emit a direction question-form');
    expect(prompt).not.toContain('<question-form id="direction"');
    expect(prompt).not.toContain('Pick a visual direction');
    expect(prompt.indexOf('## Active design system visual direction')).toBeGreaterThan(
      prompt.indexOf('### direction-picker'),
    );
  });

  it('uses stable brand option values for discovery-form branching', () => {
    const prompt = composeSystemPrompt({});
    expect(prompt).toContain('{ "label": "Pick a direction for me", "value": "pick_direction" }');
    expect(prompt).toContain('{ "label": "I have a brand spec — I\'ll share it", "value": "brand_spec" }');
    expect(prompt).toContain('{ "label": "Match a reference site / screenshot — I\'ll attach it", "value": "reference_match" }');
    expect(prompt).toContain('When the answer line includes `[value: ...]`, use that stable value instead of the visible label.');
    expect(prompt).toContain('If you keep the `brand` question, its `id` must stay `"brand"`.');
    expect(prompt).toContain('you may drop the `brand` question as already answered; classify the source under RULE 2');
    expect(prompt).toContain('When skipping the form, still classify any provided source under RULE 2');
    expect(prompt).toContain('### Branch A — replacement brand/visual source, or `brand` value is `"brand_spec"` / `"reference_match"`');
    expect(prompt).toContain('ask them to paste/upload the brand spec or reference and stop');
    expect(prompt).toContain('Do not guess a brand domain or invent tokens');
    expect(prompt).toContain('First classify what role any source plays');
    expect(prompt).toContain(
      'Use Branch A if the user explicitly designates it as the replacement brand or visual authority',
    );
    expect(prompt).toContain(
      'For an ordinary reference, extract only the requested aspects, keep the active design-system tokens binding elsewhere',
    );
    expect(prompt).not.toContain('run the extraction as a supplemental override');
    expect(prompt).toContain('### Branch B — no Branch A source or brand value');
    expect(prompt).toContain('Branch A source/value → run brand-spec extraction');
    expect(prompt).toContain('`brand_spec` / `reference_match` without a provided source → ask for the source and stop; do not guess brand tokens.');
  });

  it('injects live-artifact skill guidance and metadata intent', () => {
    const prompt = composeSystemPrompt({
      skillName: 'live-artifact',
      skillMode: 'prototype',
      skillBody: liveArtifactSkillBody,
      metadata: {
        kind: 'prototype',
        intent: 'live-artifact',
      } as any,
    });

    expect(prompt).toContain('## Active skill — live-artifact');
    expect(prompt).toContain(`> **Skill root (absolute):** \`${liveArtifactRoot}\``);
    expect(prompt).not.toContain('**Pre-flight (do this before any other tool):** Read `assets/template.html`');
    expect(prompt).not.toContain('live-artifact/references/layouts.md');
    expect(prompt).not.toContain('live-artifact/assets/template.html');
    expect(prompt).toContain('`references/artifact-schema.md`');
    expect(prompt).toContain('`references/connector-policy.md`');
    expect(prompt).toContain('`references/refresh-contract.md`');
    expect(prompt).toContain('The wrapper reads injected `OD_NODE_BIN`, `OD_BIN`, `OD_DAEMON_URL`, and `OD_TOOL_TOKEN`');
    expect(prompt).toContain('Do not include or invent `projectId`; the daemon derives project/run scope from the token.');
    expect(prompt).toContain('"$OD_NODE_BIN" "$OD_BIN" tools live-artifacts create --input artifact.json');
    expect(prompt).toContain('if the user names a connector/source (for example Notion)');
    expect(prompt).toContain('list connectors before asking where the data comes from');
    expect(prompt).toContain('a connected `notion` connector plus a user brief that names Notion is enough to start with `notion.notion_search`');
    expect(prompt).toContain('Prefer the `live-artifact` skill workflow when available');
    expect(prompt).toContain('The first output should be a live artifact/dashboard/report');
  });

  // The daemon composer (this file) is what apps/daemon/src/server.ts wires
  // into live chat runs. The contracts copy at packages/contracts/src/prompts
  // /system.ts exists for non-daemon contexts and was updated in the
  // hyperframes PR; without this test the two copies drift silently and the
  // main HyperFrames flow misses its preflight directive in production.
  it('keeps the slim design charter out of media-surface prompts', () => {
    // Reviewer finding (#5603): with slim as the server default, the charter
    // head was composed before the media surface was known, so image/video/
    // audio runs carried the turn-1 discovery mandate and HTML handoff rules
    // alongside the media contract — two mutually exclusive workflow
    // authorities. The media contract must stay the only one.
    for (const surface of ['image', 'video', 'audio'] as const) {
      const prompt = composeSystemPrompt({
        promptCoreVariant: 'slim',
        skillMode: surface,
        metadata: { kind: surface } as any,
      });
      expect(prompt).not.toContain('<question-form id="discovery"');
      expect(prompt).not.toContain('Quick brief — 30 seconds');
      expect(prompt).not.toContain('Read once, in batches');
      expect(prompt).not.toContain('Filesystem handoff is canonical');
      // Nor the Ask-mode charter (fourth-round finding): the Ask directive
      // forbids creating media, contradicting the media contract below.
      expect(prompt).not.toContain('# Ask mode');
      expect(prompt).toContain('media generate');
    }
    // Non-media slim runs keep the charter head.
    const design = composeSystemPrompt({ promptCoreVariant: 'slim' });
    expect(design).toContain('opening `question-form` element');
    expect(design).toContain('otherwise use `discovery`');
    expect(design).not.toContain('id="<workflow-specific-id>"');
    expect(design).not.toContain('id="..."');
  });

  it('gates media execution by session mode and execution capability', () => {
    const base = {
      promptCoreVariant: 'slim' as const,
      metadata: { kind: 'image', imageModel: 'gpt-image-2' } as any,
    };
    const design = composeSystemPrompt({
      ...base,
      streamFormat: 'claude-stream-json',
      executionProfile: 'filesystem',
    });
    const plan = composeSystemPrompt({
      ...base,
      sessionMode: 'plan',
      streamFormat: 'claude-stream-json',
      executionProfile: 'filesystem',
    });
    const ask = composeSystemPrompt({
      ...base,
      sessionMode: 'chat',
      streamFormat: 'claude-stream-json',
      executionProfile: 'filesystem',
    });
    const plain = composeSystemPrompt({ ...base, streamFormat: 'plain' });

    expect(design).toContain('## Media generation contract');
    expect(plan).toContain('# Plan mode — editable document first');
    expect(plan).not.toContain('## Media generation contract');
    expect(ask).toContain('# Ask mode — bare conversation');
    expect(ask).not.toContain('## Media generation contract');
    expect(plain).toContain('This is a `image` media surface');
    expect(plain).toContain('Produce a concrete creative brief and generation-ready prompt');
    expect(plain).not.toContain('## Media generation contract');
  });

  it('keeps one complete, query-derived question-form schema in every slim mode', () => {
    const prompts = [
      composeSystemPrompt({ promptCoreVariant: 'slim' }),
      composeSystemPrompt({ promptCoreVariant: 'slim', sessionMode: 'chat' }),
      composeSystemPrompt({
        promptCoreVariant: 'slim',
        sessionMode: 'plan',
        metadata: { kind: 'image' } as any,
      }),
      composeSystemPrompt({
        promptCoreVariant: 'slim',
        streamFormat: 'plain',
        metadata: { kind: 'video' } as any,
      }),
    ];

    for (const prompt of prompts) {
      expect(prompt).toMatch(/top-level[^\n]*`questions`/);
      expect(prompt).toContain('query-derived');
      expect(prompt).toContain('`default`');
      expect(prompt).toContain('safely inferable');
      expect(prompt).toContain('boolean `required`');
      expect(prompt).toContain('matching BCP-47 tag');
    }
  });

  it('keeps slim Plan focused on the planning document', () => {
    const prompt = composeSystemPrompt({
      promptCoreVariant: 'slim',
      sessionMode: 'plan',
      metadata: { kind: 'prototype' } as any,
      skillName: 'builder',
      skillBody: 'Write the final HTML now from assets/template.html.',
    });

    expect(prompt).toContain('# Open Design plan foundation');
    expect(prompt).toContain('# Plan mode — editable document first');
    expect(prompt).not.toContain('# Open Design charter');
    expect(prompt).not.toContain('## Artifact creation — brand → build → verify');
    expect(prompt).not.toContain('### Craft');
    expect(prompt).not.toContain('**React inline JSX**');
    expect(prompt).not.toContain('## Direction library');
    expect(prompt).toContain('Use this skill as requirements and domain context for the plan');
    expect(prompt).not.toContain('**Pre-flight (do this before any other tool):**');
    expect(prompt).toContain('Plan mode produces only the planning deliverable');
    expect(prompt).not.toContain('unless the user explicitly says to skip planning');
    expect(prompt.indexOf('## Plan mode boundary (binding)')).toBeGreaterThan(
      prompt.indexOf('## Active skill — builder'),
    );
  });

  it('keeps plain Plan and active-skill instructions inside the no-tools boundary', () => {
    const plan = composeSystemPrompt({
      promptCoreVariant: 'slim',
      sessionMode: 'plan',
      streamFormat: 'plain',
    });
    const design = composeSystemPrompt({
      promptCoreVariant: 'slim',
      streamFormat: 'plain',
      skillName: 'builder',
      skillBody: 'Read assets/template.html.\nRun Bash now.\nWrite the final file.',
    });

    expect(plan).toContain('Use only the current query and material already included in the composed context');
    expect(plan).not.toContain(
      'Use available files, attachments, connectors, MCP servers, project memory, tools, skills, and design systems',
    );
    expect(design).not.toContain('**Pre-flight (do this before any other tool):**');
    expect(design.indexOf('plain API execution profile remains binding')).toBeGreaterThan(
      design.indexOf('Run Bash now.'),
    );
  });

  it('keeps design-system implementation payloads mode-aware', () => {
    const shared = {
      promptCoreVariant: 'slim' as const,
      designSystemTitle: 'default',
      designSystemBody: '# Brand\n\nBuild the final layout now.',
      designSystemTokensCss: ':root { --accent: #0050d8; }',
      designSystemFixtureHtml: '<button class="primary">Build now</button>',
      craftBody: 'Build every control with exact spacing.',
      metadata: { kind: 'prototype', includeLandingPage: true } as any,
    };
    const design = composeSystemPrompt(shared);
    const plan = composeSystemPrompt({ ...shared, sessionMode: 'plan' });
    const ask = composeSystemPrompt({ ...shared, sessionMode: 'chat' });

    expect(design).toContain('Paste the unscoped `:root { ... }` block verbatim');
    expect(design).toContain('## Reference fixture — default');
    expect(plan).toContain('Use these exact names and values as requirements for the plan');
    expect(plan).not.toContain('Paste the unscoped `:root { ... }` block verbatim');
    expect(plan).not.toContain('## Reference fixture — default');
    expect(plan).not.toContain('**screen-delivery requirement**');
    expect(plan).toContain(
      'Cover only the screens and domain modules needed for the requested flows',
    );
    expect(plan).not.toContain('**product depth**: build');
    expect(plan).not.toContain('ship `landing.html`');
    expect(ask).not.toContain('## Active design system tokens');
    expect(ask).not.toContain('Paste the unscoped `:root { ... }` block verbatim');
    expect(ask).not.toContain('## Reference fixture — default');
    expect(ask).not.toContain('**screen-delivery context**');
    expect(ask).not.toContain('**product depth**: build');
    expect(ask).not.toContain('ship `landing.html`');
    for (const prompt of [plan, ask]) {
      expect(prompt).not.toContain("When you copy the active skill's seed template");
    }
  });

  it('keeps only visual brand context on image/video surfaces and drops it for audio', () => {
    const shared = {
      promptCoreVariant: 'slim' as const,
      designSystemTitle: 'default',
      designSystemBody: '# Brand\n\nUse blue and build HTML components.',
      designSystemTokensCss: ':root { --accent: #0050d8; }',
      designSystemComponentsManifest: 'button.primary — blue button',
      designSystemPullIndex: 'references/components.html',
      craftBody: 'Build every control with exact spacing.',
      activeStageBlocks: ['\n\n## Active stage: build\n\nGenerate the artifact.'],
      executionProfile: 'filesystem' as const,
    };

    for (const surface of ['image', 'video'] as const) {
      const prompt = composeSystemPrompt({
        ...shared,
        skillMode: surface,
        metadata: { kind: surface } as any,
      });
      expect(prompt).toContain('## Active design system — default');
      expect(prompt).toContain(`visual brand context for the ${surface} brief`);
      expect(prompt).toContain(`only as brand and visual direction for this ${surface}`);
      expect(prompt).not.toContain('## Active design system tokens');
      expect(prompt).not.toContain('## Reference component manifest');
      expect(prompt).not.toContain('## Pull-layer files available on demand');
      expect(prompt).not.toContain('## Active craft references');
      expect(prompt).not.toContain('## Active stage: build');
      expect(prompt).toContain('## Media generation contract');
    }

    const audio = composeSystemPrompt({
      ...shared,
      skillMode: 'audio',
      metadata: { kind: 'audio' } as any,
    });
    expect(audio).not.toContain('## How to use this design system');
    expect(audio).not.toContain('## Active design system — default');
    expect(audio).not.toContain('## Active design system tokens');
    expect(audio).not.toContain('## Reference component manifest');
    expect(audio).not.toContain('## Pull-layer files available on demand');
    expect(audio).not.toContain('## Active craft references');
    expect(audio).not.toContain('## Active stage: build');
    expect(audio).toContain('## Media generation contract');
  });

  it('keeps Ask compact while enriching visual-media and Plan design-system context', () => {
    const shared = {
      promptCoreVariant: 'slim' as const,
      designSystemTitle: 'Example',
      designSystemBody:
        [
          '# Example',
          '',
          '## Visual theme',
          '',
          'MEDIA_LIGHTING_RULE',
          '',
          '## Typography',
          '',
          'PLAN_TYPE_ROLE_RULE',
          '',
          '## Layout',
          '',
          'PLAN_LAYOUT_RHYTHM_RULE',
          '',
          '## Implementation recipes',
          '',
          'FULL_IMPLEMENTATION_PAYLOAD',
        ].join('\n'),
      designSystemUsageMd:
        '# Usage\n\n## Design Highlights\n\n- Warm editorial\n- Cobalt accent\n\n## Do\n\n- Preserve editorial hierarchy.\n\n## Avoid\n\n- Avoid generic cards.\n\n## Read Order\n\nRead all files.',
      designSystemPullIndex: 'Additional design-system files declared by manifest.json:\n- preview/: preview pages',
      designSystemCorePullIndex:
        'Core design-system files available on demand:\n- DESIGN.md: full design-system guidance\n- tokens.css: compiled token contract\n- components.manifest.json: compact component inventory',
      designSystemTokensCss: ':root { --accent: #0047ff; }',
      designSystemComponentsManifest: 'button.primary — cobalt action',
      executionProfile: 'filesystem' as const,
    };
    const ask = composeSystemPrompt({ ...shared, sessionMode: 'chat' });
    const image = composeSystemPrompt({
      ...shared,
      skillMode: 'image',
      metadata: { kind: 'image' } as any,
    });
    const plan = composeSystemPrompt({
      ...shared,
      sessionMode: 'plan',
      metadata: { kind: 'prototype' } as any,
    });

    for (const prompt of [ask, image, plan]) {
      expect(prompt).toContain('Warm editorial');
      expect(prompt).toContain('Cobalt accent');
      expect(prompt).not.toContain('Read all files.');
    }
    expect(ask).not.toContain('MEDIA_LIGHTING_RULE');
    expect(ask).not.toContain('PLAN_TYPE_ROLE_RULE');
    expect(image).toContain('MEDIA_LIGHTING_RULE');
    expect(image).toContain('PLAN_TYPE_ROLE_RULE');
    expect(image).not.toContain('PLAN_LAYOUT_RHYTHM_RULE');
    expect(image).not.toContain('FULL_IMPLEMENTATION_PAYLOAD');
    expect(plan).toContain('MEDIA_LIGHTING_RULE');
    expect(plan).toContain('PLAN_TYPE_ROLE_RULE');
    expect(plan).toContain('PLAN_LAYOUT_RHYTHM_RULE');
    expect(plan).toContain('Preserve editorial hierarchy.');
    expect(plan).toContain('Avoid generic cards.');
    expect(plan).not.toContain('FULL_IMPLEMENTATION_PAYLOAD');
    expect(plan).toContain('- DESIGN.md: full design-system guidance');
    expect(plan).toContain('- preview/: preview pages');
    expect(plan).not.toContain('- tokens.css: compiled token contract');
    expect(plan).not.toContain('- components.manifest.json: compact component inventory');
  });

  it('pins Ask boundaries after dynamic skill context and omits stage bodies', () => {
    const prompt = composeSystemPrompt({
      promptCoreVariant: 'slim',
      sessionMode: 'chat',
      skillName: 'builder',
      skillBody: 'Write files now.',
      activeStageBlocks: ['\n\n## Active stage: build\n\nGenerate the artifact.'],
    });
    const stageAt = prompt.indexOf('## Active stage: build');
    const boundaryAt = prompt.indexOf('## Ask mode boundary (binding)');
    const protocolAt = prompt.indexOf('## Host clarification protocol — any turn');
    const guardAt = prompt.indexOf('## CRITICAL: Never fabricate conversation turns');

    expect(prompt).toContain('Use this skill as domain context for the answer');
    expect(stageAt).toBe(-1);
    expect(boundaryAt).toBeGreaterThan(prompt.indexOf('## Active skill — builder'));
    expect(protocolAt).toBeGreaterThan(boundaryAt);
    expect(guardAt).toBeGreaterThan(protocolAt);
  });

  it('swaps the slim Website Clone copyright rule for faithful reproduction', () => {
    const normal = composeSystemPrompt({
      promptCoreVariant: 'slim',
      metadata: { kind: 'prototype' } as any,
    });
    const clone = composeSystemPrompt({
      promptCoreVariant: 'slim',
      metadata: { kind: 'prototype', intent: 'web-clone' } as any,
    });

    expect(normal).toContain("Don't recreate copyrighted designs.");
    expect(clone).toContain('Website Clone is an explicit faithful-reproduction task');
    expect(clone).not.toContain("Don't recreate copyrighted designs.");
  });

  it('injects the html-in-canvas preflight for the hyperframes skill', () => {
    const prompt = composeSystemPrompt({
      skillName: 'hyperframes',
      skillMode: 'video',
      skillBody: hyperframesSkillBody,
      metadata: {
        kind: 'video',
        videoModel: 'hyperframes-html',
      } as any,
    });

    expect(prompt).toContain('## Active skill — hyperframes');
    expect(prompt).toContain('**Pre-flight (do this before any other tool):**');
    expect(prompt).toContain('`references/html-in-canvas.md`');
    expect(prompt).toContain('media generate --surface video --model hyperframes-html --composition-dir <rel>');
    expect(prompt).toMatch(/Do not run `npx hyperframes render`\s+yourself/);
    const mediaContract = prompt.slice(prompt.indexOf('## Media generation contract'));
    expect(mediaContract).not.toContain('npx hyperframes init');
    expect(prompt.match(/npx hyperframes init/g)).toHaveLength(1);
    expect(prompt).not.toContain('intentionally rejected for this model');
    expect(prompt).not.toContain('AGENT_RENDERED');
    expect(prompt).not.toContain('rendered by you directly via npx');
  });

  it('keeps both hyperframes skill copies aligned with the daemon render handoff', () => {
    for (const markdown of [hyperframesSkillMarkdown, officialHyperframesSkillMarkdown]) {
      expect(markdown).toContain('media generate --surface video --model hyperframes-html --composition-dir <rel>');
      expect(markdown).toContain('Do not run `npx hyperframes render`');
      expect(markdown).not.toContain('AGENT_RENDERED');
      expect(markdown).not.toContain('rendered by you directly via npx');
      expect(markdown).not.toContain('dispatcher path returns a 400');
      expect(markdown).toContain('while [ -n "$task_id" ]; do');
      expect(markdown).not.toContain('while [ "$ec" -eq 2 ]');
      expect(markdown).not.toContain('jq -r');
      expect(markdown).toContain('`generate` exits 0 for both outcomes');
      expect(markdown).toContain('Visual Identity Gate (standalone HyperFrames only)');
      expect(markdown).toContain('If `$OD_PROJECT_DIR` is set, this subsection does not apply');
      expect(markdown).toContain('in OD it is the hidden');
      expect(markdown).toContain('Reserve the current daemon dispatch for `render`');
    }
    expect(officialHyperframesSkillMarkdown.trimEnd()).toBe(hyperframesSkillMarkdown.trimEnd());
  });

  it('does not add the responsive web contract to deck metadata without platform fields', () => {
    const prompt = composeSystemPrompt({
      metadata: {
        kind: 'deck',
        speakerNotes: true,
        slideCount: '10-15 pages',
      } as any,
    });

    expect(prompt).toContain('- **kind**: deck');
    expect(prompt).toContain('- **slideCount**: 10-15 pages');
    expect(prompt).not.toContain('**responsive web contract**');
    expect(prompt).not.toContain('**platformTargets**');
  });

  it('tells artifact generation to summarize instead of dumping raw HTML source into chat', () => {
    const prompt = composeSystemPrompt({
      metadata: { kind: 'prototype', fidelity: 'production' } as any,
    });

    expect(prompt).toContain('Do not dump the full raw HTML source back into chat');
    expect(prompt).toContain('the assistant message should only summarize the result');
  });

  it('uses the primary skill surface when composed skill modes conflict', () => {
    const prompt = composeSystemPrompt({
      skillMode: 'image',
      skillModes: ['deck', 'image'],
    });

    expect(prompt).toContain('## Media generation contract');
    expect(prompt).not.toContain('# Slide deck — fixed framework');
  });

  it('lets metadata.kind win over conflicting composed skill modes', () => {
    const prompt = composeSystemPrompt({
      skillMode: 'image',
      skillModes: ['deck', 'image'],
      metadata: { kind: 'deck' } as any,
    });

    expect(prompt).toContain('# Slide deck — fixed framework');
    expect(prompt).not.toContain('## Media generation contract');
  });

  it('pins the data chart discipline inside the deck framework (#907)', () => {
    const prompt = composeSystemPrompt({ skillMode: 'deck' });

    expect(prompt).toContain('## Data chart discipline');
    expect(prompt).toContain('calc(var(--v) / var(--max)');
    expect(prompt).toContain('visible category label AND value label');
    expect(prompt).toContain('Mentally spot-check two bars');
  });

  it('pins the mermaid theme discipline inside the deck framework (dark decks)', () => {
    const prompt = composeSystemPrompt({ skillMode: 'deck' });

    expect(prompt).toContain('## Mermaid diagram theme discipline');
    expect(prompt).toContain("theme: 'dark'");
    expect(prompt).toContain('themeVariables');
    expect(prompt).toContain('no dark-on-dark labels');
  });

  it('resolves a non-media primary surface ahead of composed media mentions', () => {
    expect(resolveExclusiveSurface({
      skillMode: 'deck',
      skillModes: ['deck', 'image'],
    })).toBe('deck');
  });

  describe('artifact handoff no-emit clauses (#1143)', () => {
    it('drops the absolute "non-negotiable" framing in favor of conditional language', () => {
      const prompt = composeSystemPrompt({});
      expect(prompt).not.toContain('non-negotiable output rule');
    });

    it('includes the "When NOT to emit <artifact>" sub-section', () => {
      const prompt = composeSystemPrompt({});
      expect(prompt).toContain('When NOT to emit `<artifact>`');
    });

    it('pins filesystem artifact handoff for AMR runs', () => {
      const prompt = composeSystemPrompt({ agentId: 'amr' });
      expect(prompt).toContain('## Filesystem handoff');
      expect(prompt).toContain('filesystem execution profile');
      expect(prompt).toContain("runtime's native tool-call interface");
      expect(prompt).toContain('Never type a tool invocation into assistant text');
      expect(prompt).toContain('This tool-call rule does not apply to Open Design UI markup');
      expect(prompt).toContain('emit the complete `<question-form>...</question-form>` block directly');
      expect(prompt).toContain('Do not output generated source code in a `<artifact type="text/html">...</artifact>` block.');
    });

    it('prioritizes question forms over native tool calls when clarifying', () => {
      const prompt = composeSystemPrompt({ agentId: 'amr' });
      expect(prompt).toContain('## Host clarification protocol — any turn');
      expect(prompt).toContain('The form is assistant text parsed by the Open Design host, not a native tool call');
      expect(prompt).toContain('emit one complete `question-form` element');
      expect(prompt).toContain('Do not ask a blocking clarification as prose');
      expect(prompt).toContain('then end the turn');
    });

    it('pins filesystem artifact handoff for other CLI agents too', () => {
      const prompt = composeSystemPrompt({ agentId: 'gemini' });
      expect(prompt).toContain('## Filesystem handoff');
      expect(prompt).toContain("runtime's native tool-call interface");
    });

    it('does not pin filesystem artifact handoff in plain API mode', () => {
      const prompt = composeSystemPrompt({ agentId: 'deepseek', streamFormat: 'plain' });
      expect(prompt).not.toContain('## Filesystem handoff');
    });

    it('forbids wrapping in-place-edit-only turns in an artifact block', () => {
      const prompt = composeSystemPrompt({});
      expect(prompt).toMatch(/filesystem runs/i);
      expect(prompt).toMatch(/Do not emit a source-code `<artifact>` block/i);
    });

    it('forbids putting prose / summaries / paths inside an artifact block', () => {
      const prompt = composeSystemPrompt({});
      expect(prompt).toMatch(/summar(y|ies)|prose|file path/i);
      expect(prompt).toContain('Never wrap a summary, prose, file path reference, bash output, explanation, or full source file inside `<artifact>`.');
    });

    it('does not carry unconditional "Emit single <artifact>" / "emit a single <artifact>" lines anywhere in the composed prompt', () => {
      const prompt = composeSystemPrompt({});
      // Discovery layer used to carry hard-rule unconditional emit instructions
      // (plan template step 9, default arc Turn 3+ recap, deck workflow step 7).
      // Those must be conditional now — otherwise the no-emit exception in the
      // base prompt is overridden by the higher-priority discovery layer.
      expect(prompt).not.toMatch(/^- 9\.\s+Emit single <artifact>\s*$/m);
      expect(prompt).not.toMatch(/emit a single `?<artifact>`?\.\s*$/m);
      expect(prompt).not.toMatch(/^7\.\s+Emit single <artifact>\s*$/m);
    });

    it('declares filesystem file handoff at the dominant discovery layer', () => {
      const prompt = composeSystemPrompt({});
      // The base prompt is lower precedence than DISCOVERY_AND_PHILOSOPHY, so
      // filesystem handoff must be stated at the dominant layer too.
      expect(prompt).toMatch(/Filesystem handoff is canonical/i);
      expect(prompt).toMatch(/Do not emit a source-code `<artifact>` block/i);
    });

    it('defaults new deliverable filenames to semantic names instead of index.html', () => {
      const prompt = composeSystemPrompt({
        skillName: 'simple-deck',
        skillBody: 'Copy assets/template.html to index.html, then fill the deck.',
      });

      expect(prompt).toContain('## Semantic output file names');
      expect(prompt).toContain('Do not call every new artifact `index.html`');
      expect(prompt).toContain('adapt the destination to a semantic filename');
      expect(prompt.indexOf('## Semantic output file names')).toBeGreaterThan(
        prompt.indexOf('## Active skill — simple-deck'),
      );
    });

    it('also keeps deck-mode prompts free of the unconditional emit line (DECK_FRAMEWORK_DIRECTIVE only stacks for deck projects)', () => {
      // The plain composeSystemPrompt({}) call does NOT include
      // DECK_FRAMEWORK_DIRECTIVE; that directive only stacks when
      // `skillMode === 'deck'` or `metadata.kind === 'deck'`. So if
      // deck-framework.ts:327 ever regresses back to "Emit single <artifact>",
      // a no-args negative assertion is a false negative — exercise the deck
      // path explicitly here.
      const deckPrompt = composeSystemPrompt({ skillMode: 'deck' });
      expect(deckPrompt).not.toMatch(/^7\.\s+Emit single <artifact>\s*$/m);
      expect(deckPrompt).not.toContain('Copy the canonical skeleton below as index.html');
      expect(deckPrompt).toContain('semantically named deck HTML file');
      expect(deckPrompt).toMatch(/Summarize the written or changed deck file/i);
    });
  });

  // The connected-external-MCP directive reflects live OAuth token state, which
  // flips mid-conversation as Bearers expire/refresh. It now rides in the
  // per-turn instruction slice (server.ts), NOT the cached system prompt, so it
  // no longer churns the cacheable prefix across resumes. composeSystemPrompt
  // must therefore never emit it; the exported renderer is tested directly.
  describe('connectedExternalMcp directive is no longer in the system prompt', () => {
    it('never emits the MCP directive from composeSystemPrompt', () => {
      const prompt = composeSystemPrompt({});
      expect(prompt).not.toContain('External MCP servers — already authenticated');
      expect(prompt).not.toContain('mcp__<server>__authenticate');
    });

    it('keeps the media-execution-disabled block, still with no MCP directive', () => {
      const prompt = composeSystemPrompt({
        metadata: { kind: 'image' },
        mediaExecution: { mode: 'disabled' },
      });
      expect(prompt).toContain('Open Design-owned media execution is **disabled for this run**');
      expect(prompt).not.toContain('## Media generation contract');
      expect(prompt).not.toContain('External MCP servers — already authenticated');
    });
  });

  describe('renderConnectedExternalMcpDirective', () => {
    it('returns an empty string for no / empty servers', () => {
      expect(renderConnectedExternalMcpDirective(undefined)).toBe('');
      expect(renderConnectedExternalMcpDirective([])).toBe('');
    });

    it('lists each connected server and forbids the synthetic auth tools', () => {
      const directive = renderConnectedExternalMcpDirective([
        { id: 'higgsfield-openclaw', label: 'Higgsfield (OpenClaw)' },
        { id: 'github' },
      ]);
      expect(directive).toContain('## External MCP servers — already authenticated');
      expect(directive).toContain('`higgsfield-openclaw`');
      expect(directive).toContain('Higgsfield (OpenClaw)');
      expect(directive).toContain('`github`');
      expect(directive).toContain(
        '**Do NOT call any tool whose name matches `mcp__<server>__authenticate` or `mcp__<server>__complete_authentication`',
      );
      expect(directive).toContain('localhost:<random>/callback');
      expect(directive).toContain('Settings → External MCP');
    });

    it('skips entries with blank ids and emits nothing when none remain', () => {
      expect(
        renderConnectedExternalMcpDirective([
          { id: '   ', label: 'blank' },
          { id: '', label: 'empty' },
        ] as any),
      ).toBe('');
    });

    it('does not duplicate the label when it equals the id', () => {
      const directive = renderConnectedExternalMcpDirective([{ id: 'github', label: 'github' }]);
      expect(directive).toContain('- `github`\n');
      expect(directive).not.toContain('- `github` (github)');
    });

    it('has no leading separator so it composes cleanly in a `---`-joined slice', () => {
      const directive = renderConnectedExternalMcpDirective([{ id: 'github' }]);
      expect(directive.startsWith('## External MCP servers')).toBe(true);
    });
  });

  // The daemon experiment for compiling a brand's design system from prose
  // (DESIGN.md) into a machine-readable contract (tokens.css) plus a worked
  // fixture (components.html) lives in PR-C. The composer exposes two new
  // optional inputs (`designSystemTokensCss`, `designSystemFixtureHtml`)
  // that the daemon populates by default for every brand that ships
  // those files (PR-D flipped the env gate to default-on, with
  // `OD_DESIGN_TOKEN_CHANNEL=0` as the kill switch). These tests pin
  // the injection shape so the prompt structure cannot drift silently.
  describe('design-system token + fixture injection (#PR-C)', () => {
    const sampleTokensCss = ':root {\n  --bg: #ffffff;\n  --fg: #111111;\n  --accent: #0050d8;\n}';
    const sampleFixtureHtml = '<!doctype html>\n<html lang="en">\n  <body><button class="btn btn-primary">Subscribe</button></body>\n</html>';
    const sampleComponentsManifest =
      'components.manifest schema v1 for default\nAvailable component groups:\n- Buttons and calls to action: selectors .btn, .btn-primary; tokens --accent';

    it('appends BOTH a tokens block and a fixture block when both inputs are present', () => {
      const prompt = composeSystemPrompt({
        designSystemTitle: 'default',
        designSystemBody: '# Neutral Modern\n\n> Category: Utility\n\nProse description.',
        designSystemTokensCss: sampleTokensCss,
        designSystemFixtureHtml: sampleFixtureHtml,
      });

      expect(prompt).toContain('## Active design system tokens — default');
      expect(prompt).toContain('Paste the unscoped `:root { ... }` block verbatim');
      expect(prompt).toContain('--accent: #0050d8;');

      expect(prompt).toContain('## Reference fixture — default');
      expect(prompt).toContain('Match its component shapes');
      expect(prompt).toContain('class="btn btn-primary"');
    });

    it('places USAGE.md before DESIGN.md so it acts as the package router', () => {
      const prompt = composeSystemPrompt({
        designSystemTitle: 'default',
        designSystemBody: 'PROSE_BODY_MARKER',
        designSystemUsageMd: 'Read Order: inspect the manifest cache before source evidence.',
      });

      const usageAt = prompt.indexOf('## How to use this design system — default');
      const proseAt = prompt.indexOf('## Active design system — default');
      expect(usageAt).toBeGreaterThan(0);
      expect(proseAt).toBeGreaterThan(usageAt);
      expect(prompt).toContain('Read Order: inspect the manifest cache before source evidence.');
    });

    it('injects a small default usage router for legacy brands with no USAGE.md', () => {
      const prompt = composeSystemPrompt({
        designSystemTitle: 'legacy',
        designSystemBody: '# Legacy\n\nProse description.',
      });

      expect(prompt).toContain('## How to use this design system — legacy');
      expect(prompt).toContain('Read DESIGN.md for visual principles');
      expect(prompt).toContain('do not assume those files have already been loaded');
    });

    it('prefers the component manifest over the full fixture when both are present', () => {
      const prompt = composeSystemPrompt({
        designSystemTitle: 'default',
        designSystemBody: '# Neutral Modern\n\n> Category: Utility\n\nProse description.',
        designSystemTokensCss: sampleTokensCss,
        designSystemComponentsManifest: sampleComponentsManifest,
        designSystemFixtureHtml: sampleFixtureHtml,
      });

      expect(prompt).toContain('## Reference component manifest — default');
      expect(prompt).toContain('components.manifest schema v1 for default');
      expect(prompt).toContain('Buttons and calls to action');
      expect(prompt).not.toContain('## Reference fixture — default');
      expect(prompt).not.toContain('class="btn btn-primary"');
    });

    it('keeps the prompt byte-equivalent to the legacy path when both inputs are omitted', () => {
      const baseline = composeSystemPrompt({
        designSystemTitle: 'default',
        designSystemBody: '# Neutral Modern\n\nProse only.',
      });
      const withFlagOffEquivalent = composeSystemPrompt({
        designSystemTitle: 'default',
        designSystemBody: '# Neutral Modern\n\nProse only.',
        designSystemTokensCss: undefined,
        designSystemComponentsManifest: undefined,
        designSystemFixtureHtml: undefined,
      });

      expect(withFlagOffEquivalent).toBe(baseline);
      expect(withFlagOffEquivalent).not.toContain('## Active design system tokens');
      expect(withFlagOffEquivalent).not.toContain('## Reference component manifest');
      expect(withFlagOffEquivalent).not.toContain('## Reference fixture');
    });

    it('gates the tokens and fixture blocks independently — either may be absent', () => {
      const tokensOnly = composeSystemPrompt({
        designSystemTitle: 'default',
        designSystemBody: '# x\n\nbody',
        designSystemTokensCss: sampleTokensCss,
      });
      expect(tokensOnly).toContain('## Active design system tokens — default');
      expect(tokensOnly).not.toContain('## Reference fixture');

      const fixtureOnly = composeSystemPrompt({
        designSystemTitle: 'default',
        designSystemBody: '# x\n\nbody',
        designSystemFixtureHtml: sampleFixtureHtml,
      });
      expect(fixtureOnly).not.toContain('## Active design system tokens');
      expect(fixtureOnly).toContain('## Reference fixture — default');

      const manifestOnly = composeSystemPrompt({
        designSystemTitle: 'default',
        designSystemBody: '# x\n\nbody',
        designSystemComponentsManifest: sampleComponentsManifest,
      });
      expect(manifestOnly).not.toContain('## Active design system tokens');
      expect(manifestOnly).toContain('## Reference component manifest — default');
    });

    it('adds the pull-layer index without loading pull-layer file contents', () => {
      const prompt = composeSystemPrompt({
        designSystemTitle: 'default',
        designSystemBody: '# x\n\nbody',
        designSystemPullIndex:
          'Additional design-system files declared by manifest.json:\n- preview/colors.html: Colors; colors\n- source/evidence.md: import evidence notes',
      });

      expect(prompt).toContain('## Pull-layer files available on demand — default');
      expect(prompt).toContain('preview/colors.html: Colors; colors');
      expect(prompt).toContain('source/evidence.md: import evidence notes');
      expect(prompt).toContain('The files below are not already present in this prompt');
    });

    it('shows core pull files only in compact Ask mode, not when they are already inline', () => {
      const shared = {
        designSystemTitle: 'default',
        designSystemBody: '# x\n\nbody',
        designSystemTokensCss: ':root { --accent: #111; }',
        designSystemComponentsManifest: 'buttons: .btn',
        designSystemCorePullIndex:
          'Core design-system files available on demand:\n- DESIGN.md: full design-system guidance\n- tokens.css: compiled token contract',
        designSystemPullIndex:
          'Additional design-system files declared by manifest.json:\n- preview/colors.html: Colors; colors',
        executionProfile: 'filesystem' as const,
      };
      const design = composeSystemPrompt(shared);
      const plan = composeSystemPrompt({ ...shared, sessionMode: 'plan' });
      const ask = composeSystemPrompt({ ...shared, sessionMode: 'chat' });

      expect(design).toContain('preview/colors.html: Colors; colors');
      expect(design).not.toContain('DESIGN.md: full design-system guidance');
      expect(design).not.toContain('tokens.css: compiled token contract');
      expect(plan).toContain('preview/colors.html: Colors; colors');
      expect(plan).toContain('DESIGN.md: full design-system guidance');
      expect(plan).not.toContain('tokens.css: compiled token contract');
      expect(ask).toContain('preview/colors.html: Colors; colors');
      expect(ask).toContain('DESIGN.md: full design-system guidance');
      expect(ask).toContain('tokens.css: compiled token contract');
    });

    it('adds importMode guidance when the manifest declares consumption semantics', () => {
      const prompt = composeSystemPrompt({
        designSystemTitle: 'source-heavy',
        designSystemBody: '# x\n\nbody',
        designSystemImportMode: 'verbatim',
      });

      expect(prompt).toContain('## Design system import mode — source-heavy');
      expect(prompt).toContain('Preserve source semantics and source naming');
      expect(prompt).toContain('pull-layer source evidence or snippets');
    });

    it('places the tokens + component manifest blocks AFTER the DESIGN.md prose block (prose sets voice, structured form binds names)', () => {
      const prompt = composeSystemPrompt({
        designSystemTitle: 'default',
        designSystemBody: 'PROSE_BODY_MARKER',
        designSystemTokensCss: sampleTokensCss,
        designSystemComponentsManifest: sampleComponentsManifest,
        designSystemFixtureHtml: sampleFixtureHtml,
      });
      const proseAt = prompt.indexOf('PROSE_BODY_MARKER');
      const tokensAt = prompt.indexOf('## Active design system tokens');
      const fixtureAt = prompt.indexOf('## Reference component manifest');
      expect(proseAt).toBeGreaterThan(0);
      expect(tokensAt).toBeGreaterThan(proseAt);
      expect(fixtureAt).toBeGreaterThan(tokensAt);
    });

    it('treats whitespace-only inputs as absent (defensive, matches DESIGN.md block behavior)', () => {
      const prompt = composeSystemPrompt({
        designSystemTitle: 'default',
        designSystemBody: '# x\n\nbody',
        designSystemTokensCss: '   \n  \t  ',
        designSystemComponentsManifest: '\n\t',
        designSystemFixtureHtml: '\n\n',
      });
      expect(prompt).not.toContain('## Active design system tokens');
      expect(prompt).not.toContain('## Reference component manifest');
      expect(prompt).not.toContain('## Reference fixture');
    });
  });
});
