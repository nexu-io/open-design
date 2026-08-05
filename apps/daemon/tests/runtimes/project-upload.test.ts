import { describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';
import { createProjectUploadMiddleware } from '../../src/runtimes/project-upload.js';

function response(): Response {
  return {} as Response;
}

describe('project upload middleware', () => {
  it('configures the files field and continues after upload success', () => {
    const uploadFiles = vi.fn((_req, _res, callback) => callback());
    const upload = { array: vi.fn(() => uploadFiles) };
    const next = vi.fn();
    const sendUploadError = vi.fn();

    const middleware = createProjectUploadMiddleware(upload, sendUploadError);
    middleware({} as Request, response(), next);

    expect(upload.array).toHaveBeenCalledWith('files', 12);
    expect(uploadFiles).toHaveBeenCalledOnce();
    expect(next).toHaveBeenCalledOnce();
    expect(sendUploadError).not.toHaveBeenCalled();
  });

  it('reports upload failures without continuing to the route', () => {
    const error = new Error('rejected upload');
    const uploadFiles = vi.fn((_req, _res, callback) => callback(error));
    const upload = { array: vi.fn(() => uploadFiles) };
    const next = vi.fn();
    const sendUploadError = vi.fn();
    const res = response();

    const middleware = createProjectUploadMiddleware(upload, sendUploadError);
    middleware({} as Request, res, next);

    expect(sendUploadError).toHaveBeenCalledWith(res, error);
    expect(next).not.toHaveBeenCalled();
  });
});
