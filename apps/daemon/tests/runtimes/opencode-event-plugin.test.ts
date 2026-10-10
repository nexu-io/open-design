import { mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';
import { applyOpenCodeEventPlugin, OPEN_CODE_EVENT_PLUGIN_SOURCE, supportsOpenCodeEventPlugin } from '../../src/runtimes/opencode-event-plugin.js';
import { createJsonEventStreamHandler } from '../../src/runtimes/json-event-stream.js';

type Frame = Record<string, unknown>;
function parser() {
  const events: Frame[] = [];
  const handler = createJsonEventStreamHandler('opencode', event => events.push(event));
  const feed = (event: Frame) => handler.feed(`${JSON.stringify(event)}\n`);
  feed({ type: 'step_start', sessionID: 'root' });
  const preview = (extra: Frame = {}) => feed({ type: 'od_opencode_tool', version: 1, sessionID: 'root', callID: 'call', tool: 'write', ...extra });
  return { events, handler, feed, preview };
}

test('stages a dependency-free plugin atomically and preserves both config plugin lists', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'od-opencode-plugin-'));
  try {
    const env = { OPENCODE_CONFIG_CONTENT: JSON.stringify({ mcp: { local: { enabled: true } }, plugin: ['overlay-plugin'] }) };
    await Promise.all(Array.from({ length: 4 }, () => applyOpenCodeEventPlugin(env, root, '1.18.30', JSON.stringify({ plugin: ['user-plugin', 'overlay-plugin'] }))));
    const config = JSON.parse(env.OPENCODE_CONFIG_CONTENT);
    expect(config.mcp).toEqual({ local: { enabled: true } });
    expect(config.plugin).toHaveLength(3);
    expect(config.plugin.slice(0, 2)).toEqual(['user-plugin', 'overlay-plugin']);
    const file = fileURLToPath(config.plugin[2]);
    expect(file.startsWith(root + path.sep)).toBe(true);
    expect(await readFile(file, 'utf8')).toBe(OPEN_CODE_EVENT_PLUGIN_SOURCE);
    expect(await readdir(path.dirname(file))).toEqual([path.basename(file)]);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test.each(['1.17.17', '1.16.0', '1.18.0-dev', '2.0.0', 'unknown', undefined])('unverified version %s leaves config and disk untouched', async version => {
  const env = { OPENCODE_CONFIG_CONTENT: '{"plugin":["user"]}' };
  expect(await applyOpenCodeEventPlugin(env, '/not-a-staging-directory', version)).toBe(false);
  expect(env.OPENCODE_CONFIG_CONTENT).toBe('{"plugin":["user"]}');
});

test('supported floor and pure mode are explicit', async () => {
  expect(supportsOpenCodeEventPlugin('1.17.18')).toBe(true);
  expect(supportsOpenCodeEventPlugin('1.18.30')).toBe(true);
  expect(await applyOpenCodeEventPlugin({ OPENCODE_PURE: 'true' }, '/not-a-staging-directory', '1.18.30')).toBe(false);
  expect(await applyOpenCodeEventPlugin({ OPENCODE_CONFIG_CONTENT: '{"plugin":42}' }, '/not-a-staging-directory', '1.18.30')).toBe(false);
});

test('reuses an intact module and repairs corrupted content before the next launch', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'od-opencode-repair-'));
  const env: NodeJS.ProcessEnv = {};
  try {
    await applyOpenCodeEventPlugin(env, root, '1.18.30');
    expect(env.npm_config_fetch_retries).toBe('0');
    expect(env.npm_config_fetch_timeout).toBe('10000');
    const file = fileURLToPath(JSON.parse(env.OPENCODE_CONFIG_CONTENT!).plugin[0]);
    const before = await stat(file);
    await applyOpenCodeEventPlugin(env, root, '1.18.30');
    expect((await stat(file)).ino).toBe(before.ino);
    expect((await stat(file)).mtimeMs).toBe(before.mtimeMs);
    await writeFile(file, 'truncated module');
    await applyOpenCodeEventPlugin(env, root, '1.18.30');
    expect(await readFile(file, 'utf8')).toBe(OPEN_CODE_EVENT_PLUGIN_SOURCE);
    expect(JSON.parse(env.OPENCODE_CONFIG_CONTENT!).plugin).toHaveLength(1);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('preserves explicit dependency fetch policy, including uppercase npm environment keys', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'od-opencode-npm-'));
  const env: NodeJS.ProcessEnv = { NPM_CONFIG_FETCH_RETRIES: '2', npm_config_fetch_timeout: '45000' };
  try {
    await applyOpenCodeEventPlugin(env, root, '1.18.30');
    expect(env.NPM_CONFIG_FETCH_RETRIES).toBe('2');
    expect(env.npm_config_fetch_retries).toBeUndefined();
    expect(env.npm_config_fetch_timeout).toBe('45000');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('staging and malformed configuration failures leave the original child overlay intact', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'od-opencode-unavailable-'));
  try {
    const blocked = path.join(root, 'file');
    await writeFile(blocked, 'not a directory');
    const env = { OPENCODE_CONFIG_CONTENT: '{"plugin":["user-plugin"]}' };
    await expect(applyOpenCodeEventPlugin(env, blocked, '1.18.30')).rejects.toThrow();
    expect(env.OPENCODE_CONFIG_CONTENT).toBe('{"plugin":["user-plugin"]}');
    env.OPENCODE_CONFIG_CONTENT = '{invalid json';
    await expect(applyOpenCodeEventPlugin(env, root, '1.18.30')).rejects.toThrow();
    expect(env.OPENCODE_CONFIG_CONTENT).toBe('{invalid json');
    expect(await readdir(root)).toEqual(['file']);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('observer failures stay local and a later update can retry a failed preview', async () => {
  const lines: string[] = [];
  let fail = true;
  const factory = vm.runInNewContext(OPEN_CODE_EVENT_PLUGIN_SOURCE.replace('export default', '(') + ')', {
    process: { stdout: { write: (line: string) => {
      if (fail) throw new Error('preview unavailable');
      lines.push(line);
    } } },
  });
  const plugin = await factory();
  await expect(plugin.event(null)).resolves.toBeUndefined();
  // Historical upstream pending parts omit input entirely.
  const frame = { event: { type: 'message.part.updated', properties: { part: {
    type: 'tool', sessionID: 'root', callID: 'call', tool: 'write', state: { status: 'pending' },
  } } } };
  await expect(plugin.event(frame)).resolves.toBeUndefined();
  fail = false;
  await plugin.event(frame);
  await plugin.event(frame);
  expect(lines).toHaveLength(1);
  expect(JSON.parse(lines[0]!)).toMatchObject({ callID: 'call', tool: 'write' });
});

test('the shipped module emits only changed tool previews, never long arguments or output', async () => {
  const lines: string[] = [];
  // Evaluate the exact shipped JS body with stdout captured; no host hooks/config.
  const factory = vm.runInNewContext(OPEN_CODE_EVENT_PLUGIN_SOURCE.replace('export default', '(') + ')', {
    process: { stdout: { write: (line: string) => lines.push(line) } },
  });
  const plugin = await factory();
  const part = { type: 'tool', sessionID: 'root', callID: 'call', tool: 'write' };
  const send = (state: Frame) => plugin.event({ event: { type: 'message.part.updated', properties: { part: { ...part, state } } } });
  await plugin.event({ event: { type: 'session.idle' } });
  await send({ status: 'pending', input: {} });
  await send({ status: 'pending', input: {} });
  await send({ status: 'running', input: { filePath: '/work/large.txt', content: 'x'.repeat(200_000) } });
  await send({ status: 'running', input: { filePath: '/work/large.txt', content: 'y'.repeat(200_000) } });
  await send({ status: 'completed', output: 'x'.repeat(200_000) });
  expect(lines).toHaveLength(2);
  expect(lines.every(line => line.endsWith('\n') && line.length < 250)).toBe(true);
  expect(JSON.parse(lines[0]!)).toEqual({ type: 'od_opencode_tool', version: 1, sessionID: 'root', callID: 'call', tool: 'write' });
  expect(JSON.parse(lines[1]!).path).toBe('/work/large.txt');
});

test.each(['completed', 'error'])('pending row merges into exactly one native %s pair with full arguments', status => {
  const { events, handler, feed, preview } = parser();
  preview();
  preview();
  expect(events.filter(e => e.type === 'tool_in_flight')).toHaveLength(1);
  expect(events.filter(e => e.type === 'tool_use')).toHaveLength(0);
  preview({ path: '/work/large.txt' });
  const previews = events.filter(e => e.type === 'tool_in_flight');
  expect(previews[0]!.input).toEqual({});
  expect(previews[1]!.startedAt).toBe(previews[0]!.startedAt);
  const input = { filePath: '/work/large.txt', content: 'x'.repeat(200_000) };
  const native = { type: 'tool_use', sessionID: 'root', part: { tool: 'write', callID: 'call', state: { status, input, output: 'wrote file', ...(status === 'error' ? { error: 'denied' } : {}) } } };
  feed(native);
  feed(native);
  preview();
  handler.flush();
  expect(events.filter(e => e.type === 'tool_in_flight')).toHaveLength(2);
  const uses = events.filter(e => e.type === 'tool_use');
  expect(uses).toHaveLength(1);
  expect(uses[0]).toMatchObject({ id: previews[0]!.id, input });
  const results = events.filter(e => e.type === 'tool_result');
  expect(results).toHaveLength(1);
  expect(results[0]).toMatchObject({ toolUseId: 'call', isError: status === 'error' });
});

test('preview filtering rejects other sessions and versions; truncated streams settle once', () => {
  const { events, handler, preview } = parser();
  preview({ sessionID: 'child' });
  preview({ version: 2 });
  preview({ tool: null });
  expect(events).toHaveLength(1);
  preview();
  handler.flush();
  handler.flush();
  preview({ callID: 'late' });
  expect(events.filter(e => e.type === 'tool_in_flight')).toHaveLength(1);
  expect(events.filter(e => e.type === 'tool_use')).toHaveLength(1);
  expect(events.filter(e => e.type === 'tool_result')).toEqual([
    { type: 'tool_result', toolUseId: 'call', content: 'Tool stream ended before completion was reported.', isError: true },
  ]);
});

test('JSON lines can split across stdout chunks without exposing a raw plugin frame', () => {
  const { events, handler } = parser();
  const line = JSON.stringify({ type: 'od_opencode_tool', version: 1, sessionID: 'root', callID: 'call', tool: 'bash' }) + '\n';
  handler.feed(line.slice(0, 40));
  expect(events).toHaveLength(1);
  handler.feed(line.slice(40));
  expect(events[1]).toMatchObject({ type: 'tool_in_flight', name: 'bash' });
  expect(events.some(e => e.type === 'raw')).toBe(false);
});

test('pending can precede native step_start; only matching root previews are released', () => {
  const events: Frame[] = [];
  const handler = createJsonEventStreamHandler('opencode', event => events.push(event));
  for (const sessionID of ['child', 'root']) handler.feed(JSON.stringify({ type: 'od_opencode_tool', version: 1, sessionID, callID: sessionID, tool: 'write' }) + '\n');
  expect(events).toEqual([]);
  handler.feed('{"type":"step_start","sessionID":"root"}\n');
  expect(events.filter(e => e.type === 'tool_in_flight')).toEqual([
    { type: 'tool_in_flight', id: 'root', name: 'write', input: {}, startedAt: expect.any(Number) },
  ]);
});
