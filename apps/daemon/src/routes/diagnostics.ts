import type { Express, RequestHandler } from 'express';
import { DIAGNOSTICS_EXPORT_PATH } from '@open-design/diagnostics';
import {
  createDiagnosticsExportHandler,
  type DiagnosticsHandlerOptions,
} from '../diagnostics-export.js';

export interface RegisterDiagnosticsRoutesDeps
  extends Pick<DiagnosticsHandlerOptions, 'runtime' | 'projectRoot' | 'runsDir' | 'dataDir'> {
  requireLocalDaemonRequest: RequestHandler;
}

export function registerDiagnosticsRoutes(
  app: Express,
  deps: RegisterDiagnosticsRoutesDeps,
): void {
  app.get(
    DIAGNOSTICS_EXPORT_PATH,
    deps.requireLocalDaemonRequest,
    createDiagnosticsExportHandler(deps),
  );
}
