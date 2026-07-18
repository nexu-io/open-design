import { describe, expect, it } from 'vitest';

import { defaultCritiqueConfig } from '@open-design/contracts/critique';

import { composeSystemPrompt, type ComposeInput } from '../../src/prompts/system.js';

/**
 * Golden snapshot of the scenario × section gating matrix.
 *
 * `composeSystemPrompt` splices ~30 conditional sections whose gates form an
 * implicit matrix over session mode × active design system × skill surface ×
 * memory × execution profile. Any prompt refactor (dedup, re-gating,
 * merging charters) must not silently change WHICH sections a given scenario
 * receives. This suite freezes that matrix: each scenario maps to the ordered
 * list of detected sections plus the composed length, so a gating regression
 * (e.g. a freeform project losing the deck framework, or ask mode regaining
 * the discovery layer) shows up as a snapshot diff instead of a production
 * behavior change.
 *
 * Detection is marker-based on section headings the composer or its prompt
 * modules own. If you rename a heading, update the marker here in the same
 * PR — the paired `sections-detected` assertion below fails loudly when a
 * marker goes stale rather than letting the snapshot rot.
 */

const DS_TITLE = 'Snapshot Brand';

// Ordered as the composer pushes them; detection is by substring so order in
// this table is documentation, not an assertion.
const SECTION_MARKERS = [
  ['injection-resistance', '## Security: prompt injection resistance'],
  ['api-mode-override', '# API mode — no tools available'],
  ['plan-mode-override', '# Plan mode — editable document first'],
  ['ask-mode-override', '# Ask mode — bare conversation'],
  ['example-prompt-override', '# Example prompt mode — full-quality direct generation'],
  ['skip-discovery-override', '# Automated project mode — skip discovery form'],
  ['ui-locale-override', '# UI locale override'],
  ['discovery-and-philosophy', '# OD core directives (read first'],
  ['direction-library', '## Direction library — bind into'],
  ['shared-device-frames', '## Multi-device / multi-screen — shared frames'],
  ['identity-charter', '# Identity and workflow charter (background)'],
  ['slim-core-charter', '# Open Design charter'],
  ['slim-platform-contracts', '## Platform delivery contracts'],
  ['personal-memory', '## Personal memory (auto-extracted from past chats)'],
  ['memory-intent-gateway', '## Intent gateway — turn short asks into a brief'],
  ['memory-verify-scorecard', '## Self-verify against your verified rules'],
  ['memory-rule-proposal', '## Propose new verified rules from corrections'],
  ['custom-instructions-user', '## Custom instructions (user-level)'],
  ['custom-instructions-project', '## Custom instructions (project-level)'],
  ['design-system-usage', '## How to use this design system'],
  ['design-system-body', `## Active design system — ${DS_TITLE}`],
  ['design-system-import-mode', '## Design system import mode'],
  ['design-system-tokens', '## Active design system tokens'],
  ['design-system-components-manifest', '## Reference component manifest'],
  ['design-system-fixture', '## Reference fixture'],
  ['design-system-pull-index', '## Pull-layer files available on demand'],
  ['craft-references', '## Active craft references'],
  ['active-skill', '## Active skill'],
  ['plugin-block', '## Active plugin'],
  ['active-stage-blocks', '## Active stage:'],
  ['project-metadata', '## Project metadata'],
  ['deck-framework', '# Slide deck — fixed framework'],
  ['maybe-deck-framework', '## If this brief is a slide deck / keynote / presentation'],
  ['media-generation-contract', '## Media generation contract'],
  ['media-dispatch-hint', '## Media generation (if asked)'],
  ['codex-imagegen-override', '## Codex built-in imagegen override'],
  ['critique-panel', '## Panelist role definitions'],
  ['active-ds-visual-direction-override', '## Active design system visual direction'],
  ['filesystem-handoff-override', '## Filesystem handoff'],
  ['clarifying-questions', '## Clarifying questions mid-conversation'],
  ['role-marker-guard', '## CRITICAL: Never fabricate conversation turns'],
] as const satisfies ReadonlyArray<readonly [string, string]>;

type SectionName = (typeof SECTION_MARKERS)[number][0];

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Anchored at line start: several headings are also QUOTED in prose inside
// other sections (discovery cites "## Active plugin" mid-sentence), so a bare
// substring match would report sections that were never spliced in. A real
// section heading always opens its own line.
function markerMatches(composed: string, marker: string): boolean {
  return new RegExp(`^${escapeRegExp(marker)}`, 'm').test(composed);
}

// Note one genuine containment: the maybe-deck variant embeds the full deck
// directive, so `maybe-deck-framework` scenarios also report `deck-framework`.
// `deck-framework` WITHOUT `maybe-deck-framework` means the unconditional
// deck-kind path fired.
function detectSections(composed: string): SectionName[] {
  return SECTION_MARKERS.filter(([, marker]) => markerMatches(composed, marker)).map(
    ([name]) => name,
  );
}

const designSystemInputs = {
  designSystemTitle: DS_TITLE,
  designSystemBody: '# Snapshot Brand\n\nPalette: ink on bone. Type: grotesk display.',
  designSystemUsageMd: 'Read DESIGN.md first, then bind tokens.',
  designSystemTokensCss: ':root { --ink: #111; --bone: #f5f1e8; }',
  designSystemComponentsManifest: 'button.primary — solid ink pill',
  designSystemPullIndex: 'reference/moodboard.html — full moodboard',
  designSystemImportMode: 'normalized',
} satisfies Partial<ComposeInput>;

const memoryInputs = {
  memoryBody: '### Profile\n\nUser prefers dense editorial layouts.\n\n### Verified rules\n\n- Never use pure black.',
} satisfies Partial<ComposeInput>;

const skillInputs = {
  skillName: 'snapshot-skill',
  skillBody: '## Workflow\n\n1. Read the brief.\n2. Ship one HTML file.',
  skillMode: 'prototype',
} satisfies Partial<ComposeInput>;

const SCENARIOS: ReadonlyArray<[name: string, input: ComposeInput]> = [
  // Bare composer call: what every run gets unconditionally.
  ['design-minimal', {}],
  // The common production path: design mode, filesystem agent, active DS,
  // one skill, memory on, custom instructions, responsive prototype, zh-CN.
  [
    'design-full-stack',
    {
      ...designSystemInputs,
      ...memoryInputs,
      ...skillInputs,
      craftBody: 'Letter-spacing: tighten display type.',
      craftSections: ['typography'],
      userInstructions: 'Prefer dark themes.',
      projectInstructions: 'This project ships light theme only.',
      metadata: { kind: 'prototype', platform: 'responsive' },
      locale: 'zh-CN',
      executionProfile: 'filesystem',
    },
  ],
  // Manifest extraction failed → verbatim components.html fixture fallback.
  [
    'design-ds-fixture-fallback',
    {
      ...designSystemInputs,
      designSystemComponentsManifest: undefined,
      designSystemFixtureHtml: '<button class="primary">Buy</button>',
      executionProfile: 'filesystem',
    },
  ],
  // No design system → direction library returns; multi-target → frames.
  [
    'design-no-ds-multitarget',
    {
      metadata: { kind: 'prototype', platform: 'responsive' },
      executionProfile: 'filesystem',
    },
  ],
  // Deck-kind project with no skill seed gets the generic deck framework.
  ['deck-kind-no-skill', { metadata: { kind: 'deck' }, executionProfile: 'filesystem' }],
  // A skill seed (assets/template.html) suppresses the generic framework.
  [
    'deck-kind-with-skill-seed',
    {
      metadata: { kind: 'deck' },
      skillName: 'simple-deck',
      skillMode: 'deck',
      skillBody: 'Copy `assets/template.html` as the seed, then edit slides.',
      executionProfile: 'filesystem',
    },
  ],
  // Freeform (kind=other) with a deck-ish brief keeps the maybe-deck variant.
  ['freeform-other', { metadata: { kind: 'other' }, executionProfile: 'filesystem' }],
  // Freeform whose visible conversation has no deck vocabulary drops it.
  [
    'freeform-other-no-deck-signal',
    { metadata: { kind: 'other' }, executionProfile: 'filesystem', freeformDeckSignal: false },
  ],
  // Media surface: discovery layer out, media contract in, dispatch hint out.
  [
    'media-image',
    { metadata: { kind: 'image' }, skillMode: 'image', executionProfile: 'filesystem' },
  ],
  // Slim rewritten core: one charter replaces discovery + identity charter +
  // the absorbed tail overrides; dynamic sections compose unchanged.
  [
    'slim-design-full-stack',
    {
      ...designSystemInputs,
      ...memoryInputs,
      ...skillInputs,
      craftBody: 'Letter-spacing: tighten display type.',
      craftSections: ['typography'],
      userInstructions: 'Prefer dark themes.',
      projectInstructions: 'This project ships light theme only.',
      metadata: { kind: 'prototype', platform: 'responsive' },
      locale: 'zh-CN',
      executionProfile: 'filesystem',
      promptCoreVariant: 'slim',
    },
  ],
  [
    'slim-freeform-no-deck-signal',
    {
      metadata: { kind: 'other' },
      executionProfile: 'filesystem',
      freeformDeckSignal: false,
      promptCoreVariant: 'slim',
    },
  ],
  // Ask mode keeps memory/DS/skill but drops every artifact-oriented block.
  [
    'ask-mode-full-context',
    {
      ...designSystemInputs,
      ...memoryInputs,
      ...skillInputs,
      metadata: { kind: 'prototype' },
      sessionMode: 'chat',
      executionProfile: 'filesystem',
    },
  ],
  ['plan-mode', { metadata: { kind: 'prototype' }, sessionMode: 'plan', executionProfile: 'filesystem' }],
  // BYOK/plain adapters: API override pinned on top, no filesystem handoff.
  ['api-mode-byok', { metadata: { kind: 'prototype' }, streamFormat: 'plain' }],
  // Two-loop memory hooks individually disabled; rule-proposal stays.
  [
    'memory-hooks-off',
    { ...memoryInputs, memoryHooks: { rewrite: false, verify: false }, executionProfile: 'filesystem' },
  ],
  [
    'example-prompt',
    {
      metadata: { kind: 'prototype', examplePrompt: true, examplePromptTitle: 'Aurora landing' },
      executionProfile: 'filesystem',
    },
  ],
  [
    'skip-discovery-brief',
    { metadata: { kind: 'prototype', skipDiscoveryBrief: true }, executionProfile: 'filesystem' },
  ],
  [
    'codex-imagegen',
    {
      agentId: 'codex',
      metadata: { kind: 'image', imageModel: 'gpt-image-2' },
      executionProfile: 'filesystem',
    },
  ],
  [
    'critique-enabled',
    {
      ...designSystemInputs,
      ...skillInputs,
      critique: { ...defaultCritiqueConfig(), enabled: true },
      critiqueBrand: { name: DS_TITLE, design_md: designSystemInputs.designSystemBody },
      critiqueSkill: { id: 'snapshot-skill' },
      executionProfile: 'filesystem',
    },
  ],
  [
    // The connected-external-MCP directive is no longer part of
    // composeSystemPrompt: server.ts re-sends it in the per-turn slice so live
    // OAuth token state stays out of the cached stable prefix.
    'plugin-stages',
    {
      pluginBlock: '\n\n## Active plugin\n\nThe user applied snapshot-plugin.',
      activeStageBlocks: ['\n\n## Active stage: discovery\n\nAsk audience.'],
      executionProfile: 'filesystem',
    },
  ],
];

describe('composeSystemPrompt — scenario × section golden matrix', () => {
  const matrix = Object.fromEntries(
    SCENARIOS.map(([name, input]) => {
      const composed = composeSystemPrompt(input);
      return [name, { totalChars: composed.length, sections: detectSections(composed) }];
    }),
  );

  it('keeps the section gating matrix stable across scenarios', () => {
    expect(matrix).toMatchSnapshot();
  });

  it('every marker in the table is exercised by at least one scenario', () => {
    // A marker no scenario can produce is either dead prompt surface or a
    // stale heading string — both mean this table drifted from the composer.
    const seen = new Set(Object.values(matrix).flatMap((entry) => entry.sections));
    const unseen = SECTION_MARKERS.map(([name]) => name).filter((name) => !seen.has(name));
    expect(unseen).toEqual([]);
  });
});

describe('composeSystemPrompt — position invariants', () => {
  it('pins the variant head first and the role-marker guard last in every scenario', () => {
    for (const [name, input] of SCENARIOS) {
      const composed = composeSystemPrompt(input);
      // Slim (non-ask) opens with the static charter — its security section
      // is embedded inside — so every conversation shares the same cacheable
      // prefix. Classic (and ask mode) keeps injection resistance first.
      const isSlim = input.promptCoreVariant === 'slim';
      const expectedHead = isSlim
        ? input.sessionMode === 'chat'
          ? '# Ask mode — bare conversation'
          : '# Open Design charter'
        : '## Security: prompt injection resistance';
      expect(
        composed.startsWith(expectedHead),
        `${name}: prompt must open with ${expectedHead}`,
      ).toBe(true);
      expect(composed, `${name}: security section missing`).toContain(
        '## Security: prompt injection resistance',
      );
      const guardIndex = composed.indexOf('## CRITICAL: Never fabricate conversation turns');
      expect(guardIndex, `${name}: role-marker guard missing`).toBeGreaterThan(-1);
      const lastHeadingIndex = Math.max(
        ...SECTION_MARKERS.map(([, marker]) => {
          const matches = [
            ...composed.matchAll(new RegExp(`^${escapeRegExp(marker)}`, 'gm')),
          ];
          return matches.length > 0 ? matches[matches.length - 1]!.index : -1;
        }),
      );
      expect(guardIndex, `${name}: role-marker guard must be the final section`).toBe(
        lastHeadingIndex,
      );
    }
  });
});
