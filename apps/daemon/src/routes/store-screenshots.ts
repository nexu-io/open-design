import type { Express, Request, Response } from 'express';
import type { ApiErrorCode } from '@open-design/contracts';
import {
  ApplyStoreScreenshotChangeSetRequestSchema,
  CreateStoreScreenshotDocumentRequestSchema,
  ExportStoreScreenshotRequestSchema,
  GenerateStoreScreenshotPlanRequestSchema,
  RestoreStoreScreenshotDocumentRequestSchema,
  StoreScreenshotChangeSetPreviewRequestSchema,
  StoreScreenshotValidationRequestSchema,
  UploadStoreScreenshotAssetRequestSchema,
} from '@open-design/contracts';

import type { RouteDeps } from '../server-context.js';
import {
  StoreScreenshotAssetError,
} from '../store-screenshots/assets.js';
import {
  StoreScreenshotPersistenceError,
} from '../store-screenshots/persistence.js';
import {
  StoreScreenshotServiceError,
  type StoreScreenshotService,
} from '../store-screenshots/service.js';

export interface RegisterStoreScreenshotRoutesDeps
  extends RouteDeps<'db' | 'http' | 'projectStore' | 'uploads'> {
  storeScreenshots: StoreScreenshotService;
}

const BASE_PATH = '/api/projects/:projectId/store-screenshots';

interface ValidationIssue {
  path: Array<string | number>;
  message: string;
  code: string;
}

interface BodySchema<T> {
  safeParse(body: unknown):
    | { success: true; data: T }
    | { success: false; error: { issues: ValidationIssue[] } };
}

function parseBody<T>(
  schema: BodySchema<T>,
  body: unknown,
  res: Response,
  sendApiError: RegisterStoreScreenshotRoutesDeps['http']['sendApiError'],
): T | null {
  const parsed = schema.safeParse(body);
  if (parsed.success) return parsed.data;
  sendApiError(res, 400, 'BAD_REQUEST', 'Request validation failed', {
    details: {
      kind: 'validation',
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
        code: issue.code,
      })),
    },
  });
  return null;
}

function mapRouteError(
  error: unknown,
  res: Response,
  sendApiError: RegisterStoreScreenshotRoutesDeps['http']['sendApiError'],
): Response {
  if (error instanceof StoreScreenshotPersistenceError) {
    const mapping: Record<typeof error.code, [number, ApiErrorCode]> = {
      DOCUMENT_EXISTS: [409, 'CONFLICT'],
      DOCUMENT_NOT_FOUND: [404, 'DOCUMENT_NOT_FOUND'],
      INVALID_DOCUMENT: [400, 'BAD_REQUEST'],
      VERSION_CONFLICT: [409, 'VERSION_CONFLICT'],
      VERSION_NOT_FOUND: [404, 'NOT_FOUND'],
    };
    const [status, code] = mapping[error.code];
    return sendApiError(res, status, code, error.message);
  }
  if (error instanceof StoreScreenshotAssetError) {
    const mapping: Record<typeof error.code, [number, ApiErrorCode]> = {
      DOCUMENT_NOT_FOUND: [404, 'DOCUMENT_NOT_FOUND'],
      INVALID_ASSET: [400, 'INVALID_ASSET'],
      ASSET_STORAGE_FAILED: [500, 'INTERNAL_ERROR'],
    };
    const [status, code] = mapping[error.code];
    return sendApiError(res, status, code, error.message);
  }
  if (error instanceof StoreScreenshotServiceError) {
    const mapping: Record<typeof error.code, [number, ApiErrorCode]> = {
      INVALID_CHANGE_SET: [400, 'BAD_REQUEST'],
      JOB_NOT_FOUND: [404, 'JOB_NOT_FOUND'],
      NOT_IMPLEMENTED: [501, 'NOT_IMPLEMENTED'],
      UNSAFE_DOWNLOAD: [400, 'BAD_REQUEST'],
    };
    const [status, code] = mapping[error.code];
    return sendApiError(res, status, code, error.message);
  }
  if (error instanceof Error && error.message === 'VERSION_CONFLICT') {
    return sendApiError(res, 409, 'VERSION_CONFLICT', 'Store screenshot version conflict');
  }
  return sendApiError(
    res,
    500,
    'INTERNAL_ERROR',
    error instanceof Error ? error.message : String(error),
  );
}

export function registerStoreScreenshotRoutes(
  app: Express,
  ctx: RegisterStoreScreenshotRoutesDeps,
): void {
  const {
    requireLocalDaemonRequest,
    sendApiError,
    sendMulterError,
  } = ctx.http;

  function requireProject(req: Request, res: Response): boolean {
    const projectId = req.params.projectId;
    if (
      typeof projectId !== 'string'
      || !projectId
      || !ctx.projectStore.getProject(ctx.db, projectId)
    ) {
      sendApiError(res, 404, 'PROJECT_NOT_FOUND', 'Project not found');
      return false;
    }
    return true;
  }

  app.post(BASE_PATH, requireLocalDaemonRequest, async (req, res) => {
    if (!requireProject(req, res)) return;
    const input = parseBody(
      CreateStoreScreenshotDocumentRequestSchema,
      req.body,
      res,
      sendApiError,
    );
    if (!input) return;
    try {
      const document = await ctx.storeScreenshots.create(req.params.projectId!, input);
      res.status(201).json({ document });
    } catch (error) {
      mapRouteError(error, res, sendApiError);
    }
  });

  app.get(BASE_PATH, async (req, res) => {
    if (!requireProject(req, res)) return;
    try {
      res.json({ document: await ctx.storeScreenshots.read(req.params.projectId!) });
    } catch (error) {
      mapRouteError(error, res, sendApiError);
    }
  });

  app.post(`${BASE_PATH}/assets`, requireLocalDaemonRequest, (req, res) => {
    if (!requireProject(req, res)) return;
    const upload = ctx.uploads.storeScreenshotUpload;
    if (!upload) {
      sendApiError(res, 500, 'INTERNAL_ERROR', 'Store screenshot upload is not configured');
      return;
    }
    upload.single('file')(req, res, async (error: unknown) => {
      if (error) {
        sendMulterError(res, error);
        return;
      }
      if (!req.file?.buffer) {
        sendApiError(res, 400, 'BAD_REQUEST', 'file is required');
        return;
      }
      const multipartFields = req.body && typeof req.body === 'object'
        ? req.body as Record<string, unknown>
        : {};
      const input = parseBody(
        UploadStoreScreenshotAssetRequestSchema,
        {
          ...multipartFields,
          fileName: req.file.originalname,
          mime: req.file.mimetype,
          byteLength: req.file.buffer.byteLength,
        },
        res,
        sendApiError,
      );
      if (!input) return;
      try {
        const asset = await ctx.storeScreenshots.uploadAsset(req.params.projectId!, {
          fileName: input.fileName,
          declaredMime: input.mime,
          data: req.file.buffer,
        });
        res.status(201).json({ asset });
      } catch (caught) {
        mapRouteError(caught, res, sendApiError);
      }
    });
  });

  app.post(`${BASE_PATH}/changes/preview`, requireLocalDaemonRequest, async (req, res) => {
    if (!requireProject(req, res)) return;
    const input = parseBody(
      StoreScreenshotChangeSetPreviewRequestSchema,
      req.body,
      res,
      sendApiError,
    );
    if (!input) return;
    try {
      res.json(await ctx.storeScreenshots.previewChanges(req.params.projectId!, input));
    } catch (error) {
      mapRouteError(error, res, sendApiError);
    }
  });

  app.post(`${BASE_PATH}/changes/apply`, requireLocalDaemonRequest, async (req, res) => {
    if (!requireProject(req, res)) return;
    const input = parseBody(
      ApplyStoreScreenshotChangeSetRequestSchema,
      req.body,
      res,
      sendApiError,
    );
    if (!input) return;
    try {
      res.json({ document: await ctx.storeScreenshots.applyChanges(req.params.projectId!, input) });
    } catch (error) {
      mapRouteError(error, res, sendApiError);
    }
  });

  app.get(`${BASE_PATH}/versions`, async (req, res) => {
    if (!requireProject(req, res)) return;
    try {
      res.json({ versions: await ctx.storeScreenshots.listVersions(req.params.projectId!) });
    } catch (error) {
      mapRouteError(error, res, sendApiError);
    }
  });

  app.post(
    `${BASE_PATH}/versions/:version/restore`,
    requireLocalDaemonRequest,
    async (req, res) => {
      if (!requireProject(req, res)) return;
      const input = parseBody(
        RestoreStoreScreenshotDocumentRequestSchema,
        { version: Number(req.params.version) },
        res,
        sendApiError,
      );
      if (!input) return;
      try {
        res.json({
          document: await ctx.storeScreenshots.restore(req.params.projectId!, input.version),
        });
      } catch (error) {
        mapRouteError(error, res, sendApiError);
      }
    },
  );

  app.post(`${BASE_PATH}/validate`, requireLocalDaemonRequest, async (req, res) => {
    if (!requireProject(req, res)) return;
    const input = parseBody(
      StoreScreenshotValidationRequestSchema,
      req.body,
      res,
      sendApiError,
    );
    if (!input) return;
    try {
      res.json(await ctx.storeScreenshots.validate(req.params.projectId!, input.platforms));
    } catch (error) {
      mapRouteError(error, res, sendApiError);
    }
  });

  app.post(`${BASE_PATH}/generate`, requireLocalDaemonRequest, async (req, res) => {
    if (!requireProject(req, res)) return;
    const input = parseBody(
      GenerateStoreScreenshotPlanRequestSchema,
      req.body,
      res,
      sendApiError,
    );
    if (!input) return;
    try {
      res.status(202).json({ job: await ctx.storeScreenshots.generate(req.params.projectId!, input) });
    } catch (error) {
      mapRouteError(error, res, sendApiError);
    }
  });

  app.post(`${BASE_PATH}/export`, requireLocalDaemonRequest, async (req, res) => {
    if (!requireProject(req, res)) return;
    const input = parseBody(
      ExportStoreScreenshotRequestSchema,
      req.body,
      res,
      sendApiError,
    );
    if (!input) return;
    try {
      res.status(202).json({ job: await ctx.storeScreenshots.export(req.params.projectId!, input) });
    } catch (error) {
      mapRouteError(error, res, sendApiError);
    }
  });

  app.get(`${BASE_PATH}/jobs/:jobId`, async (req, res) => {
    if (!requireProject(req, res)) return;
    try {
      res.json({ job: await ctx.storeScreenshots.getJob(req.params.projectId!, req.params.jobId!) });
    } catch (error) {
      mapRouteError(error, res, sendApiError);
    }
  });

  app.get(
    `${BASE_PATH}/jobs/:jobId/download`,
    requireLocalDaemonRequest,
    async (req, res) => {
      if (!requireProject(req, res)) return;
      try {
        const download = await ctx.storeScreenshots.readJobDownload(
          req.params.projectId!,
          req.params.jobId!,
        );
        res
          .status(200)
          .type('application/zip')
          .setHeader('Content-Disposition', `attachment; filename="${download.fileName}"`)
          .send(download.body);
      } catch (error) {
        mapRouteError(error, res, sendApiError);
      }
    },
  );
}
