import type { Express, Request, Response } from 'express';
import { constants as fsConstants } from 'node:fs';
import { open, readFile } from 'node:fs/promises';
import path from 'node:path';

import {
  DesignSystemAdherenceRequestSchema,
  DesignSystemIntentIdSchema,
  resolveDesignSystemIntentForGeneration,
} from '@open-design/contracts';
import type {
  ResolveDesignSystemIntentErrorCode,
  ResolveDesignSystemIntentErrorDetails,
  ResolveDesignSystemIntentRequest,
  ResolveDesignSystemIntentResponse,
  ValidateDesignSystemAdherenceRequest,
  ValidateDesignSystemAdherenceResponse,
} from '@open-design/contracts';

import type { ToolTokenGrant } from '../tool-tokens.js';
import type { PinnedRunDesignSystemScope } from '../design-systems/run-scope.js';
import { resolveProjectFilePath } from '../projects.js';
import {
  validateDesignSystemAdherence,
  type DesignSystemAdherenceArtifact,
} from '../design-systems/adherence.js';
import {
  readDesignSystemPullFile,
  resolveDesignSystemRuntime,
} from '../design-systems/index.js';

type ProjectRecord = {
  id: string;
  designSystemId?: string | null;
  metadata?: Record<string, unknown> | null;
};

const MAX_ADHERENCE_ARTIFACT_BYTES = 2 * 1024 * 1024;
const MAX_ADHERENCE_TOTAL_BYTES = 5 * 1024 * 1024;

export const designSystemToolRouteTestHooks = {
  beforeArtifactRead: null as null | ((input: {
    filePath: string;
    maxBytesToRead: number;
  }) => Promise<void> | void),
};

type BoundedArtifactRead =
  | { ok: true; buffer: Buffer }
  | {
      ok: false;
      reason: 'not-regular-file' | 'artifact-too-large' | 'artifacts-too-large';
    };

type SendApiError = (
  res: Response,
  status: number,
  code: string,
  message: string,
  extras?: Record<string, unknown>,
) => void;

export type DesignSystemUserRootResolution =
  | { ok: true; root: string }
  | {
      ok: false;
      code: Extract<ResolveDesignSystemIntentErrorCode, 'DESIGN_SYSTEM_SCOPE_UNAVAILABLE'>;
      message: string;
      details: Extract<
        ResolveDesignSystemIntentErrorDetails,
        { workspaceId: string; designSystemId: string }
      >;
    };

export type RegisterDesignSystemToolRoutesDeps = {
  auth: {
    authorizeToolRequest: (req: Request, res: Response, operation: string) => ToolTokenGrant | null;
  };
  http: {
    sendApiError: SendApiError;
  };
  paths: {
    PROJECTS_DIR: string;
    DESIGN_SYSTEMS_DIR: string;
    USER_DESIGN_SYSTEMS_DIR: string;
    /** Resolve the user root from the immutable scope captured in the run token. */
    resolveUserDesignSystemsRoot?: (
      grant: ToolTokenGrant,
      designSystemId: string,
    ) => DesignSystemUserRootResolution;
  };
  projects: {
    getProject: (id: string) => ProjectRecord | null | undefined;
  };
  runs?: {
    getRun: (id: string) => {
      designSystemId?: string | null;
      designSystemScope?: PinnedRunDesignSystemScope | null;
    } | null | undefined;
  };
  features: {
    isDesignSystemRuntimeEnabled: () => boolean;
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

      const activeDesignSystemId = activeDesignSystemIdForGrant(ctx, grant);
      if (!activeDesignSystemId) {
        return sendApiError(res, 404, 'DESIGN_SYSTEM_NOT_FOUND', 'run or project has no active design system');
      }

      const requestedDesignSystemId = typeof req.body?.designSystemId === 'string'
        ? req.body.designSystemId
        : undefined;
      if (requestedDesignSystemId !== undefined && requestedDesignSystemId !== activeDesignSystemId) {
        return sendApiError(res, 403, 'DESIGN_SYSTEM_DENIED', 'designSystemId is derived from the active tool-token run or project', {
          details: { requestedDesignSystemId, activeDesignSystemId },
        });
      }

      const requestedPath = typeof req.body?.path === 'string' ? req.body.path : '';
      if (!requestedPath) {
        return sendApiError(res, 400, 'INVALID_INPUT', 'path is required');
      }

      const userRoot = userDesignSystemsRootForGrant(ctx, grant, activeDesignSystemId);
      if (!userRoot.ok) {
        return sendApiError(res, 404, userRoot.code, userRoot.message, {
          details: userRoot.details,
        });
      }

      const file = await readActiveDesignSystemPullFile(
        ctx.paths.DESIGN_SYSTEMS_DIR,
        userRoot.root,
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

  app.post('/api/tools/design-systems/resolve-intent', async (req, res) => {
    try {
      const grant = authorizeToolRequest(req, res, 'design-systems:resolve-intent');
      if (!grant) return;

      if (!ctx.features.isDesignSystemRuntimeEnabled()) {
        return sendApiError(
          res,
          409,
          'DESIGN_SYSTEM_RUNTIME_UNAVAILABLE',
          'structured design-system runtime is disabled',
        );
      }

      const activeDesignSystemId = activeDesignSystemIdForGrant(ctx, grant);
      if (!activeDesignSystemId) {
        return sendApiError(res, 404, 'DESIGN_SYSTEM_NOT_FOUND', 'run or project has no active design system');
      }

      const body = (req.body ?? {}) as Partial<ResolveDesignSystemIntentRequest>;
      const requestedDesignSystemId = typeof body.designSystemId === 'string'
        ? body.designSystemId
        : undefined;
      if (requestedDesignSystemId !== undefined && requestedDesignSystemId !== activeDesignSystemId) {
        return sendApiError(res, 403, 'DESIGN_SYSTEM_DENIED', 'designSystemId is derived from the active tool-token run or project', {
          details: { requestedDesignSystemId, activeDesignSystemId },
        });
      }

      const parsedIntent = DesignSystemIntentIdSchema.safeParse(body.intent);
      if (!parsedIntent.success) {
        return sendApiError(res, 400, 'INVALID_INPUT', 'intent must be a canonical design-system intent id');
      }
      const intent = parsedIntent.data;

      const userRoot = userDesignSystemsRootForGrant(ctx, grant, activeDesignSystemId);
      if (!userRoot.ok) {
        return sendApiError(res, 404, userRoot.code, userRoot.message, {
          details: userRoot.details,
        });
      }

      const runtime = await resolveDesignSystemRuntime(
        activeDesignSystemId,
        ctx.paths.DESIGN_SYSTEMS_DIR,
        userRoot.root,
      );
      if (runtime.mode === 'legacy') {
        return sendApiError(
          res,
          409,
          'DESIGN_SYSTEM_RUNTIME_UNAVAILABLE',
          'active design system does not declare a structured runtime',
        );
      }
      if (runtime.mode === 'invalid') {
        return sendApiError(
          res,
          422,
          'DESIGN_SYSTEM_RUNTIME_INVALID',
          'active design system declares an invalid structured runtime',
          { details: { errors: runtime.errors } },
        );
      }

      const response: ResolveDesignSystemIntentResponse = {
        designSystemId: activeDesignSystemId,
        runtime: 'structured',
        resolution: resolveDesignSystemIntentForGeneration(runtime.bundle, intent),
        lint: runtime.bundle.lint,
      };
      res.json(response);
    } catch (error) {
      sendApiError(res, 500, 'INTERNAL_ERROR', error instanceof Error ? error.message : String(error));
    }
  });

  app.post('/api/tools/design-systems/validate-adherence', async (req, res) => {
    try {
      const grant = authorizeToolRequest(req, res, 'design-systems:validate-adherence');
      if (!grant) return;

      if (!ctx.features.isDesignSystemRuntimeEnabled()) {
        return sendApiError(
          res,
          409,
          'DESIGN_SYSTEM_RUNTIME_UNAVAILABLE',
          'structured design-system runtime is disabled',
        );
      }

      const activeDesignSystemId = activeDesignSystemIdForGrant(ctx, grant);
      if (!activeDesignSystemId) {
        return sendApiError(res, 404, 'DESIGN_SYSTEM_NOT_FOUND', 'run or project has no active design system');
      }

      const body = (req.body ?? {}) as Partial<ValidateDesignSystemAdherenceRequest>;
      const requestedDesignSystemId = typeof body.designSystemId === 'string'
        ? body.designSystemId
        : undefined;
      if (requestedDesignSystemId !== undefined && requestedDesignSystemId !== activeDesignSystemId) {
        return sendApiError(res, 403, 'DESIGN_SYSTEM_DENIED', 'designSystemId is derived from the active tool-token run or project', {
          details: { requestedDesignSystemId, activeDesignSystemId },
        });
      }

      const parsedRequest = DesignSystemAdherenceRequestSchema.safeParse({
        intent: body.intent,
        artifacts: body.artifacts,
      });
      if (!parsedRequest.success) {
        return sendApiError(
          res,
          400,
          'INVALID_INPUT',
          'intent and at least one safe project-relative artifact path are required',
          { details: { errors: parsedRequest.error.issues.map((issue) => issue.message) } },
        );
      }

      const userRoot = userDesignSystemsRootForGrant(ctx, grant, activeDesignSystemId);
      if (!userRoot.ok) {
        return sendApiError(res, 404, userRoot.code, userRoot.message, {
          details: userRoot.details,
        });
      }

      const runtime = await resolveDesignSystemRuntime(
        activeDesignSystemId,
        ctx.paths.DESIGN_SYSTEMS_DIR,
        userRoot.root,
      );
      if (runtime.mode === 'legacy') {
        return sendApiError(
          res,
          409,
          'DESIGN_SYSTEM_RUNTIME_UNAVAILABLE',
          'active design system does not declare a structured runtime',
        );
      }
      if (runtime.mode === 'invalid') {
        return sendApiError(
          res,
          422,
          'DESIGN_SYSTEM_RUNTIME_INVALID',
          'active design system declares an invalid structured runtime',
          { details: { errors: runtime.errors } },
        );
      }

      const project = ctx.projects.getProject(grant.projectId);
      if (!project) {
        return sendApiError(res, 404, 'PROJECT_NOT_FOUND', 'tool-token project was not found');
      }
      const artifacts: DesignSystemAdherenceArtifact[] = [];
      let totalBytes = 0;
      for (const artifactPath of parsedRequest.data.artifacts) {
        let file;
        try {
          file = await resolveProjectFilePath(
            ctx.paths.PROJECTS_DIR,
            grant.projectId,
            artifactPath,
            project.metadata ?? undefined,
          );
        } catch (error) {
          const code = (error as NodeJS.ErrnoException | undefined)?.code;
          if (code === 'ENOENT' || code === 'ENOTDIR') {
            return sendApiError(
              res,
              404,
              'PROJECT_FILE_NOT_FOUND',
              `artifact ${artifactPath} was not found`,
            );
          }
          throw error;
        }
        let readResult: BoundedArtifactRead;
        try {
          readResult = await readBoundedAdherenceArtifact(
            file.filePath,
            MAX_ADHERENCE_ARTIFACT_BYTES,
            MAX_ADHERENCE_TOTAL_BYTES - totalBytes,
          );
        } catch (error) {
          const code = (error as NodeJS.ErrnoException | undefined)?.code;
          if (code === 'ENOENT' || code === 'ENOTDIR') {
            return sendApiError(res, 404, 'PROJECT_FILE_NOT_FOUND', `artifact ${artifactPath} was not found`);
          }
          if (code === 'ELOOP') {
            return sendApiError(
              res,
              400,
              'INVALID_INPUT',
              `artifact ${artifactPath} must be a regular file`,
            );
          }
          throw error;
        }
        if (!readResult.ok && readResult.reason === 'not-regular-file') {
          return sendApiError(
            res,
            400,
            'INVALID_INPUT',
            `artifact ${artifactPath} must be a regular file`,
          );
        }
        if (!readResult.ok && readResult.reason === 'artifact-too-large') {
          return sendApiError(
            res,
            413,
            'ARTIFACT_TOO_LARGE',
            `artifact ${artifactPath} exceeds the ${MAX_ADHERENCE_ARTIFACT_BYTES}-byte validation limit`,
          );
        }
        if (!readResult.ok) {
          return sendApiError(
            res,
            413,
            'ARTIFACTS_TOO_LARGE',
            `artifact set exceeds the ${MAX_ADHERENCE_TOTAL_BYTES}-byte validation limit`,
          );
        }
        const { buffer } = readResult;
        totalBytes += buffer.length;
        if (!isSupportedAdherenceArtifact(file.name) || buffer.includes(0)) {
          return sendApiError(
            res,
            415,
            'UNSUPPORTED_ARTIFACT',
            `artifact ${artifactPath} must be CSS, HTML, SVG, JSX, TSX, Vue, or Svelte source`,
          );
        }
        artifacts.push({
          path: file.name,
          content: buffer.toString('utf8'),
          size: buffer.length,
          ...(typeof file.mime === 'string' ? { mime: file.mime } : {}),
        });
      }

      const tokensCss = await readRuntimePackageTokens(runtime.packageRoot);
      const response: ValidateDesignSystemAdherenceResponse = {
        designSystemId: activeDesignSystemId,
        runtime: 'structured',
        report: validateDesignSystemAdherence({
          bundle: runtime.bundle,
          intent: parsedRequest.data.intent,
          artifacts,
          ...(tokensCss === undefined ? {} : { tokensCss }),
        }),
      };
      res.json(response);
    } catch (error) {
      sendApiError(res, 500, 'INTERNAL_ERROR', error instanceof Error ? error.message : String(error));
    }
  });
}

async function readBoundedAdherenceArtifact(
  filePath: string,
  artifactLimitBytes: number,
  remainingTotalBytes: number,
): Promise<BoundedArtifactRead> {
  const noFollowFlag = typeof fsConstants.O_NOFOLLOW === 'number'
    ? fsConstants.O_NOFOLLOW
    : 0;
  const handle = await open(filePath, fsConstants.O_RDONLY | noFollowFlag);
  try {
    const openedStat = await handle.stat();
    if (!openedStat.isFile()) return { ok: false, reason: 'not-regular-file' };
    if (openedStat.size > artifactLimitBytes) {
      return { ok: false, reason: 'artifact-too-large' };
    }
    if (openedStat.size > remainingTotalBytes) {
      return { ok: false, reason: 'artifacts-too-large' };
    }

    const maxBytesToRead = Math.min(
      artifactLimitBytes,
      Math.max(0, remainingTotalBytes),
    ) + 1;
    await designSystemToolRouteTestHooks.beforeArtifactRead?.({
      filePath,
      maxBytesToRead,
    });

    const buffer = Buffer.allocUnsafe(maxBytesToRead);
    let bytesRead = 0;
    while (bytesRead < maxBytesToRead) {
      const read = await handle.read(
        buffer,
        bytesRead,
        maxBytesToRead - bytesRead,
        null,
      );
      if (read.bytesRead === 0) break;
      bytesRead += read.bytesRead;
    }
    if (bytesRead > artifactLimitBytes) {
      return { ok: false, reason: 'artifact-too-large' };
    }
    if (bytesRead > remainingTotalBytes) {
      return { ok: false, reason: 'artifacts-too-large' };
    }
    return { ok: true, buffer: buffer.subarray(0, bytesRead) };
  } finally {
    await handle.close();
  }
}

function userDesignSystemsRootForGrant(
  ctx: RegisterDesignSystemToolRoutesDeps,
  grant: ToolTokenGrant,
  designSystemId: string,
): DesignSystemUserRootResolution {
  return ctx.paths.resolveUserDesignSystemsRoot?.(grant, designSystemId)
    ?? { ok: true, root: ctx.paths.USER_DESIGN_SYSTEMS_DIR };
}

function activeDesignSystemIdForGrant(
  ctx: RegisterDesignSystemToolRoutesDeps,
  grant: ToolTokenGrant,
): string | null {
  const run = ctx.runs?.getRun(grant.runId);
  if (run !== null && run !== undefined) {
    const runDesignSystemId = run.designSystemId;
    return typeof runDesignSystemId === 'string' && runDesignSystemId.length > 0
      ? runDesignSystemId
      : null;
  }
  const projectDesignSystemId = ctx.projects.getProject(grant.projectId)?.designSystemId;
  return typeof projectDesignSystemId === 'string' && projectDesignSystemId.length > 0
    ? projectDesignSystemId
    : null;
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

async function readRuntimePackageTokens(packageRoot: string): Promise<string | undefined> {
  try {
    return await readFile(path.join(packageRoot, 'tokens.css'), 'utf8');
  } catch (error) {
    const code = (error as NodeJS.ErrnoException | undefined)?.code;
    if (code === 'ENOENT' || code === 'ENOTDIR') return undefined;
    throw error;
  }
}

function isSupportedAdherenceArtifact(filePath: string): boolean {
  return /\.(?:css|html?|jsx|tsx|vue|svelte|svg)$/iu.test(filePath);
}
