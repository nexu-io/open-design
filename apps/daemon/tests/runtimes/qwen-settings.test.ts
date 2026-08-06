import { test } from 'vitest';
import {
  assert,
  join,
  mkdtempSync,
  qwen,
  rmSync,
  tmpdir,
  writeFileSync,
} from './helpers/test-helpers.js';
import {
  loadQwenSettingsModels,
  mergeQwenSettingsModels,
  parseQwenSettingsModelIds,
  resolveQwenSettingsFile,
} from '../../src/runtimes/qwen-settings.js';

test('qwen settings parser collects provider ids without exposing secrets', () => {
  const ids = parseQwenSettingsModelIds({
    env: { DASHSCOPE_API_KEY: 'sk-secret-must-not-leak' },
    modelProviders: {
      openai: [
        { id: 'qwen3.8-max', name: '[ModelStudio] qwen3.8-max', envKey: 'DASHSCOPE_API_KEY' },
        { id: 'qwen3.7-plus', baseUrl: 'https://dashscope.example.test/v1' },
        // A provider entry that a future Qwen release could add.
        { id: 'glm-5.1' },
        { name: 'no id at all' },
        { id: '-bad-flag-shaped-id' },
        { id: 'bad id with spaces' },
        { id: '' },
      ],
      // Unknown provider keys must not be dropped: no allowlist.
      anthropicCompatible: [{ id: 'deepseek-v4-pro' }],
      notAnArray: { id: 'ignored' },
    },
    model: 'qwen3.6-plus',
  });

  assert.deepEqual(ids, [
    'qwen3.8-max',
    'qwen3.7-plus',
    'glm-5.1',
    'deepseek-v4-pro',
    'qwen3.6-plus',
  ]);
  assert.equal(JSON.stringify(ids).includes('secret'), false);
});

test('qwen settings parser accepts a record-shaped selected model and de-duplicates', () => {
  assert.deepEqual(
    parseQwenSettingsModelIds({
      modelProviders: { openai: [{ id: 'qwen3.8-max' }] },
      model: { name: 'qwen3.8-max' },
    }),
    ['qwen3.8-max'],
  );
  assert.deepEqual(
    parseQwenSettingsModelIds({ model: { id: 'qwen3-coder-next' } }),
    ['qwen3-coder-next'],
  );
  assert.deepEqual(parseQwenSettingsModelIds(null), []);
  assert.deepEqual(parseQwenSettingsModelIds({}), []);
});

test('qwen merge keeps default first, settings ids ahead of static fallbacks', () => {
  const merged = mergeQwenSettingsModels(
    ['qwen3.8-max', 'qwen3-coder-plus'],
    [{ id: 'default', label: 'CLI default' }, { id: 'qwen3-coder-plus', label: 'qwen3-coder-plus' }, { id: 'qwen3-coder-flash', label: 'qwen3-coder-flash' }],
  );

  assert.deepEqual(merged.map((m) => m.id), [
    'default',
    'qwen3.8-max',
    'qwen3-coder-plus',
    'qwen3-coder-flash',
  ]);
});

test('qwen settings file honours the env override and falls back to ~/.qwen', () => {
  assert.equal(
    resolveQwenSettingsFile({ QWEN_SETTINGS_FILE: '/tmp/custom-qwen.json' }),
    '/tmp/custom-qwen.json',
  );
  assert.equal(
    resolveQwenSettingsFile({ HOME: '/home/tester', QWEN_SETTINGS_FILE: '~/nested/qwen.json' }),
    join('/home/tester', 'nested/qwen.json'),
  );
  assert.equal(
    resolveQwenSettingsFile({ HOME: '/home/tester' }),
    join('/home/tester', '.qwen', 'settings.json'),
  );
});

test('qwen agent def surfaces configured models and degrades to fallbacks', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'od-qwen-settings-'));
  try {
    const settingsFile = join(dir, 'settings.json');
    writeFileSync(
      settingsFile,
      JSON.stringify({
        env: { DASHSCOPE_API_KEY: 'sk-secret-must-not-leak' },
        modelProviders: {
          openai: [{ id: 'qwen3.8-max' }, { id: 'qwen3.7-plus' }],
        },
      }),
    );

    const fallbacks = [
      { id: 'default', label: 'CLI default' },
      { id: 'qwen3-coder-plus', label: 'qwen3-coder-plus' },
    ];
    const models = await loadQwenSettingsModels({ QWEN_SETTINGS_FILE: settingsFile }, fallbacks);
    assert.deepEqual(models?.map((m) => m.id), [
      'default',
      'qwen3.8-max',
      'qwen3.7-plus',
      'qwen3-coder-plus',
    ]);
    assert.equal(JSON.stringify(models).includes('secret'), false);

    // Missing and malformed files fall through to the static fallback list.
    assert.equal(
      await loadQwenSettingsModels({ QWEN_SETTINGS_FILE: join(dir, 'absent.json') }, fallbacks),
      null,
    );
    const malformed = join(dir, 'malformed.json');
    writeFileSync(malformed, '{ not json');
    assert.equal(await loadQwenSettingsModels({ QWEN_SETTINGS_FILE: malformed }, fallbacks), null);

    // And the def itself is wired to the loader.
    assert.equal(typeof qwen.fetchModels, 'function');
    const viaDef = await qwen.fetchModels?.('qwen', { QWEN_SETTINGS_FILE: settingsFile });
    assert.deepEqual(viaDef?.map((m) => m.id).slice(0, 3), ['default', 'qwen3.8-max', 'qwen3.7-plus']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
