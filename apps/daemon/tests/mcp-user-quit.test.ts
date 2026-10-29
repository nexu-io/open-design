import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ensureMcpDaemonUrl } from '../src/mcp-bootstrap.js';
import { createMcpDaemonTarget, _readMcpResource, OPEN_DESIGN_BRIEF_APP_RESOURCE } from '../src/mcp.js';
import { assertMcpNotUserQuit, isMcpUserQuitError, McpUserQuitError } from '../src/mcp-user-quit.js';

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });
async function quitRoot(quitAtMs = Date.now()) {
  const root = await mkdtemp(join(tmpdir(), 'od-mcp-quit-'));
  roots.push(root);
  await writeFile(join(root, 'mcp-user-quit.json'), JSON.stringify({ schemaVersion: 1, quitAtMs }));
  return root;
}

describe('MCP explicit user quit', () => {
  it('recognizes bundled copies by error code', () => {
    expect(isMcpUserQuitError({ code: new McpUserQuitError().code })).toBe(true);
    expect(isMcpUserQuitError(new Error('unavailable'))).toBe(false);
  });
  it('reads only the explicit data root and tolerates missing or invalid records', async () => {
    await expect(assertMcpNotUserQuit({})).resolves.toBeUndefined();
    const root = await quitRoot();
    await expect(assertMcpNotUserQuit({ OD_DATA_DIR: root })).rejects.toThrow(/manually/i);
    await writeFile(join(root, 'mcp-user-quit.json'), '{invalid');
    await expect(assertMcpNotUserQuit({ OD_DATA_DIR: root })).resolves.toBeUndefined();
  });
  it('suppresses bootstrap before discovery, while explicit targets stay usable', async () => {
    const root = await quitRoot();
    const resolveDaemonUrl = vi.fn(async () => 'http://remote.example');
    const spawnBootstrap = vi.fn(async () => undefined);
    await expect(ensureMcpDaemonUrl({ env: { OD_DATA_DIR: root }, resolveDaemonUrl, spawnBootstrap })).rejects.toThrow(/manually/i);
    expect(resolveDaemonUrl).not.toHaveBeenCalled();
    expect(spawnBootstrap).not.toHaveBeenCalled();
    await expect(ensureMcpDaemonUrl({ env: { OD_DATA_DIR: root }, flagUrl: 'http://remote.example', resolveDaemonUrl, probeDaemon: async () => true })).resolves.toBe('http://remote.example');
  });
  it('rechecks user quit after discovery before launching a runtime', async () => {
    const root = await quitRoot(1);
    const spawnBootstrap = vi.fn(async () => undefined);
    await expect(ensureMcpDaemonUrl({
      env: { OD_DATA_DIR: root, OD_MCP_BOOTSTRAP_COMMAND: '/usr/bin/open', OD_MCP_BOOTSTRAP_ARGS: '["--headless"]' },
      connectInherited: (() => ({})) as never,
      discoverTargetDaemonUrl: async () => {
        await writeFile(join(root, 'mcp-user-quit.json'), JSON.stringify({ schemaVersion: 1, quitAtMs: Date.now() }));
        return null;
      },
      spawnBootstrap,
      timeoutMs: 30,
    })).rejects.toThrow(/manually/i);
    expect(spawnBootstrap).not.toHaveBeenCalled();
  });
  it('aborts bootstrap polling promptly if the user quits', async () => {
    const root = await quitRoot(1);
    const discoverTargetDaemonUrl = vi.fn(async () => null);
    await expect(ensureMcpDaemonUrl({
      env: { OD_DATA_DIR: root, OD_MCP_BOOTSTRAP_COMMAND: '/usr/bin/open', OD_MCP_BOOTSTRAP_ARGS: '["--headless"]' },
      connectInherited: (() => ({})) as never,
      discoverTargetDaemonUrl,
      spawnBootstrap: async () => undefined,
      timeoutMs: 30,
      sleep: async () => { await writeFile(join(root, 'mcp-user-quit.json'), JSON.stringify({ schemaVersion: 1, quitAtMs: Date.now() })); },
    })).rejects.toThrow(/manually/i);
    expect(discoverTargetDaemonUrl).toHaveBeenCalledTimes(1);
  });
  it('stops managed owner polling when the user quits without launching another app', async () => {
    const root = await quitRoot(1);
    const spawnBootstrap = vi.fn(async () => undefined);
    await expect(ensureMcpDaemonUrl({
      env: {
        OD_DATA_DIR: root,
        OD_MCP_BOOTSTRAP_COMMAND: '/usr/bin/open',
        OD_MCP_BOOTSTRAP_ARGS: '["--headless","--od-mcp-managed"]',
        OD_MCP_DISCOVERY: JSON.stringify({ daemon: ['/daemon'], desktop: ['/desktop'] }),
      },
      statusAtEndpoint: (async (_endpoint: string, app: string) => app === 'desktop' ? { state: 'running' } : null) as never,
      spawnBootstrap,
      timeoutMs: 30,
      sleep: async () => { await writeFile(join(root, 'mcp-user-quit.json'), JSON.stringify({ schemaVersion: 1, quitAtMs: Date.now() })); },
    })).rejects.toThrow(/manually/i);
    expect(spawnBootstrap).not.toHaveBeenCalled();
  });
  it('returns actionable resource errors while preserving the local resource', async () => {
    const target = createMcpDaemonTarget({ resolveDaemonUrl: async () => { throw new McpUserQuitError(); } });
    await expect(_readMcpResource(target, 'od://focus/active')).rejects.toThrow(/manually/i);
    expect((await _readMcpResource(target, OPEN_DESIGN_BRIEF_APP_RESOURCE)).contents.length).toBeGreaterThan(0);
  });
  it('keeps a disconnected target usable after a manual app launch', async () => {
    const resolveDaemonUrl = vi.fn<() => Promise<string>>()
      .mockRejectedValueOnce(new McpUserQuitError())
      .mockResolvedValueOnce('http://127.0.0.1:62002');
    const target = createMcpDaemonTarget({ resolveDaemonUrl });
    const handler = vi.fn(async () => ({ content: [{ type: 'text' as const, text: 'ready' }] }));
    const stopped = await target.call('get_project', {}, handler);
    expect(stopped.isError).toBe(true);
    expect(stopped.content[0]?.text).toMatch(/manually/i);
    expect(handler).not.toHaveBeenCalled();
    expect((await target.call('get_project', {}, handler)).isError).not.toBe(true);
    expect(handler).toHaveBeenCalledWith('http://127.0.0.1:62002');
  });
  it('preserves an ambiguous mutation outcome when quit interrupts a request', async () => {
    const resolveDaemonUrl = vi.fn<() => Promise<string>>()
      .mockResolvedValueOnce('http://127.0.0.1:62001')
      .mockRejectedValueOnce(new McpUserQuitError());
    const target = createMcpDaemonTarget({ daemonUrl: 'http://127.0.0.1:62001', resolveDaemonUrl });
    const handler = vi.fn(async () => ({ isError: true, content: [{ type: 'text' as const, text: 'cannot reach the OpenDesign daemon' }] }));
    const result = await target.call('create_project', {}, handler);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(result.content.map((part) => part.text).join(' ')).toMatch(/may or may not have been applied/);
    expect(result.content.map((part) => part.text).join(' ')).toMatch(/manually/i);
  });
});
