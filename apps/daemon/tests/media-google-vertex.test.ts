import { generateKeyPairSync } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { generateMedia } from '../src/media.js';

const PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+X2uoAAAAASUVORK5CYII=';
const PROJECT_ID = 'precise-dragon-496304-i5';
const IMPERSONATION_URL = `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/agent-soul-vertex@${PROJECT_ID}.iam.gserviceaccount.com:generateAccessToken`;

describe('Google Vertex media generation', () => {
  let root: string;
  let projectRoot: string;
  let projectsRoot: string;
  let vertexConfigPath: string;
  let adcPath: string;
  const realFetch = globalThis.fetch;
  const originalGoogleVertexConfig = process.env.OD_GOOGLE_VERTEX_CONFIG;
  const originalAgentSoulVertexConfig = process.env.AGENT_SOUL_GOOGLE_VERTEX_CONFIG;
  const originalGoogleApplicationCredentials = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  const originalGoogleCloudProject = process.env.GOOGLE_CLOUD_PROJECT;
  const originalGcloudProject = process.env.GCLOUD_PROJECT;
  const originalGcpProject = process.env.GCP_PROJECT;
  const originalHome = process.env.HOME;
  const originalXdgConfigHome = process.env.XDG_CONFIG_HOME;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'od-google-vertex-media-'));
    projectRoot = path.join(root, 'project-root');
    projectsRoot = path.join(projectRoot, '.od', 'projects');
    vertexConfigPath = path.join(root, 'google-vertex-config.json');
    adcPath = path.join(root, 'application_default_credentials.json');
    await mkdir(projectsRoot, { recursive: true });
    process.env.OD_GOOGLE_VERTEX_CONFIG = vertexConfigPath;
    process.env.GOOGLE_APPLICATION_CREDENTIALS = adcPath;
    delete process.env.AGENT_SOUL_GOOGLE_VERTEX_CONFIG;
    delete process.env.GOOGLE_CLOUD_PROJECT;
    delete process.env.GCLOUD_PROJECT;
    delete process.env.GCP_PROJECT;
  });

  afterEach(async () => {
    globalThis.fetch = realFetch;
    restoreEnv('OD_GOOGLE_VERTEX_CONFIG', originalGoogleVertexConfig);
    restoreEnv('AGENT_SOUL_GOOGLE_VERTEX_CONFIG', originalAgentSoulVertexConfig);
    restoreEnv('GOOGLE_APPLICATION_CREDENTIALS', originalGoogleApplicationCredentials);
    restoreEnv('GOOGLE_CLOUD_PROJECT', originalGoogleCloudProject);
    restoreEnv('GCLOUD_PROJECT', originalGcloudProject);
    restoreEnv('GCP_PROJECT', originalGcpProject);
    restoreEnv('HOME', originalHome);
    restoreEnv('XDG_CONFIG_HOME', originalXdgConfigHome);
    await rm(root, { recursive: true, force: true });
  });

  async function writeVertexConfig(data: unknown) {
    await writeFile(vertexConfigPath, JSON.stringify(data), 'utf8');
  }

  async function writeAdc(data: unknown) {
    await writeFile(adcPath, JSON.stringify(data), 'utf8');
  }

  it('renders Imagen through Vertex ADC impersonation', async () => {
    await writeVertexConfig({
      version: 1,
      enabled: true,
      auth_mode: 'adc',
      project_id: PROJECT_ID,
      default_location: 'us-central1',
      text_location: 'global',
      image_location: 'us-central1',
    });
    await writeAdc({
      type: 'impersonated_service_account',
      service_account_impersonation_url: IMPERSONATION_URL,
      source_credentials: {
        type: 'authorized_user',
        client_id: 'client-id',
        client_secret: 'client-secret',
        refresh_token: 'refresh-token',
      },
    });

    const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      if (url === 'https://oauth2.googleapis.com/token') {
        expect(init?.method).toBe('POST');
        expect(String(init?.body)).toContain('grant_type=refresh_token');
        return jsonResponse({ access_token: 'source-access-token', expires_in: 3600 });
      }
      if (url === IMPERSONATION_URL) {
        expect(init?.method).toBe('POST');
        expect(init?.headers).toMatchObject({
          authorization: 'Bearer source-access-token',
          'content-type': 'application/json',
        });
        expect(JSON.parse(String(init?.body))).toEqual({
          scope: ['https://www.googleapis.com/auth/cloud-platform'],
          lifetime: '3600s',
        });
        return jsonResponse({
          accessToken: 'vertex-access-token',
          expireTime: new Date(Date.now() + 3600_000).toISOString(),
        });
      }
      if (url === `https://us-central1-aiplatform.googleapis.com/v1/projects/${PROJECT_ID}/locations/us-central1/publishers/google/models/imagen-4.0-fast-generate-001:predict`) {
        expect(init?.method).toBe('POST');
        expect(init?.headers).toMatchObject({
          authorization: 'Bearer vertex-access-token',
          'content-type': 'application/json',
          'x-goog-user-project': PROJECT_ID,
        });
        expect(JSON.parse(String(init?.body))).toEqual({
          instances: [{ prompt: 'A crisp geometric poster' }],
          parameters: {
            sampleCount: 1,
            aspectRatio: '16:9',
            sampleImageSize: '1K',
            outputOptions: { mimeType: 'image/png' },
          },
        });
        return jsonResponse({ predictions: [{ bytesBase64Encoded: PNG_BASE64 }] });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'project-1',
      surface: 'image',
      model: 'imagen-4',
      prompt: 'A crisp geometric poster',
      aspect: '16:9',
      output: 'vertex.png',
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result.providerId).toBe('google');
    expect(result.providerNote).toContain('google-vertex/imagen-4.0-fast-generate-001');
    const bytes = await readFile(path.join(projectsRoot, 'project-1', 'vertex.png'));
    expect(bytes.length).toBeGreaterThan(0);
  });

  it('loads the upstream-friendly default Open Design Vertex config path', async () => {
    delete process.env.OD_GOOGLE_VERTEX_CONFIG;
    delete process.env.AGENT_SOUL_GOOGLE_VERTEX_CONFIG;
    delete process.env.XDG_CONFIG_HOME;
    process.env.HOME = root;
    const defaultConfigPath = path.join(root, '.config', 'open-design', 'google-vertex-config.json');
    await mkdir(path.dirname(defaultConfigPath), { recursive: true });
    await writeFile(defaultConfigPath, JSON.stringify({
      version: 1,
      enabled: true,
      auth_mode: 'adc',
      project_id: PROJECT_ID,
      image_location: 'us-central1',
    }), 'utf8');
    await writeAdc({
      type: 'authorized_user',
      client_id: 'client-id',
      client_secret: 'client-secret',
      refresh_token: 'refresh-token',
    });

    const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      if (url === 'https://oauth2.googleapis.com/token') {
        expect(init?.method).toBe('POST');
        return jsonResponse({ access_token: 'vertex-access-token', expires_in: 3600 });
      }
      if (url === `https://us-central1-aiplatform.googleapis.com/v1/projects/${PROJECT_ID}/locations/us-central1/publishers/google/models/imagen-3.0-generate-002:predict`) {
        expect(init?.headers).toMatchObject({
          authorization: 'Bearer vertex-access-token',
          'x-goog-user-project': PROJECT_ID,
        });
        return jsonResponse({ predictions: [{ bytesBase64Encoded: PNG_BASE64 }] });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'project-1',
      surface: 'image',
      model: 'imagen-3',
      prompt: 'A clean product poster',
      output: 'vertex-default-path.png',
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.providerNote).toContain('google-vertex/imagen-3.0-generate-002');
  });

  it('derives the Vertex project id from service-account key files', async () => {
    const serviceAccountPath = path.join(root, 'vertex-service-account.json');
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    await writeFile(serviceAccountPath, JSON.stringify({
      type: 'service_account',
      project_id: PROJECT_ID,
      client_email: `vertex-test@${PROJECT_ID}.iam.gserviceaccount.com`,
      private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
      token_uri: 'https://oauth2.googleapis.com/token',
    }), 'utf8');
    await writeVertexConfig({
      version: 1,
      enabled: true,
      auth_mode: 'service_account',
      service_account_key_file: serviceAccountPath,
      image_location: 'us-central1',
    });

    const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      if (url === 'https://oauth2.googleapis.com/token') {
        expect(init?.method).toBe('POST');
        const body = String(init?.body);
        expect(body).toContain('grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer');
        expect(body).toContain('assertion=');
        return jsonResponse({ access_token: 'vertex-service-account-token', expires_in: 3600 });
      }
      if (url === `https://us-central1-aiplatform.googleapis.com/v1/projects/${PROJECT_ID}/locations/us-central1/publishers/google/models/imagen-4.0-fast-generate-001:predict`) {
        expect(init?.headers).toMatchObject({
          authorization: 'Bearer vertex-service-account-token',
          'x-goog-user-project': PROJECT_ID,
        });
        return jsonResponse({ predictions: [{ bytesBase64Encoded: PNG_BASE64 }] });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'project-1',
      surface: 'image',
      model: 'imagen-4',
      prompt: 'A service-account poster',
      output: 'vertex-service-account.png',
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.providerNote).toContain('google-vertex/imagen-4.0-fast-generate-001');
  });

  it('sends reference images as inline data for Vertex Gemini image generation', async () => {
    await writeVertexConfig({
      version: 1,
      enabled: true,
      auth_mode: 'adc',
      project_id: PROJECT_ID,
      text_location: 'global',
    });
    await writeAdc({
      type: 'authorized_user',
      client_id: 'gemini-client-id',
      client_secret: 'gemini-client-secret',
      refresh_token: 'gemini-refresh-token',
    });
    const projectDir = path.join(projectsRoot, 'project-1');
    await mkdir(projectDir, { recursive: true });
    await writeFile(
      path.join(projectDir, 'reference.png'),
      Buffer.from(PNG_BASE64, 'base64'),
    );

    const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      if (url === 'https://oauth2.googleapis.com/token') {
        expect(init?.method).toBe('POST');
        return jsonResponse({ access_token: 'vertex-gemini-token', expires_in: 3600 });
      }
      if (url === `https://aiplatform.googleapis.com/v1/projects/${PROJECT_ID}/locations/global/publishers/google/models/gemini-3-pro-image-preview:generateContent`) {
        expect(init?.method).toBe('POST');
        expect(init?.headers).toMatchObject({
          authorization: 'Bearer vertex-gemini-token',
          'content-type': 'application/json',
          'x-goog-user-project': PROJECT_ID,
        });
        expect(JSON.parse(String(init?.body))).toEqual({
          contents: [{
            role: 'user',
            parts: [
              { text: 'Restyle this reference into a polished landing-page hero' },
              { inlineData: { mimeType: 'image/png', data: PNG_BASE64 } },
            ],
          }],
          generationConfig: { responseModalities: ['IMAGE', 'TEXT'] },
        });
        return jsonResponse({
          candidates: [{
            content: {
              parts: [{ inlineData: { mimeType: 'image/png', data: PNG_BASE64 } }],
            },
          }],
        });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'project-1',
      surface: 'image',
      model: 'gemini-3-pro-image-preview',
      prompt: 'Restyle this reference into a polished landing-page hero',
      image: 'reference.png',
      output: 'vertex-gemini-i2i.png',
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.providerNote).toContain('google-vertex/gemini-3-pro-image-preview · i2i');
    const bytes = await readFile(path.join(projectDir, 'vertex-gemini-i2i.png'));
    expect(bytes.length).toBeGreaterThan(0);
  });

  it('errors clearly when the Vertex config is not enabled', async () => {
    await writeVertexConfig({
      version: 1,
      enabled: false,
      auth_mode: 'adc',
      project_id: PROJECT_ID,
    });
    vi.stubGlobal('fetch', vi.fn());

    await expect(generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'project-1',
      surface: 'image',
      model: 'imagen-4',
      prompt: 'Should fail.',
      output: 'vertex-disabled.png',
    })).rejects.toThrow(/Google Vertex is not configured/);
  });

  it('reports invalid Vertex config JSON instead of treating Vertex as unconfigured', async () => {
    await writeFile(vertexConfigPath, 'NOT VALID CONFIG JSON {{{', 'utf8');
    vi.stubGlobal('fetch', vi.fn());

    await expect(generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'project-1',
      surface: 'image',
      model: 'imagen-4',
      prompt: 'Should fail with config parse error.',
      output: 'vertex-invalid-config.png',
    })).rejects.toThrow(/Google Vertex config file is invalid/);
  });

  it.each([
    'OD_GOOGLE_VERTEX_CONFIG',
    'AGENT_SOUL_GOOGLE_VERTEX_CONFIG',
  ] as const)('fails when explicit %s points at a missing config instead of falling back', async (envName) => {
    delete process.env.OD_GOOGLE_VERTEX_CONFIG;
    delete process.env.AGENT_SOUL_GOOGLE_VERTEX_CONFIG;
    process.env[envName] = path.join(root, `${envName.toLowerCase()}-missing.json`);
    process.env.XDG_CONFIG_HOME = path.join(root, 'xdg-config');
    const defaultConfigPath = path.join(
      process.env.XDG_CONFIG_HOME,
      'open-design',
      'google-vertex-config.json',
    );
    await mkdir(path.dirname(defaultConfigPath), { recursive: true });
    await writeFile(defaultConfigPath, JSON.stringify({
      version: 1,
      enabled: true,
      auth_mode: 'adc',
      project_id: PROJECT_ID,
      image_location: 'us-central1',
    }), 'utf8');
    await writeAdc({
      type: 'authorized_user',
      client_id: 'client-id',
      client_secret: 'client-secret',
      refresh_token: 'refresh-token',
    });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'project-1',
      surface: 'image',
      model: 'imagen-4',
      prompt: 'Should fail with explicit missing config.',
      output: 'vertex-explicit-missing-config.png',
    })).rejects.toThrow(new RegExp(`Google Vertex config file not found for ${envName}`));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports a broken service_account_key_file instead of the generic not-configured message', async () => {
    const brokenKeyPath = path.join(root, 'broken-key.json');
    await writeFile(brokenKeyPath, 'NOT VALID JSON {{{', 'utf8');
    await writeVertexConfig({
      version: 1,
      enabled: true,
      auth_mode: 'service_account',
      project_id: PROJECT_ID,
      service_account_key_file: brokenKeyPath,
    });
    vi.stubGlobal('fetch', vi.fn());

    await expect(generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'project-1',
      surface: 'image',
      model: 'imagen-4',
      prompt: 'Should fail with service account error.',
      output: 'vertex-broken-key.png',
    })).rejects.toThrow(/service account JSON is invalid/);
  });

  it('reports a missing service_account_key_file instead of the generic not-configured message', async () => {
    await writeVertexConfig({
      version: 1,
      enabled: true,
      auth_mode: 'service_account',
      project_id: PROJECT_ID,
      service_account_key_file: '/nonexistent/path/key.json',
    });
    vi.stubGlobal('fetch', vi.fn());

    await expect(generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'project-1',
      surface: 'image',
      model: 'imagen-4',
      prompt: 'Should fail with missing key.',
      output: 'vertex-missing-key.png',
    })).rejects.toThrow(/service account key file not found/);
  });

  it('reports broken service-account credentials while deriving the project id', async () => {
    const brokenKeyPath = path.join(root, 'broken-key-no-project.json');
    await writeFile(brokenKeyPath, '{not-json', 'utf8');
    await writeVertexConfig({
      version: 1,
      enabled: true,
      auth_mode: 'service_account',
      // No project_id: readiness must inspect the key and surface parse errors.
      service_account_key_file: brokenKeyPath,
    });
    vi.stubGlobal('fetch', vi.fn());

    await expect(generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'project-1',
      surface: 'image',
      model: 'imagen-4',
      prompt: 'Should fail with service account parse error.',
      output: 'vertex-broken-key-no-project.png',
    })).rejects.toThrow(/service account JSON is invalid/);
  });

  it('reports invalid ADC credentials while deriving the project id', async () => {
    await writeVertexConfig({
      version: 1,
      enabled: true,
      auth_mode: 'adc',
      image_location: 'us-central1',
    });
    await writeFile(adcPath, 'NOT VALID ADC JSON {{{', 'utf8');
    vi.stubGlobal('fetch', vi.fn());

    await expect(generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'project-1',
      surface: 'image',
      model: 'imagen-4',
      prompt: 'Should fail with ADC parse error.',
      output: 'vertex-broken-adc.png',
    })).rejects.toThrow(/Google ADC file is invalid/);
  });

  it('reports missing ADC credentials while deriving the project id', async () => {
    await writeVertexConfig({
      version: 1,
      enabled: true,
      auth_mode: 'adc',
      image_location: 'us-central1',
    });
    vi.stubGlobal('fetch', vi.fn());

    await expect(generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'project-1',
      surface: 'image',
      model: 'imagen-4',
      prompt: 'Should fail with missing ADC file.',
      output: 'vertex-missing-adc.png',
    })).rejects.toThrow(/Google ADC file not found/);
  });

  it('reports missing project_id when service_account is configured but project_id is absent', async () => {
    await writeVertexConfig({
      version: 1,
      enabled: true,
      auth_mode: 'service_account',
      // No project_id
      service_account_json: JSON.stringify({ client_email: 'a@b.iam', private_key: 'key' }),
    });
    delete process.env.GOOGLE_CLOUD_PROJECT;
    delete process.env.GCLOUD_PROJECT;
    delete process.env.GCP_PROJECT;
    vi.stubGlobal('fetch', vi.fn());

    await expect(generateMedia({
      projectRoot,
      projectsRoot,
      projectId: 'project-1',
      surface: 'image',
      model: 'imagen-4',
      prompt: 'Should fail with project id error.',
      output: 'vertex-no-project.png',
    })).rejects.toThrow(/project id is missing/);
  });
});

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function restoreEnv(name: string, value: string | undefined) {
  if (value == null) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}
