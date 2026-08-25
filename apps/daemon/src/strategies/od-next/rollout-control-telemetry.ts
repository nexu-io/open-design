import type Database from 'better-sqlite3';
import type { OdNextRolloutStopReasonCode } from '@open-design/contracts';

import {
  newInsertId,
  type AnalyticsContext,
  type AnalyticsService,
} from '../../analytics.js';
import {
  latchOdNextRolloutStop,
  readOdNextRolloutControlStatus,
} from './rollout.js';

/** Persist one instance latch and emit only bounded operational dimensions. */
export function latchOdNextRolloutStopOperationally(input: {
  db: Database.Database;
  analytics: AnalyticsService;
  analyticsContext: AnalyticsContext | null | undefined;
  appVersion: string;
  mode: 'off' | 'observe';
  reasonCode: OdNextRolloutStopReasonCode;
}): void {
  latchOdNextRolloutStop(input.db, {
    mode: input.mode,
    reasonCode: input.reasonCode,
  });
  if (!input.analyticsContext) return;
  const status = readOdNextRolloutControlStatus(input.db);
  void input.analytics.capture({
    eventName: 'strategy_rollout_control_changed',
    context: input.analyticsContext,
    appVersion: input.appVersion,
    insertId: newInsertId(),
    properties: {
      strategy_id: status.strategyId,
      action: 'latch',
      scope: status.scope,
      requested_latch_mode: input.mode,
      effective_latch_mode: status.latch?.mode ?? 'none',
      reason_code: status.latch?.reasonCode ?? input.reasonCode,
      effective_mode: status.effectiveMode,
    },
  });
}
