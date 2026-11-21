import { JSDOM } from 'jsdom';
import { expect, it, vi } from 'vitest';
import { buildTemplatePreviewEscapeBridge, injectTemplatePreviewEscapeBridge } from '../../src/runtime/template-preview-escape';

it('sends only Escape to the immediate parent before authored bubbling handlers', () => {
  const postMessage = vi.fn();
  const dom = new JSDOM(`<html><head>${buildTemplatePreviewEscapeBridge()}</head><body><button>Preview</button></body></html>`, {
    runScripts: 'dangerously',
    beforeParse(window) { Object.defineProperty(window, 'parent', { value: { postMessage } }); },
  });
  const bubble = vi.fn();
  dom.window.document.body.addEventListener('keydown', bubble);
  const button = dom.window.document.querySelector('button')!;
  button.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  expect(postMessage).not.toHaveBeenCalled();
  bubble.mockClear();
  const event = new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
  expect(button.dispatchEvent(event)).toBe(false);
  expect(postMessage).toHaveBeenCalledExactlyOnceWith({ type: 'od:template-preview-escape' }, '*');
  expect(bubble).not.toHaveBeenCalled();
  dom.window.close();
});

it('does not post to itself when opened outside an iframe', () => {
  const dom = new JSDOM(buildTemplatePreviewEscapeBridge(), { runScripts: 'dangerously' });
  const postMessage = vi.spyOn(dom.window, 'postMessage');
  dom.window.document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  expect(postMessage).not.toHaveBeenCalled();
  dom.window.close();
});

it.each(['<!doctype html><head><script>window.authored=true</script></head>', '<!doctype html><main>Preview</main>'])('preserves the doctype and installs before authored content', html => {
  const output = injectTemplatePreviewEscapeBridge(html);
  expect(output.startsWith('<!doctype html>')).toBe(true);
  expect(output.indexOf('data-od-template-preview-escape')).toBeLessThan(output.indexOf(html.includes('<main>') ? '<main>' : 'window.authored'));
});
