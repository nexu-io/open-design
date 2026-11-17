import { JSDOM } from 'jsdom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildPreviewSandboxShim } from '@open-design/contracts/runtime/preview-guards';
import { buildSrcdoc } from '../../src/runtime/srcdoc';

const opened: JSDOM[] = [];
function fixture(shim: string, url = 'http://preview.test/') {
  const dom = new JSDOM(`<!doctype html><html><head>${shim}</head><body>
    <a id="route" href="#/details/7">Details</a><a id="anchor" href="#section">Section</a>
    <section id="section">Section content</section>
    <form id="form"><input id="name" required><textarea id="notes"></textarea><button id="save">Save</button>
      <button id="local" type="button">Local action</button></form>
    <output id="result">0</output>
    <script>document.getElementById('form').addEventListener('submit', function(e) {
      e.preventDefault(); document.getElementById('result').textContent =
        String(Number(document.getElementById('result').textContent) + 1);
      document.getElementById('result').dataset.submitter = e.submitter && e.submitter.id;
    });</script></body></html>`, { url, runScripts: 'dangerously' });
  opened.push(dom);
  return dom;
}
afterEach(() => { for (const dom of opened.splice(0)) dom.window.close(); vi.useRealTimers(); });

describe('local interactions in a strict preview', () => {
  it('keeps SPA hash routes', () => {
    const dom = fixture(buildPreviewSandboxShim());
    dom.window.document.getElementById('route')!.click();
    expect(dom.window.location.hash).toBe('#/details/7');
  });

  it('respects an authored router that already handled the link', () => {
    const dom = fixture(buildPreviewSandboxShim());
    const link = dom.window.document.getElementById('route')!;
    link.addEventListener('click', event => event.preventDefault());
    link.click();
    expect(dom.window.location.hash).toBe('');
  });

  it('updates opaque blob hash routes without requesting a new blob navigation', () => {
    const dom = fixture(buildPreviewSandboxShim(), 'blob:http://preview.test/frozen-document');
    const hashes: string[] = [];
    dom.window.addEventListener('hashchange', () => hashes.push(dom.window.location.hash));
    // jsdom cannot rewrite Blob URL history; Chromium coverage is retained
    // separately against the unchanged frozen artifact in the existing client.
    const push = vi.spyOn(dom.window.history, 'pushState').mockImplementation((_state, _title, url) => {
      dom.reconfigure({ url: String(url) });
    });
    dom.window.document.getElementById('route')!.click();
    expect(push).toHaveBeenCalledWith(null, '', 'blob:http://preview.test/frozen-document#/details/7');
    expect(dom.window.location.hash).toBe('#/details/7');
    expect(hashes).toEqual(['#/details/7']);
  });

  it('delivers one local submit when the sandbox suppresses native form activation', () => {
    vi.useFakeTimers();
    const dom = fixture(buildPreviewSandboxShim());
    const { document, Event } = dom.window;
    (document.getElementById('name') as HTMLInputElement).value = 'Test visitor';
    // A generic click Event has no native MouseEvent activation in jsdom.
    // This models the suppressed default action; a real sandbox is checked
    // separately in the existing client with the frozen failing artifact.
    document.getElementById('save')!.dispatchEvent(new Event('click', { bubbles: true, cancelable: true }));
    vi.runOnlyPendingTimers();
    expect(document.getElementById('result')!.textContent).toBe('1');
    expect(document.getElementById('result')!.dataset.submitter).toBe('save');
  });

  it('keeps validation, canceled actions, disabled controls and explicit buttons inert', () => {
    vi.useFakeTimers();
    const dom = fixture(buildPreviewSandboxShim());
    const { document, Event } = dom.window;
    const save = document.getElementById('save') as HTMLButtonElement;
    const activate = (target: HTMLElement) => target.dispatchEvent(new Event('click', { bubbles: true, cancelable: true }));
    activate(save); vi.runOnlyPendingTimers();
    expect(document.getElementById('result')!.textContent).toBe('0');
    (document.getElementById('name') as HTMLInputElement).value = 'Test visitor';
    save.disabled = true; activate(save); vi.runOnlyPendingTimers();
    save.disabled = false;
    save.addEventListener('click', event => event.preventDefault(), { once: true });
    activate(save); vi.runOnlyPendingTimers();
    activate(document.getElementById('local')!); vi.runOnlyPendingTimers();
    expect(document.getElementById('result')!.textContent).toBe('0');
  });

  it('does not duplicate a submit when native activation already delivers it', () => {
    vi.useFakeTimers();
    const dom = fixture(buildPreviewSandboxShim());
    const { document } = dom.window;
    (document.getElementById('name') as HTMLInputElement).value = 'Test visitor';
    document.getElementById('save')!.click(); vi.runOnlyPendingTimers();
    expect(document.getElementById('result')!.textContent).toBe('1');
  });

  it('supports Enter without treating a multiline edit as submission', () => {
    vi.useFakeTimers();
    const dom = fixture(buildPreviewSandboxShim());
    const { document, KeyboardEvent } = dom.window;
    const input = document.getElementById('name') as HTMLInputElement;
    input.value = 'Test visitor';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    vi.runOnlyPendingTimers();
    expect(document.getElementById('result')!.textContent).toBe('1');
    document.getElementById('notes')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    vi.runOnlyPendingTimers();
    expect(document.getElementById('result')!.textContent).toBe('1');
  });

  it('uses the same local interaction bridge in srcDoc and URL preview guards', () => {
    const srcdoc = buildSrcdoc('<form><input><button>Save</button></form>');
    expect(srcdoc).toContain('data-od-sandbox-shim');
    expect(srcdoc).toContain('localSubmitActivations');
    expect(buildPreviewSandboxShim()).toContain('localSubmitActivations');
  });
});
