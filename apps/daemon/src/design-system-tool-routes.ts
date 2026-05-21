import type { Express, Request, Response } from 'express';

import type { ToolTokenGrant } from './tool-tokens.js';
import { readDesignSystemPullFile } from './design-systems.js';

type ProjectRecord = {
  id: string;
  designSystemId?: string | null;
};

type SendApiError = (
  res: Response,
  status: number,
  code: string,
  message: string,
  extras?: Record<string, unknown>,
) => void;

export type RegisterDesignSystemToolRoutesDeps = {
  auth: {
    authorizeToolRequest: (req: Request, res: Response, operation: string) => ToolTokenGrant | null;
  };
  http: {
    sendApiError: SendApiError;
  };
  paths: {
    DESIGN_SYSTEMS_DIR: string;
    USER_DESIGN_SYSTEMS_DIR: string;
  };
  projects: {
    getProject: (id: string) => ProjectRecord | null | undefined;
  };
};

export function registerDesignSystemToolRoutes(
  app: Express,
  ctx: RegisterDesignSystemToolRoutesDeps,
): void {
  const { authorizeToolRequest } = ctx.auth;
  const { sendApiError } = ctx.http;

  app.post('/api/tools/design-systems/read', async (req, res) => {
    try {
      const grant = authorizeToolRequest(req, res, 'design-systems:read');
      if (!grant) return;

      const project = ctx.projects.getProject(grant.projectId);
      const activeDesignSystemId = project?.designSystemId;
      if (!activeDesignSystemId) {
        return sendApiError(res, 404, 'DESIGN_SYSTEM_NOT_FOUND', 'project has no active design system');
      }

      const requestedDesignSystemId = typeof req.body?.designSystemId === 'string'
        ? req.body.designSystemId
        : undefined;
      if (requestedDesignSystemId !== undefined && requestedDesignSystemId !== activeDesignSystemId) {
        return sendApiError(res, 403, 'DESIGN_SYSTEM_DENIED', 'designSystemId is derived from the tool token project', {
          details: { requestedDesignSystemId, activeDesignSystemId },
        });
      }

      const requestedPath = typeof req.body?.path === 'string' ? req.body.path : '';
      if (!requestedPath) {
        return sendApiError(res, 400, 'INVALID_INPUT', 'path is required');
      }

      const file = await readActiveDesignSystemPullFile(
        ctx.paths.DESIGN_SYSTEMS_DIR,
        ctx.paths.USER_DESIGN_SYSTEMS_DIR,
        activeDesignSystemId,
        requestedPath,
      );
      if (!file) {
        return sendApiError(
          res,
          404,
          'DESIGN_SYSTEM_FILE_NOT_FOUND',
          'design system file was not found or is not declared in manifest.json',
          { details: { path: requestedPath } },
        );
      }

      res.json({ file });
    } catch (error) {
      sendApiError(res, 500, 'INTERNAL_ERROR', error instanceof Error ? error.message : String(error));
    }
  });
}

async function readActiveDesignSystemPullFile(
  builtInRoot: string,
  userRoot: string,
  designSystemId: string,
  relativePath: string,
) {
  if (designSystemId.startsWith('user:')) {
    return readDesignSystemPullFile(userRoot, designSystemId, relativePath);
  }

  return (
    (await readDesignSystemPullFile(builtInRoot, designSystemId, relativePath))
    ?? (await readDesignSystemPullFile(userRoot, designSystemId, relativePath))
  );
}
