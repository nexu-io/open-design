// @ts-nocheck
import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'vitest';
import { buildAcpSessionNewParams } from '../src/acp.js';

test('ACP session params do not require MCP servers by default', () => {
  assert.deepEqual(buildAcpSessionNewParams('/tmp/od-project'), {
    cwd: path.resolve('/tmp/od-project'),
    mcpServers: [],
  });
});

test('ACP session params do not request global MCP config mutation', () => {
  const params = buildAcpSessionNewParams('/tmp/od-project');

  assert.equal('mcpConfigPath' in params, false);
  assert.equal('writeMcpConfig' in params, false);
  assert.equal('installMcpServers' in params, false);
});

test('ACP session params accept explicit MCP servers as optional configuration', () => {
  const mcpServers = [{ name: 'open-design-live-artifacts', command: 'od', args: ['mcp', 'live-artifacts'] }];

  assert.deepEqual(buildAcpSessionNewParams('/tmp/od-project', { mcpServers }), {
    cwd: path.resolve('/tmp/od-project'),
    mcpServers,
  });
});
