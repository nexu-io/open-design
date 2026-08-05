import type { ApiError, ApiErrorCode } from '@open-design/contracts';
import type { NextFunction, Request, Response, RequestHandler } from 'express';
import type { ToolTokenGrant, ToolTokenRegistry } from '../tool-tokens.js';
import {
  bearerTokenFromAuthorizationHeader,
  toolTokenValidationStatus,
} from './tool-authorization.js';
import { validateLocalDaemonRequest } from './local-request.js';

type SendApiError = (
  res: Response,
  status: number,
  code: ApiErrorCode,
  message: string,
  init?: Omit<ApiError, 'code' | 'message'>,
) => Response;

export function createLocalDaemonRequestMiddleware(
  sendApiError: SendApiError,
): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const validation = validateLocalDaemonRequest({
      remoteAddress: req.socket?.remoteAddress,
      host: req.get('host'),
      origin: req.get('origin'),
    });
    if (!validation.ok) {
      return sendApiError(
        res,
        403,
        'FORBIDDEN',
        validation.message,
        validation.details ? { details: validation.details } : {},
      );
    }

    res.setHeader('Vary', 'Origin');
    if (validation.origin) {
      res.setHeader('Access-Control-Allow-Origin', validation.origin);
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Max-Age', '600');
    next();
  };
}

export interface ToolTokenValidationOptions {
  endpoint?: string;
  operation?: string;
  nowMs?: number;
}

export function createToolAuthorizationHandlers(
  registry: ToolTokenRegistry,
  sendApiError: SendApiError,
): {
  authorizeToolRequest: (
    req: Request,
    res: Response,
    operation: string,
  ) => ToolTokenGrant | null;
  optionalToolGrantFromRequest: (
    req: Request,
    options?: ToolTokenValidationOptions,
  ) => ToolTokenGrant | null;
} {
  function authorizeToolRequest(
    req: Request,
    res: Response,
    operation: string,
  ): ToolTokenGrant | null {
    const endpoint = req.path;
    const validation = registry.validate(
      bearerTokenFromAuthorizationHeader(req.get('authorization')),
      { endpoint, operation },
    );
    if (!validation.ok) {
      sendApiError(
        res,
        toolTokenValidationStatus(validation.code),
        validation.code as ApiErrorCode,
        validation.message,
        { details: { endpoint, operation } },
      );
      return null;
    }
    return validation.grant;
  }

  function optionalToolGrantFromRequest(
    req: Request,
    options: ToolTokenValidationOptions = {},
  ): ToolTokenGrant | null {
    const validation = registry.validate(
      bearerTokenFromAuthorizationHeader(req.get('authorization')),
      options,
    );
    return validation.ok ? validation.grant : null;
  }

  return { authorizeToolRequest, optionalToolGrantFromRequest };
}
