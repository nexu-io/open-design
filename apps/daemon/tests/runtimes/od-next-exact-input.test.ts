import { describe, expect, it } from 'vitest';
import {
  OD_NEXT_BUNDLE_ECHO_GUARD_V2,
  serializeOdNextPromptBundleV2,
} from '@open-design/contracts';
import {
  composeChatAgentTextPayload,
  resolveOdNextRequestUserPrompt,
} from '../../src/runtimes/chat-prompt-inputs.js';
import {
  OD_NEXT_BUNDLE_NODE_PATHS_V2,
  OD_NEXT_BUNDLE_TEXT_CONTRIBUTOR_IDS_V2,
  OD_NEXT_EXACT_INPUT_MAP_V1,
  OD_NEXT_EXACT_INPUT_MAP_VERSION,
  OD_NEXT_EXACT_TEXT_DELIVERY_PATHS_V1,
  OD_NEXT_LEGACY_TEXT_CONTRIBUTOR_IDS_V1,
  OD_NEXT_SEMANTIC_REQUEST_FACT_MAP_V1,
  type OdNextExactInputEntry,
  type OdNextSemanticRequestFactEntry,
  assertOdNextBundleTextContributorCoverage,
  assertOdNextExactInputMapV1,
  assertOdNextLegacyTextContributorCoverage,
  assertOdNextSemanticRequestFactProducerCoverage,
  assertSingleOdNextPromptBundleRoot,
} from '../../src/runtimes/od-next-exact-input.js';

describe('OD Next exact Agent input map v1', () => {
  it('classifies every production contributor exactly once', () => {
    expect(OD_NEXT_EXACT_INPUT_MAP_VERSION).toBe('open-design.od-next-exact-input-map/v2');
    expect(() => assertOdNextExactInputMapV1()).not.toThrow();
    expect(() => assertOdNextLegacyTextContributorCoverage(
      OD_NEXT_LEGACY_TEXT_CONTRIBUTOR_IDS_V1,
    )).not.toThrow();
    expect(() => assertOdNextBundleTextContributorCoverage(
      OD_NEXT_BUNDLE_TEXT_CONTRIBUTOR_IDS_V2,
    )).not.toThrow();

    const entriesById = new Map<string, OdNextExactInputEntry>(
      OD_NEXT_EXACT_INPUT_MAP_V1.map((entry) => [entry.id, entry]),
    );
    expect(entriesById.get('request_text')?.classification).toBe('initial_bundle');
    expect(entriesById.get('contract_repair_turn')).toMatchObject({
      classification: 'stage_turn',
      stage: 'contract_repair',
    });
    expect(entriesById.get('cwd_reference')?.classification).toBe('excluded');
    expect(entriesById.get('request_text')?.source).toContain('resolveOdNextRequestUserPrompt');
    expect(entriesById.get('daemon_system_prompt')?.textTarget)
      .toBe('open_design_core_system_prompt');
    expect(entriesById.get('echo_guard')?.textTarget)
      .toBe('open_design_core_system_prompt/echo_guard');
    expect(entriesById.get('user_selected_skills')?.textTarget)
      .toBe('session_skills/user_selected_skills');
    expect(entriesById.get('task_type_fact')?.textTarget).toBe('task_metadata/task_type');
    expect(entriesById.get('attachment_facts')?.textTarget).toBe('task_metadata/attachments');
    expect(entriesById.get('task_config_pending_fact')?.textTarget)
      .toBe('task_metadata/task_configuration');
    expect(entriesById.get('title_generation_directive')?.textTarget)
      .toBe('task_metadata/title_directive');
    expect(entriesById.get('recipe_identity')?.textTarget).toBe('context/recipe_identity');
    expect(entriesById.get('runtime_facts')?.textTarget).toBe('context/runtime_facts');
    expect(entriesById.get('stable_context_prompt')?.textTarget)
      .toBe('context/stable_request_context');
    expect(entriesById.get('frozen_skill_package')?.textTarget)
      .toBe('context/frozen_skill_package');
    expect(entriesById.get('request_input_facts')?.textTarget).toBe('context/request_input_facts');
    expect(entriesById.get('prior_transcript')?.textTarget).toBe('context/prior_transcript');
    expect(entriesById.get('request_text')?.textTarget).toBe('user_first_prompt');
    // Per-run and per-task text is fenced out of the cache-shared head.
    expect(entriesById.get('runtime_tool_prompt')?.textTarget)
      .toBe('context/runtime_tool_environment');
    expect(entriesById.get('client_system_prompt')?.textTarget)
      .toBe('context/client_system_prompt');
    expect(entriesById.get('form_override')?.textTarget).toBe('context/form_override');
    // The split of the former request_input_pending_fact aggregate is complete.
    expect(entriesById.has('request_input_pending_fact')).toBe(false);
    expect(entriesById.get('image_binary_input')?.classification).toBe('out_of_band');
    expect(entriesById.get('mcp_server_registrations')?.classification).toBe('out_of_band');
    expect(entriesById.get('mcp_oauth_credentials')?.classification).toBe('out_of_band');
    expect(entriesById.get('available_skills_index')?.classification).toBe('excluded');
    expect(entriesById.get('stable_prompt_hash')?.classification).toBe('excluded');

    const semanticById = new Map<string, OdNextSemanticRequestFactEntry>(
      OD_NEXT_SEMANTIC_REQUEST_FACT_MAP_V1.map((entry) => [entry.id, entry]),
    );
    expect(semanticById.get('prior_transcript')?.source).toContain('buildDaemonPriorTranscript');
    expect(semanticById.get('current_user_turn')?.textTarget).toBe('user_first_prompt');
    expect(semanticById.get('prior_transcript')?.textTarget).toBe('context/prior_transcript');
    expect(semanticById.get('strategy_task_skill')?.textTarget)
      .toBe('session_skills/task_type_skill');
    expect(semanticById.has('user_selected_skills')).toBe(false);
    expect(semanticById.get('strategy_task_type')?.owner).toContain('Task 04');
    expect(semanticById.get('project_attachment_selection')?.owner).toContain('Task 04');
    expect(semanticById.get('available_skills_catalogue')?.classification).toBe('excluded');
  });

  it('fails when a production text contributor is unregistered, duplicated, or omitted', () => {
    expect(() => assertOdNextLegacyTextContributorCoverage([
      ...OD_NEXT_LEGACY_TEXT_CONTRIBUTOR_IDS_V1,
      'new_unregistered_prompt_suffix',
    ])).toThrow(/not registered: new_unregistered_prompt_suffix/);
    expect(() => assertOdNextLegacyTextContributorCoverage([
      ...OD_NEXT_LEGACY_TEXT_CONTRIBUTOR_IDS_V1,
      'form_override',
    ])).toThrow(/duplicated: form_override/);
    expect(() => assertOdNextLegacyTextContributorCoverage(
      OD_NEXT_LEGACY_TEXT_CONTRIBUTOR_IDS_V1.filter((id) => id !== 'image_references'),
    )).toThrow(/missing: image_references/);
    expect(() => assertOdNextLegacyTextContributorCoverage(
      ['production_turn'],
      'production',
    )).not.toThrow();
    expect(() => assertOdNextBundleTextContributorCoverage([
      ...OD_NEXT_BUNDLE_TEXT_CONTRIBUTOR_IDS_V2,
      'invented_bundle_suffix',
    ])).toThrow(/not registered: invented_bundle_suffix/);
    expect(() => assertOdNextBundleTextContributorCoverage([
      ...OD_NEXT_BUNDLE_TEXT_CONTRIBUTOR_IDS_V2,
      'prior_transcript',
    ])).toThrow(/duplicated: prior_transcript/);
    expect(() => assertOdNextBundleTextContributorCoverage(
      OD_NEXT_BUNDLE_TEXT_CONTRIBUTOR_IDS_V2.filter(
        (id) => id !== 'request_input_facts',
      ),
    )).toThrow(/missing: request_input_facts/);
  });

  it('addresses every text contributor at a declared v2 Bundle node path, one owner per node', () => {
    const declared = new Set<string>(OD_NEXT_BUNDLE_NODE_PATHS_V2);
    const owners = new Map<string, string>();
    for (const entry of OD_NEXT_EXACT_INPUT_MAP_V1) {
      if (!('textTarget' in entry) || !entry.textTarget) continue;
      expect(declared, `${entry.id} -> ${entry.textTarget}`).toContain(entry.textTarget);
      expect(owners.get(entry.textTarget)).toBeUndefined();
      owners.set(entry.textTarget, entry.id);
    }
    for (const entry of OD_NEXT_SEMANTIC_REQUEST_FACT_MAP_V1) {
      if (!('textTarget' in entry) || !entry.textTarget) continue;
      expect(declared, `${entry.id} -> ${entry.textTarget}`).toContain(entry.textTarget);
    }
    // Every Bundle contributor owns a node; the aggregate head owns
    // `open_design_core_system_prompt` itself while its separately contributed
    // children are addressed as nested paths.
    expect(owners.get('open_design_core_system_prompt')).toBe('daemon_system_prompt');
    expect([...owners.keys()].filter((path) => (
      path.startsWith('open_design_core_system_prompt/') || path.startsWith('session_skills/')
    ))).toEqual([
      'open_design_core_system_prompt/echo_guard',
      'session_skills/user_selected_skills',
    ]);
    // The removed wrapper must not come back as a node path.
    expect([...declared].some((path) => (
      path === 'system_prompt'
      || path.startsWith('system_prompt/')
      || path.startsWith('task_config/')
      || path === 'user_prompt'
    ))).toBe(false);
    expect(OD_NEXT_BUNDLE_TEXT_CONTRIBUTOR_IDS_V2.every((id) => (
      [...owners.values()].includes(id)
    ))).toBe(true);
  });

  it('rejects an unknown or double-claimed Bundle node path', () => {
    expect(() => assertOdNextExactInputMapV1([
      {
        id: 'invented_contributor',
        classification: 'initial_bundle',
        source: 'nowhere()',
        owner: 'nobody',
        textTarget: 'context/invented_slot' as never,
        note: 'not a v2 node path',
      },
    ])).toThrow(/unknown Bundle node path: context\/invented_slot/);
    expect(() => assertOdNextExactInputMapV1([
      {
        id: 'first_claim',
        classification: 'initial_bundle',
        source: 'first()',
        owner: 'bundle serializer',
        textTarget: 'context/run_context',
        note: 'first owner',
      },
      {
        id: 'second_claim',
        classification: 'initial_bundle',
        source: 'second()',
        owner: 'bundle serializer',
        textTarget: 'context/run_context',
        note: 'duplicate owner',
      },
    ])).toThrow(/context\/run_context is claimed by both first_claim and second_claim/);
  });

  it('keeps wrapper syntax outside canonical text across every production delivery family', () => {
    expect(OD_NEXT_EXACT_TEXT_DELIVERY_PATHS_V1.map((path) => path.id)).toEqual([
      'prompt_file',
      'runtime_args',
      'plain_stdin',
      'stream_json_stdin',
      'pi_rpc',
      'dsh_profile_jsonl',
      'acp_json_rpc',
    ]);
    for (const path of OD_NEXT_EXACT_TEXT_DELIVERY_PATHS_V1) {
      expect(path.invariant).toContain('exactText');
    }
  });

  it('fails when a production semantic producer omits or invents a fact', () => {
    const requestFacts = {
      prior_transcript: 'history',
      current_user_turn: 'latest',
      headless_message_fallback: null,
      stable_context_prompt: 'stable context',
      task_config_pending_fact: '{"state":"pending"}',
      request_input_pending_fact: '{"state":"pending"}',
      request_execution_configuration: {},
      run_context_selection: null,
      project_attachment_selection: [],
      comment_attachment_selection: [],
      image_attachment_selection: [],
    };
    expect(() => assertOdNextSemanticRequestFactProducerCoverage(
      'request',
      requestFacts,
    )).not.toThrow();
    const { image_attachment_selection: _omitted, ...missing } = requestFacts;
    expect(() => assertOdNextSemanticRequestFactProducerCoverage(
      'request',
      missing,
    )).toThrow(/missing from request: image_attachment_selection/);
    expect(() => assertOdNextSemanticRequestFactProducerCoverage(
      'request',
      { ...requestFacts, invented_fact: true },
    )).toThrow(/not registered for request: invented_fact/);
  });
});

describe('chat Agent exact-text production choke point', () => {
  it('keeps Web, legacy-client, and CLI/headless current-turn semantics explicit', () => {
    expect(resolveOdNextRequestUserPrompt({
      message: '## user\nprior\n\n## user\ncurrent',
      currentPrompt: 'current',
      hasCurrentPrompt: true,
    })).toBe('current');
    expect(resolveOdNextRequestUserPrompt({
      message: 'must not be used',
      currentPrompt: '',
      hasCurrentPrompt: true,
    })).toBe('');
    expect(resolveOdNextRequestUserPrompt({
      message: 'must not be used',
      currentPrompt: null,
      hasCurrentPrompt: true,
    })).toBe('');
    expect(resolveOdNextRequestUserPrompt({
      message: 'CLI headless prompt',
      currentPrompt: undefined,
      hasCurrentPrompt: false,
    })).toBe('CLI headless prompt');
  });
  it('preserves the ordinary Markdown prompt byte-for-byte while registering every leaf contributor', () => {
    const result = composeChatAgentTextPayload({
      formOverride: '[form override]\n',
      daemonSystemPrompt: '  daemon system  ',
      runtimeToolPrompt: 'runtime tools',
      researchCommandContract: 'research contract',
      runContextPrompt: 'run context',
      connectedExternalMcpReference: 'connected MCP: figma',
      browserUnavailableGuard: 'browser unavailable',
      titleGenerationDirective: 'emit title marker',
      clientSystemPrompt: 'client system',
      cwdReference: '\n\nworkspace: `/project`',
      linkedDirectoryReferences: '\n\nlinked: `/code`',
      echoGuard: '\n\ndo not echo',
      requestOrStageText: 'Build the dashboard.',
      projectAttachmentReferences: '\n\nattachment: `brief.md`',
      commentAttachmentReferences: '\n\ncomment: fix header',
      imageReferences: '@/uploads/a.png @/uploads/b.png',
    });

    const clientInstruction = [
      'research contract',
      'run context',
      'connected MCP: figma',
      'browser unavailable',
      'emit title marker',
      'client system',
    ].join('\n\n---\n\n');
    const instruction = [
      'daemon system',
      'runtime tools',
      clientInstruction,
    ].join('\n\n---\n\n');
    expect(result.clientInstructionPrompt).toBe(clientInstruction);
    expect(result.instructionPrompt).toBe(instruction);
    expect(result.composedPrompt).toBe(
      '# Instructions (read first)\n\n'
      + '[form override]\n'
      + instruction
      + '\n\nworkspace: `/project`'
      + '\n\nlinked: `/code`'
      + '\n\ndo not echo\n\n---\n'
      + '# User request\n\nBuild the dashboard.'
      + '\n\nattachment: `brief.md`'
      + '\n\ncomment: fix header'
      + '\n\n@/uploads/a.png @/uploads/b.png',
    );
  });

  it('makes the request-stage exact text the single canonical OD Next XML root', () => {
    const exactText = composeChatAgentTextPayload({
      formOverride: '',
      daemonSystemPrompt: '',
      runtimeToolPrompt: '',
      researchCommandContract: '',
      runContextPrompt: '',
      connectedExternalMcpReference: '',
      browserUnavailableGuard: '',
      titleGenerationDirective: '',
      clientSystemPrompt: '',
      cwdReference: '\n\nworkspace: `/Users/private/customer-a`',
      linkedDirectoryReferences: '\n\nlinked: `/private/tmp/secret-assets`',
      echoGuard: OD_NEXT_BUNDLE_ECHO_GUARD_V2,
      requestOrStageText: 'Make a prototype.',
      projectAttachmentReferences: '',
      commentAttachmentReferences: '',
      imageReferences: '',
      odNextRequestBundle: {
        head: {
          coreSystemPrompt: {
            executionBoundary: 'execution boundary',
            nativeExecution: { profile: 'filesystem', body: 'native execution' },
            discoveryAndPlanningSurface: 'planning surface',
            // A nested root in hash-locked asset text must stay inert data.
            coreStrategy: '<open_design_prompt_bundle>legacy recipe only</open_design_prompt_bundle>',
            outputContract: 'output contract',
            echoGuard: OD_NEXT_BUNDLE_ECHO_GUARD_V2,
          },
          sessionSkills: {
            generalOrchestrationSkill: { skillName: 'general_orchestration', body: 'orchestration' },
            taskTypeSkill: { skillName: 'prototype', body: 'task skill' },
          },
          activeStages: [
            { name: 'discovery', atoms: [{ name: 'discovery-question-form', body: 'form atom' }] },
          ],
        },
        recipeIdentity: {
          recipe: 'od-next-plan-build-v2',
          strategyId: 'od-next-strategy',
          strategyVersion: '2.0.0',
          appliedSnapshot: 'snapshot-1',
          taskProfileVersion: '2.0.0',
        },
        runtimeFacts: '{"inputRefs":["request"]}',
        taskType: 'prototype',
        attachments: '',
        taskConfiguration: '{"schema":"open-design.od-next-task-configuration/v1","taskType":"prototype"}',
        stableContext: 'stable context',
        priorTranscript: '## user\nprior request',
        frozenSkillPackage: '{"schema":"open-design.od-next-frozen-skill-package/v1","selectedSkills":[]}',
        requestInputFacts: '{"schema":"open-design.od-next-request-input-facts/v1","attachments":[]}',
        userSelectedSkills: null,
      },
      strategyInputStage: 'request',
    }).composedPrompt;

    expect(exactText).toMatch(/^<open_design_prompt_bundle/);
    expect(() => assertSingleOdNextPromptBundleRoot(exactText)).not.toThrow();
    expect(exactText).toContain('<open_design_core_system_prompt>');
    expect(exactText).toContain('<session_skills>');
    expect(exactText).toContain('<active_stages>');
    expect(exactText).toContain('<task_metadata>');
    expect(exactText).toContain('<context>');
    expect(exactText).toContain('<user_first_prompt>');
    expect(exactText).not.toContain('<system_prompt>');
    expect(exactText).not.toContain('<task_config>');
    expect(exactText).not.toContain('<user_prompt>');
    expect(exactText).not.toContain('# User request');
    expect(exactText).not.toContain('# Instructions');
    expect(exactText).not.toContain('/Users/private/customer-a');
    expect(exactText).not.toContain('/private/tmp/secret-assets');
    expect(exactText).toContain('open-design.od-next-task-configuration/v1');
    expect(exactText).toContain('open-design.od-next-request-input-facts/v1');
    expect(exactText).toContain('<core_strategy>');
    expect(exactText).toContain('<recipe_identity ');
    expect(exactText).not.toContain('\n\n---\n\n');
    expect(exactText.match(/<open_design_prompt_bundle schema=/g)).toHaveLength(1);
    expect(() => assertSingleOdNextPromptBundleRoot(
      '<open_design_prompt_bundle version="1">\ncontent\n</open_design_prompt_bundle>',
    )).toThrow(/canonical open_design_prompt_bundle/);
    expect(() => assertSingleOdNextPromptBundleRoot(
      '<open_design_prompt_bundle>content</open_design_prompt_bundle>\n# appended markdown',
    )).toThrow(/canonical open_design_prompt_bundle root/);
    expect(() => assertSingleOdNextPromptBundleRoot(
      '<open_design_prompt_bundleevil>content</open_design_prompt_bundle>',
    )).toThrow(/canonical open_design_prompt_bundle root/);
  });

  it('sends existing OD Next continuation stages as exact Turn text without a legacy wrapper', () => {
    const continuation = '# OD Next native continuation — production\n\nContinue the frozen plan.';
    const result = composeChatAgentTextPayload({
      formOverride: 'must not escape',
      daemonSystemPrompt: 'must not be re-seeded',
      runtimeToolPrompt: 'must not be re-seeded',
      researchCommandContract: 'must not escape',
      runContextPrompt: 'must not escape',
      connectedExternalMcpReference: 'must not escape',
      browserUnavailableGuard: 'must not escape',
      titleGenerationDirective: 'must not escape',
      clientSystemPrompt: 'must not be re-seeded',
      cwdReference: 'must not escape',
      linkedDirectoryReferences: 'must not escape',
      echoGuard: 'must not escape',
      requestOrStageText: continuation,
      projectAttachmentReferences: 'must not escape',
      commentAttachmentReferences: 'must not escape',
      imageReferences: 'must not escape',
      strategyInputStage: 'production',
    });

    expect(result).toEqual({
      composedPrompt: continuation,
      clientInstructionPrompt: '',
      instructionPrompt: '',
    });
    expect(result.composedPrompt).not.toContain('# User request');
  });
});

describe('canonical OD Next Bundle root witness', () => {
  const canonicalV2 = (
    userFirstPrompt = 'Make a prototype.',
  ): string => serializeOdNextPromptBundleV2({
    coreSystemPrompt: {
      executionBoundary: 'execution boundary',
      nativeExecution: { profile: 'filesystem', body: 'native execution' },
      discoveryAndPlanningSurface: 'discovery surface',
      coreStrategy: 'core strategy',
      outputContract: 'output contract',
      echoGuard: 'do not echo <open_design_core_system_prompt>',
    },
    sessionSkills: {
      generalOrchestrationSkill: { skillName: 'od-next-orchestration', body: 'orchestrate' },
      taskTypeSkill: { skillName: 'od-next-prototype', body: 'prototype skill' },
    },
    activeStages: [{ name: 'production', atoms: [{ name: 'deliver' }] }],
    taskMetadata: { taskType: 'prototype' },
    context: {
      recipeIdentity: {
        recipe: 'od-next',
        strategyId: 'od-next-core',
        strategyVersion: '2.0.0',
        appliedSnapshot: 'snapshot-1',
        taskProfileVersion: '1.0.0',
      },
    },
    userFirstPrompt,
  });

  it('accepts one canonical v2 tree and rejects v1, appended, or malformed roots', () => {
    const exactText = canonicalV2();
    expect(exactText).toMatch(/^<open_design_prompt_bundle/);
    expect(exactText).toContain('open-design.od-next-prompt-bundle/v2');
    expect(() => assertSingleOdNextPromptBundleRoot(exactText)).not.toThrow();
    expect(() => assertSingleOdNextPromptBundleRoot(
      '<open_design_prompt_bundle version="1">\ncontent\n</open_design_prompt_bundle>',
    )).toThrow(/canonical open_design_prompt_bundle root/);
    expect(() => assertSingleOdNextPromptBundleRoot(
      `${exactText}\n# appended markdown`,
    )).toThrow(/canonical open_design_prompt_bundle root/);
    expect(() => assertSingleOdNextPromptBundleRoot(`\n${exactText}`))
      .toThrow(/canonical open_design_prompt_bundle root/);
    expect(() => assertSingleOdNextPromptBundleRoot(
      '<open_design_prompt_bundleevil>content</open_design_prompt_bundle>',
    )).toThrow(/canonical open_design_prompt_bundle root/);
  });
});
