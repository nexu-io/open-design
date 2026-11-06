import { randomUUID } from '../utils/uuid';
import type { PreviewCommentSnapshot } from './anchor';

/** Query the live frame by selector at save time. No publication-version or
 * semantic-identity comparison: a replacement at that selector is accepted. */
export function validateCommentSaveTarget(
  frame: HTMLIFrameElement | null,
  target: PreviewCommentSnapshot,
  currentDocumentVersion: () => string = () => `url:${frame?.src ?? ''}`,
): Promise<PreviewCommentSnapshot | 'missing' | 'unavailable'> {
  if (!frame?.contentWindow) return Promise.resolve('unavailable');
  const recipient = frame.contentWindow;
  const src = frame.src;
  const srcdoc = frame.srcdoc;
  const documentVersion = currentDocumentVersion();
  const requestId = `comment-save-${randomUUID()}`;
  return new Promise(resolve => {
    const finish = (result: PreviewCommentSnapshot | 'missing' | 'unavailable') => {
      window.clearTimeout(timeout);
      window.removeEventListener('message', receive);
      resolve(result);
    };
    const receive = (event: MessageEvent) => {
      const data = event.data;
      if (event.source !== recipient || data?.requestId !== requestId) return;
      if (!frame.isConnected || frame.src !== src || frame.srcdoc !== srcdoc) return finish('unavailable');
      if (currentDocumentVersion() !== documentVersion || data.documentVersion !== documentVersion) return finish('unavailable');
      if (data.type === 'od:comment-location-missing') return finish('missing');
      if (data.type !== 'od:comment-active-target-update') return;
      if (data.requestedSelector !== target.selector || typeof data.selector !== 'string' || !data.selector || typeof data.elementId !== 'string' || !data.elementId
        || !data.position || !['x', 'y', 'width', 'height'].every(key => Number.isFinite(data.position[key]))) return finish('unavailable');
      finish({ ...target, elementId: data.elementId, selector: data.selector,
        text: typeof data.text === 'string' ? data.text : target.text,
        label: typeof data.label === 'string' ? data.label : target.label,
        htmlHint: typeof data.htmlHint === 'string' ? data.htmlHint : target.htmlHint,
        style: data.style && typeof data.style === 'object' && !Array.isArray(data.style) ? data.style : undefined,
        slideIndex: Number.isInteger(data.slideIndex) && data.slideIndex >= 0 ? data.slideIndex : undefined,
        position: data.position });
    };
    const timeout = window.setTimeout(() => finish('unavailable'), 3000);
    window.addEventListener('message', receive);
    recipient.postMessage({ type: 'od:comment-active-target', elementId: target.elementId,
      selector: target.selector, validateForSave: true, requestId }, '*');
  });
}
