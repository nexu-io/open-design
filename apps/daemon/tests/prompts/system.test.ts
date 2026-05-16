import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { composeSystemPrompt } from '../../src/prompts/system.js';

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
const hyperframesSkillMarkdown = readFileSync(hyperframesSkillPath, 'utf8');
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
  });

  it('does not add the responsive web contract to deck metadata without platform fields', () => {
    const prompt = composeSystemPrompt({
      metadata: {
        kind: 'deck',
        speakerNotes: true,
      } as any,
    });

    expect(prompt).toContain('- **kind**: deck');
    expect(prompt).not.toContain('**responsive web contract**');
    expect(prompt).not.toContain('**platformTargets**');
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

    it('forbids wrapping in-place-edit-only turns in an artifact block', () => {
      const prompt = composeSystemPrompt({});
      expect(prompt).toMatch(/in-place|Edit-only|already-existing/i);
      expect(prompt).toMatch(/do not (emit|wrap|send) (a |an )?`?<artifact/i);
    });

    it('forbids putting prose / summaries / paths inside an artifact block', () => {
      const prompt = composeSystemPrompt({});
      expect(prompt).toMatch(/complete `?<!doctype html>`?/i);
      expect(prompt).toMatch(/summar(y|ies)|prose|file path/i);
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

    it('declares artifact-emission conditionality at the dominant discovery layer', () => {
      const prompt = composeSystemPrompt({});
      // The base prompt's "When NOT to emit" section is at lower precedence than
      // DISCOVERY_AND_PHILOSOPHY, so the exception itself must be stated once at
      // the dominant layer (near RULE 3) — not only back-pointed.
      expect(prompt).toMatch(/only when this turn wrote a new canonical HTML/i);
      expect(prompt).toMatch(/only edited an existing HTML file/i);
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
      expect(deckPrompt).toMatch(/Emit single <artifact> if a new canonical deck HTML/i);
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

    it('keeps the prompt byte-equivalent to the legacy path when both inputs are omitted', () => {
      const baseline = composeSystemPrompt({
        designSystemTitle: 'default',
        designSystemBody: '# Neutral Modern\n\nProse only.',
      });
      const withFlagOffEquivalent = composeSystemPrompt({
        designSystemTitle: 'default',
        designSystemBody: '# Neutral Modern\n\nProse only.',
        designSystemTokensCss: undefined,
        designSystemFixtureHtml: undefined,
      });

      expect(withFlagOffEquivalent).toBe(baseline);
      expect(withFlagOffEquivalent).not.toContain('## Active design system tokens');
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
    });

    it('places the tokens + fixture blocks AFTER the DESIGN.md prose block (prose sets voice, structured form binds names)', () => {
      const prompt = composeSystemPrompt({
        designSystemTitle: 'default',
        designSystemBody: 'PROSE_BODY_MARKER',
        designSystemTokensCss: sampleTokensCss,
        designSystemFixtureHtml: sampleFixtureHtml,
      });
      const proseAt = prompt.indexOf('PROSE_BODY_MARKER');
      const tokensAt = prompt.indexOf('## Active design system tokens');
      const fixtureAt = prompt.indexOf('## Reference fixture');
      expect(proseAt).toBeGreaterThan(0);
      expect(tokensAt).toBeGreaterThan(proseAt);
      expect(fixtureAt).toBeGreaterThan(tokensAt);
    });

    it('treats whitespace-only inputs as absent (defensive, matches DESIGN.md block behavior)', () => {
      const prompt = composeSystemPrompt({
        designSystemTitle: 'default',
        designSystemBody: '# x\n\nbody',
        designSystemTokensCss: '   \n  \t  ',
        designSystemFixtureHtml: '\n\n',
      });
      expect(prompt).not.toContain('## Active design system tokens');
      expect(prompt).not.toContain('## Reference fixture');
    });
  });
});
