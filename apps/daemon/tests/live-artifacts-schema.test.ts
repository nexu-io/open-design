import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  validateBoundedJsonObject,
  validateLiveArtifactCreateInput,
  validatePersistedLiveArtifact,
} from '../src/live-artifacts/schema.js';

const here = dirname(fileURLToPath(import.meta.url));
const examplesDir = join(here, '../../../specs/2026-04-29-live-artifacts/examples');

const forbiddenJsonKeys = [
  'raw',
  'rawResponse',
  'payload',
  'body',
  'headers',
  'cookie',
  'authorization',
  'token',
  'secret',
  'credential',
  'password',
] as const;

function readJsonFixture(exampleName: string, fileName: string): unknown {
  return JSON.parse(readFileSync(join(examplesDir, exampleName, fileName), 'utf8'));
}

function validCreateInput() {
  return {
    title: 'Fixture artifact',
    preview: {
      type: 'html',
      entry: 'index.html',
    },
    document: {
      format: 'html_template_v1',
      templatePath: 'template.html',
      generatedPreviewPath: 'index.html',
      dataPath: 'data.json',
      dataJson: {
        title: 'Fixture artifact',
      },
    },
  };
}

describe('live artifact schema validation', () => {
  it.each(forbiddenJsonKeys)('rejects forbidden bounded JSON key %s', (key) => {
    const result = validateBoundedJsonObject({ safe: { [key]: 'must not persist' } }, 'data');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.some((issue) => issue.path === `data.safe.${key}`)).toBe(true);
  });

  it('rejects invalid fixture artifacts with raw provider or credential-like fields', () => {
    const rawFields = validateLiveArtifactCreateInput(readJsonFixture('invalid-forbidden-raw-fields', 'artifact.json'));
    const credentials = validateLiveArtifactCreateInput(readJsonFixture('invalid-credential-like-fields', 'artifact.json'));

    expect(rawFields.ok).toBe(false);
    if (!rawFields.ok) {
      expect(rawFields.issues.map((issue) => issue.path)).toEqual(
        expect.arrayContaining(['input.document.dataJson.rawResponse', 'input.document.dataJson.rawResponse.payload']),
      );
    }
    expect(credentials.ok).toBe(false);
    if (!credentials.ok) {
      expect(credentials.issues.map((issue) => issue.path)).toEqual(
        expect.arrayContaining(['input.document.sourceJson.input.token', 'input.document.sourceJson.input.password']),
      );
    }
  });

  it('rejects path traversal and absolute paths in preview, sources, and provenance refs', () => {
    const previewTraversal = validateLiveArtifactCreateInput({
      ...validCreateInput(),
      preview: { type: 'html', entry: '../index.html' },
    });
    const sourceTraversal = validateLiveArtifactCreateInput({
      ...validCreateInput(),
      document: {
        ...validCreateInput().document,
        sourceJson: {
          type: 'local_file',
          toolName: 'project_files.read_json',
          input: { path: 'reports/../../secrets.json' },
          refreshPermission: 'none',
        },
      },
    });
    const sourceAbsolutePath = validateLiveArtifactCreateInput({
      ...validCreateInput(),
      document: {
        ...validCreateInput().document,
        sourceJson: {
          type: 'local_file',
          toolName: 'project_files.read_json',
          input: { file: '/etc/passwd' },
          refreshPermission: 'none',
        },
      },
    });
    const sourceWindowsAbsolutePath = validateLiveArtifactCreateInput({
      ...validCreateInput(),
      document: {
        ...validCreateInput().document,
        sourceJson: {
          type: 'local_file',
          toolName: 'project_files.read_json',
          input: { file: 'C:\\Users\\secrets.json' },
          refreshPermission: 'none',
        },
      },
    });
    const sourceBackslashAbsolutePath = validateLiveArtifactCreateInput({
      ...validCreateInput(),
      document: {
        ...validCreateInput().document,
        sourceJson: {
          type: 'local_file',
          toolName: 'project_files.read_json',
          input: { file: '\\etc\\passwd' },
          refreshPermission: 'none',
        },
      },
    });
    for (const result of [
      previewTraversal,
      sourceTraversal,
      sourceAbsolutePath,
      sourceWindowsAbsolutePath,
      sourceBackslashAbsolutePath,
    ]) {
      expect(result.ok).toBe(false);
    }
  });

  it('persists only connector references and rejects credential material in connector metadata', () => {
    const result = validateLiveArtifactCreateInput({
      ...validCreateInput(),
      document: {
        ...validCreateInput().document,
        sourceJson: {
          type: 'connector_tool',
          toolName: 'docs.search',
          input: { query: 'launch' },
          connector: {
            connectorId: 'docs',
            accountLabel: 'docs@example.com',
            toolName: 'docs.search',
            approvalPolicy: 'manual_refresh_granted_for_read_only',
            accessToken: 'oauth-secret-token',
            headers: { authorization: 'Bearer oauth-secret-token' },
          },
          oauthState: 'state-that-must-not-persist',
          refreshPermission: 'manual_refresh_granted_for_read_only',
        },
      },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.map((issue) => issue.path)).toEqual(expect.arrayContaining([
        'input.document.sourceJson.connector.accessToken',
        'input.document.sourceJson.connector.headers',
        'input.document.sourceJson.oauthState',
      ]));
    }
  });

  it('requires connector metadata for connector_tool sources', () => {
    const result = validateLiveArtifactCreateInput({
      ...validCreateInput(),
      document: {
        ...validCreateInput().document,
        sourceJson: {
          type: 'connector_tool',
          toolName: 'docs.search',
          input: { query: 'launch' },
          refreshPermission: 'manual_refresh_granted_for_read_only',
        },
      },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues).toEqual(expect.arrayContaining([
        expect.objectContaining({ path: 'input.document.sourceJson.connector' }),
      ]));
    }
  });

  it('does not require connector approval metadata for connector_tool sources', () => {
    const result = validateLiveArtifactCreateInput({
      ...validCreateInput(),
      document: {
        ...validCreateInput().document,
        sourceJson: {
          type: 'connector_tool',
          toolName: 'docs.search',
          input: { query: 'launch' },
          connector: {
            connectorId: 'docs',
            toolName: 'docs.search',
          },
          refreshPermission: 'none',
        },
      },
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.document?.sourceJson?.connector).toEqual({ connectorId: 'docs', toolName: 'docs.search' });
  });

  it('requires connector source tool name to match connector metadata', () => {
    const result = validateLiveArtifactCreateInput({
      ...validCreateInput(),
      document: {
        ...validCreateInput().document,
        sourceJson: {
          type: 'connector_tool',
          toolName: 'docs.search',
          input: { query: 'launch' },
          connector: {
            connectorId: 'docs',
            toolName: 'docs.lookup',
            approvalPolicy: 'read_only_auto',
          },
          refreshPermission: 'manual_refresh_granted_for_read_only',
        },
      },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues).toEqual(expect.arrayContaining([
        expect.objectContaining({ path: 'input.document.sourceJson.toolName' }),
      ]));
    }
  });

  it('requires toolName for daemon_tool sources', () => {
    const result = validateLiveArtifactCreateInput({
      ...validCreateInput(),
      document: {
        ...validCreateInput().document,
        sourceJson: {
          type: 'daemon_tool',
          input: { query: 'launch' },
          refreshPermission: 'none',
        },
      },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues).toEqual(expect.arrayContaining([
        expect.objectContaining({
          path: 'input.document.sourceJson.toolName',
          message: 'input.document.sourceJson.toolName is required for daemon_tool sources',
        }),
      ]));
    }
  });

  it('rejects oversized bounded JSON payloads', () => {
    const oversized = Object.fromEntries(Array.from({ length: 100 }, (_, index) => [`field${index}`, 'x'.repeat(3_000)]));
    const result = validateBoundedJsonObject(oversized, 'data');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.some((issue) => issue.message.includes('max serialized size'))).toBe(true);
  });

  it.each(['minimal-static'])('accepts valid fixture artifact %s', (exampleName) => {
    const artifact = readJsonFixture(exampleName, 'artifact.json');
    const data = readJsonFixture(exampleName, 'data.json');

    expect(validatePersistedLiveArtifact(artifact).ok).toBe(true);
    expect(validateBoundedJsonObject(data).ok).toBe(true);
  });
});
