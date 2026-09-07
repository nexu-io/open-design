// @vitest-environment jsdom
//
// Red spec for a comment that ends up on a different element than the one it
// was left on.
//
// A preview comment stores where it was left. `targetFrom` in the selection
// bridge takes `data-od-id` (or `data-screen-label`) when the author provided
// one, and otherwise falls back to `domSelectorFor` — a purely structural path,
// `body > div:nth-of-type(1) > p:nth-of-type(2)`. Most generated artifacts
// carry no `data-od-id`, so most comments are anchored structurally.
//
// `findCommentTargetByIdentity` resolves that anchor with a bare
// `document.querySelector(selector)`. There is no check that what came back is
// the element the comment was left on — not its tag, not its text, nothing. Any
// element the selector happens to match is accepted.
//
// Saving is what moves them. Manual Edit writes by parsing and re-serializing,
// and the HTML parser is not a pass-through: it closes a `<p>` before a block
// child and leaves the stray `</p>` behind as an empty paragraph. That empty
// paragraph is a new `p` sibling, so every later `p:nth-of-type(n)` in that
// parent now names the paragraph before it. A comment left on the third
// paragraph silently becomes a comment on the second.
//
// This one outlives the session that caused it. The anchor is stored on the
// server, so closing the tab and coming back tomorrow shows the same comment on
// the same wrong element, and on a shared project the person who wrote it is
// not there to notice.
//
// Everything here is driven through the real product: a real daemon, a real
// project, a real file write, the real preview transport, and the anchoring
// functions taken out of the bridge source the daemon actually served rather
// than reimplemented here.

import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { startServer } from '../src/server.js';

/**
 * `domSelectorFor` and `findCommentTargetByIdentity`, lifted verbatim out of
 * the bridge in the HTML the daemon served. Reimplementing them here would only
 * prove that a copy agrees with itself.
 */
function bridgeAnchoring(servedHtml: string, doc: Document): {
  domSelectorFor: (el: Element) => string | null;
  findCommentTargetByIdentity: (
    elementId: string,
    selector: string,
    witness?: { text?: string; label?: string },
  ) => Element | null;
} {
  const grab = (name: string): string => {
    const start = servedHtml.indexOf(`function ${name}(`);
    if (start < 0) throw new Error(`bridge does not define ${name}`);
    let depth = 0;
    for (let i = servedHtml.indexOf('{', start); i < servedHtml.length; i += 1) {
      if (servedHtml[i] === '{') depth += 1;
      else if (servedHtml[i] === '}') {
        depth -= 1;
        if (depth === 0) return servedHtml.slice(start, i + 1);
      }
    }
    throw new Error(`unterminated ${name}`);
  };
  // eslint-disable-next-line no-new-func
  return new Function(
    'document',
    `${grab('domSelectorFor')}\n${grab('commentTargetMatchesWitness')}\n`
      + `${grab('findCommentTargetByIdentity')}\n`
      + 'return { domSelectorFor: domSelectorFor, findCommentTargetByIdentity: findCommentTargetByIdentity };',
  )(doc) as ReturnType<typeof bridgeAnchoring>;
}

function identify(el: Element | null): string | null {
  if (!el) return null;
  return `${el.tagName.toLowerCase()}:${(el.textContent ?? '').replace(/\s+/gu, ' ').trim()}`;
}

/**
 * Authored HTML with a paragraph wrapped around a block element — one of the
 * most common things a generator emits, and something the parser rewrites.
 */
const AUTHORED =
  '<!doctype html><html><body>'
  + '<p>Intro<div>Body copy</div></p>'
  + '<p>Second paragraph</p>'
  + '<p>Third paragraph</p>'
  + '</body></html>';

describe('preview comment anchors across an ordinary save', () => {
  let server: http.Server;
  let baseUrl: string;
  let projectId: string;

  beforeAll(async () => {
    const started = (await startServer({ port: 0, returnServer: true })) as {
      url: string;
      server: http.Server;
    };
    baseUrl = started.url;
    server = started.server;
    projectId = `comment-anchor-${randomUUID()}`;
    const created = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: projectId, name: 'Comment anchor across save' }),
    });
    expect(created.ok).toBe(true);
  });

  afterAll(async () => {
    await fetch(`${baseUrl}/api/projects/${projectId}`, { method: 'DELETE' }).catch(() => {});
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  async function writeFile(name: string, content: string): Promise<void> {
    const written = await fetch(`${baseUrl}/api/projects/${projectId}/files`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, content }),
    });
    expect(written.ok).toBe(true);
  }

  /**
   * The document as the browser receives it, through the scoped-origin
   * transport the viewer actually uses. `fetch` refuses to send a caller
   * supplied `Host`, and that header is where the transport reads the preview
   * scope from, so this has to go over `node:http`.
   */
  async function servedPreview(name: string): Promise<string> {
    const urls = await fetch(
      `${baseUrl}/api/projects/${projectId}/preview-url?file=${encodeURIComponent(name)}`,
    );
    expect(urls.ok).toBe(true);
    const body = (await urls.json()) as {
      url: string;
      scopedOrigin?: { normalUrl: string };
    };
    expect(body.scopedOrigin?.normalUrl, 'the daemon must offer a scoped origin').toBeTruthy();
    const scoped = new URL(body.scopedOrigin!.normalUrl);
    const daemon = new URL(baseUrl);
    return new Promise<string>((resolve, reject) => {
      const request = http.request(
        {
          host: daemon.hostname,
          port: daemon.port,
          // Ask for the comment bridge the way the viewer does with comment
          // mode on; it is lazy, so a plain fetch does not carry it.
          path: `${scoped.pathname}?odPreviewBridge=comment`,
          method: 'GET',
          headers: { Host: scoped.host },
        },
        (response) => {
          const chunks: Buffer[] = [];
          response.on('data', (chunk: Buffer) => chunks.push(chunk));
          response.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
        },
      );
      request.on('error', reject);
      request.end();
    });
  }

  /** What a save writes: the source parsed and re-serialized, as the patch path does. */
  function reserialize(html: string): string {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    return `<!doctype html>\n${doc.documentElement.outerHTML}`;
  }

  /**
   * The control, and the reason the original suspicion was wrong: a Manual Edit
   * save re-serializes the source, but the DOM a browser builds is unchanged by
   * that — the parser had already inserted the implicit paragraph the first time
   * it read the authored bytes. Re-serialization only writes down what the DOM
   * already was, so a structural anchor is not disturbed by it.
   */
  it('keeps a comment where a save only re-serializes the source', async () => {
    const name = 'reserialized.html';
    await writeFile(name, AUTHORED);

    const before = await servedPreview(name);
    const beforeDoc = new DOMParser().parseFromString(before, 'text/html');
    const anchoring = bridgeAnchoring(before, beforeDoc);

    const target = Array.from(beforeDoc.querySelectorAll('p')).find(
      (el) => (el.textContent ?? '').trim() === 'Third paragraph',
    )!;
    const selector = anchoring.domSelectorFor(target);
    expect(selector, 'the bridge must be able to anchor this element').toBeTruthy();
    const commentedOn = identify(target);

    await writeFile(name, reserialize(AUTHORED));

    const after = await servedPreview(name);
    const afterDoc = new DOMParser().parseFromString(after, 'text/html');
    const resolved = bridgeAnchoring(after, afterDoc).findCommentTargetByIdentity(
      `dom:${selector}`,
      selector!,
      {
        text: (target.textContent ?? '').replace(/\s+/gu, ' ').trim().slice(0, 160),
        label: target.tagName.toLowerCase(),
      },
    );
    expect(identify(resolved), `anchor ${selector}`).toBe(commentedOn);
  }, 60_000);

  /**
   * The defect. The anchor is a bare `:nth-of-type` path and
   * `findCommentTargetByIdentity` resolves it with `document.querySelector` and
   * no check of any kind — not the tag, not the text. Anything the path happens
   * to match is accepted as the commented element.
   *
   * So any edit that adds a sibling of the same tag ahead of the commented one
   * hands the comment to its neighbour. This is not an exotic edit: it is what
   * the agent does on almost every turn, and what a user does by adding a
   * paragraph. Nothing warns anyone, the anchor is stored on the server, and on
   * a shared project the person who wrote the comment is not there to see it
   * move.
   */
  it('does not hand a comment to a different element when the file is edited', async () => {
    const name = 'edited.html';
    await writeFile(name, AUTHORED);

    const before = await servedPreview(name);
    const beforeDoc = new DOMParser().parseFromString(before, 'text/html');
    const anchoring = bridgeAnchoring(before, beforeDoc);

    // The user leaves a comment on the last paragraph.
    const target = Array.from(beforeDoc.querySelectorAll('p')).find(
      (el) => (el.textContent ?? '').trim() === 'Third paragraph',
    )!;
    const selector = anchoring.domSelectorFor(target);
    expect(selector, 'the bridge must be able to anchor this element').toBeTruthy();
    const commentedOn = identify(target);
    // What the stored comment already carries about where it was left.
    const witness = {
      text: (target.textContent ?? '').replace(/\s+/gu, ' ').trim().slice(0, 160),
      label: target.tagName.toLowerCase(),
    };

    // The agent adds a paragraph above it, the way an ordinary turn does.
    await writeFile(
      name,
      AUTHORED.replace('<p>Second paragraph</p>', '<p>Inserted by the agent</p><p>Second paragraph</p>'),
    );

    const after = await servedPreview(name);
    const afterDoc = new DOMParser().parseFromString(after, 'text/html');
    // Resolve through the product's own resolver, handing it the witness the
    // comment already stores.
    const resolved = bridgeAnchoring(after, afterDoc).findCommentTargetByIdentity(
      `dom:${selector}`,
      selector!,
      witness,
    );

    // Either the comment still points at the paragraph it was left on, or it
    // points at nothing and the product can say the anchor was lost. What it
    // must never do is silently hand it to a different paragraph.
    if (resolved !== null) {
      expect(identify(resolved), `anchor ${selector}`).toBe(commentedOn);
    }
  }, 60_000);
});
