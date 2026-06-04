import { test } from 'vitest';
import {
  assert,
  claude,
  join,
  mkdirSync,
  mkdtempSync,
  rmSync,
  tmpdir,
  writeFileSync,
} from './helpers/test-helpers.js';
import {
  loadMmdRouteLaunchEnv,
  loadMmdRouteModels,
  parseMmdRouteModelIds,
  resolveMmdRouteLaunchEnv,
  resolveMmdRoutesFile,
} from '../../src/runtimes/mmd-routes.js';

test('mmd route parser reads route keys without exposing provider secrets', () => {
  const ids = parseMmdRouteModelIds({
    routes: {
      'claude-sonnet-4-6': {
        primary: {
          provider_id: 'local-anthropic',
          api_key: 'sk-secret-must-not-leak',
          model_id: 'provider/internal-name',
        },
      },
      'anthropic/claude-opus-4.7': {
        primary: {
          api_key: 'another-secret',
        },
      },
      '-bad-flag-shaped-id': {},
      'bad id with spaces': {},
      '': {},
    },
  });

  assert.deepEqual(ids, ['claude-sonnet-4-6', 'anthropic/claude-opus-4.7']);
  assert.equal(JSON.stringify(ids).includes('secret'), false);
});

test('mmd launch env resolves only the selected route secret', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'od-mmd-routes-env-'));
  try {
    const routesFile = join(dir, 'model-routes.json');
    writeFileSync(
      routesFile,
      JSON.stringify({
        routes: {
          'claude-opus-4-6': {
            primary: {
              anthropic_base_url: '  https://anthropic.example.test/v1  ',
              api_key: '  sk-selected-secret  ',
            },
          },
          'gpt-5.4': {
            primary: {
              anthropic_base_url: 'https://other.example.test/v1',
              api_key: 'sk-other-secret',
            },
          },
        },
      }),
    );

    const env = await loadMmdRouteLaunchEnv(
      { MMD_MODEL_ROUTES_FILE: routesFile },
      'claude-opus-4-6',
    );

    assert.deepEqual(env, {
      ANTHROPIC_BASE_URL: 'https://anthropic.example.test/v1',
      ANTHROPIC_AUTH_TOKEN: 'sk-selected-secret',
    });
    assert.equal(
      await loadMmdRouteLaunchEnv(
        { MMD_MODEL_ROUTES_FILE: routesFile },
        'unknown-model',
      ),
      null,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('mmd launch env ignores unsafe model ids and incomplete routes', () => {
  const raw = {
    routes: {
      'safe-model': {
        primary: {
          anthropic_base_url: '',
          api_key: 'sk-secret',
        },
      },
      '-bad-flag': {
        primary: {
          anthropic_base_url: 'https://bad.example.test',
          api_key: 'sk-secret',
        },
      },
    },
  };

  assert.equal(resolveMmdRouteLaunchEnv(raw, 'safe-model'), null);
  assert.equal(resolveMmdRouteLaunchEnv(raw, '-bad-flag'), null);
  assert.equal(resolveMmdRouteLaunchEnv(raw, 'missing'), null);
});

test('mmd route loader uses HOME default path and keeps Claude fallback models', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'od-mmd-routes-home-'));
  try {
    const routesDir = join(dir, '.config', 'mms');
    const routesFile = join(routesDir, 'model-routes.json');
    mkdirSync(routesDir, { recursive: true });
    writeFileSync(
      routesFile,
      JSON.stringify({
        version: 1,
        routes: {
          'MiniMax-M2.7': {
            primary: {
              api_key: 'sk-secret-must-not-leak',
              model_id: 'MiniMax-M2.7',
            },
          },
          'gpt-5.4': {
            primary: {
              api_key: 'sk-other-secret',
              model_id: 'gpt-5.4',
            },
          },
        },
      }),
    );

    assert.equal(resolveMmdRoutesFile({ HOME: dir }), routesFile);

    const models = await loadMmdRouteModels(
      { HOME: dir },
      claude.fallbackModels,
    );
    const ids = models?.map((model) => model.id);

    assert.deepEqual(ids?.slice(0, 4), [
      'default',
      'MiniMax-M2.7',
      'gpt-5.4',
      'sonnet',
    ]);
    assert.ok(ids?.includes('opus'));
    assert.ok(ids?.includes('claude-sonnet-4-5'));
    assert.equal(JSON.stringify(models).includes('secret'), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('mmd route loader supports explicit file override and safe fallback on bad files', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'od-mmd-routes-override-'));
  try {
    const routesFile = join(dir, 'model-routes.json');
    writeFileSync(
      routesFile,
      JSON.stringify({
        routes: {
          'mimo-v2.5': {
            primary: {
              api_key: 'sk-secret-must-not-leak',
            },
          },
        },
      }),
    );

    const models = await loadMmdRouteModels(
      { MMD_MODEL_ROUTES_FILE: routesFile },
      claude.fallbackModels,
    );
    assert.deepEqual(models?.map((model) => model.id).slice(0, 3), [
      'default',
      'mimo-v2.5',
      'sonnet',
    ]);
    assert.equal(JSON.stringify(models).includes('sk-secret'), false);

    assert.equal(
      await loadMmdRouteModels(
        { MMD_MODEL_ROUTES_FILE: join(dir, 'missing.json') },
        claude.fallbackModels,
      ),
      null,
    );

    const invalidFile = join(dir, 'invalid.json');
    writeFileSync(invalidFile, '{not-json');
    assert.equal(
      await loadMmdRouteModels(
        { MMD_MODEL_ROUTES_FILE: invalidFile },
        claude.fallbackModels,
      ),
      null,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('mmd launch env expands tilde in explicit file overrides', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'od-mmd-routes-tilde-'));
  try {
    const routesDir = join(dir, '.config', 'mms');
    const routesFile = join(routesDir, 'model-routes.json');
    mkdirSync(routesDir, { recursive: true });
    writeFileSync(
      routesFile,
      JSON.stringify({
        routes: {
          'claude-sonnet-mmd': {
            primary: {
              anthropic_base_url: 'https://mmd.example.test/v1',
              api_key: 'sk-mmd-secret',
            },
          },
        },
      }),
    );

    const env = {
      HOME: dir,
      MMD_MODEL_ROUTES_FILE: '~/.config/mms/model-routes.json',
    };

    assert.equal(resolveMmdRoutesFile(env), routesFile);
    assert.deepEqual(await loadMmdRouteLaunchEnv(env, 'claude-sonnet-mmd'), {
      ANTHROPIC_BASE_URL: 'https://mmd.example.test/v1',
      ANTHROPIC_AUTH_TOKEN: 'sk-mmd-secret',
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('claude runtime fetchModels surfaces mmd route models to the picker', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'od-claude-mmd-models-'));
  try {
    const routesFile = join(dir, 'model-routes.json');
    writeFileSync(
      routesFile,
      JSON.stringify({
        routes: {
          'claude-opus-4-6-thinking': {
            primary: {
              api_key: 'sk-secret-must-not-leak',
            },
          },
        },
      }),
    );

    assert.ok(claude.fetchModels, 'claude must define mmd-backed model discovery');
    const models = await claude.fetchModels('/usr/bin/claude', {
      MMD_MODEL_ROUTES_FILE: routesFile,
    });

    assert.ok(models);
    assert.deepEqual(models.map((model) => model.id).slice(0, 3), [
      'default',
      'claude-opus-4-6-thinking',
      'sonnet',
    ]);
    assert.equal(JSON.stringify(models).includes('sk-secret'), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
