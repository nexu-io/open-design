// @vitest-environment jsdom
import { cleanup, render, waitFor, act } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ContentHeightFrame } from '../../src/components/ContentHeightFrame';
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it('preserves isolation and relative assets, accepts growth and shrink only from its frame', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, text: async () => '<html><head></head><body><img src="image.png"></body></html>' }));
  const { container } = render(<ContentHeightFrame src="/kit/system.html" title="Kit" />);
  const frame = container.querySelector('iframe')!;
  await waitFor(() => expect(frame.srcdoc).toContain('<base href='));
  expect(frame.srcdoc).toContain('/kit/system.html');
  expect(frame.getAttribute('sandbox')).toBe('allow-scripts allow-popups');
  const send = (height: number, source: Window | null = frame.contentWindow) => act(() => {
    window.dispatchEvent(new MessageEvent('message', { source, data: { type: 'od:design-kit-content-height', height } }));
  });
  send(900); expect(frame.style.height).toBe('900px');
  send(340); expect(frame.style.height).toBe('340px');
  send(1000, window); expect(frame.style.height).toBe('340px');
  send(-1); expect(frame.style.height).toBe('340px');
});
