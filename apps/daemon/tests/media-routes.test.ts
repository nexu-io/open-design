import express from 'express';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { registerMediaRoutes } from '../src/media-routes.js';

type TestApp = {
  baseUrl: string;
  close(): Promise<void>;
};

async function jsonOf<T = any>(r: Response): Promise<T> {
  return (await r.json()) as T;
}

async function startMediaRouteApp(projectRoot: string, media: Record<string, unknown>): Promise<TestApp> {
  const app = express();
  app.use(express.json());

  const resolvedPortRef = { current: 0 };
  registerMediaRoutes(app, {
    appConfig: {
      readAppConfig: async () => ({}),
      writeAppConfig: async () => ({}),
    },
    conversations: {
      insertConversation: () => undefined,
      upsertMessage: () => undefined,
    },
    db: {},
    http: {
      createSseResponse: () => undefined,
      isLocalSameOrigin: () => true,
      requireLocalDaemonRequest: (_req: unknown, _res: unknown, next: () => void) => next(),
      resolvedPortRef,
      sendApiError: () => undefined,
      sendLiveArtifactRouteError: () => undefined,
      sendMulterError: () => undefined,
    },
    ids: {
      randomUUID: () => 'test-task-id',
    },
    media: {
      AUDIO_DURATIONS_SEC: [],
      AUDIO_MODELS_BY_KIND: {},
      IMAGE_MODELS: [],
      MEDIA_ASPECTS: [],
      MEDIA_PROVIDERS: [],
      VIDEO_LENGTHS_SEC: [],
      VIDEO_MODELS: [],
      appendTaskProgress: () => undefined,
      createMediaTask: () => ({ status: 'queued', startedAt: Date.now() }),
      generateMedia: async () => ({}),
      getLiveMediaTask: () => undefined,
      listElevenLabsVoiceOptions: async () => [],
      listMediaTasksByProject: () => [],
      mediaTaskSnapshot: () => ({}),
      notifyTaskWaiters: () => undefined,
      persistMediaTask: () => undefined,
      readMaskedConfig: async () => ({}),
      writeConfig: async () => ({}),
      ...media,
    },
    nativeDialogs: {
      openNativeFolderDialog: async () => null,
    },
    orbit: {
      orbitService: {
        configure: () => undefined,
        start: async () => ({}),
        status: async () => ({}),
      },
    },
    paths: {
      PROJECT_ROOT: projectRoot,
      PROJECTS_DIR: path.join(projectRoot, 'projects'),
      RUNTIME_DATA_DIR: path.join(projectRoot, 'data'),
    },
    projectFiles: {
      writeProjectFile: async () => undefined,
    },
    projectStore: {
      getProject: () => undefined,
    },
    research: {
      ResearchError: class ResearchError extends Error {},
      searchResearch: async () => [],
    },
  } as any);

  const server = http.createServer(app);
  await new Promise<void>((resolve) =>
    server.listen(0, '127.0.0.1', () => resolve()),
  );
  const addr = server.address() as AddressInfo;
  resolvedPortRef.current = addr.port;
  return {
    baseUrl: `http://127.0.0.1:${addr.port}`,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
      }),
  };
}

describe('media routes', () => {
  let projectRoot: string;
  let app: TestApp;

  beforeEach(async () => {
    projectRoot = await mkdtemp(path.join(tmpdir(), 'od-media-routes-'));
  });

  afterEach(async () => {
    await app?.close();
    await rm(projectRoot, { recursive: true, force: true });
  });

  it('preserves invalid SenseAudio credentials as a client-fixable lookup error', async () => {
    app = await startMediaRouteApp(projectRoot, {
      listSenseAudioCatalogue: async () => {
        throw new Error('senseaudio voices api error 1004: invalid api key');
      },
    });

    const res = await fetch(`${app.baseUrl}/api/media/providers/senseaudio/voices`);
    expect(res.status).toBe(400);
    expect(await jsonOf(res)).toEqual({
      error: 'senseaudio voices api error 1004: invalid api key',
    });
  });
});
