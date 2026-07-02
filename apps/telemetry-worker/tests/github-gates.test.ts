import { describe, expect, it } from 'vitest';

import ciWorkflow from '../../../.github/workflows/ci.yml?raw';

describe('GitHub automation gates', () => {
  it('exposes an automerge-gate job backed by workspace and packaged validation', () => {
    expect(ciWorkflow).toContain('automerge-gate:');
    expect(ciWorkflow).toContain('name: automerge-gate');
    expect(ciWorkflow).toContain(
      'needs: [validate, packaged_changes, packaged_smoke_mac, packaged_smoke_win]',
    );
    expect(ciWorkflow).toContain('VALIDATE_RESULT');
    expect(ciWorkflow).toContain('PACKAGED_REQUIRED');
    expect(ciWorkflow).toContain('MAC_SMOKE_RESULT');
    expect(ciWorkflow).toContain('WIN_SMOKE_RESULT');
    expect(ciWorkflow).toContain('exit 1');
    expect(ciWorkflow).toContain('pnpm --filter @open-design/telemetry-worker test');
  });
});
