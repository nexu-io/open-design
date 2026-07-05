import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { composeSystemPrompt, resolveExclusiveSurface } from '../../src/prompts/system.js';

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
    expect(prompt).toContain('substantial plan-document work still starts with a real TodoWrite/task-list tool call');
    expect(prompt).toContain('show progress through the Todo card');
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
    expect(prompt).toContain('you may drop the `brand` question as already answered, but you must still treat that provided source as Branch A below');
    expect(prompt).toContain('When skipping the form, do not skip brand-source handling');
    expect(prompt).toContain('If the current message, attachments, prior brief, or URL already contains an actual brand spec / brand guide / reference site / screenshot source, use Branch A.');
    expect(prompt).toContain('### Branch A — user provided a brand/reference source, or `brand` value is `"brand_spec"` / `"reference_match"`');
    expect(prompt).toContain('ask them to paste/upload the brand spec or reference and stop');
    expect(prompt).toContain('Do not guess a brand domain or invent tokens');
    expect(prompt).toContain('An active design system does not suppress Branch A when the user provides a brand/reference source');
    expect(prompt).toContain('### Branch B — no user-provided brand/reference source and no Branch A brand value');
    expect(prompt).toContain('active-design-system cases where the user did not provide a new brand/reference source');
    expect(prompt).toContain('Provided brand/reference source → run brand-spec extraction');
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
    expect(prompt).toContain('Do not run `npx hyperframes render` yourself');
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
    }
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
      expect(prompt).toContain('## Clarifying questions mid-conversation');
      expect(prompt).toContain('`<question-form>` is assistant text for the Open Design UI, not a native tool call');
      expect(prompt).toContain(
        'emit the complete `<question-form>...</question-form>` block directly in the assistant message before any TodoWrite, file write/edit, Bash, or other native tool call',
      );
      expect(prompt).toContain('Do not stop after an introductory sentence such as "先确认一下方向："');
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

    it('also keeps deck-mode prompts free of the unconditional emit line (DECK_FRAMEWORK_DIRECTIVE only stacks for deck projects)', () => {
      // The plain composeSystemPrompt({}) call does NOT include
      // DECK_FRAMEWORK_DIRECTIVE; that directive only stacks when
      // `skillMode === 'deck'` or `metadata.kind === 'deck'`. So if
      // deck-framework.ts:327 ever regresses back to "Emit single <artifact>",
      // a no-args negative assertion is a false negative — exercise the deck
      // path explicitly here.
      const deckPrompt = composeSystemPrompt({ skillMode: 'deck' });
      expect(deckPrompt).not.toMatch(/^7\.\s+Emit single <artifact>\s*$/m);
      expect(deckPrompt).toMatch(/Summarize the written or changed deck file/i);
    });
  });

  describe('connectedExternalMcp directive', () => {
    it('omits the directive when no servers are passed', () => {
      const prompt = composeSystemPrompt({});
      expect(prompt).not.toContain('External MCP servers — already authenticated');
      expect(prompt).not.toContain('mcp__<server>__authenticate');
    });

    it('omits the directive when an empty array is passed', () => {
      const prompt = composeSystemPrompt({ connectedExternalMcp: [] });
      expect(prompt).not.toContain('External MCP servers — already authenticated');
    });

    it('lists each connected server and forbids the synthetic auth tools', () => {
      const prompt = composeSystemPrompt({
        connectedExternalMcp: [
          { id: 'higgsfield-openclaw', label: 'Higgsfield (OpenClaw)' },
          { id: 'github' },
        ],
      });

      expect(prompt).toContain('## External MCP servers — already authenticated');
      expect(prompt).toContain('`higgsfield-openclaw`');
      expect(prompt).toContain('Higgsfield (OpenClaw)');
      expect(prompt).toContain('`github`');
      expect(prompt).toContain(
        '**Do NOT call any tool whose name matches `mcp__<server>__authenticate` or `mcp__<server>__complete_authentication`',
      );
      expect(prompt).toContain('localhost:<random>/callback');
      expect(prompt).toContain('Settings → External MCP');
    });

    it('skips entries with blank ids and emits no directive when nothing usable remains', () => {
      const prompt = composeSystemPrompt({
        connectedExternalMcp: [
          { id: '   ', label: 'blank' },
          { id: '', label: 'empty' },
        ] as any,
      });
      expect(prompt).not.toContain('External MCP servers — already authenticated');
    });

    it('does not duplicate the label when it equals the id', () => {
      const prompt = composeSystemPrompt({
        connectedExternalMcp: [{ id: 'github', label: 'github' }],
      });
      expect(prompt).toContain('- `github`\n');
      expect(prompt).not.toContain('- `github` (github)');
    });

    it('keeps external MCP tools visible when OD-owned media execution is disabled', () => {
      const prompt = composeSystemPrompt({
        connectedExternalMcp: [{ id: 'external-media', label: 'External media' }],
        metadata: { kind: 'image' },
        mediaExecution: { mode: 'disabled' },
      });

      expect(prompt).toContain('## External MCP servers — already authenticated');
      expect(prompt).toContain('`external-media`');
      expect(prompt).toContain('Open Design-owned media execution is **disabled for this run**');
      expect(prompt).not.toContain('## Media generation contract');
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
      expect(prompt).toContain('Keep the push prompt light');
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
