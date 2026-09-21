import { describe, expect, it } from 'vitest';
import {
  composeOdNextStrategyBundleHeadV2,
  composeOdNextStrategyCorePromptV2,
  composeOdNextStrategyContinuationV2,
  composeOdNextStrategyRequestPromptV2,
  composeOdNextStrategyStableRequestContextV2,
  odNextPromptCacheIdentityV2,
  resolveOdNextDeckFrameworkMode,
  type OdNextStrategyRequestRecipeV2,
} from '../src/prompts/od-next-strategy.js';
import {
  OD_NEXT_DESIGN_NOTES_FILE,
} from '../src/prompts/od-next-strategy.js';
import { OD_NEXT_RUNTIME_STATE_BLOCK } from '../src/plugins/strategy-v2.js';
import { composeSystemPrompt } from '../src/prompts/system.js';

const A = 'a'.repeat(64);
const B = 'b'.repeat(64);

function parseWireBlock(prompt: string, tag: string): unknown {
  const match = new RegExp(`<${tag}>\\n([\\s\\S]*?)\\n</${tag}>`).exec(prompt);
  if (!match?.[1]) throw new Error(`missing ${tag} block`);
  return JSON.parse(match[1]);
}

const recipe: OdNextStrategyRequestRecipeV2 = {
  recipe: 'od-next-plan-build-v2',
  strategyId: 'od-next-strategy',
  strategyVersion: '2.0.0',
  snapshotId: 'snapshot-contracts-recipe',
  packageHash: A,
  taskProfileDigest: B,
  taskProfileVersion: '2.0.0',
  taskType: 'prototype',
  executionProfile: 'filesystem',
  coreStrategy: '# Core\n\nKeep route and execution facts locked.',
  generalOrchestration: '# Orchestration\n\nPlan in prose, write the design notes, then Build.',
  taskSkill: '# Prototype\n\nProduce the declared editable prototype.',
  activeStages: [
    { name: 'discovery', atoms: [{ name: 'discovery-question-form' }] },
    { name: 'plan', atoms: [{ name: 'direction-picker' }, { name: 'todo-write' }] },
    { name: 'generate', atoms: [{ name: 'file-write' }, { name: 'live-artifact' }] },
  ],
};

describe('OD Next V2 prompt recipe', () => {
  // OPEND-2589. The strategy admits a turn on the project's task type, not on
  // what this turn said, so a greeting or a stray keystroke enters the same
  // planning round as a real brief. An agent left with nothing to design needs
  // a taught way to say so, or it invents a subject ("111" became a prototype
  // about 111). The refusal is now a declaration the daemon reads, not an
  // outcome it validates.
  it('tells the agent to answer and declare instead of inventing a subject', () => {
    const prompt = composeOdNextStrategyRequestPromptV2(recipe);

    expect(prompt).toContain('nonDesignRequest');
    expect(prompt.toLowerCase()).toContain('do not invent');
    // The declaration has to be spelled out where the block shape is, not only
    // in prose: the agent copies its status block from that example.
    expect(parseWireBlock(prompt, OD_NEXT_RUNTIME_STATE_BLOCK)).toEqual({ nonDesignRequest: true });
    expect(prompt).toContain('"noFileWrites": true');
  });

  it('teaches two rounds and no machine contract', () => {
    const prompt = composeOdNextStrategyRequestPromptV2(recipe);
    expect(prompt).toContain('answered in two rounds');
    expect(prompt).toContain(`\`${OD_NEXT_DESIGN_NOTES_FILE}\``);
    expect(prompt).toContain('no route, stage, or outcome to declare');
    expect(prompt).toContain('when neither applies, write no block at all');
    for (const retired of [
      'open-design-plan-contract',
      'plan_ready',
      'clarification_required',
      'Plan Contract',
      'Preflight',
      'contract_repair',
      'executionIntent',
      'copy-input-refs-from-runtime-facts',
    ]) {
      expect(prompt).not.toContain(retired);
    }
  });

  it('pins the canonical Deck Protocol v1 framework into PPT requests only', () => {
    const pptRecipe: OdNextStrategyRequestRecipeV2 = {
      ...recipe,
      taskType: 'ppt',
      taskSkill: '# Presentation\n\nProduce the declared editable HTML deck.',
    };

    const prompt = composeOdNextStrategyRequestPromptV2(pptRecipe);
    const bundledTaskSkill = composeOdNextStrategyBundleHeadV2(pptRecipe)
      .sessionSkills.taskTypeSkill.body;

    expect(prompt).toContain('OD Deck Protocol v1');
    expect(prompt).toContain('data-od-deck-protocol="1"');
    expect(prompt).toContain("type: 'od:deck-ready'");
    expect(prompt).toContain("type: 'od:slide-state'");
    expect(prompt).toContain('## Final handoff — filesystem');
    expect(bundledTaskSkill).toBe(pptRecipe.taskSkill);
    expect(bundledTaskSkill).not.toContain('OD Deck Protocol v1');
    expect(prompt.match(/^## Task Skill —/gm)).toHaveLength(1);

    const prototypePrompt = composeOdNextStrategyRequestPromptV2(recipe);
    expect(prototypePrompt).not.toContain('data-od-deck-protocol="1"');
    expect(prototypePrompt).not.toContain("type: 'od:deck-ready'");

    const prototypeDeckPrompt = composeOdNextStrategyRequestPromptV2(recipe, {
      deckIntent: true,
    });
    expect(prototypeDeckPrompt).toContain('name="deck-framework"');
    expect(prototypeDeckPrompt).toContain('data-od-deck-protocol="1"');
    expect(prototypeDeckPrompt).toContain("type: 'od:deck-ready'");

    const stableDeckContext = composeOdNextStrategyStableRequestContextV2({
      deckIntent: true,
    });
    expect(stableDeckContext).toContain('name="deck-framework"');
    expect(stableDeckContext).toContain('data-od-deck-protocol="1"');

    const textArtifactRecipe: OdNextStrategyRequestRecipeV2 = {
      ...pptRecipe,
      executionProfile: 'text_artifact',
    };
    const textArtifactPrompt = composeOdNextStrategyRequestPromptV2(textArtifactRecipe);
    const textArtifactBundleSkill = composeOdNextStrategyBundleHeadV2(textArtifactRecipe)
      .sessionSkills.taskTypeSkill.body;
    const textArtifactStableContext = composeOdNextStrategyStableRequestContextV2(
      { deckIntent: true },
      'text_artifact',
    );
    for (const text of [textArtifactPrompt, textArtifactStableContext]) {
      expect(text).toContain('## Final handoff — text artifact');
      expect(text).toContain('MUST contain exactly one `<artifact type="text/html">...</artifact>` block');
      expect(text).not.toContain('## Final handoff — filesystem');
      expect(text).not.toContain('summarize the written or changed deck file');
      expect(text).not.toMatch(/TodoWrite[^\n]{0,80}(?:must|required)/i);
    }
    expect(textArtifactBundleSkill).toBe(textArtifactRecipe.taskSkill);
    expect(textArtifactBundleSkill).not.toContain('## Final handoff');

    const pptPromptWithMatchingSignal = composeOdNextStrategyRequestPromptV2(pptRecipe, {
      deckIntent: true,
    });
    expect(pptPromptWithMatchingSignal.match(/data-od-deck-protocol="1"/g)).toHaveLength(1);
  });

  it('preserves selected and existing deck scaffolds instead of injecting a second runtime', () => {
    const pptRecipe: OdNextStrategyRequestRecipeV2 = {
      ...recipe,
      taskType: 'ppt',
      taskSkill: '# Presentation\n\nCopy `assets/template.html` and fill its declared slots.',
    };
    const prompt = composeOdNextStrategyRequestPromptV2(pptRecipe, {
      deckFrameworkMode: 'legacy_compatible',
    });
    const stableContext = composeOdNextStrategyStableRequestContextV2({
      deckFrameworkMode: 'legacy_compatible',
    });

    for (const text of [prompt, stableContext]) {
      expect(text).toContain('selected or existing scaffold compatibility');
      expect(text).toContain('assets/template.html');
      expect(text).toContain("host viewer's compatibility bridge owns navigation");
      expect(text).not.toContain('data-od-deck-protocol="1"');
      expect(text).not.toContain("type: 'od:deck-ready'");
      expect(text).not.toContain("type: 'od:slide-state'");
    }

    expect(resolveOdNextDeckFrameworkMode({ taskType: 'ppt' })).toBe('canonical');
    expect(resolveOdNextDeckFrameworkMode({
      taskType: 'ppt',
      hasSelectedDeckSeed: true,
    })).toBe('legacy_compatible');
    expect(resolveOdNextDeckFrameworkMode({
      taskType: 'ppt',
      hasExistingDeckArtifact: true,
    })).toBe('legacy_compatible');
    expect(resolveOdNextDeckFrameworkMode({
      taskType: 'prototype',
      deckIntent: true,
      hasExistingDeckArtifact: true,
    })).toBe('canonical');
    expect(resolveOdNextDeckFrameworkMode({ taskType: 'prototype' })).toBeUndefined();
  });

  it('tells the planning round the entry-resolution rule a one-round change is judged by', () => {
    // A small change done in one round is judged by the same entry-resolution
    // ladder the build round follows. Shipping that rule only in the build
    // instruction left one-round agents graded on a rule they were never
    // given.
    const prompt = composeOdNextStrategyRequestPromptV2(recipe);
    expect(prompt).toContain('A small, explicit change to an existing artifact takes one round');
    expect(prompt).toContain('it looks for a root `index.html`, then a single root-level html file, then a single file matching the project kind');
    // Writing outside the project directory yields `no_artifact`, which reads
    // to the agent as "I finished" and to Open Design as "nothing delivered".
    expect(prompt).toContain('write every file inside the project directory');
  });

  it('composes a versioned request golden with one Task Skill and ordered planning/Build sections', () => {
    const prompt = composeOdNextStrategyRequestPromptV2(recipe);
    const headings = prompt.split('\n').filter((line) => line.startsWith('#'));

    expect(headings).toMatchInlineSnapshot(`
      [
        "# Open Design execution and security boundary",
        "## Native filesystem execution",
        "## Versioned recipe identity",
        "## Discovery, planning, and Build surface",
        "## OD Next core strategy",
        "# Core",
        "## OD Next general orchestration",
        "# Orchestration",
        "## Task Skill — prototype",
        "# Prototype",
        "## Active stage: discovery",
        "### discovery-question-form",
        "## Active stage: plan",
        "### direction-picker",
        "### todo-write",
        "## Active stage: generate",
        "### file-write",
        "### live-artifact",
        "## Status block and user output boundary",
      ]
    `);
    expect(prompt.match(/^## Task Skill —/gm)).toHaveLength(1);
    expect(prompt).toContain('<question-form>');
    expect(prompt).toContain('Todo plan');
    expect(prompt).toContain('planning round');
    expect(prompt).toContain('build round');
    expect(prompt).toContain('creates or edits no other file');
    expect(prompt).toContain(`strategy package: \`${A}\``);
    expect(prompt).toContain(`selected Task Skill digest: \`${B}\``);
  });

  // Every clarification rule in both prompt trees was phrased as "when to emit
  // a form" / "skip the form"; nothing forbade writing the bare marker as a
  // section label. A real turn duly answered `<question-form> 无需提出——…` — an
  // unclosed marker with prose for a body — which renders as nothing and
  // latches the project on `Needs input`. The skip case has to name the marker
  // itself, not just the form.
  it('forbids restating the literal question-form marker when nothing is asked', () => {
    const prompt = composeOdNextStrategyRequestPromptV2(recipe);
    expect(prompt).toContain(
      'do not output, quote, or explain the `<question-form>` marker',
    );
    // The constraint has to travel with the section that introduces the form,
    // so a bundle that ships only the core system prompt still carries it.
    expect(
      composeOdNextStrategyBundleHeadV2(recipe).coreSystemPrompt.discoveryAndPlanningSurface,
    ).toContain('do not output, quote, or explain the `<question-form>` marker');
  });

  it('renders real stable request facts through the shared recipe owner', () => {
    const context = {
      agentId: 'codex',
      sessionMode: 'design' as const,
      locale: 'zh-CN',
      metadata: {
        kind: 'prototype' as const,
        fidelity: 'high-fidelity' as const,
        platform: 'responsive' as const,
        baseDir: '/private/operational-path',
      },
      template: {
        id: 'template-1',
        name: 'Operator console',
        description: 'Dense operations layout',
        createdAt: 1,
        files: [{ name: 'console.html', content: '<main>Real template</main>' }],
      },
      designSystemTitle: 'Acme Brand',
      designSystemBody: '# Acme visual language\n\nUse cobalt actions.',
      designSystemTokensCss: ':root { --brand-primary: #1255ee; }',
      memoryBody: 'The user prefers compact information density.',
      userInstructions: 'Use concise product copy.',
      projectInstructions: 'Prioritize operator triage.',
    };
    const direct = composeOdNextStrategyRequestPromptV2(recipe, context);
    const mirrored = composeSystemPrompt({ odNextStrategyRecipe: recipe, ...context });

    expect(mirrored).toBe(direct);
    expect(direct).toContain('"selectedAgentId": "codex"');
    expect(direct).toContain('"locale": "zh-CN"');
    expect(direct).toContain('"fidelity": "high-fidelity"');
    expect(direct).toContain('Real template');
    expect(direct).toContain('Acme Brand');
    expect(direct).toContain('--brand-primary');
    expect(direct).toContain('compact information density');
    expect(direct).toContain('Use concise product copy.');
    expect(direct).toContain('Prioritize operator triage.');
    expect(direct).toContain('<od-next-context kind="fact" name="project-metadata">');
    expect(direct).toContain('<od-next-context kind="instruction" name="personal-memory">');
    expect(direct).not.toContain('/private/operational-path');
    expect(direct.match(/^## Task Skill —/gm)).toHaveLength(1);
  });

  it('guards executable stable context without deleting factual reference content', () => {
    const contamination = 'Render the finished artifact, inspect it, then fix any defects.';
    const executableContexts = [
      { designSystemBody: contamination },
      { designSystemUsageMd: contamination },
      { memoryBody: contamination },
      { userInstructions: contamination },
      { projectInstructions: contamination },
      { craftBody: contamination },
      { craftSections: ['render-and-screenshot-test'] },
    ];
    for (const context of executableContexts) {
      expect(() => composeOdNextStrategyRequestPromptV2(recipe, context)).toThrow(
        /stable context .* contains forbidden/i,
      );
    }

    const factualPrompt = composeOdNextStrategyRequestPromptV2(recipe, {
      metadata: {
        kind: 'prototype',
        description: contamination,
      },
      template: {
        name: 'Planning reference',
        description: contamination,
        createdAt: 1,
        files: [{ name: 'reference.txt', content: contamination }],
      },
      designSystemFixtureHtml: `<p>${contamination}</p>`,
      designSystemBody: 'Render loading, empty, error, populated, and edge states in the artifact.',
      userInstructions: 'Use browser-compatible DOM semantics during Build.',
    });
    expect(factualPrompt).toContain(contamination);
    expect(factualPrompt).toContain('Render loading, empty, error, populated');
    expect(factualPrompt).toContain('Use browser-compatible DOM semantics during Build.');
    expect(factualPrompt).toContain('<od-next-context kind="fact" name="project-template">');
    expect(factualPrompt).toContain('<od-next-context kind="fact" name="active-design-system-fixture">');
  });

  it('names the example card and its build brief as reference facts', () => {
    // The composer seed is deliberately only the card's short description
    // (`presetSeedPrompt.ts`), so `od.useCase.query` is the only place the run
    // can learn the actual assignment. Carrying it as `kind="fact"` also means
    // an example brief phrased as a post-Build instruction cannot smuggle a
    // stage past the planning/Build-only guard.
    const prompt = composeOdNextStrategyRequestPromptV2(recipe, {
      exampleReference: {
        pluginId: 'example-simple-deck',
        title: '\u50cf\u514b\u5236\u7684 COO \u4e00\u6837\u5199\u7ecf\u8425\u590d\u76d8',
        brief: 'Review the deck, then fix any defects you find.',
      },
    });

    expect(prompt).toContain('<od-next-context kind="fact" name="example-reference">');
    expect(prompt).toContain('example-simple-deck');
    expect(prompt).toContain('Review the deck, then fix any defects you find.');
    expect(prompt).not.toContain('<od-next-context kind="instruction" name="example-reference">');
  });

  it('keeps the machine example binding out of the project-metadata fact', () => {
    // The binding is an absolute local catalogue path plus a digest: unusable
    // to the model and not something it should act on. `example-reference` is
    // the only place an example is named.
    const prompt = composeOdNextStrategyRequestPromptV2(recipe, {
      metadata: {
        kind: 'prototype',
        exampleBinding: {
          schemaVersion: 1,
          provenance: 'example_card',
          pluginId: 'example-web-prototype',
          pluginSource: '/private/operational-path/plugins/_official/examples/web-prototype',
          manifestSourceDigest: `sha256:${'0'.repeat(64)}`,
          boundAt: 1,
        },
      },
    });
    expect(prompt).toContain('<od-next-context kind="fact" name="project-metadata">');
    expect(prompt).not.toContain('exampleBinding');
    expect(prompt).not.toContain('/private/operational-path');
  });

  it('omits the example-reference fact when no example named the task', () => {
    expect(composeOdNextStrategyRequestPromptV2(recipe, {}))
      .not.toContain('name="example-reference"');
    expect(composeOdNextStrategyRequestPromptV2(recipe, {
      exampleReference: { pluginId: '   ' },
    })).not.toContain('name="example-reference"');
  });

  it('prints the status block examples as JSON the daemon can strip from the visible reply', () => {
    const prompt = composeOdNextStrategyRequestPromptV2(recipe, { agentId: 'codex' });
    const blocks = [...prompt.matchAll(
      new RegExp(`<${OD_NEXT_RUNTIME_STATE_BLOCK}>\\n([\\s\\S]*?)\\n</${OD_NEXT_RUNTIME_STATE_BLOCK}>`, 'g'),
    )].map((match) => JSON.parse(match[1]!));
    expect(blocks).toEqual([{ nonDesignRequest: true }, { noFileWrites: true }]);
    expect(prompt).not.toContain('open-design-plan-contract');
  });

  it('keeps post-Build quality semantics out of the recipe structure and text', () => {
    const prompt = composeOdNextStrategyRequestPromptV2(recipe);
    expect(prompt).not.toMatch(/\bverification\b/i);
    expect(prompt).not.toMatch(/\bchecklist\b/i);
    expect(prompt).not.toMatch(/\bcritique(?:-theater)?\b/i);
    expect(prompt).not.toMatch(/\bjudge\b/i);
    expect(prompt).not.toMatch(/\bevidence plan\b|\bevidence bundle\b/i);
    expect(prompt).not.toMatch(/\bartifact repair\b|\brevalidation\b/i);
    expect(prompt).not.toMatch(/\bscreenshots?\b|\bbrowser\b|\bDOM\b/);
  });

  it('fails closed when stages are incomplete or smuggle post-Build quality work', () => {
    expect(() => composeOdNextStrategyRequestPromptV2({
      ...recipe,
      activeStages: recipe.activeStages.slice(0, 2),
    })).toThrow(/exactly discovery, plan, and generate/i);
    expect(() => composeOdNextStrategyRequestPromptV2({
      ...recipe,
      activeStages: [
        recipe.activeStages[0]!,
        { name: 'plan', atoms: [{ name: 'direction-picker' }] },
        recipe.activeStages[2]!,
      ],
    })).toThrow(/must declare exactly direction-picker, todo-write/i);
    expect(() => composeOdNextStrategyRequestPromptV2({
      ...recipe,
      activeStages: [recipe.activeStages[1]!, recipe.activeStages[0]!, recipe.activeStages[2]!],
    })).toThrow(/must describe the discovery stage/i);
    expect(() => composeOdNextStrategyRequestPromptV2({
      ...recipe,
      activeStages: [
        recipe.activeStages[0]!,
        recipe.activeStages[1]!,
        {
          name: 'generate',
          atoms: [
            { name: 'file-write', body: '## Verification\n\nReview the finished artifact.' },
            { name: 'live-artifact' },
          ],
        },
      ],
    })).toThrow(/forbidden/i);
    const forbiddenContamination = [
      'Review the finished output in a browser.',
      'Inspect the DOM after generation.',
      'Compare a screenshot after the build.',
      'Render-and-inspect the generated artifact.',
      'Fix the generated artifact after inspection.',
      'Render the finished artifact, inspect it, then fix any defects.',
      'After completing the build, render the artifact and inspect it for defects.',
      'Open the generated artifact, visually review it, and revise any defects.',
      'Create screenshots of every finished screen for a visual pass.',
      'Render-and-screenshot test: exercise every state.',
    ];
    for (const contamination of forbiddenContamination) {
      expect(() => composeOdNextStrategyRequestPromptV2({
        ...recipe,
        activeStages: [
          recipe.activeStages[0]!,
          recipe.activeStages[1]!,
          {
            name: 'generate',
            atoms: [{ name: 'file-write', body: contamination }, { name: 'live-artifact' }],
          },
        ],
      })).toThrow(/forbidden/i);
    }
  });

  it('uses the shared recipe through the contracts composer without admitting default quality tails', () => {
    const direct = composeOdNextStrategyRequestPromptV2(recipe);
    expect(composeSystemPrompt({
      odNextStrategyRecipe: recipe,
      skillBody: '# Untrusted extra skill',
      activeStageBlocks: ['## Active stage: critique\n\n# Critique Theater'],
    })).toBe(direct);
  });

  it('keeps the legacy recipe API compatible while exposing core and stable context separately', () => {
    const context = {
      memoryBody: 'Remember the operator audience.',
      userInstructions: 'Use terse labels.',
    };
    const combined = composeOdNextStrategyRequestPromptV2(recipe, context);
    const core = composeOdNextStrategyCorePromptV2(recipe);
    const stableContext = composeOdNextStrategyStableRequestContextV2(context);
    expect(combined).toContain(stableContext);
    expect(combined.match(/Remember the operator audience\./g)).toHaveLength(1);
    expect(core).not.toContain('Remember the operator audience.');
    expect(stableContext).not.toContain(recipe.coreStrategy);
    expect(composeOdNextStrategyRequestPromptV2(recipe)).toBe(core);
  });

  it('keeps memory without introducing retired cards into the OD Next prompt path', () => {
    const context = { memoryBody: 'Remember the operator audience.' };
    const core = composeOdNextStrategyCorePromptV2(recipe);
    const stableContext = composeOdNextStrategyStableRequestContextV2(context);
    const request = composeOdNextStrategyRequestPromptV2(recipe, context);
    const bundle = composeOdNextStrategyBundleHeadV2(recipe);
    const production = composeOdNextStrategyContinuationV2({
      stage: 'production',
      taskExecutionId: 'task-1',
      taskRunIndex: 1,
      hostProtocolKey: '0123456789abcdef',
    });

    expect(stableContext).toContain(context.memoryBody);
    expect(request).toContain(stableContext);
    expect(core).toContain(recipe.coreStrategy);
    expect(request).toContain(recipe.coreStrategy);
    expect(production).toContain('<od-done key="0123456789abcdef"/>');
    for (const prompt of [core, stableContext, request, JSON.stringify(bundle), production]) {
      expect(prompt).not.toContain('task-brief');
      expect(prompt).not.toContain('rule-proposal');
    }
  });

  it('changes cache identity for either package or selected profile content', () => {
    const baseline = odNextPromptCacheIdentityV2(recipe);
    expect(odNextPromptCacheIdentityV2({ ...recipe, packageHash: B })).not.toBe(baseline);
    expect(odNextPromptCacheIdentityV2({ ...recipe, taskProfileDigest: A })).not.toBe(baseline);
  });

  it('teaches the discussion-only declaration instead of a session-mode intent', () => {
    const request = composeOdNextStrategyRequestPromptV2(recipe, { sessionMode: 'chat' });
    expect(request).not.toContain('plan_only');
    expect(request).toContain('Discussion or plan in chat only');
    expect(request).toContain('Facts outrank declarations');
  });

  it('composes the build round as one instruction plus the keyed host protocols', () => {
    const production = composeOdNextStrategyContinuationV2({
      stage: 'production',
      taskExecutionId: 'task-1',
      taskRunIndex: 1,
      hostProtocolKey: '0123456789abcdef',
    });
    expect(production).toMatch(/^<open_design_request_turn/);
    expect(production).toContain('task_execution_id="task-1"');
    expect(production).toContain('stage="production" task_run_index="1"');
    expect(production).toContain('# OD Next build round');
    expect(production).toContain('Build what the planning round planned.');
    expect(production).toContain('do not ask another question');
    expect(production).toContain('<od-done key="0123456789abcdef"/>');
    expect(production).toContain('<od-next key="0123456789abcdef" value="Add an orders list page"/>');
    expect(production).toContain('<od-focus key="0123456789abcdef"');
    // No machine contract left to bind or to close with.
    expect(production).not.toContain('planContractHash');
    expect(production).not.toContain('Closing Runtime State');
    expect(production).not.toContain(OD_NEXT_RUNTIME_STATE_BLOCK);
    expect(production).not.toContain('This round runs in a new session');
    expect(production).not.toContain(recipe.coreStrategy);
    expect(production).not.toContain(recipe.generalOrchestration);
    expect(production).not.toContain(recipe.taskSkill);
    expect(() => composeOdNextStrategyContinuationV2({
      stage: 'production',
      taskExecutionId: 'task-1',
      taskRunIndex: 1,
      hostProtocolKey: '',
    })).toThrow(/hostProtocolKey/);
  });

  it('tells a cold-started build round where the plan lives and what to do without it', () => {
    const cold = composeOdNextStrategyContinuationV2({
      stage: 'production',
      taskExecutionId: 'task-1',
      taskRunIndex: 1,
      hostProtocolKey: '0123456789abcdef',
      coldStart: true,
      locale: 'zh-CN',
    });
    expect(cold).toContain('This round runs in a new session');
    expect(cold).toContain('previous assistant turn in the conversation transcript above');
    expect(cold).toContain(`\`${OD_NEXT_DESIGN_NOTES_FILE}\` at the project root`);
    expect(cold).toContain("build directly from the user's original request");
    expect(cold).toContain('the OpenDesign UI locale for this run is `zh-CN`');
  });
});

describe('handheld device shell in the stable request context', () => {
  const deviceFrame = {
    platform: 'ios' as const,
    resolvedFrom: 'request-text' as const,
    shell: '.od-frames/iphone.html',
    availableShells: ['.od-frames/android.html', '.od-frames/iphone.html', '.od-frames/neutral.html'],
    shellHtml: '<div class="phone-frame" data-phone-shell data-platform="iphone"><main class="phone-content"></main></div>',
  };

  it('emits the selection and the shell source as two facts, never as instructions', () => {
    const prompt = composeOdNextStrategyStableRequestContextV2({ deviceFrame });
    expect(prompt).toContain('<od-next-context kind="fact" name="device-frame">');
    expect(prompt).toContain('"platform": "ios"');
    expect(prompt).toContain('"resolvedFrom": "request-text"');
    expect(prompt).toContain('"shell": ".od-frames/iphone.html"');
    expect(prompt).toContain('.od-frames/neutral.html');
    expect(prompt).toContain('<od-next-context kind="fact" name="device-frame-shell">');
    expect(prompt).toContain(deviceFrame.shellHtml);
    expect(prompt).not.toContain('kind="instruction" name="device-frame');
  });

  it('keeps the shell source out of the planning/Build-only guard', () => {
    // Shell markup is quoted reference data: words that would be refused in
    // an instruction block must not refuse the handset source.
    const prompt = composeOdNextStrategyStableRequestContextV2({
      deviceFrame: {
        ...deviceFrame,
        shellHtml: '<!-- verification checklist: inspect after render --><div data-phone-shell><main class="phone-content"></main></div>',
      },
    });
    expect(prompt).toContain('verification checklist');
  });

  it('omits both facts when no shell was resolved', () => {
    expect(composeOdNextStrategyStableRequestContextV2({ memoryBody: 'Remember the operator audience.' }))
      .not.toContain('device-frame');
    expect(composeOdNextStrategyStableRequestContextV2({})).toBe('');
  });
});

describe('layout primitives in the stable request context', () => {
  it('quotes the stylesheet as a fact and omits the block when the profile ships none', () => {
    const css = '/* OD-LAYOUT-PRIMITIVES v1 */\n@layer od-layout { .od-stack { display: flex; } }\n/* /OD-LAYOUT-PRIMITIVES v1 */';
    const prompt = composeOdNextStrategyStableRequestContextV2({ layoutPrimitivesCss: css });
    expect(prompt).toContain('<od-next-context kind="fact" name="layout-primitives">');
    expect(prompt).toContain(css);
    expect(prompt).not.toContain('kind="instruction" name="layout-primitives"');
    expect(composeOdNextStrategyStableRequestContextV2({ memoryBody: 'x' })).not.toContain('layout-primitives');
  });
});

/**
 * The runtime's own plan-tool name has to survive the OD Next prompt fork.
 *
 * ── The defect ────────────────────────────────────────────────────────────
 *
 * On 2026-09-03 a codex run answered an explicit 「先用 todo 进行一轮规划」 by
 * writing a seven-item plan into its reply body and calling no plan tool. The
 * charter offers "Otherwise, provide a numbered plan in your response" as a
 * sanctioned branch, and codex had never been told the name of the tool it
 * actually has (`update_plan`), so prose WAS the compliant reading. The daemon
 * fix names each runtime's real tool through `planToolNoteForRuntime`
 * (`apps/daemon/src/prompts/system.ts`) — but only on the slim-charter path.
 *
 * OD Next runs never reach that path: `composeSystemPrompt` forks before it,
 * and the shipping request prompt is assembled from the Bundle head plus this
 * stable request context. Neither carried the note, so every OD Next run was
 * still in the pre-fix state.
 *
 * ── Why the note enters HERE and not in the Bundle head ───────────────────
 *
 * The head is the cache-stable prefix — byte-identical across every task that
 * shares a strategy version, task type, and execution profile. Which runtime
 * is driving is not one of those dimensions, so a per-runtime sentence in the
 * head would split that prefix. This block is already per-run (it carries
 * `runtime-selection`, project metadata, memory), so the note is cache-neutral
 * here and sits beside the `selectedAgentId` it is derived from.
 *
 * ── What this suite proves, and what it does not ──────────────────────────
 *
 * It proves the sentence travels: given the note the host resolved, the OD
 * Next request prompt contains it, and given no note it costs nothing. It does
 * NOT re-prove which name belongs to which runtime — that table lives in the
 * daemon and is owned by `apps/daemon/tests/prompts/plan-tool-note.test.ts`.
 * Duplicating the table here would create the second source of truth whose
 * drift is the exact failure the Claude Code 2.1 rename caused.
 */
describe('runtime plan tool in the stable request context', () => {
  // Verbatim from CODEX_PLAN_TOOL_NOTE — quoted as INPUT, the way the daemon
  // supplies it. This suite never asserts the wording is right for codex.
  const CODEX_NOTE = 'Your plan tool is `update_plan` — use it for the plan step above; the host renders it as a live Todos card. Mark each item `in_progress` when started and `completed` as it lands.';

  it('carries the host-resolved note into the block the shipping Bundle reads', () => {
    const stable = composeOdNextStrategyStableRequestContextV2({
      agentId: 'codex',
      planToolNote: CODEX_NOTE,
    });
    expect(stable).toContain('<od-next-context kind="instruction" name="runtime-plan-tool">');
    expect(stable).toContain('Your plan tool is `update_plan`');
    // Beside the runtime identity it is derived from, not adrift in project data.
    expect(stable.indexOf('name="runtime-selection"'))
      .toBeLessThan(stable.indexOf('name="runtime-plan-tool"'));
  });

  it('reaches the composed OD Next request prompt through both composers', () => {
    const context = { agentId: 'codex', planToolNote: CODEX_NOTE };
    const prompt = composeOdNextStrategyRequestPromptV2(recipe, context);
    expect(prompt).toContain('Your plan tool is `update_plan`');
    // `composeSystemPrompt` forks to the same composer; it must forward the
    // note rather than drop it on the floor.
    expect(composeSystemPrompt({ odNextStrategyRecipe: recipe, ...context }))
      .toContain('Your plan tool is `update_plan`');
  });

  it('costs nothing for a runtime the host has no verified tool name for', () => {
    // mimo and the ACP family are deliberately absent from the daemon table:
    // no verified tool name, and guessing from family resemblance is what the
    // Claude Code 2.1 rename punished. They resolve to no note, and no note
    // must mean no bytes.
    expect(composeOdNextStrategyStableRequestContextV2({ agentId: 'mimo' }))
      .not.toContain('runtime-plan-tool');
    expect(composeOdNextStrategyStableRequestContextV2({ agentId: 'vela', planToolNote: null }))
      .not.toContain('runtime-plan-tool');
    expect(composeOdNextStrategyStableRequestContextV2({ agentId: 'kimi', planToolNote: '' }))
      .not.toContain('runtime-plan-tool');
  });
});
