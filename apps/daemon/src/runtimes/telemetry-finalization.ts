import type { AnalyticsContext, AnalyticsService } from '../analytics.js';
import type { LangfuseDeliveryState } from '../langfuse-trace.js';
import { runResultFromStatus } from '../run-result.js';
import { shouldReportRunCompletedFromMessage } from './telemetry-message.js';
import { agentIdToTracking, modelIdForTracking } from '@open-design/contracts/analytics';

export interface FinalizedMessageRecord {
  conversationId?: string | null | undefined;
  runId?: string | null | undefined;
  runStatus?: string | null | undefined;
  endedAt?: number | null | undefined;
}

export interface FinalizedMessageRun {
  id: string;
  projectId?: string | null | undefined;
  conversationId?: string | null | undefined;
  agentId?: string | null | undefined;
  model?: string | null | undefined;
  errorCode?: string | null | undefined;
  status?: string;
  analyticsContext?: AnalyticsContext | null | undefined;
}

export interface FinalizedMessageRunStore {
  get(runId: string): FinalizedMessageRun | null | undefined;
}

export interface FinalizedMessageReportInput {
  db: unknown;
  dataDir: string;
  run: FinalizedMessageRun;
  persistedRunStatus?: string | undefined;
  persistedEndedAt?: number | null | undefined;
  appVersion?: unknown | undefined;
}

export interface FinalizedMessageReportOptions {
  analyticsContext?: AnalyticsContext | null | undefined;
  projectId?: string | null | undefined;
  conversationId?: string | null | undefined;
  reportTrigger?: 'final_message' | 'terminal_fallback' | undefined;
}

export interface FinalizedMessageTelemetryDependencies {
  runs: FinalizedMessageRunStore;
  analytics?: Pick<AnalyticsService, 'capture'>;
  getAppVersion?: (() => unknown) | undefined;
  report: (input: FinalizedMessageReportInput) => Promise<LangfuseDeliveryState> | LangfuseDeliveryState | undefined;
}

interface ReportCaptureInput {
  analyticsContext?: AnalyticsContext | null | undefined;
  conversationId?: string | null | undefined;
  delivery: LangfuseDeliveryState;
  durationMs?: number | undefined;
  projectId?: string | null | undefined;
  reportResult: 'accepted' | 'failed' | 'skipped';
  reportTrigger?: 'final_message' | 'terminal_fallback' | undefined;
  run?: FinalizedMessageRun | undefined;
  runId: string;
  skipReason?: string | undefined;
  status?: string | null | undefined;
}

export function createFinalizedMessageTelemetryReporter(
  dependencies: FinalizedMessageTelemetryDependencies,
  reportedRuns: Set<string>,
  db: unknown,
  dataDir: string,
) {
  const appVersionForCapture = () => {
    const appVersion = dependencies.getAppVersion?.();
    if (typeof appVersion === 'string') return appVersion;
    if (appVersion && typeof appVersion === 'object' && 'version' in appVersion && typeof appVersion.version === 'string') {
      return appVersion.version;
    }
    return 'unknown';
  };

  const captureResult = ({
    analyticsContext,
    conversationId,
    delivery,
    durationMs,
    projectId,
    reportResult,
    reportTrigger = 'final_message',
    run,
    runId,
    skipReason,
    status,
  }: ReportCaptureInput) => {
    const context = analyticsContext ?? run?.analyticsContext ?? null;
    if (!context || !dependencies.analytics?.capture || !runId || !delivery) return;
    const terminalResult = status ? runResultFromStatus(status) : undefined;
    dependencies.analytics.capture({
      eventName: 'langfuse_report_result',
      context,
      appVersion: appVersionForCapture(),
      properties: {
        page_name: 'chat_panel',
        area: 'chat_panel',
        project_id: run?.projectId ?? projectId ?? null,
        conversation_id: run?.conversationId ?? conversationId ?? null,
        run_id: runId,
        langfuse_trace_id: runId,
        langfuse_expected: delivery.langfuse_expected,
        langfuse_delivery_status: delivery.langfuse_delivery_status,
        ...(delivery.langfuse_drop_reason ? { langfuse_drop_reason: delivery.langfuse_drop_reason } : {}),
        langfuse_report_result: reportResult,
        langfuse_report_trigger: reportTrigger,
        ...(skipReason ? { langfuse_report_skip_reason: skipReason } : {}),
        ...(durationMs !== undefined ? { report_duration_ms: durationMs } : {}),
        ...(terminalResult ? { result: terminalResult } : {}),
        ...(run?.errorCode ? { error_code: run.errorCode } : {}),
        ...(run?.agentId ? { agent_provider_id: agentIdToTracking(run.agentId) } : {}),
        ...(run?.model !== undefined ? { model_id: modelIdForTracking(run.model) } : {}),
      },
      insertId: `${runId}-langfuse-report-${reportTrigger}-${reportResult}${skipReason ? `-${skipReason}` : ''}`,
    });
  };

  return (saved: FinalizedMessageRecord, body: Record<string, unknown> = {}, options: FinalizedMessageReportOptions = {}) => {
    if (!shouldReportRunCompletedFromMessage({
      runId: saved.runId ?? null,
      runStatus: saved.runStatus ?? null,
    }, body) || !saved.runId) return;
    const runId = saved.runId;
    const run = dependencies.runs.get(runId);
    if (!run) {
      captureResult({
        analyticsContext: options.analyticsContext,
        conversationId: options.conversationId ?? saved.conversationId,
        delivery: { langfuse_expected: true, langfuse_delivery_status: 'failed', langfuse_drop_reason: 'network_error' },
        projectId: options.projectId,
        reportTrigger: options.reportTrigger,
        reportResult: 'skipped',
        runId,
        skipReason: 'run_not_found',
        status: saved.runStatus,
      });
      return;
    }

    const reportTrigger = options.reportTrigger ?? 'final_message';
    if (reportedRuns.has(run.id)) {
      captureResult({
        analyticsContext: options.analyticsContext,
        conversationId: options.conversationId ?? saved.conversationId,
        delivery: { langfuse_expected: true, langfuse_delivery_status: 'failed', langfuse_drop_reason: 'network_error' },
        projectId: options.projectId,
        reportTrigger: options.reportTrigger,
        reportResult: 'skipped',
        run,
        runId: run.id,
        skipReason: 'duplicate_run',
        status: saved.runStatus,
      });
      return;
    }
    if (reportTrigger !== 'terminal_fallback') reportedRuns.add(run.id);

    void (async () => {
      const start = Date.now();
      const delivery = await dependencies.report({
        db,
        dataDir,
        run,
        persistedRunStatus: saved.runStatus ?? undefined,
        persistedEndedAt: saved.endedAt,
        appVersion: dependencies.getAppVersion?.(),
      });
      const state = delivery ?? { langfuse_expected: true, langfuse_delivery_status: 'accepted' as const };
      captureResult({
        analyticsContext: options.analyticsContext,
        conversationId: options.conversationId ?? saved.conversationId,
        delivery: state,
        durationMs: Date.now() - start,
        projectId: options.projectId,
        reportTrigger,
        reportResult: state.langfuse_expected === false
          ? 'skipped'
          : state.langfuse_delivery_status === 'accepted'
            ? 'accepted'
            : state.langfuse_delivery_status === 'failed'
              ? 'failed'
              : 'skipped',
        run,
        runId: run.id,
        skipReason: state.langfuse_expected === false ? 'not_expected' : undefined,
        status: saved.runStatus,
      });
    })();
  };
}
