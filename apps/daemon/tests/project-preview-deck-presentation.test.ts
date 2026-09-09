// Daemon-side injection contract for the Deck presentation bridge.
//
// Full-screen presentation must act on the document that is already running at
// its real project URL, so the bridge has to arrive through the same
// `odPreviewBridge=` negotiation as scroll/selection/snapshot — on the buffered
// path and on the streamed path for large decks alike — and must stay out of
// responses that did not ask for it.

import http from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { DECK_PRESENTATION_BRIDGE_MARKER } from '@open-design/contracts/runtime/deck-presentation';
import { PREVIEW_URL_GUARD_MAX_HTML_BYTES } from '@open-design/contracts/runtime/preview-guards';
import { startServer } from '../src/server.js';

const PAD = 'x'.repeat(PREVIEW_URL_GUARD_MAX_HTML_BYTES + 256);


/**
 * `fetch` silently drops a manual Host header, so the scoped origin is
 * unreachable through it. Address the daemon directly and set Host by hand.
 */
function getWithHost(pathname: string, host: string): Promise<{ status: number; html: string }> {
  const port = Number(new URL(baseUrlRef.value).port);
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: '127.0.0.1', port, path: pathname, method: 'GET', headers: { Host: host } },
      (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => resolve({ status: res.statusCode ?? 0, html: body }));
      },
    );
    req.on('error', reject);
    req.end();
  });
}

const baseUrlRef = { value: '' };

describe('deck presentation bridge injection', () => {
  let server: http.Server;
  let baseUrl: string;
  const projectId = 'proj-deck-presentation-bridge';

  const rawUrl = (name: string) => `${baseUrl}/api/projects/${projectId}/raw/${name}`;
  const poweredUrl = (name: string) => `${baseUrl}/api/projects/${projectId}/powered/${name}`;

  beforeAll(async () => {
    const started = await startServer({ port: 0, returnServer: true }) as {
      url: string;
      server: http.Server;
    };
    baseUrl = started.url;
    baseUrlRef.value = started.url;
    server = started.server;

    const created = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: projectId, name: 'Deck presentation fixture' }),
    });
    expect(created.status).toBe(200);

    const dir = path.join(process.env.OD_DATA_DIR!, 'projects', projectId);
    await mkdir(dir, { recursive: true });
    await writeFile(
      path.join(dir, 'deck.html'),
      '<!doctype html><html><head><title>Deck</title></head>'
      + '<body><section class="slide">One</section>'
      + '<nav class="deck-nav">chrome</nav></body></html>',
    );
    await writeFile(
      path.join(dir, 'large-deck.html'),
      `<!doctype html><html><head><title>Large deck</title></head><body>`
      + `<section class="slide">One</section><!-- ${PAD} --></body></html>`,
    );
  });

  afterAll(async () => {
    await fetch(`${baseUrl}/api/projects/${projectId}`, { method: 'DELETE' }).catch(() => {});
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('injects the bridge into a buffered deck preview that asks for it', async () => {
    const response = await fetch(`${rawUrl('deck.html')}?odPreviewBridge=presentation`);
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain(DECK_PRESENTATION_BRIDGE_MARKER);
    expect(html).toContain('od:deck-presentation');
    // The document itself is untouched apart from the injection.
    expect(html).toContain('<section class="slide">One</section>');
  });

  it('injects the bridge exactly once alongside the other negotiated bridges', async () => {
    const response = await fetch(
      `${rawUrl('deck.html')}?odPreviewBridge=scroll&odPreviewBridge=selection`
      + '&odPreviewBridge=snapshot&odPreviewBridge=presentation',
    );
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain('data-od-url-scroll-bridge');
    expect(html).toContain('data-od-url-selection-bridge');
    expect(html).toContain('data-od-url-snapshot-bridge');
    expect(html.split(DECK_PRESENTATION_BRIDGE_MARKER)).toHaveLength(2);
  });

  it('streams the bridge into a deck too large to buffer', async () => {
    const response = await fetch(`${rawUrl('large-deck.html')}?odPreviewBridge=presentation`);
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html.length).toBeGreaterThan(PREVIEW_URL_GUARD_MAX_HTML_BYTES);
    expect(html).toContain(DECK_PRESENTATION_BRIDGE_MARKER);
    expect(html).toContain(PAD);
  });

  it('serves the bridge on the powered preview transport too', async () => {
    const response = await fetch(`${poweredUrl('deck.html')}?odPreviewBridge=presentation`);
    expect(response.status).toBe(200);
    expect(await response.text()).toContain(DECK_PRESENTATION_BRIDGE_MARKER);
  });

  // The converged transport. Everything above tests `/raw` and `/powered`,
  // which the runtime convergence moved off: a settled file now loads from the
  // scoped preview origin, and that path does NOT carry the bridge query.
  // `buildPreviewSessionNavigation` only ever appends the sandbox/focus/redirect
  // guards, and says so on purpose — "Interactive Deck support is negotiated
  // after navigation; it must never become part of the document URL."
  //
  // So the bridge has to arrive the way every other post-load capability does:
  // installed by the Preview Runtime bootstrap. It was left out of that module
  // list, and measured live the document reports no
  // `od:deck-presentation-ready` at all, so presenting a deck promotes the
  // right document and then cannot hide its chrome.
  //
  // Injecting it unconditionally is safe by construction: the bridge only
  // registers a message listener at parse time and does nothing until the host
  // negotiates, which is also why this needs no URL switch (a URL change would
  // renavigate the document and defeat the whole point of presenting in place).
  it('installs the bridge on the scoped preview transport, with no bridge query', async () => {
    const minted = await fetch(
      `${baseUrl}/api/projects/${projectId}/preview-url?file=${encodeURIComponent('deck.html')}`,
    );
    expect(minted.status).toBe(200);
    const body = await minted.json() as { scopedOrigin?: { normalUrl?: string } };
    const normalUrl = body.scopedOrigin?.normalUrl;
    expect(typeof normalUrl).toBe('string');

    // The converged document loads from the scoped ORIGIN
    // (`n-<session>.localhost`), not from the `/preview/<scope>/` path — that
    // distinction matters, because only the origin serves the runtime
    // bootstrap. Subdomains of localhost do not resolve here, so address the
    // daemon directly and carry the scope in the Host header.
    const scopedUrl = new URL(normalUrl!);
    // Deliberately no `odPreviewBridge=` on this request: the scoped document
    // URL is built without one for anything but the passive guards.
    const { status, html } = await getWithHost(scopedUrl.pathname, scopedUrl.host);
    expect(status).toBe(200);

    // Control: the runtime bootstrap really is on this transport, so a missing
    // presentation bridge is a missing module and not a broken probe.
    expect(html).toContain('od:preview:hello');

    expect(html).toContain(DECK_PRESENTATION_BRIDGE_MARKER);
    expect(html).toContain('od:deck-presentation');
  });

  it('never injects the bridge into previews that did not negotiate it', async () => {
    const plain = await fetch(rawUrl('deck.html'));
    expect(plain.status).toBe(200);
    expect(await plain.text()).not.toContain(DECK_PRESENTATION_BRIDGE_MARKER);

    const otherBridges = await fetch(`${rawUrl('deck.html')}?odPreviewBridge=scroll`);
    expect(otherBridges.status).toBe(200);
    const html = await otherBridges.text();
    expect(html).toContain('data-od-url-scroll-bridge');
    expect(html).not.toContain(DECK_PRESENTATION_BRIDGE_MARKER);

    const largePlain = await fetch(`${rawUrl('large-deck.html')}?odPreviewBridge=scroll`);
    expect(largePlain.status).toBe(200);
    expect(await largePlain.text()).not.toContain(DECK_PRESENTATION_BRIDGE_MARKER);
  });
});
