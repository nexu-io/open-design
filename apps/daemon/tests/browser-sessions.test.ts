import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { buildSystemBrowserLaunchArgs } from '../src/browser-sessions.js';
import { SLIM_CORE_CHARTER } from '../src/prompts/core-slim.js';
import { OFFICIAL_DESIGNER_PROMPT } from '../src/prompts/official-system.js';

const repoRoot = path.resolve(import.meta.dirname, '../../..');

describe('system browser mock-keychain contract', () => {
  it('passes --use-mock-keychain when daemon spawns headless Chromium/Edge', () => {
    const args = buildSystemBrowserLaunchArgs('/tmp/od-browser-session-test');
    expect(args).toContain('--headless=new');
    expect(args).toContain('--user-data-dir=/tmp/od-browser-session-test');
    expect(args).toContain('--use-mock-keychain');
  });

  it('instructs all local-shell prompt paths to pass --use-mock-keychain on macOS CLI browser launches', () => {
    const odNextOrchestration = readFileSync(
      path.join(repoRoot, 'plugins/_official/scenarios/od-next-strategy/assets/general-orchestration.md'),
      'utf8',
    );
    expect(SLIM_CORE_CHARTER).toContain('--use-mock-keychain');
    expect(OFFICIAL_DESIGNER_PROMPT).toContain('--use-mock-keychain');
    expect(odNextOrchestration).toContain('--use-mock-keychain');
  });
});
