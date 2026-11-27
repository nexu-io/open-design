import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'vitest';
import { parseFrontmatter } from '../src/design-systems/frontmatter.js';
import { importUserSkill, listSkills, updateUserSkill } from '../src/skills.js';

function data(yaml: string) {
  return parseFrontmatter('---\n' + yaml + '\n---\n').data;
}

describe('literal colons in frontmatter block sequences', () => {
  it('keeps colons inside single- and double-quoted strings', () => {
    assert.deepEqual(data('triggers:\n- "mode: review"\n- \'ratio: 16:9\'\n- "see https://example.test"').triggers, [
      'mode: review', 'ratio: 16:9', 'see https://example.test',
    ]);
  });

  it('keeps plain URLs, ports, times and namespaced tags as strings', () => {
    assert.deepEqual(data('tags:\n  - https://example.test:8443/design\n  - design:system\n  - 12:30').tags, [
      'https://example.test:8443/design', 'design:system', '12:30',
    ]);
  });

  it('keeps nested select choices and the following parent field', () => {
    const yaml = 'od:\n  inputs:\n    - name: target\n      type: select\n      options:\n        - https://example.test\n        - "mode: review"\n  mode: prototype';
    assert.deepEqual(data(yaml).od, {
      inputs: [{ name: 'target', type: 'select', options: ['https://example.test', 'mode: review'] }],
      mode: 'prototype',
    });
  });

  it('still parses mapping entries whose values contain colons', () => {
    assert.deepEqual(data('items:\n- name: "mode: review"\n  enabled: false\n- url:\thttps://example.test:8443').items, [
      { name: 'mode: review', enabled: false },
      { url: 'https://example.test:8443' },
    ]);
  });

  it('preserves scalar coercion, indentation and the Markdown body', () => {
    const source = '---\r\nvalues:\r\n  - 42\r\n  - false\r\n  - null\r\n  - "plain text"\r\n---\r\n# Body\r\n';
    const parsed = parseFrontmatter(source);
    assert.deepEqual(parsed.data.values, [42, false, null, 'plain text']);
    assert.equal(parsed.body, '# Body\r\n');
  });
});

it('round trips literal-colon triggers through skill import, listing and update', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'od-skill-colon-triggers-'));
  try {
    const triggers = ['mode: review', 'see https://example.test', 'design:system'];
    const imported = await importUserSkill(root, { name: 'Colon Triggers', body: '# Body', triggers });
    const listed = await listSkills(root);
    assert.equal(listed.length, 1);
    assert.deepEqual(listed[0]?.triggers, triggers);

    const updated = [...triggers, 'https://other.test:8443/path'];
    await updateUserSkill(root, { name: imported.id, body: '# Updated body', triggers: updated });
    assert.deepEqual((await listSkills(root))[0]?.triggers, updated);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
