import type { Request, Response } from 'express';
import type { Express } from 'express';
import multer from 'multer';
import type { FigmaImportResult } from '@open-design/contracts';

const figmaUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 200 * 1024 * 1024 },
});

interface FigmaProject {
  id: string;
  metadata?: unknown;
}

interface FigmaRouteHttpDeps {
  sendApiError: (
    res: Response,
    status: number,
    code: string,
    message: string,
    details?: unknown,
  ) => unknown;
  sendMulterError: (res: Response, error: unknown) => unknown;
}

interface FigmaRouteProjectDeps {
  getProject: (db: unknown, id: string) => FigmaProject | null;
  resolveProjectDir: (projectsRoot: string, id: string, metadata?: unknown) => string;
}

interface FigmaRouteImportDeps {
  decodeMultipartFilename: (name: unknown) => string;
  importFigmaFromBytes: (
    bytes: Uint8Array,
    options: { cwd: string; label: string; notes?: string },
  ) => Promise<FigmaImportResult>;
}

export interface RegisterFigmaRoutesDeps {
  db: unknown;
  http: FigmaRouteHttpDeps;
  projectsRoot: string;
  projects: FigmaRouteProjectDeps;
  imports: FigmaRouteImportDeps;
}

function requestBody(req: Request): Record<string, unknown> {
  return req.body && typeof req.body === 'object'
    ? req.body as Record<string, unknown>
    : {};
}

export function registerFigmaRoutes(
  app: Express,
  ctx: RegisterFigmaRoutesDeps,
): void {
  const { db, http, projectsRoot, projects, imports } = ctx;

  app.post('/api/projects/:id/figma/import', (req, res) => {
    figmaUpload.single('file')(req, res, async (error: unknown) => {
      if (error) {
        http.sendMulterError(res, error);
        return;
      }

      try {
        const project = projects.getProject(db, req.params.id);
        if (!project) {
          http.sendApiError(res, 404, 'PROJECT_NOT_FOUND', 'project not found');
          return;
        }

        const body = requestBody(req);
        const figmaUrl = typeof body.figmaUrl === 'string' ? body.figmaUrl.trim() : '';
        if (!req.file) {
          if (figmaUrl) {
            http.sendApiError(
              res,
              409,
              'FIGMA_URL_NEEDS_MIGRATION',
              'Figma URL imports must run through the Figma migration flow.',
              { details: { figmaUrl } },
            );
            return;
          }
          http.sendApiError(res, 400, 'BAD_REQUEST', 'file is required');
          return;
        }

        const projectRoot = projects.resolveProjectDir(
          projectsRoot,
          req.params.id,
          project.metadata,
        );
        const notes = typeof body.notes === 'string' ? body.notes : undefined;
        const result = await imports.importFigmaFromBytes(req.file.buffer, {
          cwd: projectRoot,
          label: imports.decodeMultipartFilename(
            req.file.originalname || 'figma-import.fig',
          ),
          ...(notes !== undefined ? { notes } : {}),
        });
        res.json(result);
      } catch (caught: unknown) {
        http.sendApiError(
          res,
          400,
          'FIGMA_IMPORT_FAILED',
          caught instanceof Error ? caught.message : String(caught),
        );
      }
    });
  });
}
