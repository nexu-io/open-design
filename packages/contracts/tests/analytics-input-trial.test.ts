import { expect, it } from 'vitest';
import { isInputAggregationDestination, parseInputAggregationTrial } from '../src/analytics/input-aggregation.js';

it('admits only bound ingestion targets and shadow/drain/paused modes', () => {
  const host = 'https://us.i.posthog.com', key = 'phc_example';
  const trial = { trial_id: 'input-01', revision: 'r1', mode: 'shadow', host, project_key: key };
  expect(parseInputAggregationTrial(trial, host, key)).toEqual(trial);
  for (const patch of [{ mode: 'replace' }, { project_key: 'phc_other' }, { host: 'https://eu.i.posthog.com' }, { extra: true }]) {
    expect(parseInputAggregationTrial({ ...trial, ...patch }, host, key)).toBeNull();
  }
  for (const target of ['http://us.i.posthog.com', 'https://us.i.posthog.com.evil.test', 'https://user@us.i.posthog.com',
    'https://us.i.posthog.com/path', 'https://us.i.posthog.com?secret=x', 'https://us.i.posthog.com:444']) {
    expect(isInputAggregationDestination(target, key)).toBe(false);
  }
  expect(isInputAggregationDestination('http://127.0.0.1:43190', 'phc_local_poc_only')).toBe(true);
  expect(isInputAggregationDestination('http://127.0.0.1:43190', key)).toBe(false);
  expect(isInputAggregationDestination('https://eu.i.posthog.com', key)).toBe(true);
});
