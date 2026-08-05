import { describe, expect, it } from 'vitest';
import { sendLiveArtifactRouteError } from '../../src/runtimes/live-artifact-errors.js';

function responseRecorder() {
  const response = {
    statusCode: 200,
    body: undefined as unknown,
    status(statusCode: number) {
      response.statusCode = statusCode;
      return response;
    },
    json(body: unknown) {
      response.body = body;
      return response;
    },
  };
  return response;
}

describe('live artifact route errors', () => {
  it('maps missing artifacts to a stable not-found API error', () => {
    const response = responseRecorder();
    sendLiveArtifactRouteError(response as never, { code: 'ENOENT' });
    expect(response.statusCode).toBe(404);
    expect(response.body).toEqual({ error: { code: 'LIVE_ARTIFACT_NOT_FOUND', message: 'live artifact not found' } });
  });

  it('contains unknown storage failures behind the stable API error', () => {
    const response = responseRecorder();
    sendLiveArtifactRouteError(response as never, new Error('private storage detail'));
    expect(response.statusCode).toBe(500);
    expect(response.body).toEqual({ error: { code: 'LIVE_ARTIFACT_STORAGE_FAILED', message: 'Error: private storage detail' } });
  });
});
