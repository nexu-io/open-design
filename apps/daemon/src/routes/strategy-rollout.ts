import type { Express, RequestHandler } from 'express';
import type { OdNextRolloutControlResponse } from '@open-design/contracts';

import {
  readOdNextRolloutControlStatus,
  type OdNextRolloutAppConfig,
} from '../strategies/od-next/rollout.js';

/**
 * Report which authority decides OD Next for this daemon.
 *
 * Read-only, and there is nothing here to write. This route used to expose a
 * reset for the stop latch — an automatic, daemon-wide disable a run could
 * raise, which then outranked the saved mode and survived restart. The latch is
 * gone, so the only thing that turns OD Next off for an installation is that
 * installation saving `off`, and `PUT /api/app-config` already owns that.
 *
 * Status stays because the mode alone does not say who chose it. The Labs
 * switch needs `requestedModeSource` to know whether the environment has taken
 * the decision away from the user, and an operator needs it to tell a daemon
 * that is on OD Next because nobody touched it from one that is off it because
 * somebody asked.
 */
export function registerStrategyRolloutRoutes(app: Express, deps: {
  requireLocalDaemonRequest: RequestHandler;
  /**
   * The installation's saved OD Next preference. Injected rather than read
   * here so this route never resolves a daemon data path of its own, and so
   * status reflects a preference the user changed since the daemon started.
   */
  readOdNextPreference: () => Promise<OdNextRolloutAppConfig>;
}): void {
  app.get(
    '/api/strategies/od-next/rollout',
    deps.requireLocalDaemonRequest,
    async (_req, res) => {
      const body: OdNextRolloutControlResponse = {
        status: readOdNextRolloutControlStatus(
          process.env,
          await deps.readOdNextPreference(),
        ),
      };
      res.json(body);
    },
  );
}
