import type { TimelineElement } from '../player';
import type { SelectedMedia } from './MediaGatewayContext';

/** Runtime media URLs are rebased to the project root. Never turn a remote URL into a local input. */
export function projectMediaPath(src: string, sourceFile?: string): string | null {
  let value = src;
  if (/^https?:/i.test(value)) {
    const url = new URL(value);
    if (url.origin !== window.location.origin) return null;
    value = url.pathname;
  }
  if (/^(?:[a-z][\w+.-]*:|\/\/)/i.test(value)) return null;
  const preview = /^\/api\/projects\/[^/]+\/preview\//.test(value);
  value = value.replace(/^\/api\/projects\/[^/]+\/preview\//, '').split(/[?#]/)[0];
  if (sourceFile && !preview && !value.startsWith('/')) value = new URL(value, `https://project.invalid/${sourceFile}`).pathname.slice(1);
  value = value.replace(/^\.\//, '');
  try { value = decodeURIComponent(value); } catch { return null; }
  if (!value || value.startsWith('/') || value.split('/').some(part => part === '..') || value.includes('\\')) return null;
  return value;
}

export function selectedMedia(element?: TimelineElement | null): SelectedMedia | undefined {
  const modality = element?.tag === 'img' ? 'image' : element?.tag === 'video' ? 'video' : element?.tag === 'audio' ? 'audio' : undefined;
  const path = element?.src ? projectMediaPath(element.src) : null;
  if (!element || !path || !modality || element.timelineLocked || element.compositionSrc) return undefined;
  return { key: element.key ?? element.id, elementId: element.domId ?? element.id, src: element.src!, path, sourceFile: element.sourceFile,
    modality, label: element.label || path.split('/').pop() || element.id };
}
