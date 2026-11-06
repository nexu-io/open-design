import {
  type CanonicalXmlElementNode,
  type CanonicalXmlNode,
  indexCanonicalXmlChildren,
  parseCanonicalXml,
  requireCanonicalXmlAttribute,
  requireCanonicalXmlElement,
  requireCanonicalXmlText,
  serializeCanonicalXml,
} from './canonical-xml.js';

export const OD_NEXT_PROMPT_BUNDLE_SCHEMA_V2 =
  'open-design.od-next-prompt-bundle/v2' as const;

/**
 * The cache-stable head of the Bundle: `open_design_core_system_prompt`,
 * `session_skills`, and `active_stages`.
 *
 * Every byte here is identical across tasks that share a strategy version, task
 * type, and execution profile, so a provider's prompt cache can reuse the whole
 * prefix instead of diverging a few hundred tokens in. The PRD names these
 * blocks at the Bundle's top level rather than under a `system_prompt` wrapper,
 * so they are siblings of `task_metadata`, `context`, and `user_first_prompt`.
 *
 * `userSelectedSkills` is the one deliberate exception: the spec places
 * user-chosen Skills inside `session_skills`, so a task that selects Skills
 * partitions the cache separately from one that does not. It is the last child
 * of `session_skills` to keep that divergence as late as possible.
 */
export interface OdNextPromptBundleHeadV2 {
  coreSystemPrompt: {
    executionBoundary: string;
    nativeExecution: { profile: 'filesystem' | 'text_artifact'; body: string };
    discoveryAndPlanningSurface: string;
    coreStrategy: string;
    /** Output constraints belong to the core system prompt, per §3.7.1 block ①. */
    outputContract: string;
    echoGuard: string;
  };
  sessionSkills: {
    generalOrchestrationSkill: { skillName: string; body: string };
    taskTypeSkill: { skillName: string; body: string };
    userSelectedSkills?: { skillNames: ReadonlyArray<string>; body: string } | undefined;
  };
  activeStages: ReadonlyArray<OdNextPromptBundleStageV2>;
}

/**
 * The initial OD Next payload as an element tree rather than four opaque text
 * blobs.
 *
 * Block order is load-bearing:
 *
 * 1. The head (`OdNextPromptBundleHeadV2`) comes first and is byte-identical
 *    across tasks of the same strategy version, task type, and execution
 *    profile. Every per-task or per-run value lives in `taskMetadata`,
 *    `context`, or `userFirstPrompt`, so the shared cache prefix runs through
 *    the end of `active_stages`.
 * 2. `userFirstPrompt` is the last content element, so the user's own words
 *    hold the recency position rather than transport metadata.
 */
export interface OdNextPromptBundleV2 extends OdNextPromptBundleHeadV2 {
  taskMetadata: {
    taskType: string;
    attachments?: string | undefined;
    taskConfiguration?: string | undefined;
    titleDirective?: string | undefined;
  };
  context: {
    recipeIdentity: OdNextPromptBundleRecipeIdentityV2;
    runtimeFacts?: string | undefined;
    runtimeToolEnvironment?: string | undefined;
    stableRequestContext?: string | undefined;
    frozenSkillPackage?: string | undefined;
    requestInputFacts?: string | undefined;
    researchCommandContract?: string | undefined;
    runContext?: string | undefined;
    connectedExternalMcp?: string | undefined;
    browserUnavailableGuard?: string | undefined;
    clientSystemPrompt?: string | undefined;
    formOverride?: string | undefined;
    priorTranscript?: string | undefined;
  };
  userFirstPrompt: string;
}

export interface OdNextPromptBundleStageV2 {
  name: string;
  atoms: ReadonlyArray<{ name: string; body?: string | undefined }>;
}

/**
 * Per-task strategy identity. It sits in `context`, not in the head, because
 * `appliedSnapshot` is unique per task and would otherwise cut the shared cache
 * prefix at the very front of the bundle.
 *
 * Only the fields the model actually consumes are carried here. The audit-only
 * strategy package hash, Task Skill digest, and stable prompt identity stay out
 * of the prompt; they remain available through `odNextPromptCacheIdentityV2`
 * and the persisted strategy task record.
 */
export interface OdNextPromptBundleRecipeIdentityV2 {
  recipe: string;
  strategyId: string;
  strategyVersion: string;
  appliedSnapshot: string;
  taskProfileVersion: string;
}

const CORE_SYSTEM_PROMPT_SLOTS = [
  'execution_boundary',
  'native_execution',
  'discovery_and_planning_surface',
  'core_strategy',
  'output_contract',
  'echo_guard',
] as const;
const SESSION_SKILL_SLOTS = [
  'general_orchestration_skill',
  'task_type_skill',
  'user_selected_skills',
] as const;
const TASK_METADATA_SLOTS = [
  'task_type',
  'attachments',
  'task_configuration',
  'title_directive',
] as const;
const CONTEXT_SLOTS = [
  'recipe_identity',
  'runtime_facts',
  'runtime_tool_environment',
  'stable_request_context',
  'frozen_skill_package',
  'request_input_facts',
  'research_command_contract',
  'run_context',
  'connected_external_mcp',
  'browser_unavailable_guard',
  'client_system_prompt',
  'form_override',
  'prior_transcript',
] as const;
const BUNDLE_SLOTS = [
  'open_design_core_system_prompt',
  'session_skills',
  'active_stages',
  'task_metadata',
  'context',
  'user_first_prompt',
] as const;
const RECIPE_IDENTITY_ATTRIBUTES = [
  ['recipe', 'recipe'],
  ['strategy_id', 'strategyId'],
  ['strategy_version', 'strategyVersion'],
  ['applied_snapshot', 'appliedSnapshot'],
  ['task_profile_version', 'taskProfileVersion'],
] as const satisfies ReadonlyArray<readonly [string, keyof OdNextPromptBundleRecipeIdentityV2]>;
const EXECUTION_PROFILES = new Set(['filesystem', 'text_artifact']);
const STAGE_NAME_PATTERN = /^[a-z][a-z0-9-]*$/;

function requireBody(value: string, field: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new TypeError(field + ' must not be empty.');
  }
  return value;
}

/** Emit a text slot only when it has content, per the spec's no-empty-slot rule. */
function optionalTextNode(
  tag: string,
  value: string | undefined,
): CanonicalXmlNode | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  return { kind: 'text', tag, text: value };
}

function textNode(tag: string, value: string, field: string): CanonicalXmlNode {
  return { kind: 'text', tag, text: requireBody(value, field) };
}

function present(nodes: ReadonlyArray<CanonicalXmlNode | null>): CanonicalXmlNode[] {
  return nodes.filter((node): node is CanonicalXmlNode => node !== null);
}

function stageNode(
  stage: OdNextPromptBundleStageV2,
  index: number,
): CanonicalXmlNode {
  const field = 'activeStages[' + index + ']';
  if (!STAGE_NAME_PATTERN.test(stage.name)) {
    throw new TypeError(field + '.name must be a lowercase kebab-case stage id.');
  }
  if (stage.atoms.length === 0) {
    throw new TypeError(field + ' must declare at least one atom.');
  }
  const seen = new Set<string>();
  const atoms = stage.atoms.map((atom, atomIndex) => {
    const atomField = field + '.atoms[' + atomIndex + ']';
    if (!STAGE_NAME_PATTERN.test(atom.name)) {
      throw new TypeError(atomField + '.name must be a lowercase kebab-case atom id.');
    }
    if (seen.has(atom.name)) {
      throw new TypeError(atomField + ' repeats atom ' + atom.name + '.');
    }
    seen.add(atom.name);
    // An atom with no prompt fragment is a presence marker: the tag already
    // says the atom is active, so there is no filler sentence to carry.
    if (typeof atom.body !== 'string' || !atom.body.trim()) {
      return { kind: 'marker' as const, tag: 'atom', attributes: [['name', atom.name]] };
    }
    return {
      kind: 'text' as const,
      tag: 'atom',
      attributes: [['name', atom.name]] as ReadonlyArray<readonly [string, string]>,
      text: atom.body,
    };
  });
  return {
    kind: 'element',
    tag: 'stage',
    attributes: [['name', stage.name]],
    // `stage` children all share the tag `atom`, so they are distinguished by
    // their `name` attribute rather than by tag uniqueness.
    children: atoms as ReadonlyArray<CanonicalXmlNode>,
  };
}

function buildTree(input: OdNextPromptBundleV2): CanonicalXmlNode {
  const core = input.coreSystemPrompt;
  if (!EXECUTION_PROFILES.has(core.nativeExecution.profile)) {
    throw new TypeError('nativeExecution.profile must be filesystem or text_artifact.');
  }
  const skills = input.sessionSkills;
  if (input.activeStages.length === 0) {
    throw new TypeError('activeStages must declare at least one stage.');
  }
  const selected = skills.userSelectedSkills;
  if (selected && selected.skillNames.length === 0) {
    throw new TypeError('userSelectedSkills must name at least one Skill.');
  }
  return {
    kind: 'element',
    tag: 'open_design_prompt_bundle',
    attributes: [['schema', OD_NEXT_PROMPT_BUNDLE_SCHEMA_V2]],
    children: [
      {
        kind: 'element',
        tag: 'open_design_core_system_prompt',
        children: [
          textNode('execution_boundary', core.executionBoundary, 'executionBoundary'),
          {
            kind: 'text',
            tag: 'native_execution',
            attributes: [['profile', core.nativeExecution.profile]],
            text: requireBody(core.nativeExecution.body, 'nativeExecution.body'),
          },
          textNode(
            'discovery_and_planning_surface',
            core.discoveryAndPlanningSurface,
            'discoveryAndPlanningSurface',
          ),
          textNode('core_strategy', core.coreStrategy, 'coreStrategy'),
          textNode('output_contract', core.outputContract, 'outputContract'),
          textNode('echo_guard', core.echoGuard, 'echoGuard'),
        ],
      },
      {
        kind: 'element',
        tag: 'session_skills',
        children: present([
          {
            kind: 'text',
            tag: 'general_orchestration_skill',
            attributes: [['skill_name', skills.generalOrchestrationSkill.skillName]],
            text: requireBody(
              skills.generalOrchestrationSkill.body,
              'generalOrchestrationSkill.body',
            ),
          },
          {
            kind: 'text',
            tag: 'task_type_skill',
            attributes: [['skill_name', skills.taskTypeSkill.skillName]],
            text: requireBody(skills.taskTypeSkill.body, 'taskTypeSkill.body'),
          },
          selected
            ? {
              kind: 'text',
              tag: 'user_selected_skills',
              attributes: [['skill_names', selected.skillNames.join(',')]],
              text: requireBody(selected.body, 'userSelectedSkills.body'),
            }
            : null,
        ]),
      },
      {
        kind: 'element',
        tag: 'active_stages',
        children: input.activeStages.map(stageNode),
      },
      {
        kind: 'element',
        tag: 'task_metadata',
        children: present([
          textNode('task_type', input.taskMetadata.taskType, 'taskType'),
          optionalTextNode('attachments', input.taskMetadata.attachments),
          optionalTextNode('task_configuration', input.taskMetadata.taskConfiguration),
          optionalTextNode('title_directive', input.taskMetadata.titleDirective),
        ]),
      },
      {
        kind: 'element',
        tag: 'context',
        children: present([
          {
            kind: 'marker',
            tag: 'recipe_identity',
            attributes: RECIPE_IDENTITY_ATTRIBUTES.map(([attribute, field]) => [
              attribute,
              requireBody(input.context.recipeIdentity[field], 'recipeIdentity.' + field),
            ]),
          },
          optionalTextNode('runtime_facts', input.context.runtimeFacts),
          optionalTextNode('runtime_tool_environment', input.context.runtimeToolEnvironment),
          optionalTextNode('stable_request_context', input.context.stableRequestContext),
          optionalTextNode('frozen_skill_package', input.context.frozenSkillPackage),
          optionalTextNode('request_input_facts', input.context.requestInputFacts),
          optionalTextNode('research_command_contract', input.context.researchCommandContract),
          optionalTextNode('run_context', input.context.runContext),
          optionalTextNode('connected_external_mcp', input.context.connectedExternalMcp),
          optionalTextNode('browser_unavailable_guard', input.context.browserUnavailableGuard),
          optionalTextNode('client_system_prompt', input.context.clientSystemPrompt),
          optionalTextNode('form_override', input.context.formOverride),
          optionalTextNode('prior_transcript', input.context.priorTranscript),
        ]),
      },
      textNode('user_first_prompt', input.userFirstPrompt, 'userFirstPrompt'),
    ],
  };
}

/** Serialize the initial bundle to its single canonical encoding. */
export function serializeOdNextPromptBundleV2(input: OdNextPromptBundleV2): string {
  return serializeCanonicalXml(buildTree(input));
}

function readText(
  index: ReadonlyMap<string, CanonicalXmlNode>,
  tag: string,
  field: string,
): string {
  return requireCanonicalXmlText(index.get(tag), field).text;
}

function readOptionalText(
  index: ReadonlyMap<string, CanonicalXmlNode>,
  tag: string,
  field: string,
): string | undefined {
  const node = index.get(tag);
  if (!node) return undefined;
  return requireCanonicalXmlText(node, field).text;
}

function readStages(node: CanonicalXmlElementNode): OdNextPromptBundleStageV2[] {
  return node.children.map((child, index) => {
    const field = 'active_stages/stage[' + index + ']';
    if (child.tag !== 'stage' || child.kind !== 'element') {
      throw new TypeError(field + ' must be a stage element.');
    }
    return {
      name: requireCanonicalXmlAttribute(child, 'name', field),
      atoms: child.children.map((atom, atomIndex) => {
        const atomField = field + '/atom[' + atomIndex + ']';
        if (atom.tag !== 'atom' || atom.kind === 'element') {
          throw new TypeError(atomField + ' must be an atom text or marker node.');
        }
        const name = requireCanonicalXmlAttribute(atom, 'name', atomField);
        return atom.kind === 'text' ? { name, body: atom.text } : { name };
      }),
    };
  });
}

/**
 * Parse a stored bundle, then prove it is byte-identical to what this version
 * would emit. A payload that parses but would re-serialize differently is
 * rejected, so a drifting writer cannot quietly change persisted prompt bytes.
 */
export function parseOdNextPromptBundleV2(source: string): OdNextPromptBundleV2 {
  const root = requireCanonicalXmlElement(parseCanonicalXml(source), 'bundle');
  if (root.tag !== 'open_design_prompt_bundle') {
    throw new TypeError('Prompt Bundle root must be open_design_prompt_bundle.');
  }
  if (requireCanonicalXmlAttribute(root, 'schema', 'bundle') !== OD_NEXT_PROMPT_BUNDLE_SCHEMA_V2) {
    throw new TypeError('Prompt Bundle schema is not ' + OD_NEXT_PROMPT_BUNDLE_SCHEMA_V2 + '.');
  }
  const top = indexCanonicalXmlChildren(root, BUNDLE_SLOTS, 'bundle');
  const coreNode = requireCanonicalXmlElement(
    top.get('open_design_core_system_prompt'),
    'open_design_core_system_prompt',
  );
  const core = indexCanonicalXmlChildren(
    coreNode,
    CORE_SYSTEM_PROMPT_SLOTS,
    'open_design_core_system_prompt',
  );
  const nativeExecution = requireCanonicalXmlText(
    core.get('native_execution'),
    'native_execution',
  );
  const profile = requireCanonicalXmlAttribute(nativeExecution, 'profile', 'native_execution');
  if (!EXECUTION_PROFILES.has(profile)) {
    throw new TypeError('native_execution profile must be filesystem or text_artifact.');
  }
  const skillsNode = requireCanonicalXmlElement(top.get('session_skills'), 'session_skills');
  const skills = indexCanonicalXmlChildren(skillsNode, SESSION_SKILL_SLOTS, 'session_skills');
  const general = requireCanonicalXmlText(
    skills.get('general_orchestration_skill'),
    'general_orchestration_skill',
  );
  const taskTypeSkill = requireCanonicalXmlText(skills.get('task_type_skill'), 'task_type_skill');
  const selectedNode = skills.get('user_selected_skills');
  const metadataNode = requireCanonicalXmlElement(top.get('task_metadata'), 'task_metadata');
  const metadata = indexCanonicalXmlChildren(metadataNode, TASK_METADATA_SLOTS, 'task_metadata');
  const contextNode = requireCanonicalXmlElement(top.get('context'), 'context');
  const context = indexCanonicalXmlChildren(contextNode, CONTEXT_SLOTS, 'context');
  const identityNode = context.get('recipe_identity');
  if (!identityNode || identityNode.kind !== 'marker') {
    throw new TypeError('recipe_identity must be a marker node.');
  }
  const identity = Object.fromEntries(
    RECIPE_IDENTITY_ATTRIBUTES.map(([attribute, field]) => [
      field,
      requireCanonicalXmlAttribute(identityNode, attribute, 'recipe_identity'),
    ]),
  ) as unknown as OdNextPromptBundleRecipeIdentityV2;
  const parsed: OdNextPromptBundleV2 = {
    coreSystemPrompt: {
      executionBoundary: readText(core, 'execution_boundary', 'execution_boundary'),
      nativeExecution: {
        profile: profile as 'filesystem' | 'text_artifact',
        body: nativeExecution.text,
      },
      discoveryAndPlanningSurface: readText(
        core,
        'discovery_and_planning_surface',
        'discovery_and_planning_surface',
      ),
      coreStrategy: readText(core, 'core_strategy', 'core_strategy'),
      outputContract: readText(core, 'output_contract', 'output_contract'),
      echoGuard: readText(core, 'echo_guard', 'echo_guard'),
    },
    sessionSkills: {
      generalOrchestrationSkill: {
        skillName: requireCanonicalXmlAttribute(
          general,
          'skill_name',
          'general_orchestration_skill',
        ),
        body: general.text,
      },
      taskTypeSkill: {
        skillName: requireCanonicalXmlAttribute(taskTypeSkill, 'skill_name', 'task_type_skill'),
        body: taskTypeSkill.text,
      },
      ...(selectedNode
        ? {
          userSelectedSkills: {
            skillNames: requireCanonicalXmlAttribute(
              selectedNode,
              'skill_names',
              'user_selected_skills',
            ).split(','),
            body: requireCanonicalXmlText(selectedNode, 'user_selected_skills').text,
          },
        }
        : {}),
    },
    activeStages: readStages(
      requireCanonicalXmlElement(top.get('active_stages'), 'active_stages'),
    ),
    taskMetadata: {
      taskType: readText(metadata, 'task_type', 'task_type'),
      ...optionalField('attachments', readOptionalText(metadata, 'attachments', 'attachments')),
      ...optionalField(
        'taskConfiguration',
        readOptionalText(metadata, 'task_configuration', 'task_configuration'),
      ),
      ...optionalField(
        'titleDirective',
        readOptionalText(metadata, 'title_directive', 'title_directive'),
      ),
    },
    context: {
      recipeIdentity: identity,
      ...optionalField('runtimeFacts', readOptionalText(context, 'runtime_facts', 'runtime_facts')),
      ...optionalField(
        'runtimeToolEnvironment',
        readOptionalText(context, 'runtime_tool_environment', 'runtime_tool_environment'),
      ),
      ...optionalField(
        'stableRequestContext',
        readOptionalText(context, 'stable_request_context', 'stable_request_context'),
      ),
      ...optionalField(
        'frozenSkillPackage',
        readOptionalText(context, 'frozen_skill_package', 'frozen_skill_package'),
      ),
      ...optionalField(
        'requestInputFacts',
        readOptionalText(context, 'request_input_facts', 'request_input_facts'),
      ),
      ...optionalField(
        'researchCommandContract',
        readOptionalText(context, 'research_command_contract', 'research_command_contract'),
      ),
      ...optionalField('runContext', readOptionalText(context, 'run_context', 'run_context')),
      ...optionalField(
        'connectedExternalMcp',
        readOptionalText(context, 'connected_external_mcp', 'connected_external_mcp'),
      ),
      ...optionalField(
        'browserUnavailableGuard',
        readOptionalText(context, 'browser_unavailable_guard', 'browser_unavailable_guard'),
      ),
      ...optionalField(
        'clientSystemPrompt',
        readOptionalText(context, 'client_system_prompt', 'client_system_prompt'),
      ),
      ...optionalField('formOverride', readOptionalText(context, 'form_override', 'form_override')),
      ...optionalField(
        'priorTranscript',
        readOptionalText(context, 'prior_transcript', 'prior_transcript'),
      ),
    },
    userFirstPrompt: readText(top, 'user_first_prompt', 'user_first_prompt'),
  };
  if (serializeOdNextPromptBundleV2(parsed) !== source) {
    throw new TypeError('Prompt Bundle is not in canonical form.');
  }
  return parsed;
}

function optionalField<K extends string>(
  key: K,
  value: string | undefined,
): Record<K, string> | Record<string, never> {
  return value === undefined ? {} : ({ [key]: value } as Record<K, string>);
}
