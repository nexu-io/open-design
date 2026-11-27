import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { adaptAgentSkill } from '../src/adapters/agent-skill';
import { parseFrontmatter } from '../src/parsers/frontmatter';
import { parseManifestObject } from '../src/parsers/manifest';

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

it('keeps namespaced tags and URL choices when adapting a SKILL.md manifest', () => {
  const markdown = '---\nname: colon-options\ntags:\n- design:system\n- "brand: launch"\nod:\n  inputs:\n    - name: destination\n      type: select\n      options:\n      - https://example.test\n      - "mode: review"\n---\n# Pick a destination\n';
  const result = adaptAgentSkill(markdown, { folderId: 'colon-options' });
  assert.deepEqual(result.manifest.tags, ['design:system', 'brand: launch']);
  assert.deepEqual(result.manifest.od?.inputs?.[0]?.options, ['https://example.test', 'mode: review']);
  assert.equal(result.bodyMarkdown, '# Pick a destination\n');
  assert.equal(parseManifestObject(result.manifest).ok, true);
});
