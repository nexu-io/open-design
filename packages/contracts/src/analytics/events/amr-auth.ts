import type { TrackingAmrEntrySource } from './shared-enums.js';
import type { TrackingPageName } from './event-names.js';

export type AmrAuthStage =
  | 'attempt_started'
  | 'spawn_result'
  | 'device_auth_create_result'
  | 'activation_ready'
  | 'browser_open_result';

export type AmrAuthStageResult =
  | 'started'
  | 'success'
  | 'failed';

export type AmrAuthErrorKind =
  | 'network_error'
  | 'browser_open_error'
  | 'internal_error'
  | 'unknown';

export type AmrAuthNetworkPath = 'direct' | 'proxy';
export type AmrAuthStageSource = 'web' | 'daemon';

/** One sanitized lifecycle transition for an AMR device-auth attempt. */
export interface AmrAuthStageProps {
  page_name: TrackingPageName;
  area: 'amr_auth';
  auth_attempt_id: string;
  stage: AmrAuthStage;
  stage_result: AmrAuthStageResult;
  stage_source: AmrAuthStageSource;
  duration_ms: number;
  network_path: AmrAuthNetworkPath;
  fallback_used: boolean;
  error_kind?: AmrAuthErrorKind;
  entry_id?: string;
  source_detail?: TrackingAmrEntrySource;
}
