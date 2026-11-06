import { request } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { pluginRoot } from './hyperframes.ts';

const mime: Record<string, string> = { '.jpg': 'image/jpeg', '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json', '.map': 'application/json', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.txt': 'text/plain' };

/** Only application bundle and design-system files are exposed, never Studio source or project files. */
export async function serveEditorFile(url: URL, res: ServerResponse): Promise<boolean> {
  let relative: string;
  if (url.pathname === '/') relative = 'studio/build/index.html';
  else if (url.pathname === '/design-system') relative = 'web/design-system/index.html';
  else if (url.pathname === '/favicon.svg') relative = 'studio/public/favicon.svg';
  else if (/^\/editor-assets\/[a-zA-Z0-9_.-]+$/.test(url.pathname)) relative = 'studio/build' + url.pathname;
  else if (/^\/web\/design-system\/(?:fonts\/)?[a-zA-Z0-9_.-]+$/.test(url.pathname)) relative = url.pathname.slice(1);
  else if (/^\/web\/catalog\/(?:hyperframes|template-frames|provenance|covers)\.json$/.test(url.pathname) || /^\/web\/catalog\/(?:template-frames|covers)\/[a-f0-9]{24}\.jpg$/.test(url.pathname)) relative = url.pathname.slice(1);
  else return false;
  const type = mime[path.extname(relative)];
  if (!type) return false;
  try {
    const data = await readFile(path.join(pluginRoot, relative));
    res.writeHead(200, { 'Content-Type': type, 'Content-Length': data.length }); res.end(data);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(relative.endsWith('index.html') ? '编辑器尚未构建。请运行 npm run build:studio。' : '编辑器资源不存在，请刷新页面。');
  }
  return true;
}

/** Preserve native HTTP semantics (SSE, byte ranges, multipart uploads and optimistic file writes). */
export function proxyStudio(req: IncomingMessage, res: ServerResponse, url: URL, studioUrl: string): Promise<void> {
  const target = new URL(studioUrl);
  target.pathname = url.pathname; target.search = url.search; target.hash = '';
  const headers = { ...req.headers, host: target.host };
  if (headers.origin) headers.origin = target.origin;
  if (headers.referer) headers.referer = target.origin + '/';
  delete headers.connection;
  return new Promise(resolve => {
    const upstream = request(target, { method: req.method, headers }, response => {
      const outgoing = { ...response.headers };
      delete outgoing.connection;
      res.writeHead(response.statusCode || 502, outgoing);
      response.on('error', () => { res.destroy(); resolve(); });
      response.pipe(res);
    });
    upstream.on('error', () => {
      if (!res.headersSent) { res.writeHead(502, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: '原生编辑服务连接中断，请刷新重试' })); }
      else res.destroy();
      resolve();
    });
    res.on('close', () => { upstream.destroy(); resolve(); });
    res.on('finish', resolve);
    req.on('error', () => upstream.destroy());
    req.pipe(upstream);
  });
}
