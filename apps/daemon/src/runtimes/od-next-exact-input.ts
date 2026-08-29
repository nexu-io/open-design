import { parseOdNextPromptBundleV2 } from '@open-design/contracts';

export const OD_NEXT_EXACT_INPUT_MAP_VERSION =
  'open-design.od-next-exact-input-map/v2' as const;

/**
 * Every addressable node of the v2 Prompt Bundle tree that a text contributor
 * may own, in canonical document order.
 *
 * A contributor names the exact node it fills rather than one of four flat
 * blocks, so the ownership map records where the bytes land. The bare
 * `open_design_core_system_prompt` path stays addressable because the recipe
 * aggregate contributes several of its children at once; the constant head's
 * leaves are listed so a future per-leaf contributor has a legal target without
 * widening the union.
 *
 * `active_stages` is the aggregate target for stage content: `stage`/`atom`
 * children are addressed by their `name` attribute, not by a static path, so
 * they are not separate union members.
 *
 * The split follows the bundle's cache invariant: only cross-task-constant
 * content may sit in the head (`open_design_core_system_prompt`,
 * `session_skills`, `active_stages`), which is why the per-run tool prompt, the
 * caller's system prompt, and the first-run form override are `context/*` paths
 * here.
 */
export const OD_NEXT_BUNDLE_NODE_PATHS_V2 = [
  'open_design_core_system_prompt',
  'open_design_core_system_prompt/execution_boundary',
  'open_design_core_system_prompt/native_execution',
  'open_design_core_system_prompt/discovery_and_planning_surface',
  'open_design_core_system_prompt/core_strategy',
  'open_design_core_system_prompt/output_contract',
  'open_design_core_system_prompt/echo_guard',
  'session_skills/general_orchestration_skill',
  'session_skills/task_type_skill',
  'session_skills/user_selected_skills',
  'active_stages',
  'task_metadata/task_type',
  'task_metadata/attachments',
  'task_metadata/task_configuration',
  'task_metadata/title_directive',
  'context/recipe_identity',
  'context/runtime_facts',
  'context/runtime_tool_environment',
  'context/stable_request_context',
  'context/frozen_skill_package',
  'context/request_input_facts',
  'context/research_command_contract',
  'context/run_context',
  'context/connected_external_mcp',
  'context/browser_unavailable_guard',
  'context/client_system_prompt',
  'context/form_override',
  'context/prior_transcript',
  'user_first_prompt',
] as const;

export type OdNextBundleNodePathV2 = (typeof OD_NEXT_BUNDLE_NODE_PATHS_V2)[number];

export type OdNextExactInputClassification =
  | 'initial_bundle'
  | 'stage_turn'
  | 'transport_reference'
  | 'out_of_band'
  | 'excluded';

export type OdNextExactInputStage =
  | 'request'
  | 'clarification'
  | 'contract_repair'
  | 'production';

export type OdNextExactInputEntry = Readonly<{
  id: string;
  classification: OdNextExactInputClassification;
  source: string;
  owner: string;
  textTarget?: OdNextBundleNodePathV2;
  stage?: 'clarification' | 'contract_repair' | 'production';
  note: string;
}>;

export type OdNextSemanticRequestFactEntry = Readonly<{
  id: string;
  classification: 'initial_bundle' | 'transport_reference' | 'out_of_band' | 'excluded';
  producer?: 'daemon_system_prompt' | 'request';
  source: string;
  owner: string;
  textTarget?: OdNextBundleNodePathV2;
  note: string;
}>;

/**
 * Every leaf text input consumed by the ordinary production Markdown composer,
 * which is the non-OD-Next path and still emits flat Markdown sections.
 *
 * Keeping this list separate from the ownership map makes an unregistered
 * addition fail at the production seam instead of silently escaping the OD Next
 * XML root.
 */
export const OD_NEXT_LEGACY_TEXT_CONTRIBUTOR_IDS_V1 = [
  'form_override',
  'daemon_system_prompt',
  'runtime_tool_prompt',
  'research_command_contract',
  'run_context_prompt',
  'connected_external_mcp_reference',
  'browser_unavailable_guard',
  'title_generation_directive',
  'client_system_prompt',
  'cwd_reference',
  'linked_directory_references',
  'echo_guard',
  'request_text',
  'project_attachment_references',
  'comment_attachment_references',
  'image_references',
] as const;

export type OdNextLegacyTextContributorId =
  (typeof OD_NEXT_LEGACY_TEXT_CONTRIBUTOR_IDS_V1)[number];

/**
 * Every leaf text input consumed by the canonical OD Next request Bundle, in
 * the tree's canonical node order.
 */
export const OD_NEXT_BUNDLE_TEXT_CONTRIBUTOR_IDS_V2 = [
  'daemon_system_prompt',
  'echo_guard',
  'user_selected_skills',
  'task_type_fact',
  'attachment_facts',
  'task_config_pending_fact',
  'title_generation_directive',
  'recipe_identity',
  'runtime_facts',
  'runtime_tool_prompt',
  'stable_context_prompt',
  'frozen_skill_package',
  'request_input_facts',
  'research_command_contract',
  'run_context_prompt',
  'connected_external_mcp_reference',
  'browser_unavailable_guard',
  'client_system_prompt',
  'form_override',
  'prior_transcript',
  'request_text',
] as const;

export type OdNextBundleTextContributorIdV2 =
  (typeof OD_NEXT_BUNDLE_TEXT_CONTRIBUTOR_IDS_V2)[number];

/**
 * Final text-segment and transport ownership map. Aggregate entries such as
 * `daemon_system_prompt` deliberately remain aggregates here; their semantic
 * leaves are enumerated in OD_NEXT_SEMANTIC_REQUEST_FACT_MAP_V1 below.
 * `source` names a real production symbol/seam, not a product-spec alias.
 * `textTarget` names the exact v2 Bundle node the bytes land in.
 */
export const OD_NEXT_EXACT_INPUT_MAP_V1 = [
  {
    id: 'daemon_system_prompt',
    classification: 'initial_bundle',
    source: 'composeDaemonSystemPrompt().prompt',
    owner: 'bundle serializer',
    textTarget: 'open_design_core_system_prompt',
    note: 'Structured recipe aggregate: contributes open_design_core_system_prompt, session_skills and active_stages as elements. Cross-task constant.',
  },
  {
    id: 'echo_guard',
    classification: 'initial_bundle',
    source: 'startChatRun.ECHO_GUARD',
    owner: 'bundle serializer',
    textTarget: 'open_design_core_system_prompt/echo_guard',
    note: 'Constant; references the `<open_design_core_system_prompt>` and `<user_first_prompt>` tag names.',
  },
  {
    id: 'user_selected_skills',
    classification: 'initial_bundle',
    source: 'renderFrozenSkillBundleContext() user-selected Skill bodies',
    owner: 'Task 03 immutable Skill package',
    textTarget: 'session_skills/user_selected_skills',
    note: 'Frozen user-@Skill bodies. The one per-task member of session_skills, kept last so the shared prefix diverges as late as possible.',
  },
  {
    id: 'task_type_fact',
    classification: 'initial_bundle',
    source: 'loadOdNextTaskInputSnapshot().taskConfigText -> OdNextTaskConfigurationV1.taskType',
    owner: 'Task 04 canonical task configuration snapshot',
    textTarget: 'task_metadata/task_type',
    note: 'Resolved task type from the frozen task-input snapshot.',
  },
  {
    id: 'attachment_facts',
    classification: 'initial_bundle',
    source: 'loadOdNextTaskInputSnapshot().requestInputText -> OdNextRequestInputFactsV1.attachments',
    owner: 'Task 04 immutable attachment snapshot',
    textTarget: 'task_metadata/attachments',
    note: 'Immutable attachment identities (reference, mime type, digest); never attachment bodies or absolute paths.',
  },
  {
    id: 'task_config_pending_fact',
    classification: 'initial_bundle',
    source: 'loadOdNextTaskInputSnapshot().taskConfigText',
    owner: 'Task 04 canonical task configuration snapshot',
    textTarget: 'task_metadata/task_configuration',
    note: 'Canonical allowlisted task type, locale, selected agent, route, mode and execution configuration.',
  },
  {
    id: 'title_generation_directive',
    classification: 'initial_bundle',
    source: 'startChatRun.titleGenerationPrompt',
    owner: 'bundle serializer',
    textTarget: 'task_metadata/title_directive',
    note: 'Internal title marker directive; per-task presence.',
  },
  {
    id: 'recipe_identity',
    classification: 'initial_bundle',
    source: 'resolveOdNextStrategyRequestRecipeV2() identity fields + strategy task snapshotId',
    owner: 'bundle context serializer',
    textTarget: 'context/recipe_identity',
    note: 'Per-task strategy identity incl. applied snapshot id. Lives here, not in the head, so the per-task UUID does not cut the shared cache prefix. Audit-only package hash, Task Skill digest and stable prompt identity are deliberately not emitted.',
  },
  {
    id: 'runtime_facts',
    classification: 'initial_bundle',
    source: 'renderOdNextRuntimeFactsV2()',
    owner: 'bundle context serializer',
    textTarget: 'context/runtime_facts',
    note: 'Runtime-owned planning facts the Agent copies verbatim; per-task, so excluded from the cache-stable head.',
  },
  {
    id: 'runtime_tool_prompt',
    classification: 'initial_bundle',
    source: 'createAgentRuntimeToolPrompt()',
    owner: 'bundle context serializer',
    textTarget: 'context/runtime_tool_environment',
    note: 'Textual tool contract embedding the per-run daemon URL; executable capability and credentials remain transport facts.',
  },
  {
    id: 'stable_context_prompt',
    classification: 'initial_bundle',
    source: 'composeOdNextStrategyStableRequestContextV2()',
    owner: 'bundle context serializer',
    textTarget: 'context/stable_request_context',
    note: 'Stable project, design, instruction and memory context.',
  },
  {
    id: 'frozen_skill_package',
    classification: 'initial_bundle',
    source: 'renderFrozenSkillBundleContext() frozen identity/roster JSON',
    owner: 'Task 03 immutable Skill package',
    textTarget: 'context/frozen_skill_package',
    note: 'Task-owned frozen Skill identity and side-file roster; bodies are injected as user_selected_skills. Omitted entirely when the user selected no Skill.',
  },
  {
    id: 'request_input_facts',
    classification: 'initial_bundle',
    source: 'loadOdNextTaskInputSnapshot().requestInputText',
    owner: 'Task 04 immutable request inputs',
    textTarget: 'context/request_input_facts',
    note: 'Immutable attachment/workspace/MCP references with no absolute paths. Omitted entirely when no attachment, comment, MCP server or linked directory is present.',
  },
  {
    id: 'research_command_contract',
    classification: 'initial_bundle',
    source: 'resolveResearchCommandContract()',
    owner: 'bundle context serializer',
    textTarget: 'context/research_command_contract',
    note: 'Research contract for the canonical current turn only.',
  },
  {
    id: 'run_context_prompt',
    classification: 'initial_bundle',
    source: 'renderRunContextPrompt()',
    owner: 'bundle context serializer',
    textTarget: 'context/run_context',
    note: 'User-selected workspace context, plugins, MCP servers and connectors.',
  },
  {
    id: 'connected_external_mcp_reference',
    classification: 'transport_reference',
    source: 'renderConnectedExternalMcpDirective()',
    owner: 'bundle context reference',
    textTarget: 'context/connected_external_mcp',
    note: 'Already-authenticated external MCP server references, frozen per task.',
  },
  {
    id: 'browser_unavailable_guard',
    classification: 'initial_bundle',
    source: 'renderBrowserUseUnavailablePrompt()',
    owner: 'bundle context serializer',
    textTarget: 'context/browser_unavailable_guard',
    note: 'Browser-automation unavailability reason, frozen per task.',
  },
  {
    id: 'client_system_prompt',
    classification: 'initial_bundle',
    source: 'ChatRequest.systemPrompt',
    owner: 'bundle context serializer',
    textTarget: 'context/client_system_prompt',
    note: 'Caller-supplied system prompt; per-task, so excluded from the cache-stable head.',
  },
  {
    id: 'form_override',
    classification: 'initial_bundle',
    source: 'startChatRun.formOverride',
    owner: 'bundle context serializer',
    textTarget: 'context/form_override',
    note: 'First-run form-answer control text; per-task, so excluded from the cache-stable head.',
  },
  {
    id: 'prior_transcript',
    classification: 'initial_bundle',
    source: 'buildDaemonPriorTranscript(history, agentId) -> ChatRequest.priorTranscript',
    owner: 'bundle context serializer',
    textTarget: 'context/prior_transcript',
    note: 'Agent-scoped transcript ending before the canonical current user turn.',
  },
  {
    id: 'request_text',
    classification: 'initial_bundle',
    source: 'resolveOdNextRequestUserPrompt({ message, currentPrompt, hasCurrentPrompt })',
    owner: 'stage-aware bundle/turn selector',
    textTarget: 'user_first_prompt',
    note: 'Explicit currentPrompt property presence wins even for null/empty; message is used only when the property is absent.',
  },
  {
    id: 'cwd_reference',
    classification: 'excluded',
    source: 'loadOdNextTaskInputSnapshot().requestInputText',
    owner: 'Task 04 immutable workspace reference',
    note: 'The live workspace path is excluded; task-input facts emit only workspace:project while the real cwd stays out of band.',
  },
  {
    id: 'linked_directory_references',
    classification: 'excluded',
    source: 'loadOdNextTaskInputSnapshot().requestInputText',
    owner: 'Task 04 immutable workspace reference',
    note: 'Live linked-directory paths are excluded; stable linked-dir:N aliases are emitted while access stays out of band.',
  },
  {
    id: 'clarification_turn',
    classification: 'stage_turn',
    source: 'composeOdNextStrategyContinuationV2(stage=clarification)',
    owner: 'turn serializer',
    stage: 'clarification',
    note: 'Existing strategy state-machine continuation; never re-seeds the first Bundle.',
  },
  {
    id: 'contract_repair_turn',
    classification: 'stage_turn',
    source: 'composeOdNextStrategyContinuationV2(stage=contract_repair)',
    owner: 'turn serializer',
    stage: 'contract_repair',
    note: 'Existing strategy state-machine continuation; never re-seeds the first Bundle.',
  },
  {
    id: 'production_turn',
    classification: 'stage_turn',
    source: 'composeOdNextStrategyContinuationV2(stage=production)',
    owner: 'turn serializer',
    stage: 'production',
    note: 'Existing strategy state-machine continuation; never re-seeds the first Bundle.',
  },
  {
    id: 'project_attachment_references',
    classification: 'excluded',
    source: 'loadOdNextTaskInputSnapshot().requestInputText',
    owner: 'Task 04 immutable attachment snapshot',
    note: 'Live paths are excluded; task-input references resolve under the out-of-band OD_TASK_INPUT_DIR Run projection.',
  },
  {
    id: 'comment_attachment_references',
    classification: 'excluded',
    source: 'loadOdNextTaskInputSnapshot().requestInputText',
    owner: 'Task 04 immutable attachment snapshot',
    note: 'Live comment bodies and paths are excluded; only a path/body-free count is emitted.',
  },
  {
    id: 'image_references',
    classification: 'excluded',
    source: 'loadOdNextTaskInputSnapshot().requestInputText',
    owner: 'Task 04 immutable attachment snapshot',
    note: 'Live image paths are excluded; frozen identity references are emitted while Run-projection resource paths stay out of band.',
  },
  {
    id: 'effective_cwd_capability',
    classification: 'out_of_band',
    source: 'startChatRun.effectiveCwd',
    owner: 'runtime transport',
    note: 'Spawn cwd / ACP session cwd; not prompt text.',
  },
  {
    id: 'linked_directory_allowlist',
    classification: 'out_of_band',
    source: 'resolveChatExtraAllowedDirs()',
    owner: 'runtime transport',
    note: 'Filesystem capability passed via adapter arguments; not prompt text.',
  },
  {
    id: 'image_binary_input',
    classification: 'out_of_band',
    source: 'buildArgs imagePaths / attachPiRpcSession.imagePaths / attachAcpSession.imagePaths',
    owner: 'runtime transport',
    note: 'Binary or runtime-native image input; references are represented separately.',
  },
  {
    id: 'mcp_server_registrations',
    classification: 'out_of_band',
    source: 'buildLiveArtifactsMcpServersForAgent(); Claude/Codebuddy .mcp.json; OpenCode/MiMo env-content; attachAcpSession.mcpServers',
    owner: 'runtime transport',
    note: 'External, run-scoped and live-artifact MCP registrations never become Bundle text.',
  },
  {
    id: 'mcp_oauth_credentials',
    classification: 'out_of_band',
    source: 'buildClaudeMcpJson() / buildOpenCodeMcpConfigContent()',
    owner: 'runtime transport',
    note: 'Bearer OAuth injection into .mcp.json or OpenCode/MiMo env-content; ACP currently admits stdio registrations only.',
  },
  {
    id: 'runtime_tool_environment',
    classification: 'out_of_band',
    source: 'createOpenDesignToolEnv() / spawnEnvForAgent() including OD_TOOL_TOKEN',
    owner: 'runtime transport',
    note: 'Executable paths, daemon/data coordinates and the scoped tool credential are child environment facts, not Bundle text.',
  },
  {
    id: 'runtime_model_options',
    classification: 'out_of_band',
    source: 'RuntimeAgentDef.buildArgs agentOptions / ACP model',
    owner: 'runtime transport',
    note: 'Model, reasoning, service tier and execution profile are launch/session configuration.',
  },
  {
    id: 'native_session_resume_identity',
    classification: 'out_of_band',
    source: 'resolveAgentResumeContext()',
    owner: 'runtime transport',
    note: 'Resume handle and stable-prefix cache diagnostics are not task Bundle content.',
  },
  {
    id: 'skill_side_files',
    classification: 'out_of_band',
    source: 'stageActiveSkill() / RuntimeAgentDef extraAllowedDirs',
    owner: 'Task 03 immutable Skill package',
    note: 'Filesystem package capability; the selected Skill body itself belongs inside Bundle context.',
  },
  {
    id: 'project_attachment_bytes',
    classification: 'out_of_band',
    source: 'createOdNextRunInputProjection() -> OD_TASK_INPUT_DIR / ACP resource_link',
    owner: 'Task 04 immutable attachment snapshot',
    note: 'Canonical bytes are daemon-only; Agent-readable copies live in a per-Run projection and only identity/reference/env-root semantics belong in Bundle text.',
  },
  {
    id: 'transport_wrapper_syntax',
    classification: 'excluded',
    source: 'prompt file / argv / stdin / stream-json / Pi RPC / ACP wrappers',
    owner: 'runtime transport',
    note: 'A wrapper may encode the exact text but must not change or be counted as canonical inner text.',
  },
  {
    id: 'available_skills_index',
    classification: 'excluded',
    source: 'not produced',
    owner: 'explicit product exclusion',
    note: 'The all-Skills catalogue is intentionally absent from Bundle, Turn, telemetry and tests.',
  },
  {
    id: 'stable_prompt_hash',
    classification: 'excluded',
    source: 'hashStableInstructions()',
    owner: 'conversation+agent cache diagnostics',
    note: 'Not task Bundle identity and must never trigger Bundle reconstruction or re-seeding.',
  },
] as const satisfies readonly OdNextExactInputEntry[];

/**
 * Semantic request facts below the final text aggregates. Task 02 decides their
 * canonical XML representation; Tasks 03/04 freeze the mutable Skill and
 * attachment/config facts. Keeping this layer executable prevents the final
 * `daemon_system_prompt`/`request_text` segments from hiding mutable inputs.
 */
export const OD_NEXT_SEMANTIC_REQUEST_FACT_MAP_V1 = [
  {
    id: 'prior_transcript',
    classification: 'initial_bundle',
    producer: 'request',
    source: 'buildDaemonPriorTranscript(history, agentId) -> ChatRequest.priorTranscript',
    owner: 'Task 02 transcript/context serializer',
    textTarget: 'context/prior_transcript',
    note: 'Contains only agent-scoped history before the latest user turn; ChatRequest.message remains a legacy transport compatibility field.',
  },
  {
    id: 'current_user_turn',
    classification: 'initial_bundle',
    producer: 'request',
    source: 'latestUserPromptFromHistory(history) -> ChatRequest.currentPrompt',
    owner: 'Task 02 user_first_prompt serializer',
    textTarget: 'user_first_prompt',
    note: 'Canonical latest user-authored turn. Property presence, not nullishness, selects this source.',
  },
  {
    id: 'headless_message_fallback',
    classification: 'initial_bundle',
    producer: 'request',
    source: 'od run start --message -> ChatRequest.message when currentPrompt is absent',
    owner: 'Task 02 user_first_prompt serializer',
    textTarget: 'user_first_prompt',
    note: 'Compatibility fallback only when currentPrompt is not an own property; explicit null or empty never falls back.',
  },
  {
    id: 'stable_context_prompt',
    classification: 'initial_bundle',
    producer: 'request',
    source: 'composeOdNextStrategyStableRequestContextV2() -> odNextStableContextPrompt',
    owner: 'Task 02 context serializer',
    textTarget: 'context/stable_request_context',
    note: 'The production Bundle receives this aggregate separately from the core recipe system prompt.',
  },
  {
    id: 'task_config_pending_fact',
    classification: 'initial_bundle',
    producer: 'request',
    source: 'loadOdNextTaskInputSnapshot().taskConfigText',
    owner: 'Task 04 canonical task configuration',
    textTarget: 'task_metadata/task_configuration',
    note: 'Canonical immutable configuration loaded from the task-scoped snapshot manifest.',
  },
  {
    id: 'request_input_pending_fact',
    classification: 'initial_bundle',
    producer: 'request',
    source: 'loadOdNextTaskInputSnapshot().requestInputText',
    owner: 'Task 04 immutable request inputs',
    textTarget: 'context/request_input_facts',
    note: 'Immutable attachment identities and controlled transport references are serialized here; attachment identities are additionally projected into task_metadata/attachments.',
  },
  {
    id: 'strategy_task_skill',
    classification: 'initial_bundle',
    producer: 'daemon_system_prompt',
    source: 'resolveOdNextStrategyRequestRecipeV2().taskSkill',
    owner: 'Task 02 Bundle head serializer',
    textTarget: 'session_skills/task_type_skill',
    note: 'Pinned Task Skill from the verified strategy package, distinct from user-selected @Skills.',
  },
  {
    id: 'strategy_task_type',
    classification: 'initial_bundle',
    producer: 'daemon_system_prompt',
    source: 'AppliedStrategyBindingV2.selectedTaskProfile / resolvedRecipe.taskType',
    owner: 'Task 02 core recipe; Task 04 canonical task configuration',
    textTarget: 'task_metadata/task_type',
    note: 'Selects the verified core recipe and is serialized as the canonical Task 04 task type.',
  },
  {
    id: 'strategy_runtime_capability_facts',
    classification: 'initial_bundle',
    producer: 'daemon_system_prompt',
    source: 'odNextStrategyRecipe.planningFacts and capabilitySnapshotHash',
    owner: 'Task 02 core recipe; Task 04 canonical task configuration',
    textTarget: 'context/runtime_facts',
    note: 'Runtime facts are per-task, so they are emitted as Bundle context instead of inside the cross-task-constant head; task_metadata carries only the stable allowlisted execution selection.',
  },
  {
    id: 'request_execution_configuration',
    classification: 'out_of_band',
    producer: 'request',
    source: 'sessionMode, locale, research, mediaExecution, titleGeneration and selected runtime profile',
    owner: 'Task 04 canonical task configuration',
    note: 'The allowlisted stable subset is serialized in task_metadata; research/title/context remain their separately owned Bundle contributors.',
  },
  {
    id: 'project_and_design_context',
    classification: 'initial_bundle',
    producer: 'daemon_system_prompt',
    source: 'metadata, template, design-system fields, craftBody/craftSections and memoryBody',
    owner: 'Task 02 context serializer',
    textTarget: 'context/stable_request_context',
    note: 'Stable project/design facts currently nested in composeDaemonSystemPrompt().',
  },
  {
    id: 'user_and_project_instructions',
    classification: 'initial_bundle',
    producer: 'daemon_system_prompt',
    source: 'userInstructions + projectInstructions',
    owner: 'Task 02 context serializer',
    textTarget: 'context/stable_request_context',
    note: 'Stable instruction facts currently nested in the daemon system aggregate.',
  },
  {
    id: 'run_context_selection',
    classification: 'initial_bundle',
    producer: 'request',
    source: 'ChatRequest.context -> renderRunContextPrompt()',
    owner: 'Task 02 context serializer',
    textTarget: 'context/run_context',
    note: 'Explicit user-selected context facts, separate from transcript history.',
  },
  {
    id: 'project_attachment_selection',
    classification: 'out_of_band',
    producer: 'request',
    source: 'ChatRequest.attachments -> createOdNextTaskInputSnapshot()',
    owner: 'Task 04 immutable attachment snapshot',
    note: 'Raw and canonical paths stay daemon-only; the Bundle receives logical reference, byte length, media type, digest and the OD_TASK_INPUT_DIR resolver contract.',
  },
  {
    id: 'comment_attachment_selection',
    classification: 'out_of_band',
    producer: 'request',
    source: 'ChatRequest.commentAttachments -> normalizeCommentAttachments()',
    owner: 'Task 04 immutable attachment snapshot',
    note: 'Raw comment bodies and screenshot paths remain excluded; the Bundle carries only the canonical comment count.',
  },
  {
    id: 'image_attachment_selection',
    classification: 'out_of_band',
    producer: 'request',
    source: 'ChatRequest.imagePaths -> createOdNextTaskInputSnapshot()',
    owner: 'Task 04 immutable attachment snapshot',
    note: 'Runtime-native resources use per-Run projection paths out of band; the Bundle carries only logical reference and immutable identity.',
  },
  {
    id: 'available_skills_catalogue',
    classification: 'excluded',
    source: 'not produced',
    owner: 'explicit product exclusion',
    note: 'No all-Skills catalogue is serialized or observed.',
  },
] as const satisfies readonly OdNextSemanticRequestFactEntry[];

export const OD_NEXT_AGENT_INPUT_OWNERSHIP_V1 = {
  version: OD_NEXT_EXACT_INPUT_MAP_VERSION,
  finalTextAndTransport: OD_NEXT_EXACT_INPUT_MAP_V1,
  semanticRequestFacts: OD_NEXT_SEMANTIC_REQUEST_FACT_MAP_V1,
} as const;

export const OD_NEXT_EXACT_TEXT_DELIVERY_PATHS_V1 = [
  {
    id: 'prompt_file',
    source: 'preparePromptFileForAgent(def, exactText, run.id)',
    invariant: 'file UTF-8 content equals exactText',
  },
  {
    id: 'runtime_args',
    source: 'RuntimeAgentDef.buildArgs(exactText, ...)',
    invariant: 'adapter receives exactText; argv/file choice is transport-only',
  },
  {
    id: 'plain_stdin',
    source: 'writePromptAndEndStdin(child.stdin, exactText)',
    invariant: 'stdin bytes are exactText UTF-8',
  },
  {
    id: 'stream_json_stdin',
    source: 'JSONL user.content[0].text = exactText',
    invariant: 'JSON encoding changes the wire wrapper only; decoded text equals exactText',
  },
  {
    id: 'pi_rpc',
    source: 'attachPiRpcSession({ prompt: exactText })',
    invariant: 'prompt field equals exactText',
  },
  {
    id: 'dsh_profile_jsonl',
    source: 'attachDshProfileSession({ prompt: exactText })',
    invariant: 'execute.prompt equals exactText',
  },
  {
    id: 'acp_json_rpc',
    source: 'attachAcpSession({ prompt: exactText })',
    invariant: 'prompt field equals exactText',
  },
] as const;

const ALLOWED_CLASSIFICATIONS = new Set<OdNextExactInputClassification>([
  'initial_bundle',
  'stage_turn',
  'transport_reference',
  'out_of_band',
  'excluded',
]);

const ALLOWED_BUNDLE_NODE_PATHS = new Set<string>(OD_NEXT_BUNDLE_NODE_PATHS_V2);

export function assertOdNextExactInputMapV1(
  entries: readonly OdNextExactInputEntry[] = OD_NEXT_EXACT_INPUT_MAP_V1,
): void {
  const ids = new Set<string>();
  const claimedNodePaths = new Map<string, string>();
  for (const entry of entries) {
    if (!entry.id || ids.has(entry.id)) {
      throw new Error(`OD Next exact-input map has a missing or duplicate id: ${entry.id || '<empty>'}`);
    }
    ids.add(entry.id);
    if (!ALLOWED_CLASSIFICATIONS.has(entry.classification)) {
      throw new Error(`OD Next exact-input map has an invalid classification for ${entry.id}`);
    }
    if (entry.classification === 'stage_turn' && !entry.stage) {
      throw new Error(`OD Next stage-turn input ${entry.id} is missing its stage`);
    }
    if (
      (entry.classification === 'initial_bundle' || entry.classification === 'transport_reference')
      && !entry.textTarget
    ) {
      throw new Error(`OD Next textual input ${entry.id} is missing its Bundle target`);
    }
    if (
      (entry.classification === 'out_of_band' || entry.classification === 'excluded')
      && entry.textTarget
    ) {
      throw new Error(`OD Next non-text input ${entry.id} must not declare a Bundle target`);
    }
    if (entry.textTarget) {
      if (!ALLOWED_BUNDLE_NODE_PATHS.has(entry.textTarget)) {
        throw new Error(`OD Next textual input ${entry.id} declares an unknown Bundle node path: ${entry.textTarget}`);
      }
      const owner = claimedNodePaths.get(entry.textTarget);
      if (owner) {
        throw new Error(
          `OD Next Bundle node path ${entry.textTarget} is claimed by both ${owner} and ${entry.id}`,
        );
      }
      claimedNodePaths.set(entry.textTarget, entry.id);
    }
  }

  const semanticIds = new Set<string>();
  for (const entry of OD_NEXT_SEMANTIC_REQUEST_FACT_MAP_V1 as readonly OdNextSemanticRequestFactEntry[]) {
    if (!entry.id || semanticIds.has(entry.id)) {
      throw new Error(`OD Next semantic request-fact map has a missing or duplicate id: ${entry.id || '<empty>'}`);
    }
    semanticIds.add(entry.id);
    if (entry.classification !== 'excluded' && !entry.producer) {
      throw new Error(`OD Next semantic request fact ${entry.id} is missing its production producer`);
    }
    if (entry.classification === 'excluded' && entry.producer) {
      throw new Error(`OD Next excluded semantic fact ${entry.id} must not declare a production producer`);
    }
    if (
      (entry.classification === 'initial_bundle' || entry.classification === 'transport_reference')
      && !entry.textTarget
    ) {
      throw new Error(`OD Next semantic text fact ${entry.id} is missing its Bundle target`);
    }
    if (
      (entry.classification === 'out_of_band' || entry.classification === 'excluded')
      && entry.textTarget
    ) {
      throw new Error(`OD Next semantic non-text fact ${entry.id} must not declare a Bundle target`);
    }
    if (entry.textTarget && !ALLOWED_BUNDLE_NODE_PATHS.has(entry.textTarget)) {
      throw new Error(`OD Next semantic text fact ${entry.id} declares an unknown Bundle node path: ${entry.textTarget}`);
    }
  }
}

export function assertOdNextSemanticRequestFactProducerCoverage(
  producer: 'daemon_system_prompt' | 'request',
  facts: Readonly<Record<string, unknown>>,
): void {
  assertOdNextExactInputMapV1();
  const expected = new Set<string>(
    (OD_NEXT_SEMANTIC_REQUEST_FACT_MAP_V1 as readonly OdNextSemanticRequestFactEntry[])
      .filter((entry) => entry.producer === producer)
      .map((entry) => entry.id),
  );
  const actual = new Set<string>();
  for (const id of Object.keys(facts)) {
    actual.add(id);
    if (!expected.has(id)) {
      throw new Error(`OD Next semantic request fact is not registered for ${producer}: ${id}`);
    }
  }
  const missing = [...expected].filter((id) => !actual.has(id));
  if (missing.length > 0) {
    throw new Error(
      `OD Next semantic request facts are missing from ${producer}: ${missing.join(', ')}`,
    );
  }
}

export function assertOdNextLegacyTextContributorCoverage(
  contributorIds: readonly string[],
  stage: OdNextExactInputStage | null = 'request',
): void {
  assertOdNextExactInputMapV1();
  const stageContributorId = stage === null || stage === 'request'
    ? 'request_text'
    : `${stage}_turn`;
  const expected = new Set<string>(
    stage === null || stage === 'request'
      ? OD_NEXT_LEGACY_TEXT_CONTRIBUTOR_IDS_V1
      : [stageContributorId],
  );
  const mapped = new Set<string>(OD_NEXT_EXACT_INPUT_MAP_V1.map((entry) => entry.id));
  const unmappedExpected = [...expected].filter((id) => !mapped.has(id));
  if (unmappedExpected.length > 0) {
    throw new Error(`OD Next exact-text contributors are absent from the ownership map: ${unmappedExpected.join(', ')}`);
  }
  const actual = new Set<string>();
  for (const id of contributorIds) {
    if (actual.has(id)) {
      throw new Error(`OD Next exact-text contributor is duplicated: ${id}`);
    }
    actual.add(id);
    if (!expected.has(id)) {
      throw new Error(`OD Next exact-text contributor is not registered: ${id}`);
    }
  }
  const missing = [...expected].filter((id) => !actual.has(id));
  if (missing.length > 0) {
    throw new Error(`OD Next exact-text contributors are missing: ${missing.join(', ')}`);
  }
}

export function assertOdNextBundleTextContributorCoverage(
  contributorIds: readonly string[],
): void {
  assertOdNextExactInputMapV1();
  const expected = new Set<string>(OD_NEXT_BUNDLE_TEXT_CONTRIBUTOR_IDS_V2);
  const mapped = new Set<string>(OD_NEXT_EXACT_INPUT_MAP_V1.map((entry) => entry.id));
  const unmappedExpected = [...expected].filter((id) => !mapped.has(id));
  if (unmappedExpected.length > 0) {
    throw new Error(
      `OD Next Bundle contributors are absent from the ownership map: ${unmappedExpected.join(', ')}`,
    );
  }
  const actual = new Set<string>();
  for (const id of contributorIds) {
    if (actual.has(id)) {
      throw new Error(`OD Next Bundle contributor is duplicated: ${id}`);
    }
    actual.add(id);
    if (!expected.has(id)) {
      throw new Error(`OD Next Bundle contributor is not registered: ${id}`);
    }
  }
  const missing = [...expected].filter((id) => !actual.has(id));
  if (missing.length > 0) {
    throw new Error(`OD Next Bundle contributors are missing: ${missing.join(', ')}`);
  }
}

/**
 * Fail-closed boundary witness for the canonical first textual payload: the
 * exact text must be one canonical `open_design_prompt_bundle` v2 tree and
 * nothing else. Delegating to the contract's parser means the witness also
 * rejects a payload that parses but is not in canonical form, so leading or
 * trailing bytes, a second root, and a drifting serializer all fail here.
 */
export function assertSingleOdNextPromptBundleRoot(exactText: string): void {
  try {
    parseOdNextPromptBundleV2(exactText);
  } catch (error) {
    throw new Error(
      'OD Next initial exact text must be one canonical open_design_prompt_bundle root with no outer bytes',
      { cause: error },
    );
  }
}
