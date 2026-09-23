import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import postcss from 'postcss';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const coreCss = readFileSync(resolve(here, '../../src/styles/viewer/core.css'), 'utf8');

function declarations(selector: string): Record<string, string> {
  const rule = postcss.parse(coreCss).nodes.find(
    (node): node is postcss.Rule => node.type === 'rule' && node.selector === selector,
  );
  expect(rule, `missing ${selector} rule`).toBeTruthy();
  return Object.fromEntries(
    rule!.nodes
      ?.filter((node): node is postcss.Declaration => node.type === 'decl')
      .map((node) => [node.prop, node.value]) ?? [],
  );
}

describe('D1–D3 drift tooltip Homeboard contract', () => {
  it('keeps the portal tipd bubble on the exact visual tokens', () => {
    expect(declarations('.od-tooltip-layer.tipd')).toMatchObject({
      padding: '5px 8px',
      'border-radius': '6px',
      background: '#1F1F1F',
      color: '#FFFFFF',
      'font-size': '11px',
    });
  });
});
