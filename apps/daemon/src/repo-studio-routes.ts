// @summary Local-only HTTP surface for inspecting and editing registered live applications.
import type { Express, NextFunction, Request, Response } from 'express';
import type { RepoStudioApplyRequest, RepoStudioDiffRequest, RepoStudioInspectRequest, RepoStudioVerifyRequest } from '@open-design/contracts';
import { applyRepoStudioControl, diffRepoStudio, inspectRepoStudio, RepoStudioError, verifyRepoStudio } from './repo-studio.js';

type LocalMiddleware = (req: Request, res: Response, next: NextFunction) => void;

export function registerRepoStudioRoutes(app: Express, requireLocal: LocalMiddleware): void {
  app.post('/api/repo-studio/inspect', requireLocal, async (req, res) => {
    await respond(res, () => inspectRepoStudio(req.body as RepoStudioInspectRequest));
  });
  app.post('/api/repo-studio/apply', requireLocal, async (req, res) => {
    await respond(res, () => applyRepoStudioControl(req.body as RepoStudioApplyRequest));
  });
  app.post('/api/repo-studio/verify', requireLocal, async (req, res) => {
    await respond(res, () => verifyRepoStudio(req.body as RepoStudioVerifyRequest));
  });
  app.post('/api/repo-studio/diff', requireLocal, async (req, res) => {
    await respond(res, () => diffRepoStudio(req.body as RepoStudioDiffRequest));
  });
}

async function respond(res: Response, run: () => Promise<unknown>): Promise<void> {
  try {
    res.json(await run());
  } catch (error) {
    if (error instanceof RepoStudioError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: message });
  }
}
