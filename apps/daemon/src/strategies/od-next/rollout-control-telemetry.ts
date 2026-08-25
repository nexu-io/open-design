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
  type OdNextRolloutAppConfig,
} from './rollout.js';

/** Persist one instance latch and emit only bounded operational dimensions. */
export function latchOdNextRolloutStopOperationally(input: {
  db: Database.Database;
  analytics: AnalyticsService;
  analyticsContext: AnalyticsContext | null | undefined;
  appVersion: string;
  mode: 'off' | 'observe';
  reasonCode: OdNextRolloutStopReasonCode;
  /**
   * Reads the installation's saved OD Next preference, so the reported
   * `effective_mode` matches the mode the run actually took rather than the
   * unconfigured default.
   *
   * A thunk rather than a value because the latch below must not depend on it:
   * this is the safety stop, and it lands whether or not the daemon can read
   * its config.
   */
  readAppConfig?: () => OdNextRolloutAppConfig | null | undefined;
}): void {
  latchOdNextRolloutStop(input.db, {
    mode: input.mode,
    reasonCode: input.reasonCode,
  });
  if (!input.analyticsContext) return;
  let appConfig: OdNextRolloutAppConfig | null | undefined;
  try {
    appConfig = input.readAppConfig?.();
  } catch (error) {
    // Reporting `off` here would be a claim about the installation, not about
    // this daemon's disk. Say nothing rather than something false; the latch
    // itself already happened.
    console.warn(
      '[od-next-rollout] skipped the control-change event: the app config could not be read',
      error,
    );
    return;
  }
  const status = readOdNextRolloutControlStatus(input.db, process.env, appConfig);
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
