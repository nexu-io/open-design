/** Content-free stock-photo telemetry, independent of paid media generation. */
export const MEDIA_STOCK_BATCH_LIMITS = { events: 240, bytes: 512 * 1024 } as const;
export type MediaStockProvider = string;
export type MediaStockError = 'none' | 'rate_limit_429' | 'http_error' | 'timeout' | 'network_error' | 'invalid_response' | 'write_error' | 'unknown';
export interface MediaStockCommonProps {
  call_id: string;
  slot_index: number;
  run_id: string | null;
  project_id: string | null;
  node_id: string | null;
  evaluation_run_id: string | null;
  case_id: string | null;
  source_commit: string | null;
  execution_source: 'product' | 'evaluation' | 'standalone' | 'validation';
  collection_status: 'complete' | 'partial';
  stock_schema_version: 1;
}
export interface MediaStockRequestResultProps extends MediaStockCommonProps {
  provider: MediaStockProvider;
  stage: 'search' | 'download';
  result: 'ok' | 'not_found' | 'error';
  http_status: number | null;
  error_type: MediaStockError;
  duration_ms: number;
  credential_ref: string | null;
  rate_limited: boolean;
  quota_limit: number | null;
  quota_remaining: number | null;
  quota_reset_unix: number | null;
  retry_after: string | null;
}
export interface MediaStockSlotResultProps extends MediaStockCommonProps {
  provider: MediaStockProvider | null;
  result: 'ok' | 'not_found' | 'error' | 'budget_exceeded';
  /** Legacy compatibility counter; use primary_provider/attempted_providers for routing. */
  pexels_attempted: boolean;
  primary_provider?: MediaStockProvider | null;
  attempted_providers?: MediaStockProvider[];
  fallback_attempted: boolean;
  fallback_reason: MediaStockError | 'not_found' | 'none';
  fallback_succeeded: boolean;
  duration_ms: number;
}
export type MediaStockTelemetryEvent = {
  id: string;
  timestamp: string;
} & (
  | { event: 'media_stock_request_result'; properties: MediaStockRequestResultProps }
  | { event: 'media_stock_slot_result'; properties: MediaStockSlotResultProps }
);
