import http from 'node:http';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import express from 'express';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest';

import { readAppConfig, writeAppConfig } from '../src/app-config.js';
import { isLocalSameOrigin } from '../src/origin-validation.js';

// Default telemetry preference applied when an existing config has no
// telemetry block (fresh install, pre-disclosure). See
// `app-config.ts#applyTelemetryDefaults` and `state/config.ts#DEFAULT_CONFIG`
// for the matching client default. Tests that previously expected an
// empty `{}` are now updated to expect this default; tests confirming
// "user opted out → stays opted out" assert on `metrics: false`.
const DEFAULT_TELEMETRY = {
  metrics: true,
  content: true,
} as const;

describe('app-config', () => {
  let dataDir: string;

  beforeEach(async () => {
    dataDir = await mkdtemp(path.join(tmpdir(), 'od-appconfig-'));
  });

  afterEach(async () => {
    await rm(dataDir, { recursive: true, force: true });
  });

  describe('readAppConfig', () => {
    it('returns default telemetry when config file does not exist', async () => {
      expect(await readAppConfig(dataDir)).toEqual({
        telemetry: DEFAULT_TELEMETRY,
      });
    });

    it('returns parsed config from existing file (with default telemetry)', async () => {
      await writeFile(
        path.join(dataDir, 'app-config.json'),
        JSON.stringify({ onboardingCompleted: true }),
      );
      const cfg = await readAppConfig(dataDir);
      expect(cfg.onboardingCompleted).toBe(true);
      expect(cfg.telemetry).toEqual(DEFAULT_TELEMETRY);
    });

    it('returns default telemetry for corrupted JSON without crashing', async () => {
      await writeFile(path.join(dataDir, 'app-config.json'), '{not valid');
      const cfg = await readAppConfig(dataDir);
      expect(cfg).toEqual({ telemetry: DEFAULT_TELEMETRY });
    });

    it('returns default telemetry when file contains a JSON array', async () => {
      await writeFile(path.join(dataDir, 'app-config.json'), '[1,2,3]');
      const cfg = await readAppConfig(dataDir);
      expect(cfg).toEqual({ telemetry: DEFAULT_TELEMETRY });
    });

    it('returns default telemetry when file contains a JSON primitive', async () => {
      await writeFile(path.join(dataDir, 'app-config.json'), '"hello"');
      const cfg = await readAppConfig(dataDir);
      expect(cfg).toEqual({ telemetry: DEFAULT_TELEMETRY });
    });

    it('filters out unknown keys from stored file', async () => {
      await writeFile(
        path.join(dataDir, 'app-config.json'),
        JSON.stringify({ agentId: 'claude', rogue: 'value', __proto: 'x' }),
      );
      const cfg = await readAppConfig(dataDir);
      expect(cfg).toEqual({ agentId: 'claude', telemetry: DEFAULT_TELEMETRY });
      expect(cfg).not.toHaveProperty('rogue');
      expect(cfg).not.toHaveProperty('__proto');
    });

    it('filters out invalid scalar values from stored file', async () => {
      await writeFile(
        path.join(dataDir, 'app-config.json'),
        JSON.stringify({
          onboardingCompleted: 'yes',
          agentId: 123,
          skillId: { id: 'bad' },
          designSystemId: ['bad'],
        }),
      );
      const cfg = await readAppConfig(dataDir);
      expect(cfg).toEqual({ telemetry: DEFAULT_TELEMETRY });
    });

    it('preserves an explicit telemetry opt-out across reads', async () => {
      // Regression guard: the `applyTelemetryDefaults` helper must only
      // fill in defaults when the saved config has NO telemetry field.
      // A user who explicitly opted out (toggled metrics off in
      // Settings → Privacy) keeps `metrics: false`; we never silently
      // re-enable it on read.
      await writeFile(
        path.join(dataDir, 'app-config.json'),
        JSON.stringify({
          telemetry: { metrics: false, content: false, artifactManifest: false },
        }),
      );
      const cfg = await readAppConfig(dataDir);
      expect(cfg.telemetry).toEqual({
        metrics: false,
        content: false,
        artifactManifest: false,
      });
    });

    it('preserves a partial explicit telemetry (metrics on, content off)', async () => {
      // The user picked a non-default combo (e.g. metrics on for funnel,
      // content off for privacy). We hand back exactly what they saved
      // — defaults never overwrite explicit per-field choices.
      await writeFile(
        path.join(dataDir, 'app-config.json'),
        JSON.stringify({ telemetry: { metrics: true, content: false } }),
      );
      const cfg = await readAppConfig(dataDir);
      expect(cfg.telemetry).toEqual({ metrics: true, content: false });
    });

    it('preserves omitted orbit.templateSkillId from legacy stored config', async () => {
      await writeFile(
        path.join(dataDir, 'app-config.json'),
        JSON.stringify({
          orbit: {
            enabled: true,
            time: '09:30',
          },
        }),
      );

      const cfg = await readAppConfig(dataDir);

      expect(cfg.orbit).toEqual({
        enabled: true,
        time: '09:30',
      });
      expect(cfg.orbit).not.toHaveProperty('templateSkillId');
    });

    it('falls back to default orbit time for out-of-range stored values', async () => {
      await writeFile(
        path.join(dataDir, 'app-config.json'),
        JSON.stringify({
          orbit: {
            enabled: true,
            time: '99:99',
          },
        }),
      );

      const cfg = await readAppConfig(dataDir);

      expect(cfg.orbit).toEqual({
        enabled: true,
        time: '08:00',
      });
    });

    it('preserves explicit orbit.templateSkillId null and trimmed string', async () => {
      await writeFile(
        path.join(dataDir, 'app-config.json'),
        JSON.stringify({
          orbit: {
            enabled: false,
            time: '08:00',
            templateSkillId: null,
          },
        }),
      );

      let cfg = await readAppConfig(dataDir);
      expect(cfg.orbit).toEqual({
        enabled: false,
        time: '08:00',
        templateSkillId: null,
      });

      await writeFile(
        path.join(dataDir, 'app-config.json'),
        JSON.stringify({
          orbit: {
            enabled: true,
            time: '10:15',
            templateSkillId: '  orbit-general  ',
          },
        }),
      );

      cfg = await readAppConfig(dataDir);
      expect(cfg.orbit).toEqual({
        enabled: true,
        time: '10:15',
        templateSkillId: 'orbit-general',
      });
    });
  });

  describe('writeAppConfig', () => {
    it('creates data directory if missing', async () => {
      const nested = path.join(dataDir, 'sub', 'dir');
      await writeAppConfig(nested, { onboardingCompleted: true });
      const cfg = await readAppConfig(nested);
      expect(cfg.onboardingCompleted).toBe(true);
    });

    it('only persists ALLOWED_KEYS, filtering unknown keys', async () => {
      await writeAppConfig(dataDir, {
        onboardingCompleted: true,
        unknownKey: 'should be dropped',
        agentId: 'claude',
      });
      const cfg = await readAppConfig(dataDir);
      expect(cfg).toEqual({
        onboardingCompleted: true,
        agentId: 'claude',
        telemetry: DEFAULT_TELEMETRY,
      });
      expect(cfg).not.toHaveProperty('unknownKey');
    });

    it('does not persist invalid scalar values', async () => {
      await writeAppConfig(dataDir, {
        onboardingCompleted: 'yes',
        agentId: 123,
        skillId: false,
        designSystemId: { id: 'bad' },
      });
      const cfg = await readAppConfig(dataDir);
      expect(cfg).toEqual({ telemetry: DEFAULT_TELEMETRY });
    });

    it('merges with existing config', async () => {
      await writeAppConfig(dataDir, { agentId: 'claude' });
      await writeAppConfig(dataDir, { skillId: 'coder' });
      const cfg = await readAppConfig(dataDir);
      expect(cfg.agentId).toBe('claude');
      expect(cfg.skillId).toBe('coder');
    });

    it('clears a key when null is sent', async () => {
      await writeAppConfig(dataDir, { agentId: 'claude', skillId: 'coder' });
      await writeAppConfig(dataDir, { agentId: null });
      const cfg = await readAppConfig(dataDir);
      expect(cfg.agentId).toBeNull();
      expect(cfg.skillId).toBe('coder');
    });

    it('clears agentModels when null is sent', async () => {
      await writeAppConfig(dataDir, {
        agentModels: { a: { model: 'gpt-4' } },
        onboardingCompleted: true,
      });
      expect((await readAppConfig(dataDir)).agentModels).toBeDefined();
      await writeAppConfig(dataDir, { agentModels: null });
      const cfg = await readAppConfig(dataDir);
      expect(cfg.agentModels).toBeUndefined();
      expect(cfg.onboardingCompleted).toBe(true);
    });

    it('clears agentModels when empty object is sent', async () => {
      await writeAppConfig(dataDir, {
        agentModels: { a: { model: 'gpt-4' } },
      });
      await writeAppConfig(dataDir, { agentModels: {} });
      const cfg = await readAppConfig(dataDir);
      expect(cfg.agentModels).toBeUndefined();
    });

    it('validates agentModels entries, dropping invalid shapes', async () => {
      await writeAppConfig(dataDir, {
        agentModels: {
          validAgent: { model: 'gpt-4', reasoning: 'fast' },
          invalidAgent: 'not-an-object',
          arrayAgent: [1, 2, 3],
          badKeys: { model: 'ok', extra: 42 },
        },
      });
      const cfg = await readAppConfig(dataDir);
      expect(cfg.agentModels).toEqual({
        validAgent: { model: 'gpt-4', reasoning: 'fast' },
      });
    });

    it('drops agentModels entirely when no entries are valid', async () => {
      await writeAppConfig(dataDir, {
        onboardingCompleted: true,
        agentModels: { bad: 'string-value' },
      });
      const cfg = await readAppConfig(dataDir);
      expect(cfg.onboardingCompleted).toBe(true);
      expect(cfg.agentModels).toBeUndefined();
    });

    it('persists supported per-agent CLI env keys and drops everything else', async () => {
      await writeAppConfig(dataDir, {
        agentCliEnv: {
          claude: {
            CLAUDE_CONFIG_DIR: '  ~/.claude-2  ',
            ANTHROPIC_BASE_URL: '  https://proxy.example/anthropic  ',
            ANTHROPIC_API_KEY: '  sk-proxy-anthropic  ',
            ANTHROPIC_AUTH_TOKEN: '  sk-proxy-token  ',
            MMD_MODEL_ROUTES_FILE: '  ~/.config/mms/model-routes.json  ',
          },
          codex: {
            CODEX_HOME: '~/.codex-alt',
            CODEX_BIN: '~/bin/codex-next',
            OPENAI_BASE_URL: '  https://proxy.example/openai  ',
            OPENAI_API_KEY: '  sk-proxy-openai  ',
          },
          amr: {
            VELA_BIN: '~/bin/vela',
            VELA_API_URL: '  https://custom-amr.example  ',
            OPEN_DESIGN_AMR_PROFILE: '  local  ',
            OPENCODE_TEST_HOME: '  ~/.open-design-amr-opencode  ',
            HOME: 'should-not-persist',
          },
          'trae-cli': {
            TRAE_CLI_BIN: '  ~/bin/traecli-public  ',
          },
          gemini: {
            GEMINI_API_KEY: 'should-not-persist',
          },
          __proto__: {
            CLAUDE_CONFIG_DIR: 'bad',
          },
        },
      });

      const cfg = await readAppConfig(dataDir);

      expect(cfg.agentCliEnv).toEqual({
        claude: { CLAUDE_CONFIG_DIR: '~/.claude-2', ANTHROPIC_BASE_URL: 'https://proxy.example/anthropic', ANTHROPIC_API_KEY: 'sk-proxy-anthropic', ANTHROPIC_AUTH_TOKEN: 'sk-proxy-token', MMD_MODEL_ROUTES_FILE: '~/.config/mms/model-routes.json' },
        codex: { CODEX_HOME: '~/.codex-alt', CODEX_BIN: '~/bin/codex-next', OPENAI_BASE_URL: 'https://proxy.example/openai', OPENAI_API_KEY: 'sk-proxy-openai' },
        amr: {
          VELA_BIN: '~/bin/vela',
          VELA_API_URL: 'https://custom-amr.example',
          OPEN_DESIGN_AMR_PROFILE: 'local',
          OPENCODE_TEST_HOME: '~/.open-design-amr-opencode',
        },
        'trae-cli': { TRAE_CLI_BIN: '~/bin/traecli-public' },
      });
    });

    it('drops legacy standalone Claude and Codex auth keys without base URLs or CLI intent', async () => {
      await writeFile(path.join(dataDir, 'app-config.json'), JSON.stringify({
        agentCliEnv: {
          claude: {
            CLAUDE_CONFIG_DIR: '~/.claude-2',
            ANTHROPIC_API_KEY: 'sk-legacy-anthropic',
            ANTHROPIC_AUTH_TOKEN: 'sk-legacy-token',
          },
          codex: {
            CODEX_HOME: '~/.codex-alt',
            CODEX_API_KEY: 'sk-legacy-codex',
            OPENAI_API_KEY: 'sk-legacy-openai',
          },
        },
      }));

      const cfg = await readAppConfig(dataDir);

      expect(cfg.agentCliEnv).toEqual({
        claude: { CLAUDE_CONFIG_DIR: '~/.claude-2' },
        codex: { CODEX_HOME: '~/.codex-alt' },
      });
      expect(cfg.agentCliEnvIntent).toBeUndefined();
    });

    it('keeps explicit CLI API key overrides without requiring base URLs', async () => {
      await writeAppConfig(dataDir, {
        agentCliEnv: {
          claude: { ANTHROPIC_API_KEY: 'sk-anthropic' },
          codex: { CODEX_API_KEY: 'sk-codex', OPENAI_API_KEY: 'sk-openai' },
        },
        agentCliEnvIntent: {
          claude: { apiKeyOverride: true },
          codex: { apiKeyOverride: true },
        },
      });

      const cfg = await readAppConfig(dataDir);

      expect(cfg.agentCliEnv).toEqual({
        claude: { ANTHROPIC_API_KEY: 'sk-anthropic' },
        codex: { CODEX_API_KEY: 'sk-codex', OPENAI_API_KEY: 'sk-openai' },
      });
      expect(cfg.agentCliEnvIntent).toEqual({
        claude: { apiKeyOverride: true },
        codex: { apiKeyOverride: true },
      });
    });

    it('infers CLI API key override intent for explicit agentCliEnv writes', async () => {
      await writeAppConfig(dataDir, {
        agentCliEnv: {
          claude: { ANTHROPIC_AUTH_TOKEN: 'sk-anthropic-token' },
          codex: { CODEX_API_KEY: 'sk-codex' },
        },
      });

      const cfg = await readAppConfig(dataDir);

      expect(cfg.agentCliEnv).toEqual({
        claude: { ANTHROPIC_AUTH_TOKEN: 'sk-anthropic-token' },
        codex: { CODEX_API_KEY: 'sk-codex' },
      });
      expect(cfg.agentCliEnvIntent).toEqual({
        claude: { apiKeyOverride: true },
        codex: { apiKeyOverride: true },
      });
    });

    it('does not infer CLI API key override intent when reading legacy disk config', async () => {
      await writeFile(path.join(dataDir, 'app-config.json'), JSON.stringify({
        agentCliEnv: {
          codex: { CODEX_API_KEY: 'sk-legacy-codex' },
        },
      }));

      const cfg = await readAppConfig(dataDir);

      expect(cfg.agentCliEnv).toBeUndefined();
      expect(cfg.agentCliEnvIntent).toBeUndefined();
    });

    it('drops orphan CLI env intent entries when the agent env is empty', async () => {
      await writeAppConfig(dataDir, {
        agentCliEnv: {
          claude: { CLAUDE_CONFIG_DIR: '~/.claude-2' },
        },
        agentCliEnvIntent: {
          codex: { apiKeyOverride: true },
        },
      });

      const cfg = await readAppConfig(dataDir);

      expect(cfg.agentCliEnv).toEqual({
        claude: { CLAUDE_CONFIG_DIR: '~/.claude-2' },
      });
      expect(cfg.agentCliEnvIntent).toBeUndefined();
    });

    it('drops agentCliEnv entries that collide with Object.prototype keys', async () => {
      await writeAppConfig(dataDir, {
        agentCliEnv: {
          toString: {
            CODEX_HOME: '~/.codex-prototype',
          },
          hasOwnProperty: {
            CLAUDE_CONFIG_DIR: '~/.claude-prototype',
          },
          claude: {
            CLAUDE_CONFIG_DIR: '~/.claude-2',
          },
        },
      });

      const cfg = await readAppConfig(dataDir);

      expect(cfg.agentCliEnv).toEqual({
        claude: { CLAUDE_CONFIG_DIR: '~/.claude-2' },
      });
    });

    it('clears agentCliEnv when null or an empty object is sent', async () => {
      await writeAppConfig(dataDir, {
        agentCliEnv: {
          claude: { CLAUDE_CONFIG_DIR: '~/.claude-2' },
        },
        onboardingCompleted: true,
      });
      expect((await readAppConfig(dataDir)).agentCliEnv).toBeDefined();

      await writeAppConfig(dataDir, { agentCliEnv: null });
      let cfg = await readAppConfig(dataDir);
      expect(cfg.agentCliEnv).toBeUndefined();
      expect(cfg.onboardingCompleted).toBe(true);

      await writeAppConfig(dataDir, {
        agentCliEnv: {
          codex: { CODEX_HOME: '~/.codex-alt' },
        },
      });
      await writeAppConfig(dataDir, { agentCliEnv: {} });
      cfg = await readAppConfig(dataDir);
      expect(cfg.agentCliEnv).toBeUndefined();
    });

    it('handles corrupted existing file gracefully on write', async () => {
      await writeFile(path.join(dataDir, 'app-config.json'), 'CORRUPT');
      await writeAppConfig(dataDir, { agentId: 'test' });
      const cfg = await readAppConfig(dataDir);
      expect(cfg.agentId).toBe('test');
    });
  });
});

// ---------------------------------------------------------------------------
// HTTP-layer origin guard
// ---------------------------------------------------------------------------

function httpRequest(
  url: string,
  opts: { method?: string; headers?: Record<string, string>; body?: string },
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = http.request(
      {
        hostname: parsed.hostname,
        port: Number(parsed.port),
        path: parsed.pathname,
        method: opts.method ?? 'GET',
        headers: opts.headers ?? {},
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => resolve({ status: res.statusCode!, body: data }));
      },
    );
    req.on('error', reject);
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

describe('app-config disabled lists', () => {
  let dataDir: string;

  beforeEach(async () => {
    dataDir = await mkdtemp(path.join(tmpdir(), 'od-disabled-'));
  });

  afterEach(async () => {
    await rm(dataDir, { recursive: true, force: true });
  });

  it('persists disabledSkills as string array', async () => {
    await writeAppConfig(dataDir, { disabledSkills: ['skill-a', 'skill-b'] });
    const cfg = await readAppConfig(dataDir);
    expect(cfg.disabledSkills).toEqual(['skill-a', 'skill-b']);
  });

  it('persists disabledDesignSystems as string array', async () => {
    await writeAppConfig(dataDir, { disabledDesignSystems: ['ds-x'] });
    const cfg = await readAppConfig(dataDir);
    expect(cfg.disabledDesignSystems).toEqual(['ds-x']);
  });

  it('drops disabledSkills when not a string array', async () => {
    await writeAppConfig(dataDir, { disabledSkills: 'not-array' } as any);
    const cfg = await readAppConfig(dataDir);
    expect(cfg.disabledSkills).toBeUndefined();
  });

  it('drops disabledSkills with non-string elements', async () => {
    await writeAppConfig(dataDir, { disabledSkills: [1, 2, 3] } as any);
    const cfg = await readAppConfig(dataDir);
    expect(cfg.disabledSkills).toBeUndefined();
  });

  it('clears disabledSkills when empty array is sent', async () => {
    await writeAppConfig(dataDir, { disabledSkills: ['a'] });
    await writeAppConfig(dataDir, { disabledSkills: [] });
    const cfg = await readAppConfig(dataDir);
    expect(cfg.disabledSkills).toEqual([]);
  });
});

describe('app-config telemetry prefs', () => {
  let dataDir: string;

  beforeEach(async () => {
    dataDir = await mkdtemp(path.join(tmpdir(), 'od-telemetry-'));
  });

  afterEach(async () => {
    await rm(dataDir, { recursive: true, force: true });
  });

  it('persists installationId as string', async () => {
    await writeAppConfig(dataDir, {
      installationId: '11111111-2222-3333-4444-555555555555',
    });
    const cfg = await readAppConfig(dataDir);
    expect(cfg.installationId).toBe('11111111-2222-3333-4444-555555555555');
  });

  it('clears installationId when null is sent', async () => {
    await writeAppConfig(dataDir, { installationId: 'abc' });
    await writeAppConfig(dataDir, { installationId: null });
    const cfg = await readAppConfig(dataDir);
    expect(cfg.installationId).toBeNull();
  });

  it('drops installationId of wrong type', async () => {
    await writeAppConfig(dataDir, { installationId: 12345 } as any);
    const cfg = await readAppConfig(dataDir);
    expect(cfg.installationId).toBeUndefined();
  });

  it('persists privacyDecisionAt as a timestamp', async () => {
    await writeAppConfig(dataDir, { privacyDecisionAt: 1778244000000 });
    const cfg = await readAppConfig(dataDir);
    expect(cfg.privacyDecisionAt).toBe(1778244000000);
  });

  it('clears privacyDecisionAt when null is sent', async () => {
    await writeAppConfig(dataDir, { privacyDecisionAt: 1778244000000 });
    await writeAppConfig(dataDir, { privacyDecisionAt: null });
    const cfg = await readAppConfig(dataDir);
    expect(cfg.privacyDecisionAt).toBeNull();
  });

  it('drops privacyDecisionAt of wrong type', async () => {
    await writeAppConfig(dataDir, { privacyDecisionAt: 'yesterday' } as any);
    const cfg = await readAppConfig(dataDir);
    expect(cfg.privacyDecisionAt).toBeUndefined();
  });

  it('persists full telemetry prefs', async () => {
    await writeAppConfig(dataDir, {
      telemetry: { metrics: true, content: true, artifactManifest: false },
    });
    const cfg = await readAppConfig(dataDir);
    expect(cfg.telemetry).toEqual({
      metrics: true,
      content: true,
      artifactManifest: false,
    });
  });

  it('persists partial telemetry prefs and omits absent keys', async () => {
    await writeAppConfig(dataDir, { telemetry: { metrics: true } });
    const cfg = await readAppConfig(dataDir);
    expect(cfg.telemetry).toEqual({ metrics: true });
  });

  it('drops telemetry inner values that are not booleans', async () => {
    await writeAppConfig(dataDir, {
      telemetry: {
        metrics: 'yes' as any,
        content: 1 as any,
        artifactManifest: true,
      },
    } as any);
    const cfg = await readAppConfig(dataDir);
    expect(cfg.telemetry).toEqual({ artifactManifest: true });
  });

  it('drops invalid telemetry entirely from the on-disk file (read backfills the default)', async () => {
    // Pre-default era: a bad-shaped `telemetry` write got stripped and
    // `readAppConfig` returned `cfg.telemetry === undefined`. After the
    // 2026-05-22 default-on switch, the same read backfills the
    // default — telemetry is never undefined for callers, but the
    // user's invalid value still didn't make it to disk. The
    // assertion now tracks "what the gate sees" (the default), since
    // that's the actually observable behavior; the write-validation
    // invariant the test was guarding is still in force (nothing of
    // the bad input survives).
    await writeAppConfig(dataDir, {
      onboardingCompleted: true,
      telemetry: { metrics: 'yes' } as any,
    } as any);
    const cfg = await readAppConfig(dataDir);
    expect(cfg.onboardingCompleted).toBe(true);
    expect(cfg.telemetry).toEqual(DEFAULT_TELEMETRY);
  });

  it('drops unknown keys nested inside telemetry', async () => {
    await writeAppConfig(dataDir, {
      telemetry: { metrics: true, rogue: true } as any,
    } as any);
    const cfg = await readAppConfig(dataDir);
    expect(cfg.telemetry).toEqual({ metrics: true });
    expect(cfg.telemetry).not.toHaveProperty('rogue');
  });

  it('drops telemetry when value is not a plain object (read backfills default)', async () => {
    await writeAppConfig(dataDir, { telemetry: [true] } as any);
    const cfg = await readAppConfig(dataDir);
    expect(cfg.telemetry).toEqual(DEFAULT_TELEMETRY);
  });

  it('clearing telemetry by sending null resets to default (read backfills)', async () => {
    // Sending `null` for telemetry erases the on-disk field. Read
    // path then backfills the default because the absence of a value
    // is treated the same as a fresh install. If the user really
    // wants to opt out, the PrivacySection writes
    // `{ metrics: false, content: false, ... }` explicitly — that
    // shape persists and is preserved across reads (see "preserves
    // an explicit telemetry opt-out across reads" above).
    await writeAppConfig(dataDir, {
      telemetry: { metrics: true, content: true },
    });
    await writeAppConfig(dataDir, { telemetry: null } as any);
    const cfg = await readAppConfig(dataDir);
    expect(cfg.telemetry).toEqual(DEFAULT_TELEMETRY);
  });

  it('merges telemetry without disturbing other keys', async () => {
    await writeAppConfig(dataDir, {
      installationId: 'install-1',
      telemetry: { metrics: true },
      agentId: 'claude',
    });
    await writeAppConfig(dataDir, { telemetry: { content: true } });
    const cfg = await readAppConfig(dataDir);
    expect(cfg.installationId).toBe('install-1');
    expect(cfg.agentId).toBe('claude');
    // telemetry is replaced (not deep-merged) — matches the agentModels semantics.
    expect(cfg.telemetry).toEqual({ content: true });
  });
});

describe('app-config projectLocations', () => {
  let dataDir: string;

  beforeEach(async () => {
    dataDir = await mkdtemp(path.join(tmpdir(), 'od-projectLocations-'));
  });

  afterEach(async () => {
    await rm(dataDir, { recursive: true, force: true });
  });

  it('persists valid projectLocations and reads them back', async () => {
    const locs = [
      { id: 'ext-one', name: 'One', path: '/tmp/od-loc-one' },
      { id: 'ext-two', name: 'Two', path: '/tmp/od-loc-two' },
    ];
    await writeAppConfig(dataDir, { projectLocations: locs });
    const cfg = await readAppConfig(dataDir);
    expect(cfg.projectLocations).toEqual(locs);
  });

  it('normalizes ~/ paths via expandHomePrefix', async () => {
    const home = homedir();
    const locs = [{ id: 'home-loc', name: 'Home', path: '~/od-projects' }];
    await writeAppConfig(dataDir, { projectLocations: locs });
    const cfg = await readAppConfig(dataDir);
    expect(cfg.projectLocations).toHaveLength(1);
    const first = cfg.projectLocations![0]!;
    expect(first.path).toBe(path.join(home, 'od-projects'));
    expect(path.isAbsolute(first.path)).toBe(true);
  });

  it('drops relative paths that cannot be resolved to absolute', async () => {
    const locs = [
      { id: 'good', name: 'Good', path: '/tmp/od-good' },
      { id: 'bad-relative', name: 'Bad Rel', path: './relative/path' },
    ];
    await writeAppConfig(dataDir, { projectLocations: locs });
    const cfg = await readAppConfig(dataDir);
    expect(cfg.projectLocations).toHaveLength(1);
    const first = cfg.projectLocations![0]!;
    expect(first.id).toBe('good');
  });

  it('drops entries without a string path', async () => {
    const locs = [
      { id: 'good', name: 'Good', path: '/tmp/od-good' },
      { id: 'no-path', name: 'No Path' },
    ];
    await writeAppConfig(dataDir, { projectLocations: locs as any });
    const cfg = await readAppConfig(dataDir);
    expect(cfg.projectLocations).toHaveLength(1);
    const first = cfg.projectLocations![0]!;
    expect(first.id).toBe('good');
  });

  it('deduplicates paths (case-sensitive on unix)', async () => {
    const locs = [
      { id: 'first', name: 'First', path: '/tmp/od-same' },
      { id: 'second', name: 'Second', path: '/tmp/od-same' },
    ];
    await writeAppConfig(dataDir, { projectLocations: locs });
    const cfg = await readAppConfig(dataDir);
    // Single canonical entry, second deduplicated
    expect(cfg.projectLocations).toHaveLength(1);
    const first = cfg.projectLocations![0]!;
    expect(first.path).toBe(path.normalize('/tmp/od-same'));
  });

  it('deduplicates by resolved path after normalization', async () => {
    const locs = [
      { id: 'first', name: 'First', path: '/tmp/od-dup/../od-dup' },
      { id: 'second', name: 'Second', path: '/tmp/od-dup' },
    ];
    await writeAppConfig(dataDir, { projectLocations: locs });
    const cfg = await readAppConfig(dataDir);
    expect(cfg.projectLocations).toHaveLength(1);
    const first = cfg.projectLocations![0]!;
    expect(first.path).toBe(path.normalize('/tmp/od-dup'));
  });

  it('rejects reserved id "default" and falls back to auto-generated id', async () => {
    const locs = [{ id: 'default', name: 'Hijack', path: '/tmp/od-hijack' }];
    await writeAppConfig(dataDir, { projectLocations: locs });
    const cfg = await readAppConfig(dataDir);
    expect(cfg.projectLocations).toHaveLength(1);
    // The stored id must NOT be 'default'
    const first = cfg.projectLocations![0]!;
    expect(first.id).not.toBe('default');
    // The auto-generated id follows the hash-backed base64url pattern
    expect(first.id).toMatch(/^loc_[A-Za-z0-9_-]{1,16}$/);
    expect(first.path).toBe(path.normalize('/tmp/od-hijack'));
  });

  it('generates distinct ids for sibling paths with long shared prefixes', async () => {
    const locs = [
      { path: '/tmp/open-design-project-locations/shared-prefix-one' },
      { path: '/tmp/open-design-project-locations/shared-prefix-two' },
    ];
    await writeAppConfig(dataDir, { projectLocations: locs });
    const cfg = await readAppConfig(dataDir);
    expect(cfg.projectLocations).toHaveLength(2);
    const ids = cfg.projectLocations!.map((location) => location.id);
    expect(new Set(ids).size).toBe(2);
    expect(ids.every((id) => /^loc_[A-Za-z0-9_-]{1,16}$/.test(id))).toBe(true);
  });

  it('persists a defaultProjectLocationId preference', async () => {
    await writeAppConfig(dataDir, {
      projectLocations: [{ id: 'external-default', name: 'External', path: '/tmp/od-default-location' }],
      defaultProjectLocationId: 'external-default',
    });
    const cfg = await readAppConfig(dataDir);
    expect(cfg.defaultProjectLocationId).toBe('external-default');
  });

  it('normalizes invalid defaultProjectLocationId values', async () => {
    await writeAppConfig(dataDir, { defaultProjectLocationId: '../bad' });
    let cfg = await readAppConfig(dataDir);
    expect(cfg.defaultProjectLocationId).toBe('default');

    await writeAppConfig(dataDir, { defaultProjectLocationId: null });
    cfg = await readAppConfig(dataDir);
    expect(cfg.defaultProjectLocationId).toBeNull();
  });

  it('drops invalid scalar projectLocations (not an array)', async () => {
    await writeAppConfig(dataDir, { projectLocations: 'not-array' } as any);
    const cfg = await readAppConfig(dataDir);
    expect(cfg.projectLocations).toBeUndefined();
  });

  it('clears projectLocations when empty array is sent', async () => {
    await writeAppConfig(dataDir, {
      projectLocations: [{ id: 'ext', name: 'ext', path: '/tmp/od-ext' }],
      onboardingCompleted: true,
    });
    expect((await readAppConfig(dataDir)).projectLocations).toHaveLength(1);
    await writeAppConfig(dataDir, { projectLocations: [] });
    const cfg = await readAppConfig(dataDir);
    expect(cfg.projectLocations).toEqual([]);
    expect(cfg.onboardingCompleted).toBe(true);
  });

  it('clears projectLocations when null is sent', async () => {
    await writeAppConfig(dataDir, {
      projectLocations: [{ id: 'ext', name: 'ext', path: '/tmp/od-ext' }],
      onboardingCompleted: true,
    });
    expect((await readAppConfig(dataDir)).projectLocations).toHaveLength(1);
    await writeAppConfig(dataDir, { projectLocations: null as any });
    const cfg = await readAppConfig(dataDir);
    expect(cfg.projectLocations).toBeUndefined();
    expect(cfg.onboardingCompleted).toBe(true);
  });

  it('validates projectLocations on read (filters corrupted stored data)', async () => {
    // Write raw JSON with invalid entries
    await writeFile(
      path.join(dataDir, 'app-config.json'),
      JSON.stringify({
        projectLocations: [
          { id: 'good', name: 'Good', path: '/tmp/od-good' },
          { id: 'bad-relative', name: 'Bad', path: 'relative' },
          { id: 'no-path', name: 'No Path' },
          'not-an-object',
          null,
          { id: 'good2', name: 'Dup Path', path: '/tmp/od-good' },
          { id: 'default', name: 'Reserved', path: '/tmp/od-reserved' },
        ],
      }),
    );
    const cfg = await readAppConfig(dataDir);
    expect(cfg.projectLocations).toHaveLength(2);
    const ids = cfg.projectLocations!.map((l) => l.id);
    expect(ids).not.toContain('default');
    expect(ids).not.toContain('bad-relative');
    expect(ids).not.toContain('no-path');
  });
});

describe('app-config recentLinkedDirs', () => {
  let dataDir: string;

  beforeEach(async () => {
    dataDir = await mkdtemp(path.join(tmpdir(), 'od-recentdirs-'));
  });

  afterEach(async () => {
    await rm(dataDir, { recursive: true, force: true });
  });

  it('persists a clean list of working directories', async () => {
    const cfg = await writeAppConfig(dataDir, {
      recentLinkedDirs: ['/home/a/project', '/home/b/site'],
    });
    expect(cfg.recentLinkedDirs).toEqual(['/home/a/project', '/home/b/site']);
    expect((await readAppConfig(dataDir)).recentLinkedDirs).toEqual([
      '/home/a/project',
      '/home/b/site',
    ]);
  });

  it('trims, drops empty entries, and de-dupes preserving order', async () => {
    const cfg = await writeAppConfig(dataDir, {
      recentLinkedDirs: ['  /home/a  ', '', '/home/a', '   ', '/home/b'],
    });
    expect(cfg.recentLinkedDirs).toEqual(['/home/a', '/home/b']);
  });

  it('caps the list at RECENT_LINKED_DIRS_MAX entries', async () => {
    const many = Array.from({ length: 25 }, (_, i) => `/home/dir${i}`);
    const cfg = await writeAppConfig(dataDir, { recentLinkedDirs: many });
    expect(cfg.recentLinkedDirs).toEqual(many.slice(0, 5));
  });

  it('ignores a non-array value without touching other prefs', async () => {
    await writeAppConfig(dataDir, { onboardingCompleted: true });
    const cfg = await writeAppConfig(dataDir, {
      recentLinkedDirs: 'not-an-array' as unknown as string[],
    });
    expect(cfg.recentLinkedDirs).toBeUndefined();
    expect(cfg.onboardingCompleted).toBe(true);
  });

  it('updates recentLinkedDirs without clobbering unrelated prefs', async () => {
    await writeAppConfig(dataDir, { skillId: 'keep-me' });
    const cfg = await writeAppConfig(dataDir, {
      recentLinkedDirs: ['/home/a'],
    });
    expect(cfg.recentLinkedDirs).toEqual(['/home/a']);
    expect(cfg.skillId).toBe('keep-me');
  });
});

describe('app-config origin guard', () => {
  let server: http.Server;
  let port: number;
  let baseUrl: string;

  beforeAll(
    () =>
      new Promise<void>((resolve) => {
        const app = express();
        app.use(express.json());
        app.get('/api/app-config', (req, res) => {
          if (!isLocalSameOrigin(req, port)) {
            return res
              .status(403)
              .json({ error: 'cross-origin request rejected' });
          }
          res.json({ config: {} });
        });
        app.put('/api/app-config', (req, res) => {
          if (!isLocalSameOrigin(req, port)) {
            return res
              .status(403)
              .json({ error: 'cross-origin request rejected' });
          }
          res.json({ config: req.body });
        });
        server = app.listen(0, '127.0.0.1', () => {
          port = (server.address() as { port: number }).port;
          baseUrl = `http://127.0.0.1:${port}`;
          resolve();
        });
      }),
  );

  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  it('allows GET from same-origin (no Origin header)', async () => {
    const res = await httpRequest(`${baseUrl}/api/app-config`, {
      headers: { Host: `127.0.0.1:${port}` },
    });
    expect(res.status).toBe(200);
  });

  it('allows PUT from same-origin', async () => {
    const res = await httpRequest(`${baseUrl}/api/app-config`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Host: `127.0.0.1:${port}`,
        Origin: `http://127.0.0.1:${port}`,
      },
      body: JSON.stringify({ onboardingCompleted: true }),
    });
    expect(res.status).toBe(200);
  });

  it('rejects GET with cross-origin Origin header', async () => {
    const res = await httpRequest(`${baseUrl}/api/app-config`, {
      headers: {
        Host: `127.0.0.1:${port}`,
        Origin: 'https://evil.com',
      },
    });
    expect(res.status).toBe(403);
  });

  it('rejects PUT with cross-origin Origin header', async () => {
    const res = await httpRequest(`${baseUrl}/api/app-config`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Host: `127.0.0.1:${port}`,
        Origin: 'https://evil.com',
      },
      body: JSON.stringify({ agentId: 'hacked' }),
    });
    expect(res.status).toBe(403);
  });

  it('rejects request with wrong Host header', async () => {
    const res = await httpRequest(`${baseUrl}/api/app-config`, {
      headers: { Host: 'evil.com:9999' },
    });
    expect(res.status).toBe(403);
  });

  it('rejects no-Origin requests that only match configured deployment hosts', async () => {
    process.env.OD_ALLOWED_ORIGINS = 'https://od.example.com';
    try {
      const res = await httpRequest(`${baseUrl}/api/app-config`, {
        headers: { Host: 'od.example.com' },
      });
      expect(res.status).toBe(403);
    } finally {
      delete process.env.OD_ALLOWED_ORIGINS;
    }
  });

  it('still rejects non-loopback Origin', async () => {
    const res = await httpRequest(`${baseUrl}/api/app-config`, {
      headers: {
        Host: `127.0.0.1:${port}`,
        Origin: 'https://evil.com',
      },
    });
    expect(res.status).toBe(403);
  });
});
