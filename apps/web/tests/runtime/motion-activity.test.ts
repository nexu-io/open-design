// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { MOTION_PREVIEW_ACTIVITY, MOTION_PREVIEW_PROBE, MOTION_PREVIEW_REQUEST } from '@open-design/contracts/runtime/motion-source-player';
import { bindMotionPreviewActivity, unbindMotionPreviewActivity } from '../../src/runtime/motion-preview-activity';
import { buildSrcdoc } from '../../src/runtime/srcdoc';

afterEach(() => {
  for (const frame of document.querySelectorAll('iframe')) unbindMotionPreviewActivity(frame);
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});
function frame() {
  const element = document.createElement('iframe');
  element.dataset.odActive = 'true';
  document.body.appendChild(element);
  const post = vi.spyOn(element.contentWindow!, 'postMessage').mockImplementation(() => {});
  bindMotionPreviewActivity(element);
  const request = (id: string, source: MessageEventSource | null = element.contentWindow) => window.dispatchEvent(new MessageEvent('message', {source, data:{type:MOTION_PREVIEW_REQUEST, id}}));
  return { element, post, request };
}

it('answers a reloaded hidden document with inactive and challenges it again on activation', async () => {
  const { element, post, request } = frame();
  request('first');
  expect(post).toHaveBeenLastCalledWith({type:MOTION_PREVIEW_ACTIVITY, id:'first', active:true}, '*');
  element.dataset.odActive = 'false';
  await Promise.resolve();
  expect(post).toHaveBeenLastCalledWith({type:MOTION_PREVIEW_ACTIVITY, active:false}, '*');
  request('reloaded');
  expect(post).toHaveBeenLastCalledWith({type:MOTION_PREVIEW_ACTIVITY, id:'reloaded', active:false}, '*');
  element.dataset.odActive = 'true';
  await Promise.resolve();
  expect(post).toHaveBeenLastCalledWith({type:MOTION_PREVIEW_PROBE}, '*');
  request('reloaded');
  expect(post).toHaveBeenLastCalledWith({type:MOTION_PREVIEW_ACTIVITY, id:'reloaded', active:true}, '*');
});

it('ignores a different frame and removes listeners when the frame is evicted', () => {
  const { element, post, request } = frame();
  post.mockClear();
  request('foreign', window);
  expect(post).not.toHaveBeenCalled();
  unbindMotionPreviewActivity(element);
  post.mockClear();
  request('after-eviction');
  element.dispatchEvent(new Event('load'));
  expect(post).not.toHaveBeenCalled();
});

it('marks only live video srcdoc and leaves standalone, frozen and ordinary documents unchanged', () => {
  const video='<meta name="od-motion-output" content="video"><main data-composition-id="main"></main>';
  const live=buildSrcdoc(video,{motionPreview:true});
  expect(live).toContain('window.__odMotionPreview=true');
  expect(live.indexOf('__odMotionPreview=true')).toBeLessThan(live.indexOf('data-od-motion-source-player'));
  expect(buildSrcdoc(video)).not.toContain('__odMotionPreview=true');
  expect(buildSrcdoc(video,{motionPreview:true,freezeMotion:true})).not.toContain('__odMotionPreview=true');
  for(const content of ['<main>Prototype</main>','<meta name="od-motion-output" content="interactive"><main>Interactive</main>','<main data-composition-id="legacy"></main>']) {
    expect(buildSrcdoc(content,{motionPreview:true})).toBe(buildSrcdoc(content));
  }
});


it('pauses an inactive motion document without changing ordinary iframe prewarming', async () => {
  const { element, post, request } = frame();
  element.dataset.odMotionActive = 'false';
  await Promise.resolve();
  expect(element.dataset.odActive).toBe('true');
  expect(post).toHaveBeenLastCalledWith({ type: MOTION_PREVIEW_ACTIVITY, active: false }, '*');
  request('warm-hidden-document');
  expect(post).toHaveBeenLastCalledWith({ type: MOTION_PREVIEW_ACTIVITY, id: 'warm-hidden-document', active: false }, '*');
  element.dataset.odMotionActive = 'true';
  await Promise.resolve();
  request('warm-hidden-document');
  expect(post).toHaveBeenLastCalledWith({ type: MOTION_PREVIEW_ACTIVITY, id: 'warm-hidden-document', active: true }, '*');
});


it('keeps generation mute across document reloads and updates it without changing activity', async () => {
  const { element, post, request } = frame();
  element.dataset.odMotionMuted = 'true';
  await Promise.resolve();
  expect(post).toHaveBeenLastCalledWith({ type: MOTION_PREVIEW_PROBE }, '*');
  request('new-document');
  expect(post).toHaveBeenLastCalledWith({ type: MOTION_PREVIEW_ACTIVITY, id: 'new-document', active: true, muted: true }, '*');
  request('reloaded-document');
  expect(post).toHaveBeenLastCalledWith({ type: MOTION_PREVIEW_ACTIVITY, id: 'reloaded-document', active: true, muted: true }, '*');
  element.dataset.odMotionMuted = 'false';
  await Promise.resolve();
  expect(post).toHaveBeenLastCalledWith({ type: MOTION_PREVIEW_PROBE }, '*');
  request('reloaded-document');
  expect(post).toHaveBeenLastCalledWith({ type: MOTION_PREVIEW_ACTIVITY, id: 'reloaded-document', active: true }, '*');
});
