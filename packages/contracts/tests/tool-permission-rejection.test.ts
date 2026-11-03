import { describe, expect, it } from 'vitest';
import {
  readToolPermissionRejection,
  toolPermissionRejectionMessage,
  TOOL_PERMISSION_REJECTED_MARKER,
} from '../src/runtime/tool-permission-rejection';

describe('tool permission rejection sentence', () => {
  it('carries the marker the failure classifier keys on', () => {
    expect(toolPermissionRejectionMessage({ tool: 'read', target: '/tmp/a.md' }))
      .toContain(TOOL_PERMISSION_REJECTED_MARKER);
  });

  it.each([
    ['/Users/qa/Desktop/notes.md'],
    ['C:\\Users\\QA User\\Documents\\brief on launch.md'],
    ['/Users/qa/My Files/was blocked/plan.md'],
  ])('reads the full target %s back out', (target) => {
    const text = toolPermissionRejectionMessage({ tool: 'read', target });
    expect(readToolPermissionRejection(text)).toEqual({ tool: 'read', target });
  });

  it('reads a call that carried no target', () => {
    const text = toolPermissionRejectionMessage({ tool: 'bash', target: null });
    expect(readToolPermissionRejection(text)).toEqual({ tool: 'bash', target: null });
  });

  it('returns null for any other failure text', () => {
    expect(readToolPermissionRejection('json-rpc id 4: Invalid params')).toBeNull();
    expect(readToolPermissionRejection(null)).toBeNull();
  });
});
