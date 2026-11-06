import { expect, it, vi } from 'vitest';
import { acceptClientExperienceDiagnostic } from '../src/routes/telemetry.js';
import { parseClientExperienceDiagnostic } from '@open-design/contracts/analytics';
const evidence = { occurrenceId: 'run:r:failed', category: 'visible_error', surface: 'chat', errorCode: 'FAILED', observedAt: 1, runId: 'r' };
function deps(metrics = true, content = true) {
  return { dataDir: '/isolated', readAppConfig: vi.fn(async () => ({ telemetry: { metrics, content } })) as never,
    writeAppConfig: vi.fn() as never, onClientExperience: vi.fn(() => 'incident') };
}
it.each([[false, true], [true, false], [false, false]])('refuses diagnostic collection for metrics=%s content=%s', async (metrics, content) => {
  const d = deps(metrics, content);
  expect(await acceptClientExperienceDiagnostic(d, evidence)).toEqual({ ok: true, accepted: false });
  expect(d.onClientExperience).not.toHaveBeenCalled();
});
it('allows only schema metadata into the diagnostic queue', async () => {
  const d = deps();
  expect(await acceptClientExperienceDiagnostic(d, { ...evidence, message: 'SECRET', url: 'PRIVATE' })).toEqual({ ok: true, accepted: true });
  expect(d.onClientExperience).toHaveBeenCalledWith(evidence);
});
it.each([{ runId: '../../secret' }, { surface: 'free text' }, { observedAt: NaN }, { occurrenceId: 'x'.repeat(513) }])('rejects malformed metadata %s', async (patch) => {
  const d = deps();
  expect(await acceptClientExperienceDiagnostic(d, { ...evidence, ...patch })).toEqual({ ok: false });
  expect(d.onClientExperience).not.toHaveBeenCalled();
});
it('fails closed if preferences cannot be read', async () => {
  const d = deps(); d.readAppConfig = vi.fn(async () => { throw new Error('corrupt config'); }) as never;
  expect(await acceptClientExperienceDiagnostic(d, evidence)).toEqual({ ok: true, accepted: false });
  expect(d.onClientExperience).not.toHaveBeenCalled();
});
it('rejects non-object payloads', () => {
  for (const input of [null, 'text', [], 1]) expect(parseClientExperienceDiagnostic(input)).toBeNull();
});

it('signals a temporary unavailable outbox for bounded transport retry', async () => {
  const d = { ...deps(), onClientExperience: () => null };
  expect(await acceptClientExperienceDiagnostic(d, evidence)).toEqual({ ok: true, accepted: false, retryable: true });
});
