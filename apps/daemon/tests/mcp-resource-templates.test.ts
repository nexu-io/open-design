import { describe, expect, it } from 'vitest';
import { ListResourceTemplatesRequestSchema } from '@modelcontextprotocol/sdk/types.js';

import { _listMcpResourceTemplates } from '../src/mcp.js';

/**
 * #7014 — when capabilities.resources is advertised, clients call
 * resources/templates/list. The handler must exist and may return an
 * empty page when OD has no URI templates.
 */
describe('MCP resources/templates/list (#7014)', () => {
  it('ListResourceTemplatesRequestSchema targets resources/templates/list', () => {
    const parsed = ListResourceTemplatesRequestSchema.parse({
      method: 'resources/templates/list',
      params: {},
    });
    expect(parsed.method).toBe('resources/templates/list');
  });

  it('returns an empty resourceTemplates page', async () => {
    await expect(_listMcpResourceTemplates()).resolves.toEqual({
      resourceTemplates: [],
    });
  });
});
