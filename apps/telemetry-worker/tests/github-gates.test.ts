import { describe, expect, it } from 'vitest';

import ciWorkflow from '../../../.github/workflows/ci.yml?raw';
import releaseBetaWorkflow from '../../../.github/workflows/release-beta.yml?raw';
import releaseStableWorkflow from '../../../.github/workflows/release-stable.yml?raw';

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

  it('keeps release Sentry credentials secret-scoped and out of top-level workflow env', () => {
    for (const workflow of [releaseBetaWorkflow, releaseStableWorkflow]) {
      expect(workflow).not.toContain('${{ vars.OPEN_DESIGN_WEB_SENTRY_DSN }}');
      expect(workflow).not.toContain('${{ vars.OPEN_DESIGN_DAEMON_SENTRY_DSN }}');
      expect(workflow).not.toContain('\n  SENTRY_AUTH_TOKEN:');
      expect(workflow).not.toContain('\n  NEXT_PUBLIC_SENTRY_DSN:');
      expect(workflow).not.toContain('\n  OPEN_DESIGN_DAEMON_SENTRY_DSN:');
      expect(workflow).not.toContain('\n  SENTRY_DSN:');
      expect(workflow).not.toContain('\n  SENTRY_ORG: zhenheai');
      expect(workflow).not.toContain('\n  SENTRY_PROJECT: open-design-web');

      expect(workflow).toContain('NEXT_PUBLIC_SENTRY_DSN: ${{ secrets.OPEN_DESIGN_WEB_SENTRY_DSN }}');
      expect(workflow).toContain('OPEN_DESIGN_DAEMON_SENTRY_DSN: ${{ secrets.OPEN_DESIGN_DAEMON_SENTRY_DSN }}');
      expect(workflow).toContain('SENTRY_DSN: ${{ secrets.OPEN_DESIGN_WEB_SENTRY_DSN }}');
      expect(workflow).toContain('SENTRY_AUTH_TOKEN: ${{ secrets.SENTRY_AUTH_TOKEN }}');
      expect(workflow).toContain('SENTRY_ORG: ${{ vars.SENTRY_ORG }}');
      expect(workflow).toContain('SENTRY_PROJECT: ${{ vars.OPEN_DESIGN_WEB_SENTRY_PROJECT }}');
    }
  });

  it('keeps Windows tools-pack cache keys free of Sentry secret-derived material', () => {
    for (const workflow of [releaseBetaWorkflow, releaseStableWorkflow]) {
      const cacheKeyStep = workflow.match(
        /- name: Compute Windows tools-pack cache key[\s\S]*?\n\n      - name: Restore Windows tools-pack cache/,
      )?.[0];

      expect(cacheKeyStep).toBeTruthy();
      expect(cacheKeyStep).toContain('WIN_TOOLS_PACK_ORIGIN_KEY');
      expect(cacheKeyStep).not.toContain('WIN_TOOLS_PACK_CACHE_EPOCH');
      expect(cacheKeyStep).not.toContain('OPEN_DESIGN_DAEMON_SENTRY_DSN');
      expect(cacheKeyStep).not.toContain('NEXT_PUBLIC_SENTRY_DSN');
      expect(cacheKeyStep).not.toContain('SENTRY_AUTH_TOKEN');
      expect(cacheKeyStep).not.toContain('SENTRY_DSN');
      expect(cacheKeyStep).not.toContain('$sentryInputs');
      expect(cacheKeyStep).not.toContain('$sentryHash');
      expect(cacheKeyStep).not.toContain('[System.Security.Cryptography.SHA256]');
    }
  });
});
