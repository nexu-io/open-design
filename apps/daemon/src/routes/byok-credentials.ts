import type { Express, RequestHandler, Response } from 'express';
import type {
  ByokChatProtocol,
  ConnectionTestResponse,
  UpsertByokCredentialProfileRequest,
} from '@open-design/contracts';
import type {
  ByokCredentialService,
  ResolvedByokCredentialProfile,
} from '../byok/credential-service.js';

export interface RegisterByokCredentialRoutesDeps {
  http: {
    requireLocalDaemonRequest: RequestHandler;
    sendApiError: (
      res: Response,
      status: number,
      code: string,
      message: string,
    ) => unknown;
  };
  byokCredentials: Pick<
    ByokCredentialService,
    'delete' | 'list' | 'resolve' | 'status' | 'upsert'
  >;
  connectionTest: (
    input: {
      protocol: ByokChatProtocol;
      baseUrl: string;
      apiKey: string;
      model: string;
      apiVersion?: string;
    },
  ) => Promise<ConnectionTestResponse>;
}

export function registerByokCredentialRoutes(
  app: Express,
  deps: RegisterByokCredentialRoutesDeps,
): void {
  const { requireLocalDaemonRequest, sendApiError } = deps.http;

  app.get('/api/byok/profiles', requireLocalDaemonRequest, async (_req, res) => {
    try {
      const [status, profiles] = await Promise.all([
        deps.byokCredentials.status(),
        deps.byokCredentials.list(),
      ]);
      res.setHeader('Cache-Control', 'no-store');
      return res.json({ ...status, profiles });
    } catch {
      return sendApiError(
        res,
        500,
        'INTERNAL',
        'Failed to read BYOK credential profiles',
      );
    }
  });

  app.post('/api/byok/profiles', requireLocalDaemonRequest, async (req, res) => {
    try {
      const profile = await deps.byokCredentials.upsert(
        requestBody(req.body),
      );
      res.setHeader('Cache-Control', 'no-store');
      return res.status(201).json({ profile });
    } catch (error) {
      const message = safeCredentialErrorMessage(error);
      const unavailable = /secure credential storage is unavailable/iu.test(message);
      return sendApiError(
        res,
        unavailable ? 503 : 400,
        unavailable ? 'UPSTREAM_UNAVAILABLE' : 'VALIDATION_FAILED',
        message,
      );
    }
  });

  app.delete('/api/byok/profiles/:id', requireLocalDaemonRequest, async (req, res) => {
    try {
      const deleted = await deps.byokCredentials.delete(routeProfileId(req.params.id));
      if (!deleted) {
        return sendApiError(res, 404, 'NOT_FOUND', 'BYOK credential profile not found');
      }
      return res.status(204).end();
    } catch (error) {
      return sendApiError(
        res,
        400,
        'VALIDATION_FAILED',
        safeCredentialErrorMessage(error),
      );
    }
  });

  app.post('/api/byok/profiles/:id/test', requireLocalDaemonRequest, async (req, res) => {
    let resolved: ResolvedByokCredentialProfile | null;
    try {
      resolved = await deps.byokCredentials.resolve(routeProfileId(req.params.id));
    } catch (error) {
      return sendApiError(
        res,
        400,
        'VALIDATION_FAILED',
        safeCredentialErrorMessage(error),
      );
    }
    if (!resolved) {
      return sendApiError(
        res,
        404,
        'NOT_FOUND',
        'BYOK credential profile is missing or has no stored credential',
      );
    }
    try {
      // The key exists only in this local variable and in the outbound
      // authorization header built by the provider tester. Its result shape is
      // already redacted and never contains the request credential.
      const result = await deps.connectionTest({
        protocol: resolved.profile.protocol,
        baseUrl: resolved.profile.baseUrl,
        apiKey: resolved.apiKey,
        model: resolved.profile.model,
        ...(resolved.profile.apiVersion
          ? { apiVersion: resolved.profile.apiVersion }
          : {}),
      });
      res.setHeader('Cache-Control', 'no-store');
      return res.json(result);
    } catch {
      return sendApiError(res, 500, 'INTERNAL', 'Connection test failed');
    }
  });
}

function requestBody(value: unknown): UpsertByokCredentialProfileRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('A BYOK credential profile body is required.');
  }
  return value as UpsertByokCredentialProfileRequest;
}

function routeProfileId(value: string | string[] | undefined): string {
  if (typeof value !== 'string' || !value) {
    throw new Error('Invalid BYOK profile id.');
  }
  return value;
}

function safeCredentialErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return 'Invalid BYOK credential profile.';
  const message = error.message.trim();
  if (
    /^(?:secure credential storage|an API key|the BYOK profile|invalid BYOK profile id|unsupported BYOK protocol|BYOK baseUrl|label|baseUrl|model)/iu
      .test(message)
  ) {
    return message;
  }
  return 'Invalid BYOK credential profile.';
}
