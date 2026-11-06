import { Readable, Writable } from 'node:stream';
import { finished } from 'node:stream/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { handler } from '../server.ts';
import type { WorkspaceStore } from '../workspace.ts';

class Capture extends Writable {
  statusCode = 200; headersSent = false;
  headers: Record<string, string> = {}; chunks: Buffer[] = [];
  setHeader(name: string, value: unknown) { this.headers[name] = String(value); }
  writeHead(status: number, headers: Record<string, unknown>) { this.statusCode = status; for (const [key, value] of Object.entries(headers)) this.setHeader(key, value); this.headersSent = true; return this; }
  _write(chunk: Buffer, _: string, done: () => void) { this.chunks.push(Buffer.from(chunk)); done(); }
}
// Runs the real HTTP request handler with streams, without binding a socket.
export function transport(store: WorkspaceStore): (url: string, init?: RequestInit) => Promise<Response> {
  return async (url, init = {}) => {
    const headers = Object.fromEntries(new Headers(init.headers));
    headers.host = 'localhost:4173'; headers.origin = 'http://localhost:4173';
    const input = typeof init.body === 'string' ? Buffer.from(init.body) : init.body instanceof Blob ? Buffer.from(await init.body.arrayBuffer()) : Buffer.alloc(0);
    const req = Object.assign(Readable.from([input]), { url, method: init.method || 'GET', headers });
    const res = new Capture(); const complete = finished(res);
    await handler(req as unknown as IncomingMessage, res as unknown as ServerResponse, store);
    await complete;
    return new Response(Buffer.concat(res.chunks), { status: res.statusCode, headers: res.headers });
  };
}
