import { afterEach, expect, it, vi } from 'vitest';
const starts = vi.hoisted(() => [] as { filename: string; prewarm?: boolean }[]);
vi.mock('node:worker_threads', () => ({
  isMainThread: true, parentPort: null, workerData: null,
  Worker: class {
    constructor(_file: unknown, options: { workerData: { filename: string; prewarm?: boolean } }) { starts.push(options.workerData); }
    on() { return this; }
  },
}));
import { NativeInputStore, nativeInputPocEnabled } from '../../src/main/input-native-store.js';
afterEach(() => { starts.length = 0; vi.unstubAllEnvs(); });

it('N05 prepares validators when the native worker starts, before any input or read request', () => {
  vi.stubEnv('OD_INPUT_PREWARM_POC', undefined);
  new NativeInputStore('local-poc.sqlite');
  expect(starts).toEqual([{ filename: 'local-poc.sqlite', prewarm: true }]);
});
it('N06 can disable startup preparation for the local before/after control', () => {
  vi.stubEnv('OD_INPUT_PREWARM_POC', '0');
  new NativeInputStore('local-poc.sqlite');
  expect(starts).toEqual([{ filename: 'local-poc.sqlite', prewarm: false }]);
});

it('N07 packaged QA requires every local-only gate and rejects production destinations', () => {
  const env = { OD_INPUT_QA_BUNDLE: 'local-only', OD_INPUT_NATIVE_POC: '1', NEXT_PUBLIC_OD_INPUT_AGGREGATION_POC: '1', POSTHOG_KEY: 'phc_local_poc_only', POSTHOG_HOST: 'http://127.0.0.1:43190' };
  expect(nativeInputPocEnabled(true, env)).toBe(true);
  for (const key of Object.keys(env)) expect(nativeInputPocEnabled(true, { ...env, [key]: '' })).toBe(false);
  for (const host of ['https://us.i.posthog.com', 'http://127.0.0.1.evil.test', 'http://user@127.0.0.1', 'http://[::1]']) expect(nativeInputPocEnabled(true, { ...env, POSTHOG_HOST: host })).toBe(false);
  expect(nativeInputPocEnabled(true, { ...env, POSTHOG_KEY: 'phc_real' })).toBe(false);
});

it('N08 exposes trial storage only with an explicit capability and an approved bound target', () => {
  const env = { OD_INPUT_TRIAL_CAPABILITY: '1', POSTHOG_KEY: 'phc_example', POSTHOG_HOST: 'https://us.i.posthog.com' };
  expect(nativeInputPocEnabled(true, env)).toBe(true);
  for (const patch of [{ OD_INPUT_TRIAL_CAPABILITY: '' }, { POSTHOG_HOST: 'http://us.i.posthog.com' },
    { POSTHOG_KEY: 'phc_local_poc_only' }, { POSTHOG_HOST: 'https://us.i.posthog.com.evil.test' }]) {
    expect(nativeInputPocEnabled(true, { ...env, ...patch })).toBe(false);
  }
});
