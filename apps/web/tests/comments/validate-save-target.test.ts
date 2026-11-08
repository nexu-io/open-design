// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { validateCommentSaveTarget } from '../../src/comments/validate-save-target';
const target = { filePath: 'index.html', elementId: 'old', selector: 'button', label: 'button', text: 'old', htmlHint: '<button>', position: { x: 0, y: 0, width: 100, height: 40 } };
afterEach(() => { document.body.replaceChildren(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });
it('ignores other frames and accepts the requested selector even with a new element ID', async () => {
  const frame = document.createElement('iframe'); document.body.append(frame);
  const post = vi.spyOn(frame.contentWindow!, 'postMessage');
  const result = validateCommentSaveTarget(frame, target);
  const request = post.mock.calls[0]![0] as { requestId: string };
  window.dispatchEvent(new MessageEvent('message', { source: window, data: { type: 'od:comment-location-missing', documentVersion: `url:${frame.src}`, requestId: request.requestId } }));
  window.dispatchEvent(new MessageEvent('message', { source: frame.contentWindow, data: { ...target, requestedSelector: target.selector, elementId: 'replacement', text: 'new', type: 'od:comment-active-target-update', documentVersion: `url:${frame.src}`, requestId: request.requestId } }));
  expect(await result).toMatchObject({ elementId: 'replacement', text: 'new' });
});
it('does not save from a frame that navigated during validation', async () => {
  const frame = document.createElement('iframe'); document.body.append(frame);
  const recipient = frame.contentWindow;
  const post = vi.spyOn(recipient!, 'postMessage');
  const result = validateCommentSaveTarget(frame, target);
  const request = post.mock.calls[0]![0] as { requestId: string };
  frame.srcdoc = '<button>New document</button>';
  window.dispatchEvent(new MessageEvent('message', { source: recipient, data: { ...target, type: 'od:comment-active-target-update', documentVersion: `url:${frame.src}`, requestId: request.requestId } }));
  expect(await result).toBe('unavailable');
});
it('times out without treating a refreshing frame as a deleted target', async () => {
  vi.useFakeTimers();
  const frame = document.createElement('iframe'); document.body.append(frame);
  const result = validateCommentSaveTarget(frame, target);
  await vi.advanceTimersByTimeAsync(3000);
  expect(await result).toBe('unavailable');
});

it('saves over plain HTTP when crypto.randomUUID is unavailable', async () => {
  vi.stubGlobal('crypto', { getRandomValues: (bytes: Uint8Array) => bytes.fill(7) });
  const frame = document.createElement('iframe'); document.body.append(frame);
  const post = vi.spyOn(frame.contentWindow!, 'postMessage');
  const result = validateCommentSaveTarget(frame, target);
  const request = post.mock.calls[0]![0] as { requestId: string };
  expect(request.requestId).toMatch(/^comment-save-[0-9a-f-]{36}$/);
  window.dispatchEvent(new MessageEvent('message', { source: frame.contentWindow,
    data: { ...target, requestedSelector: target.selector, selector: '[data-od-comment-id="new"]', elementId: 'cmt:new',
      type: 'od:comment-active-target-update', documentVersion: `url:${frame.src}`, requestId: request.requestId } }));
  expect(await result).toMatchObject({ elementId: 'cmt:new', selector: '[data-od-comment-id="new"]' });
});
it('rejects a response for a different queried selector', async () => {
  const frame = document.createElement('iframe'); document.body.append(frame);
  const post = vi.spyOn(frame.contentWindow!, 'postMessage');
  const result = validateCommentSaveTarget(frame, target);
  const request = post.mock.calls[0]![0] as { requestId: string };
  window.dispatchEvent(new MessageEvent('message', { source: frame.contentWindow,
    data: { ...target, requestedSelector: 'other', type: 'od:comment-active-target-update', documentVersion: `url:${frame.src}`, requestId: request.requestId } }));
  expect(await result).toBe('unavailable');
});

it.each([{ color: 'blue', fontSize: '20px' }, undefined])('uses current style, including clearing absent style: %j', async style => {
  const frame = document.createElement('iframe'); document.body.append(frame);
  const post = vi.spyOn(frame.contentWindow!, 'postMessage');
  const result = validateCommentSaveTarget(frame, { ...target, style: { color: 'red', fontSize: '12px' } });
  const request = post.mock.calls[0]![0] as { requestId: string };
  window.dispatchEvent(new MessageEvent('message', { source: frame.contentWindow,
    data: { ...target, style, requestedSelector: target.selector,
      type: 'od:comment-active-target-update', documentVersion: `url:${frame.src}`, requestId: request.requestId } }));
  expect(await result).toMatchObject({ style });
});

it.each([3, 0, undefined])('replaces the old slide index with the current value: %j', async slideIndex => {
  const frame = document.createElement('iframe'); document.body.append(frame);
  const post = vi.spyOn(frame.contentWindow!, 'postMessage');
  const result = validateCommentSaveTarget(frame, { ...target, slideIndex: 1 });
  const request = post.mock.calls[0]![0] as { requestId: string };
  window.dispatchEvent(new MessageEvent('message', { source: frame.contentWindow,
    data: { ...target, slideIndex, requestedSelector: target.selector,
      type: 'od:comment-active-target-update', documentVersion: `url:${frame.src}`, requestId: request.requestId } }));
  expect(await result).toMatchObject({ slideIndex });
});
it('rejects an old URL document after src changes but before navigation commits', async () => {
  const frame = document.createElement('iframe'); frame.src = 'https://example.invalid/new?fr=2'; document.body.append(frame);
  const post = vi.spyOn(frame.contentWindow!, 'postMessage');
  const result = validateCommentSaveTarget(frame, target);
  const request = post.mock.calls[0]![0] as { requestId: string };
  window.dispatchEvent(new MessageEvent('message', { source: frame.contentWindow,
    data: { ...target, requestedSelector: target.selector, documentVersion: 'url:https://example.invalid/old?fr=1',
      type: 'od:comment-active-target-update', requestId: request.requestId } }));
  expect(await result).toBe('unavailable');
});
it.each(['srcdoc:old', 'srcdoc:new'])('checks the intrinsic srcdoc generation: %s', async documentVersion => {
  const frame = document.createElement('iframe'); document.body.append(frame);
  const post = vi.spyOn(frame.contentWindow!, 'postMessage');
  const result = validateCommentSaveTarget(frame, target, () => 'srcdoc:new');
  const request = post.mock.calls[0]![0] as { requestId: string };
  window.dispatchEvent(new MessageEvent('message', { source: frame.contentWindow,
    data: { ...target, requestedSelector: target.selector, documentVersion,
      type: 'od:comment-active-target-update', requestId: request.requestId } }));
  if (documentVersion === 'srcdoc:new') expect(await result).toMatchObject(target);
  else expect(await result).toBe('unavailable');
});
it('rejects a srcdoc generation change while its shell attributes stay unchanged', async () => {
  const frame = document.createElement('iframe'); document.body.append(frame);
  const post = vi.spyOn(frame.contentWindow!, 'postMessage');
  let generation = 'srcdoc:old';
  const result = validateCommentSaveTarget(frame, target, () => generation);
  const request = post.mock.calls[0]![0] as { requestId: string };
  generation = 'srcdoc:new';
  window.dispatchEvent(new MessageEvent('message', { source: frame.contentWindow,
    data: { ...target, requestedSelector: target.selector, documentVersion: 'srcdoc:old',
      type: 'od:comment-active-target-update', requestId: request.requestId } }));
  expect(await result).toBe('unavailable');
});
