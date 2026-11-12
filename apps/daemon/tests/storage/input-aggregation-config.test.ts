import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { readInputAggregationTrial } from '../../src/storage/input-aggregation-config.js';

it('reads runtime changes and fails closed for missing, corrupt or mismatched files', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'od-input-config-'));
  const host = 'https://us.i.posthog.com', key = 'phc_example';
  const trial = { trial_id: 'input-01', revision: 'r1', mode: 'shadow', host, project_key: key };
  const file = join(dir, 'input-aggregation-trial.json');
  try {
    expect(await readInputAggregationTrial(dir, host, key)).toBeNull();
    await writeFile(file, JSON.stringify(trial));
    expect(await readInputAggregationTrial(dir, host, key)).toEqual(trial);
    await writeFile(file, JSON.stringify({ ...trial, mode: 'drain', revision: 'r2' }));
    expect(await readInputAggregationTrial(dir, host, key)).toMatchObject({ mode: 'drain', revision: 'r2' });
    expect(await readInputAggregationTrial(dir, host, 'phc_other')).toBeNull();
    for (const text of ['{', ' '.repeat(2049)]) {
      await writeFile(file, text); expect(await readInputAggregationTrial(dir, host, key)).toBeNull();
    }
  } finally { await rm(dir, { recursive: true, force: true }); }
});
