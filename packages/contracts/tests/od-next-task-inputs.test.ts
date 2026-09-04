import { describe, expect, it } from 'vitest';
import {
  OD_NEXT_REQUEST_INPUT_FACTS_SCHEMA_V1,
  OD_NEXT_TASK_CONFIGURATION_SCHEMA_V1,
  serializeOdNextRequestInputFactsV1,
  serializeOdNextTaskConfigurationV1,
  serializeOdNextWorkspaceInputFactsV1,
  type OdNextProductionTaskTypeV1,
  type OdNextRequestInputFactsV1,
} from '../src/index.js';

function requestInputFacts(
  overrides: Partial<OdNextRequestInputFactsV1> = {},
): OdNextRequestInputFactsV1 {
  return {
    schema: OD_NEXT_REQUEST_INPUT_FACTS_SCHEMA_V1,
    attachmentTransport: {
      scheme: 'task-input',
      rootEnvironmentVariable: 'OD_TASK_INPUT_DIR',
      access: 'out_of_band',
    },
    attachments: [],
    comments: { count: 0 },
    workspace: {
      project: { reference: 'workspace:project', access: 'out_of_band' },
      linkedDirectories: [],
    },
    mcp: { serverCount: 0, registration: 'out_of_band' },
    ...overrides,
  };
}

describe('OD Next task input facts', () => {
  it.each<OdNextProductionTaskTypeV1>([
    'prototype',
    'ppt',
    'marketing',
    'hyperframes',
  ])('canonically encodes the %s task configuration', (taskType) => {
    const serialized = serializeOdNextTaskConfigurationV1({
      schema: OD_NEXT_TASK_CONFIGURATION_SCHEMA_V1,
      taskType,
      locale: 'zh-CN',
      selectedAgentId: 'codex',
      route: 'full_plan',
      mode: 'unresolved',
      configuration: {
        sessionMode: 'design',
        mediaExecution: { mode: 'enabled', allowedSurfaces: ['image'] },
      },
    });
    expect(serialized).toBe(serializeOdNextTaskConfigurationV1(JSON.parse(serialized)));
    expect(serialized).toContain(`"taskType":"${taskType}"`);
    expect(serialized).not.toContain('/Users/');
  });

  it('keeps only logical transport references and immutable attachment facts', () => {
    const serialized = serializeOdNextRequestInputFactsV1({
      schema: OD_NEXT_REQUEST_INPUT_FACTS_SCHEMA_V1,
      attachmentTransport: {
        scheme: 'task-input',
        rootEnvironmentVariable: 'OD_TASK_INPUT_DIR',
        access: 'out_of_band',
      },
      attachments: [{
        id: 'attachment-001',
        order: 1,
        kind: 'image',
        reference: 'task-input:attachments/attachment-001.png',
        mediaType: 'image/png',
        bytes: 8,
        sha256: 'a'.repeat(64),
      }],
      comments: { count: 0 },
      workspace: {
        project: { reference: 'workspace:project', access: 'out_of_band' },
        linkedDirectories: [{ reference: 'linked-dir:1', access: 'out_of_band' }],
      },
      mcp: { serverCount: 1, registration: 'out_of_band' },
    });
    expect(serialized).toContain('task-input:attachments/attachment-001.png');
    expect(serialized).toContain('OD_TASK_INPUT_DIR');
    expect(serialized).toContain('linked-dir:1');
    expect(serialized).not.toContain('oauth');
    expect(serialized).not.toContain('/private/');
  });

  it('omits the workspace input facts slot when no input fact is substantive', () => {
    // The all-empty state serialized to ~300 bytes of zeroes and empty arrays
    // in the real bundle: pure noise the model cannot act on.
    expect(serializeOdNextWorkspaceInputFactsV1(requestInputFacts())).toBe('');
  });

  it.each<[string, Partial<OdNextRequestInputFactsV1>]>([
    ['a comment', { comments: { count: 1 } }],
    ['an MCP server', { mcp: { serverCount: 1, registration: 'out_of_band' } }],
    ['a linked directory', {
      workspace: {
        project: { reference: 'workspace:project', access: 'out_of_band' },
        linkedDirectories: [{ reference: 'linked-dir:1', access: 'out_of_band' }],
      },
    }],
    ['an attachment', {
      attachments: [{
        id: 'attachment-001',
        order: 1,
        kind: 'file',
        reference: 'task-input:attachments/attachment-001.txt',
        mediaType: 'text/plain',
        bytes: 4,
        sha256: 'b'.repeat(64),
      }],
    }],
  ])('still emits the workspace input facts slot when the request carries %s', (_label, overrides) => {
    const serialized = serializeOdNextWorkspaceInputFactsV1(requestInputFacts(overrides));
    expect(serialized).not.toBe('');
    expect(serialized).toContain(OD_NEXT_REQUEST_INPUT_FACTS_SCHEMA_V1);
  });
});
