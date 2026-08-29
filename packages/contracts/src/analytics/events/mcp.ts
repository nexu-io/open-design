import type {
  AnalyticsAttributionQuality,
  AnalyticsDistributionMechanism,
  AnalyticsHostProduct,
  AnalyticsPublisherClass,
} from '../public-params.js';

export type McpToolResult = 'success' | 'failed' | 'cancelled' | 'blocked';
export type McpDeliveryKind =
  | 'preview_studio_reference'
  | 'artifact_context_bundle';
export type McpDeliveryResult = 'complete' | 'partial' | 'failed';
export type McpPollState = 'non_terminal' | 'terminal';
export type McpCorrelationStatus =
  | 'matched'
  | 'missing_workflow'
  | 'project_mismatch'
  | 'run_mismatch'
  | 'unknown';
export type McpFailureStage =
  | 'brief'
  | 'auth'
  | 'project'
  | 'bootstrap'
  | 'mcp_initialize'
  | 'run_accept'
  | 'runtime_preflight'
  | 'generation'
  | 'recharge_wait'
  | 'artifact_validation'
  | 'delivery'
  | 'finalize';
export type McpFailureSource =
  | 'codex_host'
  | 'local_mcp'
  | 'open_design_daemon'
  | 'runtime_cli'
  | 'vela_api'
  | 'model_provider'
  | 'artifact_store'
  | 'preview_delivery'
  | 'unknown';
export type McpFailureCategory =
  | 'invalid_request'
  | 'availability'
  | 'invalid_output'
  | 'auth'
  | 'upstream'
  | 'unknown';

export interface McpSourceProps {
  mcp_session_id: string;
  host_product: AnalyticsHostProduct;
  external_plugin_id?: string;
  external_plugin_version?: string;
  distribution_mechanism?: AnalyticsDistributionMechanism;
  publisher_class?: AnalyticsPublisherClass;
  attribution_quality?: AnalyticsAttributionQuality;
  plugin_workflow_id?: string;
}

export type McpSessionInitializedProps = McpSourceProps;

export interface McpToolStartedProps extends McpSourceProps {
  tool_name: string;
  tool_attempt_id: string;
  attempt_number: number;
  run_id?: string;
  logical_request_digest?: string;
  logical_request_digest_version?: number;
}

export interface McpToolFinishedProps extends McpToolStartedProps {
  result: McpToolResult;
  duration_ms: number;
  error_code?: string;
  failure_stage?: McpFailureStage;
  failure_source?: McpFailureSource;
  failure_category?: McpFailureCategory;
  retryable?: boolean;
  user_action?: string;
  delivery_kind?: McpDeliveryKind;
  delivery_result?: McpDeliveryResult;
  deliverable_validation?: 'valid' | 'invalid';
  poll_state?: McpPollState;
  poll_attempt_count?: number;
  correlation_status?: McpCorrelationStatus;
  project_id?: string;
  artifact_type?: string;
  skipped_file_count?: number;
  truncated?: boolean;
}
