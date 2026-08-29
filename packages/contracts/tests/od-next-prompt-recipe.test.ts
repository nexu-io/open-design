import { describe, expect, it } from 'vitest';
import {
  composeOdNextStrategyBundleHeadV2,
  composeOdNextStrategyCorePromptV2,
  composeOdNextStrategyContinuationV2,
  composeOdNextStrategyRequestPromptV2,
  renderOdNextRuntimeFactsV2,
  composeOdNextStrategyStableRequestContextV2,
  odNextPromptCacheIdentityV2,
  type OdNextStrategyRequestRecipeV2,
} from '../src/prompts/od-next-strategy.js';
import {
  FullPlanV2Schema,
  OD_NEXT_PLAN_CONTRACT_BLOCK,
  OD_NEXT_RUNTIME_STATE_BLOCK,
  OpenDesignPlanContractV2Schema,
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
  generalOrchestration: '# Orchestration\n\nPrepare a Design Spec and Full Plan, then Build.',
  taskSkill: '# Prototype\n\nProduce the declared editable prototype.',
  activeStages: [
    { name: 'discovery', atoms: [{ name: 'discovery-question-form' }] },
    { name: 'plan', atoms: [{ name: 'direction-picker' }, { name: 'todo-write' }] },
    { name: 'generate', atoms: [{ name: 'file-write' }, { name: 'live-artifact' }] },
  ],
};

describe('OD Next V2 prompt recipe', () => {
  it('states the deliverable rules that only bite once a plan declares more than one', () => {
    // The canonical Plan Contract example carries a single deliverable whose id
    // equals `canonicalDeliverable.id`, so the membership rule reads as a
    // coincidence of the one-item example rather than an invariant. A complex
    // plan naturally declares one deliverable per page and picks one as
    // canonical, at which point codex emitted a canonical id that appeared
    // nowhere in requiredDeliverables and terminated on
    // `taskProfile.requiredDeliverables: The canonical deliverable must be part
    // of requiredDeliverables.`
    const prompt = composeOdNextStrategyRequestPromptV2(recipe);
    const contract = OpenDesignPlanContractV2Schema.parse(
      parseWireBlock(prompt, OD_NEXT_PLAN_CONTRACT_BLOCK),
    );
    const multiDeliverable = {
      ...contract,
      taskProfile: {
        ...contract.taskProfile,
        canonicalDeliverable: { ...contract.taskProfile.canonicalDeliverable, id: 'home' },
        requiredDeliverables: [
          { id: 'pricing', kind: contract.taskProfile.canonicalDeliverable.kind },
          { id: 'about', kind: contract.taskProfile.canonicalDeliverable.kind },
        ],
      },
    };
    const rejected = OpenDesignPlanContractV2Schema.safeParse(multiDeliverable);
    expect(rejected.success).toBe(false);
    expect(JSON.stringify(rejected.error?.issues)).toContain(
      'The canonical deliverable must be part of requiredDeliverables.',
    );
    expect(prompt).toContain(
      'taskProfile.canonicalDeliverable.id must itself appear as one of the requiredDeliverables ids',
    );
    expect(prompt).toContain('Ids must be unique within requiredDeliverables and within buildRequirements');
  });

  it('spells out the Build Package shape that only a complex plan ever emits', () => {
    // The canonical Plan Contract example is a SIMPLE plan, and the schema
    // rejects a simple plan that carries Build Packages, so that example's
    // `buildPackages` is necessarily `[]`. It left the one array unique to
    // complex mode with neither a template nor a prose shape, while
    // `buildRequirements` and `readinessArtifacts` both got spelled out. A
    // model asked for complex therefore had to invent seven `.strict()` field
    // names: codex and opencode independently guessed `dependencies` plus a
    // stray `boundary`, and both terminated on
    // `od_next_protocol_plan_contract_invalid_schema`.
    const buildPackage = FullPlanV2Schema.parse({
      executionMode: 'complex',
      steps: [
        { id: 'shell', objective: 'Build the shared shell.', outputs: ['shell'] },
        { id: 'flow', objective: 'Build the primary flow.', outputs: ['flow'], dependsOn: ['shell'] },
      ],
      readinessArtifacts: [],
      buildPackages: [
        {
          id: 'shell',
          objective: 'Build the shared shell.',
          inputs: [],
          outputs: ['shell'],
          sharedConstraints: ['Use the frozen type and spacing tokens.'],
          dependsOn: [],
          allowedResources: ['project-source'],
        },
        {
          id: 'flow',
          objective: 'Build the primary flow.',
          inputs: ['shell'],
          outputs: ['flow'],
          sharedConstraints: ['Use the frozen type and spacing tokens.'],
          dependsOn: ['shell'],
          allowedResources: ['project-source'],
        },
      ],
    }).buildPackages[0]!;

    const prompt = composeOdNextStrategyRequestPromptV2(recipe);
    // Naming every accepted key means a new schema field cannot land without
    // the contract prose growing to describe it.
    for (const field of Object.keys(buildPackage)) {
      expect(prompt).toContain(field);
    }
    expect(prompt).toContain(
      'Every buildPackages entry is an object with exactly id, objective, inputs, outputs, '
      + 'sharedConstraints, dependsOn, and allowedResources',
    );
    expect(prompt).toContain(
      'a complex plan needs at least two Build Packages, an acyclic dependsOn graph, '
      + 'and exactly one owning Build Package per output',
    );
  });

  it('tells the request stage the canonical-deliverable rule that judges a Direct Edit completion', () => {
    // A Direct Edit turn declares `outcome: completed` on the REQUEST stage and
    // is then judged by `validateRunDeliverable` — the same entry-resolution
    // ladder the production prompt spells out. Shipping that rule only in the
    // production continuation left Direct Edit agents graded on a contract they
    // were never given, which surfaced as a terminal
    // `od_next_canonical_deliverable_invalid` with no repair path.
    const prompt = composeOdNextStrategyRequestPromptV2(recipe);
    expect(prompt).toContain('Direct Edit remains the only route allowed to perform Build work on the request stage.');
    expect(prompt).toContain('canonical-deliverable check that gates production already applies');
    expect(prompt).toContain('it looks for a root `index.html`, then a single root-level html file, then a single file matching the project kind');
    // Writing outside the project directory yields `no_artifact`, which reads
    // to the agent as "I finished" and to Open Design as "nothing delivered".
    expect(prompt).toContain('Write every deliverable inside the project directory');
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
        "## Strict machine wire protocol and user output boundary",
      ]
    `);
    expect(prompt.match(/^## Task Skill —/gm)).toHaveLength(1);
    expect(prompt).toContain('<question-form>');
    expect(prompt).toContain('Todo plan');
    expect(prompt).toContain('Design Spec');
    expect(prompt).toContain('Full Plan');
    expect(prompt).toContain('Build Packages');
    expect(prompt).toContain('request and clarification stages are planning-only');
    expect(prompt).toContain('Direct Edit remains the only route allowed to perform Build work');
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

  it('pins daemon-owned planning facts into the strict machine example', () => {
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
    const contract = parseWireBlock(prompt, OD_NEXT_PLAN_CONTRACT_BLOCK);
    // The example carries only per-task-type values; every per-task value is a
    // placeholder the Agent copies from <runtime_facts>.
    expect(OpenDesignPlanContractV2Schema.parse(contract)).toMatchObject({
      taskProfile: {
        taskProfileVersion: '2.0.0',
        canonicalDeliverable: { kind: 'prototype' },
      },
      runManifest: {
        capabilitySnapshotHash: '0'.repeat(64),
        inputRefs: ['copy-input-refs-from-runtime-facts'],
        productionRoutes: ['copy-production-route-from-runtime-facts'],
      },
    });
    expect(contract).not.toMatchObject({ runManifest: { capabilitySnapshotHash: B } });
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

  it('prints wrapper protocol examples that remain valid against the exact V2 schemas', () => {
    const prompt = composeOdNextStrategyRequestPromptV2(recipe, { agentId: 'codex' });
    const planContract = parseWireBlock(prompt, OD_NEXT_PLAN_CONTRACT_BLOCK);
    const runtimeState = parseWireBlock(prompt, OD_NEXT_RUNTIME_STATE_BLOCK);

    expect(OpenDesignPlanContractV2Schema.parse(planContract)).toEqual(planContract);
    expect(StrategyRuntimeStateV2Schema.parse(runtimeState)).toEqual(runtimeState);
    expect(prompt).toContain('open-design.plan-contract/v2');
    expect(prompt).toContain('open-design.strategy-state/v2');
    expect(prompt).toContain('capabilitySnapshotHash');
    expect(prompt).toContain('productionRoutes');
    expect(prompt).toContain('decisionSummary');
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

  it('changes cache identity for either package or selected profile content', () => {
    const baseline = odNextPromptCacheIdentityV2(recipe);
    expect(odNextPromptCacheIdentityV2({ ...recipe, packageHash: B })).not.toBe(baseline);
    expect(odNextPromptCacheIdentityV2({ ...recipe, taskProfileDigest: A })).not.toBe(baseline);
  });

  it('emits native-session-only deltas and gives Production only a Plan Contract hash', () => {
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
    });

    expect(clarification).toContain('Clarification answer');
    expect(contractRepair).toContain('serialization-only');
    expect(production).toContain(`planContractHash=${A}`);
    expect(production).toMatch(/^<open_design_request_turn/);
    expect(production).toContain('task_execution_id="task-1"');
    expect(production).toContain('stage="production" task_run_index="1"');
    expect(production).not.toContain(recipe.coreStrategy);
    expect(production).not.toContain(recipe.generalOrchestration);
    expect(production).not.toContain(recipe.taskSkill);
    expect(production).not.toContain(B);
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
