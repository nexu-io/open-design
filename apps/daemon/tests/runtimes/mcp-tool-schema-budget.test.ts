import { chmod, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { measureOpenCodeMcpToolSchemaBytes } from '../../src/runtimes/mcp-tool-schema-budget.js';

const directories: string[] = [];
afterEach(async () => {
  for (const dir of directories.splice(0)) await rm(dir, { recursive: true, force: true });
});

async function fixture(config: unknown) {
  const dir = await mkdtemp(join(tmpdir(), 'od-config-probe-'));
  directories.push(dir);
  const configFile = join(dir, 'resolved.json');
  const capture = join(dir, 'invocation.json');
  const runner = join(dir, 'cli.cjs');
  const command = join(dir, process.platform === 'win32' ? 'opencode.cmd' : 'opencode');
  const script = `
const fs = require('node:fs');
fs.writeFileSync(${JSON.stringify(capture)}, JSON.stringify({args: process.argv.slice(2), cwd: process.cwd(), home: process.env.HOME}));
process.stdout.write(fs.readFileSync(${JSON.stringify(configFile)}, 'utf8'));
`;
  await writeFile(configFile, JSON.stringify(config));
  if (process.platform === 'win32') {
    await writeFile(runner, script);
    await writeFile(command, `@echo off\r\n"${process.execPath}" "${runner}" %*\r\n`);
  } else {
    await writeFile(command, `#!${process.execPath}\n${script}`);
    await chmod(command, 0o755);
  }
  const invocation = { command, cwd: dir, env: { ...process.env, HOME: dir } };
  return { dir, configFile, capture, invocation };
}

async function mcpServer(dir: string, options: { paginate?: boolean; expectHome?: string } = {}) {
  const script = join(dir, 'mcp.cjs');
  await writeFile(script, `
const readline = require('node:readline');
const send = (id, result) => process.stdout.write(JSON.stringify({jsonrpc:'2.0', id, result}) + '\\n');
readline.createInterface({ input: process.stdin }).on('line', line => {
  const msg = JSON.parse(line);
  if (msg.id === undefined) return;
  if (msg.method === 'initialize') return send(msg.id, { protocolVersion:'2024-11-05', capabilities:{tools:{}}, serverInfo:{name:'fixture',version:'1'} });
  if (msg.method !== 'tools/list') return;
  ${options.expectHome ? `if (process.env.HOME !== ${JSON.stringify(options.expectHome)}) return;` : ''}
  if (${Boolean(options.paginate)} && !msg.params?.cursor) return send(msg.id, {tools:[], nextCursor:'page2'});
  send(msg.id, {tools:[{name:'tool', description:'x'.repeat(400000), inputSchema:{type:'object'}}]});
});`);
  return { type: 'local', command: [process.execPath, script], enabled: true };
}

describe('OpenCode resolved-config preflight', () => {
  it('asks the selected CLI for config using the exact child environment and cwd', async () => {
    const f = await fixture({});
    expect(await measureOpenCodeMcpToolSchemaBytes(f.invocation)).toEqual({ bytes: 0, toolCount: 0 });
    expect(JSON.parse(await readFile(f.capture, 'utf8'))).toEqual({
      args: ['debug', 'config'], cwd: await realpath(f.dir), home: f.dir,
    });
  });

  it('measures a managed server returned by the runtime, regardless of file locations', async () => {
    const f = await fixture({});
    const server = await mcpServer(f.dir);
    await writeFile(f.configFile, JSON.stringify({ mcp: { 'enterprise-managed': server } }));
    const result = await measureOpenCodeMcpToolSchemaBytes(f.invocation);
    expect(result.bytes).toBeGreaterThan(400_000);
    expect(result.toolCount).toBe(1);
  });

  it('passes the same sandbox environment to the MCP command and includes paginated tools', async () => {
    const f = await fixture({});
    const server = await mcpServer(f.dir, { paginate: true, expectHome: f.dir });
    await writeFile(f.configFile, JSON.stringify({ mcp: { sandbox: server } }));
    const result = await measureOpenCodeMcpToolSchemaBytes(f.invocation);
    expect(result.bytes).toBeGreaterThan(400_000);
    expect(result.toolCount).toBe(1);
  });

  it('does not reuse stale schemas across two config resolutions', async () => {
    const f = await fixture({});
    const server = await mcpServer(f.dir);
    expect((await measureOpenCodeMcpToolSchemaBytes(f.invocation)).bytes).toBe(0);
    await writeFile(f.configFile, JSON.stringify({ mcp: { added: server } }));
    expect((await measureOpenCodeMcpToolSchemaBytes(f.invocation)).bytes).toBeGreaterThan(400_000);
  });

  it('honors a disabled entry in the runtime-resolved configuration', async () => {
    const f = await fixture({mcp: {disabled: {enabled: false}}});
    expect(await measureOpenCodeMcpToolSchemaBytes(f.invocation)).toEqual({ bytes: 0, toolCount: 0 });
  });

  it('fails closed on an invalid config response without leaking its contents', async () => {
    const f = await fixture({mcp: {broken: {headers: {authorization: 'secret-marker'}}}});
    await expect(measureOpenCodeMcpToolSchemaBytes(f.invocation)).rejects.toThrow('Could not resolve');
    await writeFile(f.configFile, 'secret-marker');
    await expect(measureOpenCodeMcpToolSchemaBytes(f.invocation)).rejects.not.toThrow('secret-marker');
  });

  it('closes an SSE startup that never announces its endpoint at the deadline', async () => {
    let announceRequest = () => {};
    const request = new Promise<void>(resolve => { announceRequest = resolve; });
    const server = createServer((_req, response) => {
      response.writeHead(200, { 'content-type': 'text/event-stream' });
      response.flushHeaders();
      announceRequest();
      // Deliberately withhold the endpoint event: transport.start stays pending.
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing HTTP address');
    const f = await fixture({ mcp: { stalled: {type:'remote',url:`http://127.0.0.1:${address.port}/sse`} } });
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      let rejected = false;
      const result = measureOpenCodeMcpToolSchemaBytes(f.invocation, {serverTimeoutMs:100});
      void result.catch(() => { rejected = true; });
      await request;
      await vi.advanceTimersByTimeAsync(99);
      expect(rejected).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      expect(rejected).toBe(true);
      await expect(result).rejects.toThrow('Could not measure');
    } finally {
      vi.useRealTimers();
      server.closeAllConnections();
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
  });

  it('refuses an unavailable server instead of treating it as zero tool bytes', async () => {
    const f = await fixture({mcp: {broken: {type:'local',command:['missing-od-test-server']}}});
    await expect(measureOpenCodeMcpToolSchemaBytes(f.invocation)).rejects.toThrow('Could not measure');
  });
});
