import { afterEach, describe, expect, it } from 'vitest';
import {
  amrAutoRechargeUrlForProfile,
  amrConsoleUrlForProfile,
  amrConsoleUrlForWorkspace,
  amrPlansUrlForProfile,
  amrPlansUrlForWorkspace,
  amrWorkspaceUrl,
  setRuntimeAmrConsoleOrigin,
} from '../../src/runtime/amr-guidance';

const runtimeOrigin = 'https://console.example.invalid/cloud';
const prodDashboard = 'https://open-design.ai/cloud/dashboard';

afterEach(() => setRuntimeAmrConsoleOrigin(null));

// CS-04 (DD:1312), CMP-K2 (DD:973), inventory C-03. AMR owns role/Free routing.
const profiles = [
  { profile: 'prod', dashboard: prodDashboard },
  { profile: 'test', dashboard: 'https://open-design.powerformer.net/cloud/dashboard' },
  { profile: 'local', dashboard: 'http://localhost:5173/dashboard' },
  { profile: 'feature-test', dashboard: prodDashboard },
  { profile: 'feature-test', runtime: runtimeOrigin, dashboard: `${runtimeOrigin}/dashboard` },
  { profile: 'test', runtime: runtimeOrigin, dashboard: `${runtimeOrigin}/dashboard` },
  { profile: 'local', runtime: runtimeOrigin, dashboard: `${runtimeOrigin}/dashboard` },
  { profile: 'prod', runtime: runtimeOrigin, dashboard: prodDashboard },
  { profile: 'unknown', runtime: runtimeOrigin, dashboard: prodDashboard },
];
const intents = [
  { intent: 'plan', build: amrPlansUrlForProfile },
  { intent: 'auto-recharge', build: amrAutoRechargeUrlForProfile },
];

describe.each(profiles)('C-03 profile=$profile runtime=$runtime', ({ profile, runtime, dashboard }) => {
  it.each(intents)('pins billing=$intent to the encoded current workspace in canonical order', ({ intent, build }) => {
    setRuntimeAmrConsoleOrigin(runtime);
    const url = build(profile, '  space /中?&=+#  ');
    const suffix = intent ? `&billing=${intent}` : '';
    expect(url).toBe(`${dashboard}?workspaceId=space+%2F%E4%B8%AD%3F%26%3D%2B%23&source=open_design${suffix}`);
    const parsed = new URL(url);
    expect(parsed.searchParams.get('workspaceId')).toBe('space /中?&=+#');
    expect([...parsed.searchParams.keys()]).toEqual(intent ? ['workspaceId', 'source', 'billing'] : ['workspaceId', 'source']);
    expect(parsed.searchParams.has('interval')).toBe(false);
  });

  it.each(intents)('preserves byte-identical legacy billing=$intent without workspace context', ({ intent, build }) => {
    setRuntimeAmrConsoleOrigin(runtime);
    const suffix = intent && intent !== 'recharge' ? `&billing=${intent}` : '';
    const expected = `${dashboard}?source=open_design${suffix}`;
    expect(build(profile)).toBe(expected);
    for (const blank of [undefined, null, '', ' \t\n ']) {
      expect(build(profile, blank)).toBe(expected);
    }
  });

  it('keeps the workspace-only signatures and null semantics', () => {
    setRuntimeAmrConsoleOrigin(runtime);
    expect(amrConsoleUrlForWorkspace(profile, ' ws-1 ')).toBe(`${dashboard}?workspaceId=ws-1&source=open_design`);
    expect(amrPlansUrlForWorkspace(profile, ' ws-1 ')).toBe(`${dashboard}?workspaceId=ws-1&source=open_design&billing=plan`);
    for (const blank of [undefined, null, '', ' \t\n ']) {
      expect(amrConsoleUrlForWorkspace(profile, blank)).toBeNull();
      expect(amrPlansUrlForWorkspace(profile, blank)).toBeNull();
    }
  });
});

describe('C-03 explicit status origin compatibility', () => {
  it('keeps consoleOrigin in argument two and gives it precedence for non-prod', () => {
    setRuntimeAmrConsoleOrigin('https://fallback.example.invalid');
    expect(amrConsoleUrlForProfile('test', ` ${runtimeOrigin}/ `)).toBe(
      `${runtimeOrigin}/dashboard?source=open_design`,
    );
    for (const profile of ['prod', 'unknown', null, undefined, ' ']) {
      expect(amrConsoleUrlForProfile(profile, runtimeOrigin)).toBe(
        `${prodDashboard}?source=open_design`,
      );
    }
  });
});

// Settings-derived URLs share the same workspace construction without changing
// the section resolver or its malformed-URL fallback (TASK C caller-only edits).
describe('C-03 settings-derived console URL', () => {
  it('replaces stale workspace/source while preserving the base path and remaining parameters', () => {
    expect(amrWorkspaceUrl('https://console.example.invalid/cloud/dashboard?source=old&workspaceId=stale&lang=en', 'current', 'recharge')).toBe(
      'https://console.example.invalid/cloud/dashboard?workspaceId=current&source=open_design&lang=en&billing=recharge',
    );
  });

  it('lets callers retain their existing fallback for malformed or unscoped bases', () => {
    expect(amrWorkspaceUrl('not-a-url', 'current')).toBeNull();
    expect(amrWorkspaceUrl('https://console.example.invalid/dashboard', ' ')).toBeNull();
  });
});
