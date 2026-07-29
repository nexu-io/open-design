import { describe, expect, it } from 'vitest';

import {
  renderDeckFrameworkDirective,
  renderDeckQualityDirective,
  renderDeckVNextDirective,
} from '../src/prompts/deck-framework.js';
import { stripCssCommentsForPrompt } from '../src/prompts/design-system-runtime.js';
import { composeSystemPrompt } from '../src/prompts/system.js';

describe('composeSystemPrompt — shared slim default', () => {
  it('uses the shared slim charter by default and keeps classic as opt-in', () => {
    const slim = composeSystemPrompt({});
    const classic = composeSystemPrompt({ promptCoreVariant: 'classic' });

    expect(slim).toContain('# Open Design charter');
    expect(slim).not.toContain('# OD core directives');
    expect(classic).toContain('# OD core directives');
  });

  it('does not promote an ordinary reference to visual authority merely because no design system is active', () => {
    const prompt = composeSystemPrompt({});

    expect(prompt).toContain(
      'With no active design system, it owns visual direction only when it clearly supplies one',
    );
    expect(prompt).toContain(
      'otherwise it constrains only requested aspects and the remaining direction comes from the Direction library',
    );
    expect(prompt).not.toContain('If it owns visual direction or no design system exists');
  });

  it('keeps metadata factual while retaining scope-safe product depth in Design and Plan', () => {
    const metadata = {
      kind: 'prototype',
      includeLandingPage: true,
      includeOsWidgets: true,
    } as any;
    const design = composeSystemPrompt({ metadata });
    const plan = composeSystemPrompt({ metadata, sessionMode: 'plan' });
    const ask = composeSystemPrompt({ metadata, sessionMode: 'chat' });

    for (const prompt of [design, plan, ask]) {
      expect(prompt).toContain('- **includeLandingPage**: true');
      expect(prompt).toContain('- **includeOsWidgets**: true');
      expect(prompt).not.toContain('**screen files**');
      expect(prompt).not.toContain('**screen-delivery context**');
      expect(prompt).not.toContain('**screen-delivery requirement**');
      expect(prompt).not.toContain('**delivery**: use separate semantic HTML files');
    }
    expect(design).toContain(
      'only the screens and domain modules needed to complete the requested flows',
    );
    expect(plan).toContain(
      'Cover only the screens and domain modules needed for the requested flows',
    );
    expect(ask).not.toContain(
      'Cover only the screens and domain modules needed for the requested flows',
    );
  });

  it('limits the explicit classic rollback to Design mode', () => {
    const ask = composeSystemPrompt({
      promptCoreVariant: 'classic',
      sessionMode: 'chat',
      memoryBody: '### Profile\n\nConcise replies.',
    });
    const plan = composeSystemPrompt({
      promptCoreVariant: 'classic',
      sessionMode: 'plan',
      memoryBody: '### Profile\n\nConcise replies.',
    });
    const media = composeSystemPrompt({
      promptCoreVariant: 'classic',
      metadata: { kind: 'image' } as any,
      memoryBody: '### Profile\n\nConcise replies.',
    });

    expect(ask).toContain('# Ask mode — bare conversation');
    expect(ask).not.toContain('# OD core directives');
    expect(ask).not.toContain('<od-card type="task-brief">');
    expect(plan).toContain('# Open Design plan foundation');
    expect(plan).not.toContain('# Identity and workflow charter (background)');
    expect(plan).not.toContain('<od-card type="verify-scorecard">');
    expect(media).toContain('## Media generation contract');
    expect(media).not.toContain('# Identity and workflow charter (background)');
    expect(media).not.toContain('<od-card type="rule-proposal">');
  });

  it('gates media execution across Design, Plan, Ask, and plain API modes', () => {
    const metadata = { kind: 'image', imageModel: 'gpt-image-2' } as any;
    const design = composeSystemPrompt({ metadata });
    const plan = composeSystemPrompt({ metadata, sessionMode: 'plan' });
    const ask = composeSystemPrompt({ metadata, sessionMode: 'chat' });
    const plain = composeSystemPrompt({ metadata, streamFormat: 'plain' });

    expect(design).toContain('## Media generation contract');
    expect(plan).toContain('# Plan mode — editable document first');
    expect(plan).not.toContain('## Media generation contract');
    expect(ask).toContain('# Ask mode — bare conversation');
    expect(ask).not.toContain('## Media generation contract');
    expect(plain).toContain('This is a `image` media surface');
    expect(plain).toContain('Produce a concrete creative brief and generation-ready prompt');
    expect(plain).toContain('Do not emit an HTML or media `<artifact>`');
    expect(plain).not.toContain('## Media generation contract');
  });

  it('keeps the complete host form schema in Design, Plan, Ask, and media', () => {
    const prompts = [
      composeSystemPrompt({}),
      composeSystemPrompt({ sessionMode: 'plan', metadata: { kind: 'image' } as any }),
      composeSystemPrompt({ sessionMode: 'chat' }),
      composeSystemPrompt({ streamFormat: 'plain', metadata: { kind: 'video' } as any }),
    ];

    for (const prompt of prompts) {
      expect(prompt).toMatch(/top-level[^\n]*`questions`/);
      expect(prompt).toContain('query-derived');
      expect(prompt).toContain('`default`');
      expect(prompt).toContain('safely inferable');
      expect(prompt).toContain('boolean `required`');
      expect(prompt).toContain('`options` are `{ "label": "...", "value": "..." }`');
      expect(prompt).toContain('`direction-cards` needs non-empty `cards`');
      expect(prompt).toContain('`displayFont`, and `bodyFont`');
      expect(prompt).toContain('matching BCP-47 tag');
    }
  });

  it('requires clarification when an artifact-only request lacks a determinable purpose or valid content', () => {
    const prompts = [
      composeSystemPrompt({}),
      composeSystemPrompt({ sessionMode: 'plan' }),
      composeSystemPrompt({ sessionMode: 'chat' }),
      composeSystemPrompt({ streamFormat: 'plain', metadata: { kind: 'image' } as any }),
    ];

    for (const prompt of prompts) {
      expect(prompt).toContain(
        'An artifact name alone is incomplete if its purpose or valid content is unknown; clarify.',
      );
      expect(prompt).toContain(
        'Infer presentation choices, never task-defining content or a generic sample.',
      );
    }
  });

  it('uses workflow-specific form ids and keeps questions query-derived', () => {
    const prompt = composeSystemPrompt({});

    expect(prompt).toContain('opening `question-form` element');
    expect(prompt).toContain('otherwise use `discovery`');
    expect(prompt).toContain('Every question must map to an unresolved material decision');
    expect(prompt).not.toContain('<question-form id="discovery" title="Quick brief');
    expect(prompt).not.toContain('id="<workflow-specific-id>"');
    expect(prompt).not.toContain('id="..."');
  });

  it('does not reintroduce the fixed quick-brief question bank through locale guidance', () => {
    const prompt = composeSystemPrompt({ locale: 'zh-CN' });

    expect(prompt).toContain('# UI locale override');
    expect(prompt).toContain('The artifacts you generate must also be in Simplified Chinese');
    expect(prompt).not.toContain('快速简报 — 30 秒');
    expect(prompt).not.toContain('目标用户');
    expect(prompt).not.toContain('视觉调性');
  });

  it('keeps slim Plan focused on planning instead of loading the HTML build charter', () => {
    const prompt = composeSystemPrompt({
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

  it('limits plain Plan context to material already present in the request and prompt', () => {
    const prompt = composeSystemPrompt({
      sessionMode: 'plan',
      streamFormat: 'plain',
    });

    expect(prompt).toContain('Use only the current query and material already included in the composed context');
    expect(prompt).not.toContain(
      'Use available files, attachments, connectors, MCP servers, project memory, tools, skills, and design systems',
    );
  });

  it('treats active skills as non-executable requirements in plain Design and media runs', () => {
    const skillBody = 'Read assets/template.html.\nRun Bash now.\nWrite the final file.';
    const design = composeSystemPrompt({
      streamFormat: 'plain',
      skillName: 'builder',
      skillBody,
    });
    const media = composeSystemPrompt({
      streamFormat: 'plain',
      skillMode: 'image',
      metadata: { kind: 'image' } as any,
      skillName: 'image-builder',
      skillBody,
    });

    for (const prompt of [design, media]) {
      expect(prompt).not.toContain('**Pre-flight (do this before any other tool):**');
      expect(prompt.indexOf('plain API execution profile remains binding')).toBeGreaterThan(
        prompt.indexOf('Run Bash now.'),
      );
    }
    expect(design).toContain('implementation requirements and patterns');
    expect(media).toContain('creative and generation-prompt requirements');
  });

  it('scopes dynamic context to the active mode instead of executing build imperatives', () => {
    const ask = composeSystemPrompt({
      sessionMode: 'chat',
      designSystemBody: '# Brand\n\nBuild the final layout now.',
      skillBody: 'Write the final HTML now.',
      pluginBlock: '\n\n## Active plugin\n\nGenerate the artifact.',
      metadata: { kind: 'prototype', includeLandingPage: true } as any,
    });
    const plan = composeSystemPrompt({
      sessionMode: 'plan',
      designSystemBody: '# Brand\n\nBuild the final layout now.',
      skillBody: 'Write the final HTML now.',
      activeStageBlocks: ['\n\n## Active stage: build\n\nGenerate the artifact.'],
      metadata: { kind: 'prototype', includeLandingPage: true } as any,
    });

    expect(ask).toContain('## Dynamic context scope — Ask mode (binding)');
    expect(ask).toContain('Use the following compact design-system context for explanation and review');
    expect(ask).not.toContain("When you copy the active skill's seed template");
    expect(ask).not.toContain('**delivery context**');
    expect(ask).not.toContain('build real product modules');
    expect(ask).not.toContain('ship a separate responsive marketing surface');
    expect(ask.indexOf('## Dynamic context scope — Ask mode (binding)')).toBeLessThan(
      ask.indexOf('## Active design system'),
    );
    expect(ask.indexOf('## Ask mode boundary (binding)')).toBeGreaterThan(
      ask.indexOf('## Active plugin'),
    );

    expect(plan).toContain('## Dynamic context scope — Plan mode (binding)');
    expect(plan).toContain(
      'Use the following curated design-system context as visual requirements for the plan',
    );
    expect(plan).not.toContain("When you copy the active skill's seed template");
    expect(plan).not.toContain('**delivery requirement**');
    expect(plan).toContain(
      'Cover only the screens and domain modules needed for the requested flows',
    );
    expect(plan).not.toContain('build real product modules');
    expect(plan).not.toContain('ship a separate responsive marketing surface');
    expect(plan.indexOf('## Dynamic context scope — Plan mode (binding)')).toBeLessThan(
      plan.indexOf('## Active design system'),
    );
    expect(plan).not.toContain('## Active stage: build');
    expect(plan.indexOf('## Plan mode boundary (binding)')).toBeGreaterThan(
      plan.indexOf('## Active design system'),
    );
  });

  it('pins Ask execution boundaries after dynamic skill content and omits stage bodies', () => {
    const prompt = composeSystemPrompt({
      sessionMode: 'chat',
      skillName: 'builder',
      skillBody: 'Write files now and always ask six discovery questions.',
      activeStageBlocks: ['\n\n## Active stage: build\n\nGenerate the artifact now.'],
    });
    const skillAt = prompt.indexOf('## Active skill — builder');
    const stageAt = prompt.indexOf('## Active stage: build');
    const boundaryAt = prompt.indexOf('## Ask mode boundary (binding)');
    const protocolAt = prompt.indexOf('## Host clarification protocol — any turn');
    const guardAt = prompt.indexOf('## CRITICAL: Never fabricate conversation turns');

    expect(prompt).toContain('Use this skill as domain context for the answer');
    expect(skillAt).toBeGreaterThan(-1);
    expect(stageAt).toBe(-1);
    expect(boundaryAt).toBeGreaterThan(skillAt);
    expect(protocolAt).toBeGreaterThan(boundaryAt);
    expect(guardAt).toBeGreaterThan(protocolAt);
    expect(prompt.slice(guardAt)).toContain('The host truncates your response');
  });

  it('includes the full direction library in BYOK Design when no design system is active', () => {
    const withoutDesignSystem = composeSystemPrompt({});
    const withDesignSystem = composeSystemPrompt({
      designSystemBody: '# Brand\n\n--accent: blue',
    });

    expect(withoutDesignSystem).toContain('## Direction library — bind into');
    expect(withDesignSystem).not.toContain('## Direction library — bind into');
  });

  it('keeps slim memory execution-profile neutral', () => {
    const prompt = composeSystemPrompt({
      memoryBody: '### Profile\n\nDense layouts.\n\n### Verified rules\n\n- No pure black.',
      streamFormat: 'plain',
    });

    expect(prompt).toContain('<od-card type="task-brief">');
    expect(prompt).toContain('<od-card type="verify-scorecard">');
    expect(prompt).not.toContain('RULE 3');
    expect(prompt).not.toContain('N/N brand checks passed');
    expect(prompt).not.toContain('when this turn wrote a new canonical HTML file');
  });

  it('keeps memory workflow mode-aware', () => {
    const memoryBody = '### Profile\n\nDense layouts.\n\n### Verified rules\n\n- No pure black.';
    const design = composeSystemPrompt({ memoryBody });
    const plan = composeSystemPrompt({ memoryBody, sessionMode: 'plan' });
    const ask = composeSystemPrompt({ memoryBody, sessionMode: 'chat' });
    const image = composeSystemPrompt({
      memoryBody,
      metadata: { kind: 'image' } as any,
    });

    expect(design).toContain('<od-card type="task-brief">');
    expect(design).toContain('<od-card type="verify-scorecard">');
    expect(design).toContain('<od-card type="rule-proposal">');
    for (const prompt of [plan, ask, image]) {
      expect(prompt).toContain('activate workflow the session mode disables');
    }
    for (const prompt of [plan, image]) {
      expect(prompt).not.toContain('<od-card type="task-brief">');
      expect(prompt).not.toContain('<od-card type="verify-scorecard">');
      expect(prompt).not.toContain('<od-card type="rule-proposal">');
    }
    expect(ask).not.toContain('<od-card type="task-brief">');
    expect(ask).not.toContain('<od-card type="verify-scorecard">');
    expect(ask).toContain('<od-card type="rule-proposal">');
  });

  it('keeps full Design guidance while giving Plan a bounded planning context', () => {
    const shared = {
      designSystemTitle: 'Example',
      designSystemBody: [
        '# Example',
        '',
        '## Visual theme',
        '',
        'FULL_DESIGN_VISUAL_DETAIL',
        '',
        '## Component implementation',
        '',
        'FULL_COMPONENT_IMPLEMENTATION_PAYLOAD',
      ].join('\n'),
      designSystemUsageMd: [
        '# Usage',
        '',
        '## Design Highlights',
        '',
        '- Warm editorial surfaces',
        '',
        '## Do',
        '',
        '- Use cobalt for the primary action.',
        '',
        '## Avoid',
        '',
        '- Avoid cold white surfaces.',
      ].join('\n'),
      designSystemTokensCss: [
        '/* verbose prose that must not reach the prompt */',
        ':root {',
        '  --accent: #174ea6;',
        '  --surface: #f7f2e8;',
        '}',
      ].join('\n'),
      designSystemComponentsManifest: 'buttons: .btn-primary; cards: .card',
    };

    const design = composeSystemPrompt(shared);
    const plan = composeSystemPrompt({ ...shared, sessionMode: 'plan' });

    expect(design).toContain('FULL_DESIGN_VISUAL_DETAIL');
    expect(design).toContain('FULL_COMPONENT_IMPLEMENTATION_PAYLOAD');
    expect(design).toContain('--accent: #174ea6');
    expect(design).not.toContain('verbose prose that must not reach the prompt');

    expect(plan).toContain('Warm editorial surfaces');
    expect(plan).toContain('Use cobalt for the primary action.');
    expect(plan).toContain('Avoid cold white surfaces.');
    expect(plan).toContain('FULL_DESIGN_VISUAL_DETAIL');
    expect(plan).not.toContain('FULL_COMPONENT_IMPLEMENTATION_PAYLOAD');
    expect(plan).toContain('--accent: #174ea6');
    expect(plan).toContain('buttons: .btn-primary');
  });

  it('keeps compiled design-system assets available in the API-fallback composer', () => {
    const prompt = composeSystemPrompt({
      designSystemTitle: 'Example',
      designSystemBody: '# Example\n\nBrand guidance.',
      designSystemUsageMd: '## Design Highlights\n\n- Cobalt identity.',
      designSystemTokensCss: ':root { --accent: #174ea6; }',
      designSystemComponentsManifest: 'buttons: .btn-primary',
      designSystemImportMode: 'normalized',
      streamFormat: 'plain',
    });

    expect(prompt).toContain('## How to use this design system — Example');
    expect(prompt).toContain('## Active design system tokens — Example');
    expect(prompt).toContain('--accent: #174ea6');
    expect(prompt).toContain('## Reference component manifest — Example');
    expect(prompt).toContain('buttons: .btn-primary');
    expect(prompt).toContain('## Design system import mode — Example');
  });

  it('strips CSS comments without changing declarations or quoted content', () => {
    const source = [
      '/* prose */',
      ':root {',
      '  --accent: #174ea6;',
      '  --data: "text/*not-a-comment*/value";',
      '  color: red/**/blue;',
      '}',
    ].join('\n');
    const stripped = stripCssCommentsForPrompt(source);

    expect(stripped).not.toContain('prose');
    expect(stripped).toContain('--accent: #174ea6;');
    expect(stripped).toContain('"text/*not-a-comment*/value"');
    expect(stripped).toContain('color: red blue;');
    expect(stripCssCommentsForPrompt(':root { --accent: red; /* unfinished')).toBe(
      ':root { --accent: red; /* unfinished',
    );
  });

  it('injects memory workflow blocks only when their prerequisite sections exist', () => {
    const profileOnly = composeSystemPrompt({
      memoryBody: '### Profile\n\n- Role: product manager',
    });
    const rulesOnly = composeSystemPrompt({
      memoryBody: '### Verified rules\n\n- **No pure black** — Keep surfaces warm.',
    });

    expect(profileOnly).toContain('<od-card type="task-brief">');
    expect(profileOnly).not.toContain('<od-card type="verify-scorecard">');
    expect(rulesOnly).not.toContain('<od-card type="task-brief">');
    expect(rulesOnly).toContain('<od-card type="verify-scorecard">');
    for (const prompt of [profileOnly, rulesOnly]) {
      expect(prompt).toContain('<od-card type="rule-proposal">');
    }
  });

  it('uses compact design-system highlights in Ask and visual media while Design keeps the full body', () => {
    const fullBody = [
      '# Example brand',
      '',
      '## Visual theme',
      '',
      'Warm editorial surfaces.',
      '',
      '## Component implementation',
      '',
      'FULL_COMPONENT_IMPLEMENTATION_PAYLOAD',
    ].join('\n');
    const usage = [
      '# Example usage',
      '',
      '## Design Highlights',
      '',
      '- Warm editorial surfaces',
      '- Cobalt accent',
      '',
      '## Read Order',
      '',
      'Read every implementation file.',
    ].join('\n');
    const shared = {
      designSystemTitle: 'Example',
      designSystemBody: fullBody,
      designSystemUsageMd: usage,
    };

    const design = composeSystemPrompt(shared);
    const ask = composeSystemPrompt({ ...shared, sessionMode: 'chat' });
    const media = composeSystemPrompt({
      ...shared,
      skillMode: 'image',
      metadata: { kind: 'image' } as any,
    });

    expect(design).toContain('FULL_COMPONENT_IMPLEMENTATION_PAYLOAD');
    for (const prompt of [ask, media]) {
      expect(prompt).toContain('Warm editorial surfaces');
      expect(prompt).toContain('Cobalt accent');
      expect(prompt).not.toContain('FULL_COMPONENT_IMPLEMENTATION_PAYLOAD');
      expect(prompt).not.toContain('Read every implementation file.');
    }
  });

  it('branches Plan delivery cleanly for filesystem and text-artifact runs', () => {
    const filesystem = composeSystemPrompt({ sessionMode: 'plan' });
    const textArtifact = composeSystemPrompt({ sessionMode: 'plan', streamFormat: 'plain' });

    expect(filesystem).toContain('Create or update the Markdown planning document');
    expect(filesystem).not.toContain('no project file was written in this run');
    expect(textArtifact).toContain('type="text/markdown"');
    expect(textArtifact).toContain('host persists this supported artifact type as an editable `.md` file');
    expect(textArtifact).not.toContain('type="text/html"');
    expect(textArtifact).not.toContain('Write a real `.md` file under the active project');
    for (const prompt of [filesystem, textArtifact]) {
      expect(prompt).toContain('switch to Design mode');
      expect(prompt).not.toContain('unless the user explicitly says to skip planning');
      expect(prompt).not.toContain('confirms that an existing plan is approved');
    }
  });

  it('swaps the slim copyright rule for Website Clone fidelity', () => {
    const normal = composeSystemPrompt({ metadata: { kind: 'prototype' } as any });
    const clone = composeSystemPrompt({
      metadata: { kind: 'prototype', intent: 'web-clone' } as any,
    });

    expect(normal).toContain("Don't recreate copyrighted designs.");
    expect(clone).toContain('Website Clone is an explicit faithful-reproduction task');
    expect(clone).not.toContain("Don't recreate copyrighted designs.");
  });

  it('does not let an ordinary reference silently replace active design-system tokens', () => {
    const prompt = composeSystemPrompt({
      designSystemBody: '# Brand\n\nUse the active brand palette.',
      designSystemTokensCss: ':root { --accent: #174ea6; }',
    });

    expect(prompt).toContain(
      'With an active design system, it replaces those tokens only when the user explicitly names it as the brand or visual authority',
    );
    expect(prompt).toContain(
      'otherwise it constrains only requested aspects and the design system stays binding',
    );
    expect(prompt).toContain(
      'unless the user explicitly designated another provided source as the replacement brand or visual authority',
    );
    expect(prompt).not.toContain(
      'A provided source outranks the active design system\'s tokens',
    );
  });

  it('injects platform contracts from metadata or a turn-level platform signal only in Design', () => {
    const base = { metadata: { kind: 'prototype' } as any };
    const quiet = composeSystemPrompt(base);
    const metadataGated = composeSystemPrompt({
      metadata: { kind: 'prototype', platform: 'responsive' } as any,
    });
    const signalGated = composeSystemPrompt({
      ...base,
      platformHintSignal: true,
    });

    expect(quiet).not.toContain('## Platform delivery contracts');
    expect(metadataGated).toContain('## Platform delivery contracts');
    expect(signalGated).toContain('## Platform delivery contracts');
    expect(metadataGated.indexOf('## Platform delivery contracts')).toBeLessThan(
      metadataGated.indexOf('## Project metadata'),
    );
    expect(signalGated.indexOf('## Platform delivery contracts')).toBeGreaterThan(
      signalGated.indexOf('## Project metadata'),
    );

    for (const prompt of [
      composeSystemPrompt({ ...base, sessionMode: 'plan', platformHintSignal: true }),
      composeSystemPrompt({ ...base, sessionMode: 'chat', platformHintSignal: true }),
      composeSystemPrompt({
        metadata: { kind: 'image', platform: 'responsive' } as any,
        platformHintSignal: true,
      }),
    ]) {
      expect(prompt).not.toContain('## Platform delivery contracts');
    }
  });

  it('keeps platform delivery compatible with the text-artifact handoff', () => {
    const prompt = composeSystemPrompt({
      metadata: {
        kind: 'prototype',
        platformTargets: ['mobile-ios', 'mobile-android'],
      } as any,
      streamFormat: 'plain',
    });

    expect(prompt).toContain('## Platform delivery contracts');
    expect(prompt).toContain('inside the one standalone artifact');
    expect(prompt).not.toContain('`mobile-ios.html`');
  });

  it('renders deck handoff wording for the active execution profile from one source', () => {
    const filesystem = renderDeckFrameworkDirective('filesystem');
    const textArtifact = renderDeckFrameworkDirective('text_artifact');

    expect(filesystem).toContain('Pre-handoff self-check');
    expect(filesystem).not.toContain('Emit one complete `<artifact>` block');
    expect(textArtifact).toContain('Pre-emit self-check');
    expect(textArtifact).toContain('Emit one complete `<artifact>` block');
  });

  it('uses narrative surface hierarchy instead of a light-dark quota', () => {
    const framework = renderDeckFrameworkDirective('filesystem');

    expect(framework).toContain('choose one dominant slide surface');
    expect(framework).toContain('named narrative role');
    expect(framework).toContain('A single-surface deck is valid');
    expect(framework).toContain('never alternate light and dark by slide index or quota');
    expect(framework).not.toContain('no 3+ same-theme');
  });

  it('uses the vNext delivery and outcome directive for production decks', () => {
    const directive = renderDeckVNextDirective('filesystem');

    expect(directive).toContain('# Deck delivery contract');
    expect(directive).toContain('Open Design owns visible navigation');
    expect(directive).toContain('exported slides must remain chrome-free');
    expect(directive).toContain('click/tap');
    expect(directive).not.toContain('data-deck-nav');
    expect(directive).toContain('emit exactly N');
    expect(directive).toContain('explicit background');
    expect(directive).toContain('## Fixed-canvas execution baseline');
    expect(directive).toContain('data-od-id="deck-stage"');
    expect(directive).toContain('width: 1920px; height: 1080px');
    expect(directive).toContain(
      'Open Design preview and export own the one uniform scale',
    );
    expect(directive).toContain(
      'Do not use `vw`, `vh`, `vmin`, `vmax`, or viewport-based `clamp()` inside the stage',
    );
    expect(directive).toContain('# Deck outcome quality rules');
    expect(directive).toContain('Every element earns its place');
    expect(directive).toContain('**Local contrast over imagery.**');
    expect(directive).toContain('the exact region behind it');
    expect(directive).toContain('**Intentional canvas.**');
    expect(directive).toContain('sparse content is stranded in one corner');
    expect(directive).toContain('**Container-content fit.**');
    expect(directive).toContain('Size cards and panels to their payload');
    expect(directive).not.toContain('persist position to localStorage');
    expect(directive).toContain('Charts/diagrams');
    expect(directive).not.toContain('# Slide deck — fixed framework');
    expect(directive).not.toContain('## Canonical skeleton');
  });

  it('keeps shared deck quality criteria when a skill supplies the template seed', () => {
    const prompt = composeSystemPrompt({
      metadata: { kind: 'deck' } as any,
      skillName: 'simple-deck',
      skillMode: 'deck',
      skillBody: 'Copy `assets/template.html` as the seed, then edit slides.',
    });

    expect(prompt).toContain('## Active skill — simple-deck');
    expect(prompt).not.toContain('# Deck delivery contract');
    expect(prompt).not.toContain('## Fixed-canvas execution baseline');
    expect(prompt).toContain('# Deck outcome quality rules');
    expect(prompt).toContain('## Rendered verification — filesystem decks');
    expect(prompt).toContain('**Local contrast over imagery.**');
    expect(prompt).toContain('**Container-content fit.**');
    expect(prompt).not.toContain('# Slide deck — fixed framework');
  });

  it('keeps skill-seeded deck quality profile-aware without adding delivery implementation', () => {
    const filesystem = renderDeckQualityDirective('filesystem');
    const textArtifact = renderDeckQualityDirective('text_artifact');

    expect(filesystem).toContain('## Rendered verification — filesystem decks');
    expect(filesystem).toContain('# Deck outcome quality rules');
    expect(filesystem).not.toContain('# Deck delivery contract');
    expect(filesystem).not.toContain('## Fixed-canvas execution baseline');
    expect(textArtifact).not.toContain('## Rendered verification — filesystem decks');
    expect(textArtifact).toContain('# Deck outcome quality rules');
    expect(textArtifact).not.toContain('# Deck delivery contract');
    expect(textArtifact).not.toContain('## Fixed-canvas execution baseline');
  });

  it('requires one real stitched render for filesystem decks without leaking tools into text-artifact runs', () => {
    const filesystem = renderDeckVNextDirective('filesystem');
    const textArtifact = renderDeckVNextDirective('text_artifact');

    expect(filesystem).toContain('## Rendered verification — filesystem decks');
    expect(filesystem).toContain('export <deck-file>');
    expect(filesystem).toContain('--format image --deck');
    expect(filesystem).toContain('stitches all slides into one review image');
    expect(filesystem).toContain('"mental rendering" is insufficient');
    expect(textArtifact).not.toContain('## Rendered verification — filesystem decks');
    expect(textArtifact).not.toContain('export <deck-file>');
  });

  it('requires a purposeful closing while preserving meaningful thank-you endings', () => {
    const outcomeOnly = renderDeckVNextDirective('filesystem');
    const legacy = renderDeckFrameworkDirective('filesystem');

    expect(outcomeOnly).toContain('**Purposeful close.**');
    expect(outcomeOnly).toContain('intended next step');
    expect(outcomeOnly).toContain('gratitude has real relational, ceremonial, or brand value');
    expect(outcomeOnly).toContain('no empty "Thank you."');
    expect(outcomeOnly).toContain('The requested count includes this slide');
    expect(legacy).not.toContain('**Purposeful close.**');
  });

  it('adds presentation presence without reducing visual value to comprehension alone', () => {
    const directive = renderDeckVNextDirective('filesystem');
    const legacy = renderDeckFrameworkDirective('filesystem');
    const composedDeck = composeSystemPrompt({
      metadata: { kind: 'deck' } as any,
    });
    const composedNonDeck = composeSystemPrompt({
      metadata: { kind: 'other' } as any,
    });

    expect(directive.match(/## Presentation presence/g)).toHaveLength(1);
    expect(directive).toContain('**Deck-wide visual system.**');
    expect(directive).toContain('establish one coherent grammar');
    expect(directive).toContain('a small family of content-fit layouts');
    expect(directive).toContain('Treat a master as a system, not a frame');
    expect(directive).toContain(
      'add no border, logo, header, footer, or control by default',
    );
    expect(directive).toContain('Preserve an active template or design system');
    expect(directive).toContain('**Live-delivery composition.**');
    expect(directive).toContain('Vary silhouettes with content roles');
    expect(directive).toContain(
      'repetition is valid for direct comparison or sequence',
    );
    expect(directive).toContain(
      'Vary surface, density, and layout only when the story changes mode',
    );
    expect(directive).toContain('**Narrative rhythm.**');
    expect(directive).toContain('**One dominant, fitting medium.**');
    expect(directive).toContain(
      'product views for product proof, charts for quantities',
    );
    expect(directive).toContain(
      'imagery for emotion/context, and expressive type for reveals',
    );
    expect(directive).toContain(
      'use calmer workhorse slides between peaks',
    );
    expect(directive).toContain(
      'comprehension, emphasis, pacing, atmosphere, or brand recognition',
    );
    expect(directive).toContain(
      'Keep supporting elements subordinate',
    );
    expect(directive).toContain('**Shareable payoff.**');
    expect(directive).toContain('**Brief fidelity.**');
    expect(directive).toContain('explicit composition constraints');
    expect(directive).not.toContain(
      'If removing it does not reduce comprehension, remove it.',
    );

    expect(legacy).not.toContain('## Presentation presence');
    expect(composedDeck).toContain('## Presentation presence');
    expect(composedDeck).toContain('**Deck-wide visual system.**');
    expect(composedNonDeck).not.toContain('## Presentation presence');
    expect(composedNonDeck).not.toContain('**Deck-wide visual system.**');
  });

  it('does not inject the freeform deck framework without a positive query signal', () => {
    const quiet = composeSystemPrompt({ metadata: { kind: 'other' } as any });
    const deck = composeSystemPrompt({
      metadata: { kind: 'other' } as any,
      freeformDeckSignal: true,
    });

    expect(quiet).not.toContain('## If this brief is a slide deck');
    expect(quiet).not.toContain('# Deck delivery contract');
    expect(deck).not.toContain('## If this brief is a slide deck');
    expect(deck).toContain('# Deck delivery contract');
  });

  it('treats missing metadata as inferable context rather than mandatory questions', () => {
    const prompt = composeSystemPrompt({ metadata: { kind: 'prototype' } as any });

    expect(prompt).toContain('- **platform**: (unknown)');
    expect(prompt).not.toMatch(/unknown\s+[—-]\s+ask/i);
    expect(prompt).not.toContain('MUST include a matching question');
  });
});
