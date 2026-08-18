import type {
  RunActivityProps,
  RunAutomaticRetryProps,
  RunCapabilitiesProps,
  RunContextProps,
  RunCreatedProps,
  RunDesignSystemProps,
  RunDiagnosticsProps,
  RunFinishedProps,
  RunLangfuseDeliveryProps,
  RunTaskLineageProps,
  RunTimingProps,
  RunTokenProps,
  TrackingInputAccountingMode,
} from './events/result-events.js';

type JsonRecord = Record<string, unknown>;

export interface RunCreatedV4Aliases extends RunTaskLineageProps {
  entry_source?: RunCreatedProps['entry_source'];
  interaction_mode?: RunCreatedProps['interaction_mode'];
  has_attachments: boolean;
  run_context?: RunContextProps;
  capabilities?: RunCapabilitiesProps;
  tokens: RunTokenProps;
  design_system?: RunDesignSystemProps;
}

export interface RunFinishedV4Overrides {
  inputAccountingMode?: TrackingInputAccountingMode;
  firstModelCall?: RunTokenProps['first_model_call'];
  primaryArtifactChange?: RunFinishedProps['primary_artifact_change'];
  artifactFiles?: NonNullable<RunActivityProps['artifacts']>;
  designSystemChangeType?: NonNullable<RunDesignSystemProps['change_type']>;
}

export interface RunFinishedV4Aliases extends RunCreatedV4Aliases {
  failure_reason?: RunFinishedProps['failure_reason'];
  is_automatic_retry_eligible?: boolean;
  clarification_requested: boolean;
  primary_artifact_change?: RunFinishedProps['primary_artifact_change'];
  timing: RunTimingProps;
  automatic_retry?: RunAutomaticRetryProps;
  run_activity?: RunActivityProps;
  diagnostics?: RunDiagnosticsProps;
  langfuse_delivery?: RunLangfuseDeliveryProps;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function booleanValue(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function stringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter((item): item is string => typeof item === 'string' && item.length > 0);
}

function compact<T extends JsonRecord>(value: T): Partial<T> | undefined {
  const entries = Object.entries(value).filter(([, item]) => item !== undefined);
  return entries.length > 0 ? Object.fromEntries(entries) as Partial<T> : undefined;
}

function capabilitiesFromLegacy(legacy: JsonRecord): RunCapabilitiesProps | undefined {
  const skillIds = stringArray(legacy.skill_ids)
    ?? (stringValue(legacy.skill_id) ? [stringValue(legacy.skill_id)!] : []);
  const mcpServerIds = stringArray(legacy.mcp_ids)
    ?? (stringValue(legacy.mcp_id) ? [stringValue(legacy.mcp_id)!] : []);
  const pluginId = stringValue(legacy.plugin_id);
  return {
    ...(pluginId ? { plugin_id: pluginId } : {}),
    skill_ids: skillIds,
    mcp_server_ids: mcpServerIds,
  };
}

function runContextFromLegacy(legacy: JsonRecord): RunContextProps | undefined {
  return compact({
    session_run_index: numberValue(legacy.turn_index),
    project_run_index: numberValue(legacy.project_turn_index),
    has_existing_artifacts: booleanValue(legacy.has_existing_artifact),
    is_followup_run: booleanValue(legacy.is_followup_turn),
  }) as RunContextProps | undefined;
}

function designSystemFromLegacy(legacy: JsonRecord): RunDesignSystemProps | undefined {
  const selectionSource = stringValue(legacy.design_system_selection_source)
    ?? stringValue(legacy.design_system_source);
  if (!stringValue(legacy.design_system_id) && selectionSource === 'not_applicable') {
    return undefined;
  }
  return compact({
    selection_source: selectionSource,
    edit_surface: stringValue(legacy.edit_surface),
    origin: stringValue(legacy.ds_source_origin),
    input_source_count: numberValue(legacy.source_count),
    has_brand_description: booleanValue(legacy.has_brand_description),
    brand_description_length_bucket: stringValue(legacy.brand_description_length_bucket),
    github_repo_count: numberValue(legacy.github_repo_count),
    local_folder_count: numberValue(legacy.local_folder_count),
    fig_file_count: numberValue(legacy.fig_file_count),
    asset_file_count: numberValue(legacy.asset_file_count),
  }) as RunDesignSystemProps | undefined;
}

function tokensFromLegacy(
  legacy: JsonRecord,
  overrides: RunFinishedV4Overrides = {},
): RunTokenProps {
  const userQuery = numberValue(legacy.user_query_tokens);
  const providerInput = numberValue(legacy.input_tokens_provider);
  const effectiveInput = numberValue(legacy.input_tokens_effective);
  const output = numberValue(legacy.output_tokens);
  const cacheRead = numberValue(legacy.cache_read_input_tokens);
  const cacheWrite = numberValue(legacy.cache_creation_input_tokens);
  const total = numberValue(legacy.total_tokens);
  const cacheSource = stringValue(legacy.cache_token_source) as RunTokenProps['cache_token_source'];
  const firstModelCall = overrides.firstModelCall ?? compact({
    provider_input_tokens: numberValue(legacy.first_call_input_tokens),
    cache_read_tokens: numberValue(legacy.first_call_cache_read_input_tokens),
  }) as RunTokenProps['first_model_call'];

  return {
    usage_count_source:
      (stringValue(legacy.token_count_source) as RunTokenProps['usage_count_source']) ?? 'unknown',
    ...(cacheSource ? { cache_token_source: cacheSource } : {}),
    ...(overrides.inputAccountingMode
      ? { input_accounting_mode: overrides.inputAccountingMode }
      : {}),
    ...(userQuery !== undefined
      ? { user_query_tokens: userQuery }
      : {}),
    ...(providerInput !== undefined ? { provider_input_tokens: providerInput } : {}),
    ...(effectiveInput !== undefined ? { effective_input_tokens: effectiveInput } : {}),
    ...(output !== undefined ? { output_tokens: output } : {}),
    ...(providerInput === undefined || output === undefined
      ? total !== undefined ? { total_tokens: total } : {}
      : {}),
    ...(cacheRead !== undefined ? { cache_read_tokens: cacheRead } : {}),
    ...(cacheWrite !== undefined ? { cache_write_tokens: cacheWrite } : {}),
    ...(firstModelCall ? { first_model_call: firstModelCall } : {}),
  };
}

export function buildRunCreatedV4Aliases(
  legacy: JsonRecord,
  lineage: RunTaskLineageProps,
): RunCreatedV4Aliases {
  const runContext = runContextFromLegacy(legacy);
  const capabilities = capabilitiesFromLegacy(legacy);
  const designSystem = designSystemFromLegacy(legacy);
  return {
    ...lineage,
    ...(stringValue(legacy.entry_from)
      ? { entry_source: stringValue(legacy.entry_from) as RunCreatedProps['entry_source'] }
      : {}),
    ...(stringValue(legacy.session_mode)
      ? { interaction_mode: stringValue(legacy.session_mode) as RunCreatedProps['interaction_mode'] }
      : {}),
    has_attachments: legacy.has_attachment === true,
    ...(runContext ? { run_context: runContext } : {}),
    ...(capabilities ? { capabilities } : {}),
    tokens: tokensFromLegacy(legacy),
    ...(designSystem ? { design_system: designSystem } : {}),
  };
}

function timingFromLegacy(legacy: JsonRecord): RunTimingProps {
  const queueDuration = numberValue(legacy.queue_duration_ms);
  const processSpawnDuration = numberValue(legacy.process_spawn_duration_ms);
  const firstModelEventDuration = numberValue(legacy.time_to_first_model_event_ms);
  const firstTokenDuration = numberValue(legacy.time_to_first_token_ms);
  const firstVisibleOutputDuration = numberValue(legacy.time_to_first_visible_output_ms);
  const firstArtifactDuration = numberValue(legacy.time_to_first_artifact_ms);
  const generationDuration = numberValue(legacy.generation_duration_ms);
  const finalizeDuration = numberValue(legacy.finalize_duration_ms);
  const firstModelEventType = stringValue(legacy.first_model_event_type);
  const collectionStatus = stringValue(legacy.phase_timing_status);
  return {
    total_duration_ms: numberValue(legacy.total_duration_ms) ?? 0,
    ...(queueDuration !== undefined
      ? { queue_duration_ms: queueDuration }
      : {}),
    ...(processSpawnDuration !== undefined
      ? { process_spawn_duration_ms: processSpawnDuration }
      : {}),
    ...(firstModelEventDuration !== undefined
      ? { time_to_first_model_event_ms: firstModelEventDuration }
      : {}),
    ...(firstModelEventType
      ? { first_model_event_type: firstModelEventType as NonNullable<RunTimingProps['first_model_event_type']> }
      : {}),
    ...(firstTokenDuration !== undefined
      ? { time_to_first_token_ms: firstTokenDuration }
      : {}),
    ...(firstVisibleOutputDuration !== undefined
      ? { time_to_first_visible_output_ms: firstVisibleOutputDuration }
      : {}),
    ...(firstArtifactDuration !== undefined
      ? { time_to_first_artifact_ms: firstArtifactDuration }
      : {}),
    ...(generationDuration !== undefined
      ? { generation_duration_ms: generationDuration }
      : {}),
    ...(finalizeDuration !== undefined
      ? { finalize_duration_ms: finalizeDuration }
      : {}),
    ...(collectionStatus
      ? { collection_status: collectionStatus as NonNullable<RunTimingProps['collection_status']> }
      : {}),
  };
}

function automaticRetryFromLegacy(legacy: JsonRecord): RunAutomaticRetryProps | undefined {
  const retryCount = numberValue(legacy.retry_attempt_count);
  const outcome = stringValue(legacy.retry_final_result) as RunAutomaticRetryProps['outcome'];
  if (retryCount === undefined && !outcome) return undefined;
  const attemptIndex = numberValue(legacy.attempt_index);
  const attemptDuration = numberValue(legacy.attempt_duration_ms);
  const attemptFirstToken = numberValue(legacy.attempt_time_to_first_token_ms);
  const lastAttempt = attemptIndex !== undefined
    || attemptDuration !== undefined
    || attemptFirstToken !== undefined
    ? {
        ...(attemptIndex !== undefined ? { index: attemptIndex } : {}),
        ...(attemptDuration !== undefined ? { duration_ms: attemptDuration } : {}),
        ...(attemptFirstToken !== undefined
          ? { time_to_first_token_ms: attemptFirstToken }
          : {}),
      }
    : undefined;
  const suppressedReason = stringValue(legacy.retry_suppressed_reason);
  return {
    retry_count: retryCount ?? 0,
    outcome: outcome ?? 'not_attempted',
    ...(suppressedReason
      ? { suppressed_reason: suppressedReason as NonNullable<RunAutomaticRetryProps['suppressed_reason']> }
      : {}),
    ...(lastAttempt ? { last_attempt: lastAttempt } : {}),
  };
}

function runActivityFromLegacy(
  legacy: JsonRecord,
  artifactFiles?: NonNullable<RunActivityProps['artifacts']>,
): RunActivityProps | undefined {
  const tools = compact({
    call_count: numberValue(legacy.tool_call_count),
    duration_ms: numberValue(legacy.tool_duration_ms),
  });
  const legacyArtifacts = compact({
    changed_file_count: numberValue(legacy.artifact_count),
    created_file_count: numberValue(legacy.artifacts_created),
    modified_file_count: numberValue(legacy.artifacts_modified),
    write_duration_ms: numberValue(legacy.artifact_write_duration_ms),
    write_status: stringValue(legacy.artifact_write_status),
    write_source: stringValue(legacy.artifact_write_source),
  });
  const artifacts = artifactFiles
    ? { ...(legacyArtifacts ?? {}), ...artifactFiles }
    : legacyArtifacts;
  if (!tools && !artifacts) return undefined;
  return {
    ...(tools ? { tools } : {}),
    ...(artifacts ? { artifacts } : {}),
  } as RunActivityProps;
}

function diagnosticsFromLegacy(legacy: JsonRecord): RunDiagnosticsProps | undefined {
  if (legacy.result === 'success') return undefined;
  const runtimeTiming = compact({
    pre_spawn_duration_ms: numberValue(legacy.pre_spawn_duration_ms),
    prompt_build_duration_ms: numberValue(legacy.prompt_build_duration_ms),
    launch_preflight_duration_ms: numberValue(legacy.launch_preflight_duration_ms),
    stdin_write_duration_ms: numberValue(legacy.stdin_write_duration_ms),
    runtime_init_to_first_token_ms: numberValue(legacy.runtime_init_to_first_token_ms),
    spawn_to_first_token_ms: numberValue(legacy.spawn_to_first_token_ms),
    cli_ready_ms: numberValue(legacy.cli_ready_ms),
    session_init_ms: numberValue(legacy.session_init_ms),
    model_first_token_ms: numberValue(legacy.model_first_token_ms),
  });
  return compact({
    failure_signal_source: stringValue(legacy.diagnostic_source),
    run_close_reason: stringValue(legacy.rpc_close_reason),
    last_observed_phase: stringValue(legacy.last_observed_phase),
    stderr_line_count_bucket: stringValue(legacy.stderr_line_count_bucket),
    stdout_line_count_bucket: stringValue(legacy.stdout_line_count_bucket),
    first_token_seen: booleanValue(legacy.first_token_seen),
    user_visible_output_seen: booleanValue(legacy.user_visible_output_seen),
    tool_call_seen: booleanValue(legacy.tool_call_seen),
    artifact_write_seen: booleanValue(legacy.artifact_write_seen),
    live_artifact_seen: booleanValue(legacy.live_artifact_seen),
    session_resume_fallback_used: booleanValue(legacy.resume_auto_reseeded),
    runtime_timing: runtimeTiming,
  }) as RunDiagnosticsProps | undefined;
}

function langfuseDeliveryFromLegacy(legacy: JsonRecord): RunLangfuseDeliveryProps | undefined {
  const status = stringValue(legacy.langfuse_delivery_status) as RunLangfuseDeliveryProps['delivery_status'];
  if (!status) return undefined;
  const dropReason = stringValue(legacy.langfuse_drop_reason);
  return {
    delivery_status: status,
    ...(dropReason
      ? { drop_reason: dropReason as NonNullable<RunLangfuseDeliveryProps['drop_reason']> }
      : {}),
  };
}

export function buildRunFinishedV4Aliases(
  legacy: JsonRecord,
  lineage: RunTaskLineageProps,
  overrides: RunFinishedV4Overrides = {},
): RunFinishedV4Aliases {
  const created = buildRunCreatedV4Aliases(legacy, lineage);
  const previewModuleCount = numberValue(legacy.preview_module_count);
  const missingFontCount = numberValue(legacy.missing_font_count);
  const designSystem = created.design_system
    ? {
        ...created.design_system,
        ...(overrides.designSystemChangeType
          ? { change_type: overrides.designSystemChangeType }
          : {}),
        ...(previewModuleCount !== undefined
          ? { preview_module_count: previewModuleCount }
          : {}),
        ...(missingFontCount !== undefined
          ? { missing_font_count: missingFontCount }
          : {}),
      }
    : undefined;
  const failureReason = stringValue(legacy.failure_detail);
  const retryEligible = booleanValue(legacy.retryable);
  const automaticRetry = automaticRetryFromLegacy(legacy);
  const runActivity = runActivityFromLegacy(legacy, overrides.artifactFiles);
  const diagnostics = diagnosticsFromLegacy(legacy);
  const langfuseDelivery = langfuseDeliveryFromLegacy(legacy);
  return {
    ...created,
    tokens: tokensFromLegacy(legacy, overrides),
    ...(designSystem ? { design_system: designSystem } : {}),
    ...(failureReason
      ? { failure_reason: failureReason as RunFinishedProps['failure_reason'] }
      : {}),
    ...(retryEligible !== undefined
      ? { is_automatic_retry_eligible: retryEligible }
      : {}),
    clarification_requested: legacy.asked_user_question === true,
    ...(overrides.primaryArtifactChange
      ? { primary_artifact_change: overrides.primaryArtifactChange }
      : {}),
    timing: timingFromLegacy(legacy),
    ...(automaticRetry
      ? { automatic_retry: automaticRetry }
      : {}),
    ...(runActivity
      ? { run_activity: runActivity }
      : {}),
    ...(diagnostics
      ? { diagnostics }
      : {}),
    ...(langfuseDelivery
      ? { langfuse_delivery: langfuseDelivery }
      : {}),
  };
}
