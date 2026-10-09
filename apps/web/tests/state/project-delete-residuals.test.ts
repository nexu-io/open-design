import { afterEach, expect, it, vi } from 'vitest';
import { deleteProject } from '../../src/state/projects';
afterEach(() => vi.unstubAllGlobals());
it('delivers every per-file residual once without changing the boolean deletion contract', async () => {
  const rows = [{ filePath: 'a.html', slug: 'a', retrying: true }, { filePath: 'b.html', slug: 'b', retrying: false, code: 'FAILED' }];
  const request = vi.fn(async () => Response.json({ ok: true, shareResiduals: rows }));
  vi.stubGlobal('fetch', request);
  const receive = vi.fn();
  expect(await deleteProject('gone', null, receive)).toBe(true);
  expect(receive).toHaveBeenCalledExactlyOnceWith(rows);
  expect(request).toHaveBeenCalledTimes(1);
});
it.each([{}, { ok: true }, { ok: true, shareResiduals: [] }])('does not invent residuals for legacy/empty success %j', async payload => {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json(payload)));
  const receive = vi.fn();
  expect(await deleteProject('gone', null, receive)).toBe(true);
  expect(receive).not.toHaveBeenCalled();
});
it('keeps structured not-found idempotent and does not redeliver', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ error: { code: 'PROJECT_NOT_FOUND' } }, { status: 404 })));
  const receive = vi.fn();
  expect(await deleteProject('gone', null, receive)).toBe(true);
  expect(receive).not.toHaveBeenCalled();
});
it('does not deliver from a failed deletion', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 403 })));
  const receive = vi.fn();
  await expect(deleteProject('gone', null, receive)).rejects.toThrow();
  expect(receive).not.toHaveBeenCalled();
});
