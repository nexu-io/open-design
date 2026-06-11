import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  classifyCodexImageAuth,
  classifyCodexImageFailure,
  codexImageAuthErrorMessage,
  codexImageFailureMessage,
  inspectCodexImageAuth,
  resolveCodexHome,
  topLevelModelProvider,
} from '../src/codex-image-auth.js';

// Two real-shape ~/.codex/auth.json fixtures. Schema mirrors openai/codex
// codex-rs/login AuthDotJson: `auth_mode` (lowercase serde), `OPENAI_API_KEY`,
// `tokens` { access_token, account_id, id_token, refresh_token }, last_refresh.
// Token values are obvious fakes — no real credential lives in the repo.
const SUBSCRIPTION_AUTH = {
  auth_mode: 'chatgpt',
  OPENAI_API_KEY: null,
  tokens: {
    access_token: 'eyJhbGci.FAKE.subscription',
    account_id: 'acct_fake_0001',
    id_token: 'id_fake_0001',
    refresh_token: 'rt_fake_0001',
  },
  last_refresh: '2026-06-11T00:00:00Z',
};
const API_KEY_AUTH = {
  auth_mode: 'apikey',
  OPENAI_API_KEY: 'sk-fake-test-not-a-real-key',
};

describe('classifyCodexImageAuth (pure)', () => {
  it('accepts a ChatGPT subscription (OAuth tokens) with no provider override', () => {
    expect(classifyCodexImageAuth(SUBSCRIPTION_AUTH, null)).toEqual({ ok: true });
  });

  it('accepts a subscription whose config pins the default openai provider', () => {
    const cfg = 'model = "gpt-5.4"\nmodel_provider = "openai"\n';
    expect(classifyCodexImageAuth(SUBSCRIPTION_AUTH, cfg)).toEqual({ ok: true });
  });

  it('rejects a subscription routed through a third-party model_provider', () => {
    const cfg = 'model = "glm-4.6"\nmodel_provider = "my-gateway"\n';
    expect(classifyCodexImageAuth(SUBSCRIPTION_AUTH, cfg)).toEqual({
      ok: false,
      reason: 'third-party-provider',
      detail: 'my-gateway',
    });
  });

  it('rejects API-key auth (no image_gen tool on the Images API)', () => {
    expect(classifyCodexImageAuth(API_KEY_AUTH, null)).toEqual({
      ok: false,
      reason: 'api-key',
    });
  });

  it('rejects programmatic auth modes', () => {
    expect(
      classifyCodexImageAuth({ auth_mode: 'agentIdentity' }, null),
    ).toEqual({ ok: false, reason: 'programmatic', detail: 'agentIdentity' });
  });

  it('reports not-signed-in for an empty / missing auth file', () => {
    expect(classifyCodexImageAuth(null, null)).toEqual({
      ok: false,
      reason: 'not-signed-in',
    });
    expect(classifyCodexImageAuth({}, null)).toEqual({
      ok: false,
      reason: 'not-signed-in',
    });
  });

  it('prefers OAuth tokens over a stale OPENAI_API_KEY field (codex resolved_mode order)', () => {
    const both = { ...SUBSCRIPTION_AUTH, OPENAI_API_KEY: 'sk-stale' };
    expect(classifyCodexImageAuth(both, null)).toEqual({ ok: true });
  });
});

describe('topLevelModelProvider', () => {
  it('extracts a top-level override', () => {
    expect(topLevelModelProvider('model_provider = "azure"\n')).toBe('azure');
  });

  it('ignores keys inside a [table] (no false positive from provider defs)', () => {
    const cfg = '[model_providers.azure]\nbase_url = "https://x"\nmodel_provider = "azure"\n';
    expect(topLevelModelProvider(cfg)).toBe('');
  });

  it('ignores comments and returns empty when unset', () => {
    expect(topLevelModelProvider('# model_provider = "azure"\nmodel = "gpt-5.4"\n')).toBe('');
  });
});

describe('resolveCodexHome', () => {
  it('honors CODEX_HOME, else falls back to ~/.codex', () => {
    expect(resolveCodexHome({ CODEX_HOME: '/tmp/cx' })).toBe('/tmp/cx');
    expect(resolveCodexHome({})).toMatch(/[/\\]\.codex$/);
  });
});

describe('inspectCodexImageAuth (reads $CODEX_HOME)', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'od-codex-auth-'));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const writeHome = async (
    name: string,
    auth: unknown,
    config?: string,
  ): Promise<string> => {
    const home = path.join(dir, name);
    await mkdir(home, { recursive: true });
    await writeFile(path.join(home, 'auth.json'), JSON.stringify(auth, null, 2));
    if (config != null) await writeFile(path.join(home, 'config.toml'), config);
    return home;
  };

  it('verdict ok for a subscription auth.json fixture', async () => {
    const home = await writeHome('sub', SUBSCRIPTION_AUTH, 'model = "gpt-5.4"\n');
    expect(await inspectCodexImageAuth({ CODEX_HOME: home })).toEqual({ ok: true });
  });

  it('verdict api-key for an API-key auth.json fixture', async () => {
    const home = await writeHome('key', API_KEY_AUTH);
    expect(await inspectCodexImageAuth({ CODEX_HOME: home })).toEqual({
      ok: false,
      reason: 'api-key',
    });
  });

  it('verdict not-signed-in when $CODEX_HOME has no auth.json', async () => {
    const home = path.join(dir, 'empty');
    await mkdir(home, { recursive: true });
    expect(await inspectCodexImageAuth({ CODEX_HOME: home })).toEqual({
      ok: false,
      reason: 'not-signed-in',
    });
  });
});

describe('codexImageAuthErrorMessage', () => {
  it('every reason yields ChatGPT-login guidance', () => {
    for (const reason of ['not-signed-in', 'api-key', 'programmatic'] as const) {
      const msg = codexImageAuthErrorMessage({ ok: false, reason });
      expect(msg).toMatch(/codex login/i);
      expect(msg).toMatch(/ChatGPT/);
    }
    const tp = codexImageAuthErrorMessage({
      ok: false,
      reason: 'third-party-provider',
      detail: 'my-gateway',
    });
    expect(tp).toMatch(/my-gateway/);
    expect(tp).toMatch(/model_provider/);
  });
});

describe('classifyCodexImageFailure + message', () => {
  it('classifies usage-limit / 429 as quota', () => {
    expect(classifyCodexImageFailure("You've hit your usage limit. try again at 3pm")).toBe('quota');
    expect(classifyCodexImageFailure('stream error: 429 Too Many Requests')).toBe('quota');
  });

  it('classifies 401 / login errors as auth', () => {
    expect(classifyCodexImageFailure('Error: 401 Unauthorized')).toBe('auth');
    expect(classifyCodexImageFailure('please run codex login')).toBe('auth');
  });

  it('classifies network/crash as transient', () => {
    expect(classifyCodexImageFailure('boom: codex blew up')).toBe('transient');
    expect(classifyCodexImageFailure('read ECONNRESET')).toBe('transient');
  });

  it('does not mislabel benign transient phrases as quota/auth', () => {
    // "try again later" is a transient phrase, not a usage-limit signal.
    expect(classifyCodexImageFailure('temporary server error, please try again later')).toBe('transient');
    // An embedded request id must not trip the numeric HTTP-code guards.
    expect(classifyCodexImageFailure('stream error: request req-401-abc dropped')).toBe('transient');
    expect(classifyCodexImageFailure('trace id 4290 timed out')).toBe('transient');
  });

  it('quota/auth messages guide recovery; transient preserves the exit wording', () => {
    expect(
      codexImageFailureMessage({ reason: 'exit 1', tail: 'usage limit', output: 'usage limit' }),
    ).toMatch(/usage limit|resets/i);
    expect(
      codexImageFailureMessage({ reason: 'exit 1', tail: '401', output: '401 unauthorized' }),
    ).toMatch(/codex login/i);
    expect(
      codexImageFailureMessage({ reason: 'exit 1', tail: 'boom', output: 'boom' }),
    ).toMatch(/codex image_gen exited exit 1/i);
  });
});
