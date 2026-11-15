// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useHostResolvedPreview } from '../../src/hooks/useHostResolvedPreview';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it('host-fetches the entry and retains canonical base and response CSP in an opaque srcdoc', async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response('<html><head></head><body>kit<img src="logo.svg"></body></html>', {
    headers: { 'content-type': 'text/html', 'content-location': '/static/previews/scope/files/kit/index.html', 'content-security-policy': "default-src 'none'; img-src 'self'; script-src 'unsafe-inline'" },
  }));
  vi.stubGlobal('fetch', fetcher);
  const url = '/api/design-systems/kit/showcase?workspaceId=a&workspaceMemberId=m';
  const { result } = renderHook(() => useHostResolvedPreview(url));
  await waitFor(() => expect(result.current).toContain('kit<img'));
  expect(fetcher).toHaveBeenCalledWith(url, expect.objectContaining({ signal: expect.any(AbortSignal), headers: { 'x-od-design-system-preview': '1' } }));
  const parsed = new DOMParser().parseFromString(result.current!, 'text/html');
  expect(parsed.querySelector('base')?.href).toBe(new URL('/static/previews/scope/files/kit/index.html', window.location.href).href);
  expect(parsed.querySelector('meta[http-equiv="Content-Security-Policy"]')?.getAttribute('content')).toContain("default-src 'none'");
});

it('evicts old identity immediately and ignores a late old response', async () => {
  let resolveOld!: (r: Response) => void;
  const fetcher = vi.fn().mockImplementationOnce(() => new Promise<Response>(r => { resolveOld = r; })).mockResolvedValue(new Response('<p>new workspace</p>', { headers: { 'content-type': 'text/html' } }));
  vi.stubGlobal('fetch', fetcher);
  const { result, rerender } = renderHook(({ url }) => useHostResolvedPreview(url), { initialProps: { url: '/api/plugins/a/preview?workspaceId=old' } });
  rerender({ url: '/api/plugins/a/preview?workspaceId=new' });
  expect(result.current).toBeUndefined();
  await waitFor(() => expect(result.current).toContain('new workspace'));
  await act(async () => { resolveOld(new Response('<p>old workspace</p>', { headers: { 'content-type': 'text/html' } })); });
  expect(result.current).not.toContain('old workspace');
  expect(fetcher.mock.calls[0]![1].signal.aborted).toBe(true);
});

it('clears an already displayed document before another identity loads', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response('<p>old</p>', { headers: { 'content-type': 'text/html' } })).mockImplementationOnce(() => new Promise(() => {})));
  const { result, rerender } = renderHook(({ url }) => useHostResolvedPreview(url), { initialProps: { url: '/api/plugins/a/preview' } });
  await waitFor(() => expect(result.current).toContain('<p>old</p>'));
  rerender({ url: '/api/plugins/b/preview' });
  expect(result.current).toBeUndefined();
});

it.each([new Response('denied', { status: 403 }), new Response('{"secret":true}', { headers: { 'content-type': 'application/json' } })])('never renders failed or non-HTML responses', async (response) => {
  const fetcher = vi.fn().mockResolvedValue(response);
  vi.stubGlobal('fetch', fetcher);
  const { result } = renderHook(() => useHostResolvedPreview('/api/plugins/a/preview'));
  await act(async () => {});
  expect(result.current).toBeUndefined();
});

it('does not reuse a previous document when the same URL is reactivated', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response('<p>old</p>', { headers: { 'content-type': 'text/html' } })).mockImplementationOnce(() => new Promise(() => {})));
  const { result, rerender } = renderHook(({ url }: { url: string | null }) => useHostResolvedPreview(url), { initialProps: { url: '/api/plugins/a/preview' as string | null } });
  await waitFor(() => expect(result.current).toContain('<p>old</p>'));
  rerender({ url: null });
  rerender({ url: '/api/plugins/a/preview' });
  expect(result.current).toBeUndefined();
});

it('preserves authored relative base against canonical metadata', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html><head><base href="../assets/"></head><body>kit</body></html>', { headers: { 'content-type': 'text/html', 'content-location': '/static/previews/s/files/pages/kit.html' } })));
  const { result } = renderHook(() => useHostResolvedPreview('/api/design-systems/a/showcase'));
  await waitFor(() => expect(result.current).toBeDefined());
  expect(new DOMParser().parseFromString(result.current!, 'text/html').querySelector('base')?.href).toBe(new URL('/static/previews/s/files/assets/', window.location.href).href);
});
