import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  encodeSlideRenderFrame,
  SLIDE_RENDERER_FRAME_MAGIC,
  SLIDE_RENDERER_HTTP_PROTOCOL_VERSION,
} from '@open-design/sidecar-proto';
import { httpSlideRendererFromEnv } from '../src/integrations/slide-renderer-http.js';
import { startServer } from '../src/server.js';

// The optional HTTP slide renderer: the extension point that lets a deployment
// without an Electron sidecar supply one. The properties worth pinning are the
// ones an operator cannot see going wrong — an unset variable that quietly
// changes something, a renderer outage reported as a render result, or a
// renderer choosing where the daemon writes files.
//
// Frames are built with the published encoder rather than a local copy of the
// layout: a test that hand-rolls the format can agree with itself while
// disagreeing with every real renderer, which is exactly the drift the shared
// codec exists to prevent. The malformed cases below corrupt the encoder's
// OUTPUT, so they stay honest about what a real renderer could emit.

/** Builds a success frame the way a renderer would. */
function frame(
  result: Record<string, unknown>,
  parts: Array<{ name: string; body: Buffer }>,
): Buffer {
  return Buffer.from(encodeSlideRenderFrame(result as never, parts));
}

const servers: http.Server[] = [];
const tempDirs: string[] = [];

/** Reserves a port so the daemon's own URL can be known before it starts. */
async function freePort(): Promise<number> {
  const probe = http.createServer();
  await new Promise<void>((resolve) => probe.listen(0, '127.0.0.1', resolve));
  const { port } = probe.address() as { port: number };
  await new Promise<void>((resolve) => probe.close(() => resolve()));
  return port;
}

/** Polls until `predicate` holds, so a cross-process signal is not raced. */
async function waitFor(predicate: () => boolean, timeoutMs = 2_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate() && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

/** A stub renderer. `respond` decides what the single /render-slides call returns. */
async function stubRenderer(
  respond: (res: http.ServerResponse) => void,
): Promise<string> {
  const server = http.createServer((req, res) => {
    if (req.url !== '/render-slides' || req.method !== 'POST') {
      res.writeHead(404).end();
      return;
    }
    // Drain the request body before answering; the daemon always sends one.
    req.resume();
    req.on('end', () => respond(res));
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as { port: number };
  return `http://127.0.0.1:${address.port}`;
}

// The output dir is a SUBDIRECTORY of the temp root so that a test about
// escaping it has somewhere owned to escape into. Pointing the escape at the
// system temp dir instead would leave a stray file there and make the assertion
// depend on how clean /tmp happens to be.
function tempOutputDir(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'od-slide-renderer-'));
  tempDirs.push(root);
  const dir = path.join(root, 'out');
  fs.mkdirSync(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))),
  );
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe('httpSlideRendererFromEnv', () => {
  // The whole opt-in claim rests on this: an operator who never sets the
  // variable must get a daemon that is byte-for-byte the one they have today.
  it.each([
    ['unset', undefined],
    ['empty', ''],
    ['whitespace only', '   '],
  ])('binds nothing when the URL is %s', (_label, url) => {
    expect(httpSlideRendererFromEnv(url)).toBeNull();
  });

  it('renders through the configured URL, tolerating a trailing slash', async () => {
    const seen: Array<{ url: string; body: unknown }> = [];
    const server = http.createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (c: Buffer) => chunks.push(c));
      req.on('end', () => {
        seen.push({ url: req.url ?? '', body: JSON.parse(Buffer.concat(chunks).toString('utf8')) });
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'no slides', errorCode: 'NO_SLIDES' }));
      });
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as { port: number };

    const render = httpSlideRendererFromEnv(`http://127.0.0.1:${port}//`);
    await render!({ html: '<p>hi</p>', deck: true });

    expect(seen).toHaveLength(1);
    expect(seen[0]!.url).toBe('/render-slides');
    expect(seen[0]!.body).toEqual({ html: '<p>hi</p>', deck: true });
  });

  // The distinction that matters to whoever reads the failure: "the renderer is
  // down" and "this deck cannot be rendered" need different actions, so they
  // must not arrive as the same thing.
  it('throws when the renderer itself fails, surfacing its message', async () => {
    const base = await stubRenderer((res) => {
      res.writeHead(503, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'renderer pool exhausted' }));
    });

    await expect(httpSlideRendererFromEnv(base)!({ html: '' })).rejects.toThrow(
      'renderer pool exhausted',
    );
  });

  it('throws with the status when a renderer failure has no JSON body', async () => {
    const base = await stubRenderer((res) => {
      res.writeHead(502, { 'content-type': 'text/plain' });
      res.end('bad gateway');
    });

    await expect(httpSlideRendererFromEnv(base)!({ html: '' })).rejects.toThrow('HTTP 502');
  });

  it('returns a failed RENDER verbatim instead of throwing', async () => {
    const base = await stubRenderer((res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'page is too tall', errorCode: 'PAGE_TOO_TALL' }));
    });

    await expect(httpSlideRendererFromEnv(base)!({ html: '' })).resolves.toEqual({
      ok: false,
      error: 'page is too tall',
      errorCode: 'PAGE_TOO_TALL',
    });
  });

  it('writes an editable pptx into the daemon-chosen directory', async () => {
    const outputDir = tempOutputDir();
    const body = Buffer.from('PKpptx-bytes');
    const base = await stubRenderer((res) => {
      res.writeHead(200, { 'content-type': 'application/octet-stream' });
      res.end(frame({ ok: true, mode: 'deck' }, [{ name: 'deck.pptx', body }]));
    });

    const result = await httpSlideRendererFromEnv(base)!({ html: '', editable: true, outputDir });

    expect(result).toEqual({ ok: true, mode: 'deck', pptxFile: path.join(outputDir, 'deck.pptx') });
    expect(fs.readFileSync(path.join(outputDir, 'deck.pptx'))).toEqual(body);
    // `parts` is transport framing, not part of the contract the routes read.
    expect(result).not.toHaveProperty('parts');
  });

  // The protocol calls `name` advisory, so nothing about the outcome may depend
  // on it. These are the shapes a conforming renderer is allowed to send and
  // that the previous `.pptx`-suffix check silently mishandled: it wrote the
  // file, reported it as `slideFiles`, and the editable route then rejected the
  // export as having produced no PPTX.
  it.each([['extensionless', 'deck'], ['upper-case', 'DECK.PPTX'], ['unrelated', 'output.bin']])(
    'returns an editable render as pptxFile whatever the renderer called it (%s)',
    async (_label, advisoryName) => {
      const outputDir = tempOutputDir();
      const body = Buffer.from('PKpptx-bytes');
      const base = await stubRenderer((res) => {
        res.writeHead(200, { 'content-type': 'application/octet-stream' });
        res.end(frame({ ok: true, mode: 'deck' }, [{ name: advisoryName, body }]));
      });

      const result = await httpSlideRendererFromEnv(base)!({ html: '', editable: true, outputDir });

      expect(result.pptxFile).toBe(path.join(outputDir, 'deck.pptx'));
      expect(fs.readFileSync(result.pptxFile!)).toEqual(body);
    },
  );

  // Two payloads whose advisory names share a basename. Naming the outputs after
  // them made the second overwrite the first and returned the same path twice —
  // a deck exported with a slide missing, and nothing anywhere said so.
  it('keeps payloads separate when their advisory names collide', async () => {
    const outputDir = tempOutputDir();
    const base = await stubRenderer((res) => {
      res.writeHead(200, { 'content-type': 'application/octet-stream' });
      res.end(
        frame({ ok: true, mode: 'deck' }, [
          { name: 'a/slide.png', body: Buffer.from('first') },
          { name: 'b/slide.png', body: Buffer.from('second') },
        ]),
      );
    });

    const result = await httpSlideRendererFromEnv(base)!({ html: '', outputDir });

    expect(new Set(result.slideFiles)).toHaveLength(2);
    expect(result.slideFiles!.map((file: string) => fs.readFileSync(file).toString())).toEqual([
      'first',
      'second',
    ]);
  });

  it('takes the image encoding from the request, not from an odd advisory name', async () => {
    const outputDir = tempOutputDir();
    const base = await stubRenderer((res) => {
      res.writeHead(200, { 'content-type': 'application/octet-stream' });
      res.end(frame({ ok: true, mode: 'page' }, [{ name: 'weird.bin', body: Buffer.from('x') }]));
    });

    const result = await httpSlideRendererFromEnv(base)!({
      html: '',
      outputDir,
      pageImageFormat: 'jpeg',
    });

    expect(result.slideFiles).toEqual([path.join(outputDir, 'slide-0.jpeg')]);
  });

  it.each([
    ['an editable render returning several payloads', { editable: true }, 2, 'expected exactly 1'],
    ['a slide render returning none', {}, 0, 'no payloads'],
  ])('rejects %s', async (_label, extra, count, message) => {
    const outputDir = tempOutputDir();
    const base = await stubRenderer((res) => {
      res.writeHead(200, { 'content-type': 'application/octet-stream' });
      res.end(
        frame(
          { ok: true },
          Array.from({ length: count }, (_v, i) => ({
            name: `p${i}.png`,
            body: Buffer.from('x'),
          })),
        ),
      );
    });

    await expect(
      httpSlideRendererFromEnv(base)!({ html: '', outputDir, ...extra }),
    ).rejects.toThrow(message as string);
  });

  // The silent one: a renderer in another container is told to load relative
  // assets from the daemon's own address, which there is loopback pointing back
  // at the renderer. Nothing errors — the deck just renders without its images.
  it('rewrites the asset origin to one the renderer can reach', async () => {
    const seen: Array<string | undefined> = [];
    const base = await stubRenderer((res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'stop here', errorCode: 'RENDER_FAILED' }));
    });
    const server = http.createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (c: Buffer) => chunks.push(c));
      req.on('end', () => {
        seen.push(JSON.parse(Buffer.concat(chunks).toString('utf8')).baseHref);
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'stop here' }));
      });
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as { port: number };
    void base;

    const render = httpSlideRendererFromEnv(
      `http://127.0.0.1:${port}`,
      'http://open-design:7456',
    );
    await render!({
      html: '',
      baseHref: 'http://127.0.0.1:7456/api/projects/p1/preview/scope-abc/sub/',
    });

    // Origin swapped, scoped path preserved exactly — the scope is what
    // authorizes the fetch, so losing it would turn a silent failure into a 403.
    expect(seen[0]).toBe('http://open-design:7456/api/projects/p1/preview/scope-abc/sub/');
  });

  it('leaves the asset origin alone when no renderer-reachable daemon URL is set', async () => {
    const seen: Array<string | undefined> = [];
    const server = http.createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (c: Buffer) => chunks.push(c));
      req.on('end', () => {
        seen.push(JSON.parse(Buffer.concat(chunks).toString('utf8')).baseHref);
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'stop here' }));
      });
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as { port: number };

    const original = 'http://127.0.0.1:7456/api/projects/p1/preview/scope-abc/';
    await httpSlideRendererFromEnv(`http://127.0.0.1:${port}`, undefined)!({
      html: '',
      baseHref: original,
    });
    await httpSlideRendererFromEnv(`http://127.0.0.1:${port}`, 'not a url')!({
      html: '',
      baseHref: original,
    });

    expect(seen).toEqual([original, original]);
  });

  it('writes rendered slides in order and reports them as slideFiles', async () => {
    const outputDir = tempOutputDir();
    const parts = [
      { name: 'slide-1.png', body: Buffer.from('first') },
      { name: 'slide-2.png', body: Buffer.from('second-longer') },
    ];
    const base = await stubRenderer((res) => {
      res.writeHead(200, { 'content-type': 'application/octet-stream' });
      res.end(frame({ ok: true, mode: 'deck', width: 1920, height: 1080 }, parts));
    });

    const result = await httpSlideRendererFromEnv(base)!({ html: '', outputDir });

    // Named by position in the frame, not by what the renderer called them.
    expect(result.slideFiles).toEqual([
      path.join(outputDir, 'slide-0.png'),
      path.join(outputDir, 'slide-1.png'),
    ]);
    expect(fs.readFileSync(path.join(outputDir, 'slide-1.png')).toString()).toBe('second-longer');
  });

  // The renderer is a separate process — possibly a separate container — and it
  // names the files. It must not be able to name one that lands outside the
  // directory the daemon owns.
  it('gives a renderer no say in where its output lands', async () => {
    const outputDir = tempOutputDir();
    const escapee = path.join(path.dirname(outputDir), 'escaped.png');
    const base = await stubRenderer((res) => {
      res.writeHead(200, { 'content-type': 'application/octet-stream' });
      res.end(frame({ ok: true, mode: 'deck' }, [
        { name: '../escaped.png', body: Buffer.from('nope') },
      ]));
    });

    const result = await httpSlideRendererFromEnv(base)!({ html: '', outputDir });

    // The traversal attempt is not sanitised into a filename — the name is not
    // consulted at all, so there is nothing to sanitise.
    expect(result.slideFiles).toEqual([path.join(outputDir, 'slide-0.png')]);
    expect(fs.existsSync(escapee)).toBe(false);
    expect(fs.readdirSync(outputDir)).toEqual(['slide-0.png']);
  });

  it('rejects a frame cut short in transit', async () => {
    const outputDir = tempOutputDir();
    const full = frame({ ok: true }, [{ name: 'a.png', body: Buffer.from('12345') }]);
    const base = await stubRenderer((res) => {
      res.writeHead(200, { 'content-type': 'application/octet-stream' });
      // A well-formed frame missing its last two bytes — what a dropped
      // connection or a renderer that died mid-write actually produces.
      res.end(full.subarray(0, full.length - 2));
    });

    await expect(httpSlideRendererFromEnv(base)!({ html: '', outputDir })).rejects.toThrow(
      'frame length mismatch',
    );
    expect(fs.readdirSync(outputDir)).toEqual([]);
  });

  it('rejects a frame carrying more than it declares', async () => {
    const outputDir = tempOutputDir();
    const base = await stubRenderer((res) => {
      res.writeHead(200, { 'content-type': 'application/octet-stream' });
      res.end(
        Buffer.concat([
          frame({ ok: true }, [{ name: 'a.png', body: Buffer.from('12345') }]),
          Buffer.from('trailing'),
        ]),
      );
    });

    await expect(httpSlideRendererFromEnv(base)!({ html: '', outputDir })).rejects.toThrow(
      'frame length mismatch',
    );
  });

  it('refuses a frame version it does not speak', async () => {
    const outputDir = tempOutputDir();
    const future = frame({ ok: true }, [{ name: 'a.png', body: Buffer.from('x') }]);
    // Bump the version digit in the magic; everything else stays valid. An
    // operator running a newer renderer needs to be told that, not handed
    // "unrecognised frame".
    future[SLIDE_RENDERER_FRAME_MAGIC.length - 1] = '9'.charCodeAt(0);
    const base = await stubRenderer((res) => {
      res.writeHead(200, { 'content-type': 'application/octet-stream' });
      res.end(future);
    });

    await expect(httpSlideRendererFromEnv(base)!({ html: '', outputDir })).rejects.toThrow(
      `frame version 9 is not supported (this build speaks ${SLIDE_RENDERER_HTTP_PROTOCOL_VERSION})`,
    );
  });

  it('rejects a response that is not a render frame at all', async () => {
    const outputDir = tempOutputDir();
    const base = await stubRenderer((res) => {
      res.writeHead(200, { 'content-type': 'application/octet-stream' });
      res.end(Buffer.from('this is not a frame'));
    });

    await expect(httpSlideRendererFromEnv(base)!({ html: '', outputDir })).rejects.toThrow(
      'unrecognised frame',
    );
  });

  it('refuses a binary handoff with nowhere to put it', async () => {
    const base = await stubRenderer((res) => {
      res.writeHead(200, { 'content-type': 'application/octet-stream' });
      res.end(frame({ ok: true }, [{ name: 'a.png', body: Buffer.from('x') }]));
    });

    await expect(httpSlideRendererFromEnv(base)!({ html: '' })).rejects.toThrow('requires outputDir');
  });

  it('stops the renderer when the caller cancels', async () => {
    // A renderer that never answers, so the only way this resolves is the
    // cancellation actually reaching the request.
    let rendererSawRequest = false;
    let rendererSawAbort = false;
    const server = http.createServer((req) => {
      rendererSawRequest = true;
      req.resume();
      // 'aborted' is deprecated on IncomingMessage and no longer fires reliably;
      // this handler never responds, so any close is the caller going away.
      req.once('close', () => {
        rendererSawAbort = true;
      });
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as { port: number };

    const caller = new AbortController();
    const pending = httpSlideRendererFromEnv(`http://127.0.0.1:${port}`)!(
      { html: '', outputDir: tempOutputDir() },
      { signal: caller.signal },
    );
    // Abort only once the renderer is actually handling the request. Cancelling
    // sooner would abort a request that never left, which proves nothing about
    // propagation and is what made an earlier version of this pass vacuously.
    await waitFor(() => rendererSawRequest);
    expect(rendererSawRequest).toBe(true);
    caller.abort();

    await expect(pending).rejects.toThrow();
    await waitFor(() => rendererSawAbort);
    expect(rendererSawAbort).toBe(true);
  });
});

// Wiring, observed where a user would feel it: the export route's answer and
// the capability the daemon advertises. Both have to move together with the
// extension point, or the UI is told one thing while the routes do another —
// the drift the capability flag was introduced to prevent (#7224).
describe('OD_SLIDE_RENDERER_URL wiring', () => {
  const projectId = 'proj-http-slide-renderer';

  async function withDaemon(
    url: string | undefined,
    options: Parameters<typeof startServer>[0],
    body: (baseUrl: string) => Promise<void>,
  ): Promise<void> {
    const previous = process.env.OD_SLIDE_RENDERER_URL;
    if (url === undefined) delete process.env.OD_SLIDE_RENDERER_URL;
    else process.env.OD_SLIDE_RENDERER_URL = url;
    const started = (await startServer({ port: 0, returnServer: true, ...options })) as {
      url: string;
      server: http.Server;
    };
    // Registered through the API, not just written to disk: the export route
    // tolerates an unknown project, but the preview route that serves the
    // renderer's relative assets does not.
    await fetch(`${started.url}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: projectId, name: projectId }),
    });
    // Written per-daemon because the data dir is shared across this file's tests.
    const dir = path.join(process.env.OD_DATA_DIR!, 'projects', projectId);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'deck.html'),
      '<html><body><section class="slide">A</section></body></html>',
    );
    try {
      await body(started.url);
    } finally {
      await new Promise<void>((resolve) => started.server.close(() => resolve()));
      if (previous === undefined) delete process.env.OD_SLIDE_RENDERER_URL;
      else process.env.OD_SLIDE_RENDERER_URL = previous;
    }
  }

  const exportEditablePptx = (baseUrl: string, signal?: AbortSignal) =>
    fetch(`${baseUrl}/api/projects/${projectId}/export/pptx`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileName: 'deck.html', editable: true }),
      ...(signal ? { signal } : {}),
    });

  const capability = async (baseUrl: string) => {
    const res = await fetch(`${baseUrl}/api/version`);
    const json = (await res.json()) as { version?: { capabilities?: { slideRenderer?: boolean } } };
    return json.version?.capabilities?.slideRenderer;
  };

  // The opt-in claim, stated where a user would notice it breaking: leave the
  // variable alone and the daemon answers exactly as it does today.
  it('changes nothing when the variable is unset', async () => {
    await withDaemon(undefined, {}, async (baseUrl) => {
      expect(await capability(baseUrl)).toBe(false);
      const res = await exportEditablePptx(baseUrl);
      expect(res.status).toBe(501);
    });
  });

  it('serves exports through the configured renderer and advertises it', async () => {
    const bytes = Buffer.from('PK\x03\x04from-the-http-renderer');
    const base = await stubRenderer((res) => {
      res.writeHead(200, { 'content-type': 'application/octet-stream' });
      res.end(frame({ ok: true, mode: 'deck' }, [{ name: 'deck.pptx', body: bytes }]));
    });

    await withDaemon(base, {}, async (baseUrl) => {
      expect(await capability(baseUrl)).toBe(true);
      const res = await exportEditablePptx(baseUrl);

      expect(res.status).toBe(200);
      expect(Buffer.from(await res.arrayBuffer())).toEqual(bytes);
    });
  });

  // An injected renderer belongs to the desktop sidecar and the environment must
  // not be able to displace it. Asserted on WHICH renderer produced the bytes —
  // both are present and both advertise the same capability, so the flag alone
  // could not tell these two worlds apart.
  it('never displaces a renderer the host injected', async () => {
    const httpBytes = Buffer.from('PK\x03\x04from-the-http-renderer');
    const injectedBytes = Buffer.from('PK\x03\x04from-the-injected-renderer');
    const base = await stubRenderer((res) => {
      res.writeHead(200, { 'content-type': 'application/octet-stream' });
      res.end(frame({ ok: true, mode: 'deck' }, [{ name: 'deck.pptx', body: httpBytes }]));
    });
    const injected = async (input: { outputDir?: string }) => {
      const file = path.join(input.outputDir!, 'deck.pptx');
      await fs.promises.mkdir(input.outputDir!, { recursive: true });
      await fs.promises.writeFile(file, injectedBytes);
      return { ok: true as const, pptxFile: file, mode: 'deck' as const };
    };

    await withDaemon(base, { desktopSlideRenderer: injected }, async (baseUrl) => {
      const res = await exportEditablePptx(baseUrl);

      expect(res.status).toBe(200);
      expect(Buffer.from(await res.arrayBuffer())).toEqual(injectedBytes);
    });
  });

  // End to end for the asset path, because the unit-level origin rewrite proves
  // the URL is different, not that it WORKS. The renderer here does what a real
  // one does: takes the `baseHref` it was handed and fetches a relative asset
  // through it, as a browser would — the minted scope has to authorize it and
  // the path has to survive intact.
  //
  // Deliberately NOT reached via `localhost`: the daemon reserves the swapped
  // spelling of its own host (127.0.0.1 <-> localhost) for powered previews and
  // answers 403 on every other /api route for browser-shaped requests. That is
  // a real trap for this setting, documented in deploy/.env.example, but it is
  // a property of that one hostname rather than of cross-origin asset loading.
  it('lets the renderer load a relative asset through the rewritten origin', async () => {
    const port = await freePort();
    let fetched: { body: string; status: number } | null = null;
    const renderer = http.createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (c: Buffer) => chunks.push(c));
      req.on('end', () => {
        const { baseHref } = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        void (async () => {
          const asset = await fetch(new URL('theme.css', baseHref));
          fetched = { body: await asset.text(), status: asset.status };
          // Stop the export here; the asset fetch is what this pins.
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: 'asset probe complete' }));
        })();
      });
    });
    servers.push(renderer);
    await new Promise<void>((resolve) => renderer.listen(0, '127.0.0.1', resolve));
    const rendererPort = (renderer.address() as { port: number }).port;

    await withDaemon(`http://127.0.0.1:${rendererPort}`, { port }, async (baseUrl) => {
      fs.writeFileSync(
        path.join(process.env.OD_DATA_DIR!, 'projects', projectId, 'theme.css'),
        'body{color:red}',
      );
      await exportEditablePptx(baseUrl);
    });

    expect(fetched).toEqual({ body: 'body{color:red}', status: 200 });
  });

  // The reason cancellation matters more for an external renderer than for the
  // co-located one: it does not share the daemon's lifetime, so without this it
  // keeps executing the artifact and holding the response for a client that has
  // already hung up.
  it('cancels the render when the export client disconnects', async () => {
    let rendererSawAbort = false;
    const renderer = http.createServer((req) => {
      req.resume();
      // Never answer. The request can only end by being aborted.
      // 'aborted' is deprecated on IncomingMessage and no longer fires reliably;
      // this handler never responds, so any close is the caller going away.
      req.once('close', () => {
        rendererSawAbort = true;
      });
    });
    servers.push(renderer);
    await new Promise<void>((resolve) => renderer.listen(0, '127.0.0.1', resolve));
    const { port } = renderer.address() as { port: number };

    await withDaemon(`http://127.0.0.1:${port}`, {}, async (baseUrl) => {
      const client = new AbortController();
      const pending = exportEditablePptx(baseUrl, client.signal).catch(() => undefined);
      // Wait until the daemon has actually reached the renderer, otherwise
      // aborting could beat the request out and the test would pass without
      // exercising the propagation at all.
      await waitFor(() => renderer.connections > 0 || rendererSawAbort);
      client.abort();
      await pending;

      await waitFor(() => rendererSawAbort);
      expect(rendererSawAbort).toBe(true);
    });
  });
});
