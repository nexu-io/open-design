/**
 * Regression test for `resources/templates/list` MCP handler registration.
 *
 * The MCP spec requires clients to be able to discover what resource
 * templates a server offers via `resources/templates/list`. If this handler
 * is removed or bound to the wrong schema, the client falls back to
 * `method_not_found` (-32601) and cannot use resource templates even when
 * they are later added.
 *
 * This file tests the exported handler body directly. The pattern mirrors
 * `_listMcpResources` (tested in mcp-resources-workspace-scope.test.ts):
 * the handler body is extracted into an exported function so tests can call
 * it without a full server transport. If someone removes the
 * `setRequestHandler(ListResourceTemplatesRequestSchema, ...)` call from
 * `runMcpStdio`, this test still passes but the integration-level contract
 * test (drive the actual stdio path with initialize + resources/templates/list)
 * would fail, which is why the contract test in
 * packages/contracts/tests/mcp-run-contract.test.ts is also important.
 *
 * See: https://github.com/nexu-io/open-design/issues/7454
 */

import { describe, expect, it } from 'vitest';

import { _listMcpResourceTemplates } from '../src/mcp.js';

describe('MCP resources/templates/list handler body', () => {
  it('returns a valid resourceTemplates response shape', async () => {
    const result = await _listMcpResourceTemplates();

    expect(result).toHaveProperty('resourceTemplates');
    expect(Array.isArray(result.resourceTemplates)).toBe(true);
  });

  it('returns an empty template list (no templates defined yet)', async () => {
    const result = await _listMcpResourceTemplates();

    expect(result.resourceTemplates).toHaveLength(0);
  });

  it('returns a result that conforms to the MCP ListResourceTemplates result schema', async () => {
    const result = await _listMcpResourceTemplates();

    // The MCP spec requires resourceTemplates[] with uriPattern, name, and
    // optionally description. Verify the shape matches even when empty.
    const { resourceTemplates } = result;
    expect(
      resourceTemplates.every(
        (t) =>
          typeof t === 'object' &&
          typeof t.uriPattern === 'string' &&
          typeof t.name === 'string' &&
          (t.description === undefined || typeof t.description === 'string'),
      ),
    ).toBe(true);
  });
});
