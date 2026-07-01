import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  createUserDesignSystem,
  readDesignSystemAssets,
} from '../../src/design-systems/index.js';

// Red spec for the self-built / AI-draft design-system path (path B).
//
// Path A (imported folder / GitHub) renders a schema-aligned `tokens.css`
// through the TOKEN_SCHEMA contract and is pulled correctly. Path B
// (`createUserDesignSystem` -> `writeGeneratedDesignSystemFiles`) historically
// only wrote `colors_and_type.css` with a `--<slug>-*` / `--color-*`
// vocabulary and no `tokens.css`, so `readDesignSystemAssets` — which falls
// back to the literal `tokens.css` when there is no manifest — silently
// returned an empty `tokensCss`. The generation binding contract then never
// fired and `var(--bg)` / `var(--accent)` resolved to nothing in artifacts.
//
// The invariant: every self-built design system, pulled the same way a
// generation run pulls it, must expose a non-empty `tokens.css` declaring the
// canonical schema identity tokens.
describe('self-built design system token contract', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'od-self-built-tokens-'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('exposes a schema-aligned tokens.css through the pull path', async () => {
    const created = await createUserDesignSystem(root, {
      title: 'Acme Product',
      summary: 'Dense product UI.',
      category: 'Custom',
    });

    const assets = await readDesignSystemAssets(root, created.id);

    expect(
      assets.tokensCss,
      'self-built DS must expose tokens.css through the pull path',
    ).toBeTruthy();
    expect(assets.tokensCss).toContain('--bg');
    expect(assets.tokensCss).toContain('--accent');
  });
});
