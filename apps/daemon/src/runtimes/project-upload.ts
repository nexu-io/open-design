import type { NextFunction, Request, RequestHandler, Response } from 'express';

export interface ProjectUploadAdapter {
  array(fieldName: string, maxCount: number): RequestHandler;
}

export type UploadErrorResponder = (res: Response, error: unknown) => Response;

/** Keep Multer's multipart middleware construction at the daemon boundary. */
export function createProjectUploadMiddleware(
  upload: ProjectUploadAdapter,
  sendUploadError: UploadErrorResponder,
): RequestHandler {
  const uploadFiles = upload.array('files', 12);
  return (req: Request, res: Response, next: NextFunction) => {
    uploadFiles(req, res, (error?: unknown) => {
      if (error) {
        sendUploadError(res, error);
        return;
      }
      next();
    });
  };
}
