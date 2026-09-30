import type { Request, Response, RequestHandler } from 'express';
import type { PublicFileMutations } from '../collab/public-file-mutations.js';

/** Serialize the entire handler, including authorization and post-request cleanup. */
export function publicFileMutationHandler(
  mutations: PublicFileMutations | undefined,
  handler: (req: Request, res: Response) => Promise<unknown>,
): RequestHandler {
  return async (req, res) => {
    const projectId = String(req.params.id ?? req.params[0] ?? '');
    if (mutations) await mutations.run(projectId, () => handler(req, res));
    else await handler(req, res);
  };
}
