import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEEPSEEK_SKILLS } from '../app/_lib/deepseek-design';

test('dsh-vision-router install resolves a compatibility-fixed release', () => {
  const plugin = DEEPSEEK_SKILLS.find((skill) => skill.slug === 'dsh-vision-router');

  assert.ok(plugin, 'dsh-vision-router must remain in the curated catalog');
  assert.equal(plugin.install.kind, 'installer');
  assert.match(plugin.install.command, /\bdsh-vision-router@latest\b/);
});
