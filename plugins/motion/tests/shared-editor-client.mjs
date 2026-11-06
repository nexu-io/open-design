import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';

export class Client {
  constructor(directory, { legacy = false } = {}) {
    this.next = 0; this.pending = new Map(); this.trace = []; this.stderr = '';
    this.child = spawn(process.execPath, ['--experimental-strip-types', fileURLToPath(new URL(legacy ? './shared-editor-legacy.mjs' : '../mcp.ts', import.meta.url))], {
      env: { ...process.env, MOTION_DATA_DIR: directory }, stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.child.stderr.on('data', data => { this.stderr += data; });
    this.closed = once(this.child, 'exit');
    this.child.once('exit', () => { for (const { reject } of this.pending.values()) reject(new Error(`MCP exited: ${this.stderr}`)); this.pending.clear(); });
    createInterface({ input: this.child.stdout }).on('line', line => {
      const response = JSON.parse(line), waiting = this.pending.get(response.id);
      if (waiting) { this.pending.delete(response.id); waiting.resolve(response); }
    });
  }
  async rpc(method, params = {}) {
    const id = ++this.next, started = Date.now();
    const response = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`MCP timed out: ${method}; ${this.stderr}`)); }, 120_000);
      this.pending.set(id, { resolve: value => { clearTimeout(timer); resolve(value); }, reject: error => { clearTimeout(timer); reject(error); } });
      this.child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    });
    this.trace.push({ method, tool: params.name, elapsedMs: Date.now() - started, isError: Boolean(response.error || response.result?.isError) });
    if (response.error) throw new Error(response.error.message);
    return response.result;
  }
  initialize() { return this.rpc('initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'openmotion-poc-process-test', version: '1' } }); }
  async call(name, args = {}) {
    const value = await this.rpc('tools/call', { name, arguments: args });
    if (value.isError) throw Object.assign(new Error(value.structuredContent.error?.message ?? value.structuredContent.error), { code: value.structuredContent.error?.code ?? value.structuredContent.code });
    return value.structuredContent;
  }
  async close() { if (this.child.exitCode !== null) return; this.child.stdin.end(); await this.closed; }
}
