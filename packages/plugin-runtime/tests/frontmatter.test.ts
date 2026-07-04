// Characterization test for the parseYamlSubset paths that parsers.test.ts
// does not exercise: inline arrays, empty inline arrays, dash arrays of
// scalars and single-line objects, nested objects, and the block-scalar
// variants (|, >, |-). Pins the exact parsed shape so the frontmatter
// helper extraction is provably behavior-preserving.

import { describe, expect, it } from 'vitest';
import { parseFrontmatter } from '../src/parsers/frontmatter.js';

const SRC = [
  '---',
  'name: foo',
  'tags: [a, b, 3, true]',
  'empty: []',
  'list:',
  '  - one',
  '  - two',
  'objs:',
  '  - id: x',
  '    n: 1',
  '  - id: y',
  'nested:',
  '  key: val',
  '  deep: 2',
  'block: |',
  '  L1',
  '  L2',
  'folded: >',
  '  F1',
  '  F2',
  'stripped: |-',
  '  S1',
  '---',
  'body text',
].join('\n');

describe('parseFrontmatter (characterization: arrays, nesting, block scalars)', () => {
  it('parses the full subset into a stable shape', () => {
    const { data, body } = parseFrontmatter(SRC);
    expect(body).toBe('body text');
    expect(data).toMatchInlineSnapshot(`
      {
        "block": "L1
      L2",
        "empty": [],
        "folded": "F1
      F2",
        "list": [
          "one",
          "two",
        ],
        "name": "foo",
        "nested": {
          "deep": 2,
          "key": "val",
        },
        "objs": [
          {
            "id": "x",
            "n": 1,
          },
          {
            "id": "y",
          },
        ],
        "stripped": "S1",
        "tags": [
          "a",
          "b",
          3,
          true,
        ],
      }
    `);
  });
});
