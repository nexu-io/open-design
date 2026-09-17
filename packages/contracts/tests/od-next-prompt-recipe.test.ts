import { describe, expect, it } from 'vitest';
import {
  composeOdNextStrategyBundleHeadV2,
  composeOdNextStrategyCorePromptV2,
  composeOdNextStrategyContinuationV2,
  composeOdNextStrategyRequestPromptV2,
  renderOdNextRuntimeFactsV2,
  composeOdNextStrategyStableRequestContextV2,
  odNextPromptCacheIdentityV2,
  resolveOdNextDeckFrameworkMode,
  type OdNextStrategyRequestRecipeV2,
} from '../src/prompts/od-next-strategy.js';
import {
  OD_NEXT_PLAN_CONTRACT_BLOCK,
  OD_NEXT_RUNTIME_STATE_BLOCK,
  StrategyRuntimeStateV2Schema,
} from '../src/plugins/strategy-v2.js';
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
  generalOrchestration: '# Orchestration\n\nGenerate the requested deliverables directly.',
  taskSkill: '# Prototype\n\nProduce the declared editable prototype.',
  activeStages: [
    { name: 'generate', atoms: [{ name: 'file-write' }, { name: 'live-artifact' }] },
  ],
};

describe('OD Next V2 prompt recipe', () => {
  // OPEND-2589. The strategy admits a turn on the project's task type, not on
  // what this turn said, so a greeting or a stray keystroke enters the same
  // Full Plan route as a real brief. The prompt taught only three outcomes —
  // ask once, freeze a plan, deliver — and never named `blocked`, so an agent
  // left with nothing to design had no taught way to say so and invented a
  // subject instead ("111" became a prototype about 111). Teach the refusal.
  it('tells the agent to answer and block instead of inventing a subject', () => {
    const prompt = composeOdNextStrategyRequestPromptV2(recipe);

    expect(prompt).toContain('outcome: blocked');
    expect(prompt.toLowerCase()).toContain('do not invent');
    // The outcome has to be spelled out where the contract shapes are, not
    // only in prose: the agent copies its Runtime State from those examples.
    expect(prompt).toMatch(/blocked[\s\S]{0,400}canceled|canceled[\s\S]{0,400}blocked/);
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
    expect(prompt).toContain('## Generate the complete deck directly');
    expect(prompt).not.toContain('your plan **must**');
    expect(prompt).not.toContain('Plan the slide arc');
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

  it('tells the request stage the canonical-deliverable rule that judges a Direct Edit completion', () => {
    // A Direct Edit turn declares `outcome: completed` on the REQUEST stage and
    // is then judged by `validateRunDeliverable` — the same entry-resolution
    // ladder the production prompt spells out. Shipping that rule only in the
    // production continuation left Direct Edit agents graded on a contract they
    // were never given, which surfaced as a terminal
    // `od_next_canonical_deliverable_invalid` with no repair path.
    const prompt = composeOdNextStrategyRequestPromptV2(recipe);
    expect(prompt).toContain('for both new work and existing artifacts');
    expect(prompt).toContain('it looks for a root `index.html`, then a single root-level html file, then a single file matching the project kind');
    // Writing outside the project directory yields `no_artifact`, which reads
    // to the agent as "I finished" and to Open Design as "nothing delivered".
    expect(prompt).toContain('Write every deliverable inside the project directory');
  });

  it('composes a versioned request golden with one Task Skill and a generation stage', () => {
    const prompt = composeOdNextStrategyRequestPromptV2(recipe);
    const headings = prompt.split('\n').filter((line) => line.startsWith('#'));

    expect(headings).toMatchInlineSnapshot(`
      [
        "# Open Design execution and security boundary",
        "## Native filesystem execution",
        "## Versioned recipe identity",
        "## Direct generation surface",
        "## OD Next core strategy",
        "# Core",
        "## OD Next general orchestration",
        "# Orchestration",
        "## Task Skill — prototype",
        "# Prototype",
        "## Active stage: generate",
        "### file-write",
        "### live-artifact",
        "## Strict machine wire protocol and user output boundary",
      ]
    `);
    expect(prompt.match(/^## Task Skill —/gm)).toHaveLength(1);
    expect(prompt).not.toContain('<question-form>');
    expect(prompt).not.toContain(`<${OD_NEXT_PLAN_CONTRACT_BLOCK}>`);
    expect(prompt).not.toContain('Todo plan');
    expect(prompt).not.toContain('planning-only');
    expect(prompt).toContain('Create or edit the requested deliverables in the current request turn');
    expect(prompt).toContain(`strategy package: \`${A}\``);
    expect(prompt).toContain(`selected Task Skill digest: \`${B}\``);
  });

  it('settles missing essential inputs without starting a planning continuation', () => {
    const surface = composeOdNextStrategyBundleHeadV2(recipe)
      .coreSystemPrompt.discoveryAndPlanningSurface;
    expect(surface).toContain('declare `outcome: blocked`');
    expect(surface).toContain('The user can supply it in a new request');
    expect(surface).not.toContain('<question-form>');
  });

  it('retains runtime facts without asking for a Plan Contract', () => {
    const prompt = composeOdNextStrategyRequestPromptV2({
      ...recipe,
      planningFacts: {
        capabilitySnapshotHash: B,
        inputRefs: ['request'],
        productionRoutes: ['html', 'prototype-html'],
        outputKinds: ['prototype', 'html'],
        nativeChildLifecycleVerified: true,
      },
    });
    expect(prompt).not.toContain(`<${OD_NEXT_PLAN_CONTRACT_BLOCK}>`);
    expect(StrategyRuntimeStateV2Schema.parse(
      parseWireBlock(prompt, OD_NEXT_RUNTIME_STATE_BLOCK),
    )).toMatchObject({ route: 'direct_edit', inputStage: 'request', outcome: 'completed' });
    // The real facts live in the separately rendered runtime-facts block.
    const facts = renderOdNextRuntimeFactsV2({
      ...recipe,
      planningFacts: {
        capabilitySnapshotHash: B,
        inputRefs: ['request'],
        productionRoutes: ['html', 'prototype-html'],
        outputKinds: ['prototype', 'html'],
        nativeChildLifecycleVerified: true,
      },
    });
    expect(facts).toContain(`"capabilitySnapshotHash": "${B}"`);
    expect(facts).toContain('"allowedProductionRoutes": [');
    expect(facts).toContain('"prototype-html"');
    expect(facts).toContain(`"appliedSnapshot": "${recipe.snapshotId}"`);
    // The core strategy makes verified structured native Child lifecycle a
    // precondition for locking complex mode. Asked to judge a capability it
    // cannot observe, an Agent can only guess, and the safe guess is simple —
    // so the answer has to travel with the other runtime-owned facts.
    expect(facts).toContain('"nativeChildLifecycleVerified": true');
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

  it('emits a Runtime State accepted by the existing schema without a Plan Contract', () => {
    const prompt = composeOdNextStrategyRequestPromptV2(recipe, { agentId: 'codex' });
    const state = StrategyRuntimeStateV2Schema.parse(parseWireBlock(prompt, OD_NEXT_RUNTIME_STATE_BLOCK));
    expect(state).toEqual({
      schema: 'open-design.strategy-state/v2', route: 'direct_edit',
      inputStage: 'request', outcome: 'completed', executionMode: 'simple', reasonCodes: [],
    });
    expect(StrategyRuntimeStateV2Schema.parse({ ...state, outcome: 'blocked' }).outcome).toBe('blocked');
    expect(prompt).not.toContain(`<${OD_NEXT_PLAN_CONTRACT_BLOCK}>`);
    expect(prompt).not.toContain('plan_ready');
    expect(prompt).not.toContain('buildPackages');
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
      activeStages: [],
    })).toThrow(/exactly the generate stage/i);
    expect(() => composeOdNextStrategyRequestPromptV2({
      ...recipe,
      activeStages: [{ name: 'generate', atoms: [{ name: 'file-write' }] }],
    })).toThrow(/must declare exactly file-write, live-artifact/i);
    expect(() => composeOdNextStrategyRequestPromptV2({
      ...recipe,
      activeStages: [{ name: 'plan', atoms: [{ name: 'todo-write' }] }],
    })).toThrow(/must describe the generate stage/i);
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
      nativeSessionResume: true,
      taskExecutionId: 'task-1',
      taskRunIndex: 1,
      planContractHash: A,
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

  it('emits native-session-only deltas and gives Production the frozen plan plus terminal state shape', () => {
    const clarification = composeOdNextStrategyContinuationV2({
      stage: 'clarification',
      nativeSessionResume: true,
      taskExecutionId: 'task-1',
      taskRunIndex: 1,
      answer: 'Keep the audience focused on operators.',
    });
    const contractRepair = composeOdNextStrategyContinuationV2({
      stage: 'contract_repair',
      nativeSessionResume: true,
      taskExecutionId: 'task-1',
      taskRunIndex: 1,
      serializationIssue: 'fullPlan.steps[0].outputs is missing.',
    });
    const production = composeOdNextStrategyContinuationV2({
      stage: 'production',
      nativeSessionResume: true,
      taskExecutionId: 'task-1',
      taskRunIndex: 1,
      planContractHash: A,
      hostProtocolKey: '0123456789abcdef',
    });

    expect(clarification).toContain('Clarification answer');
    // OPEND-2954: every Runtime State example in the protocol reference shows
    // `inputStage: "request"`, and this was the one continuation that never
    // named its own stage — so a clarification turn copied the example and was
    // refused for it. The continuation now says which stage it runs at.
    expect(clarification).toContain('stage="clarification" task_run_index="1"');
    expect(clarification).toContain('inputStage clarification');
    expect(clarification).toContain('outcome plan_ready');
    expect(contractRepair).toContain('serialization-only');
    expect(production).toContain(`planContractHash=${A}`);
    expect(production).toMatch(/^<open_design_request_turn/);
    expect(production).toContain('task_execution_id="task-1"');
    expect(production).toContain('stage="production" task_run_index="1"');
    expect(production).toContain('## Closing Runtime State');
    expect(production).toContain('exactly one open-design-runtime-state block');
    expect(production).toContain('schema open-design.strategy-state/v2');
    expect(production).toContain('route full_plan');
    expect(production).toContain('inputStage production');
    expect(production).toContain('executionMode equal to the mode locked');
    expect(production).toContain('outcome completed');
    expect(production).toContain('reasonCodes []');
    expect(production).toContain('no Plan Contract block');
    expect(production).not.toContain(recipe.coreStrategy);
    expect(production).not.toContain(recipe.generalOrchestration);
    expect(production).not.toContain(recipe.taskSkill);
    expect(production).not.toContain(B);
    expect(production).toContain('inputStage=production');
    expect(production).toContain('<od-done key="0123456789abcdef"/>');
    expect(production).toContain('<od-next key="0123456789abcdef" value="Add an orders list page"/>');
    expect(production).toContain('<od-focus key="0123456789abcdef"');
    expect(production).toContain('Place the Closing Runtime State before any final follow-up markers');
    expect(production).not.toContain('End this response with exactly one');
    expect(clarification).not.toContain('<od-done');
    expect(contractRepair).not.toContain('<od-done');
    const complexProduction = composeOdNextStrategyContinuationV2({
      stage: 'production',
      nativeSessionResume: true,
      taskExecutionId: 'task-1',
      taskRunIndex: 2,
      planContractHash: A,
      nativeBuildPackageBindings: [{
        buildPackageId: 'shell',
        nativeAgentHandle: 'od-build-1-0123456789abcdef',
        dependsOn: [],
      }, {
        buildPackageId: 'flow',
        nativeAgentHandle: 'od-build-2-fedcba9876543210',
        dependsOn: ['shell'],
      }],
    });
    expect(complexProduction).toContain('structured `subagent_type` handle');
    expect(complexProduction).toContain('## Closing Runtime State');
    expect(complexProduction).not.toContain('<od-done');
    expect(complexProduction).not.toContain('Place the Closing Runtime State before any final follow-up markers');
    expect(complexProduction).toContain('od-build-1-0123456789abcdef');
    expect(complexProduction).toContain('"dependsOn":["shell"]');
    expect(() => composeOdNextStrategyContinuationV2({
      stage: 'production',
      nativeSessionResume: true,
      taskExecutionId: 'task-1',
      taskRunIndex: 2,
      planContractHash: A,
      nativeBuildPackageBindings: [{
        buildPackageId: 'shell',
        nativeAgentHandle: 'shell-from-prose',
        dependsOn: [],
      }],
    })).toThrow(/daemon-issued/);
    expect(() => composeOdNextStrategyContinuationV2({
      stage: 'production',
      nativeSessionResume: false,
      planContractHash: A,
    } as never)).toThrow(/native session resume/i);
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

describe('direct generation omits the runtime planning-tool hint', () => {
  const note = 'Your plan tool is `update_plan` — use it for the plan step above.';

  it('omits the host-resolved hint from stable context and both composers', () => {
    const context = { agentId: 'codex', planToolNote: note };
    for (const prompt of [
      composeOdNextStrategyStableRequestContextV2(context),
      composeOdNextStrategyRequestPromptV2(recipe, context),
      composeSystemPrompt({ odNextStrategyRecipe: recipe, ...context }),
    ]) {
      expect(prompt).not.toContain('runtime-plan-tool');
      expect(prompt).not.toContain(note);
    }
  });
});
