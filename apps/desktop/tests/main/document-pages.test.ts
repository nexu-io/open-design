// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { measureDocumentPages } from '../../src/main/document-pages.js';

afterEach(() => { document.body.replaceChildren(); vi.restoreAllMocks(); });
function paper(height = 1122.5) {
  const node = document.createElement('main');
  node.dataset.odDocumentPage = '';
  document.body.append(node);
  vi.spyOn(node, 'getBoundingClientRect').mockReturnValue({ x: 0, y: 0, left: 0, top: 0,
    right: 793.7, bottom: height, width: 793.7, height, toJSON() {} });
  Object.defineProperties(node, { clientHeight: { value: height }, scrollHeight: { value: height, configurable: true } });
  return node;
}
describe('authored document pages', () => {
  it('does not classify ordinary web .page classes as paper', () => {
    document.body.innerHTML = '<main class="page">A long website</main>';
    expect(measureDocumentPages()).toEqual([]);
  });
  it('keeps one A4 page whole even though it is taller than the screenshot viewport', () => {
    paper();
    expect(measureDocumentPages()).toEqual([{ x: 0, y: 0, width: 793.7, height: 1122.5 }]);
  });
  it('keeps separately authored pages separate', () => {
    paper(); paper();
    expect(measureDocumentPages()).toHaveLength(2);
  });
  it('rejects overflow instead of silently clipping it', () => {
    const page = paper();
    page.style.overflow = 'hidden';
    Object.defineProperty(page, 'scrollHeight', { value: 1300 });
    expect(() => measureDocumentPages()).toThrow('exceeds its paper boundary');
  });
});
