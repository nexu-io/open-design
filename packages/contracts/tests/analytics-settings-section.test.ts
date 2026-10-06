import { describe, expect, it } from 'vitest';

import { settingsSectionToTracking } from '../src/analytics/events.js';

describe('settingsSectionToTracking', () => {
  it('gives the Labs settings page an area of its own', () => {
    // The fallback is `configure_execution_mode`, so a section that reaches it
    // is not merely unlabelled — it is counted as an execution-mode view and
    // inflates that funnel. Labs is user-reachable from the sidebar, so it
    // needs its own area.
    expect(settingsSectionToTracking('labs')).toBe('labs');
  });

  it('keeps each mapped sidebar section distinct from the execution fallback', () => {
    const sections = [
      'instructions',
      'memory',
      'media',
      'privacy',
      'about',
      'labs',
    ] as const;
    const areas = sections.map((section) => settingsSectionToTracking(section));
    expect(areas).not.toContain('configure_execution_mode');
    expect(new Set(areas).size).toBe(sections.length);
  });

  it('still resolves an unknown section rather than throwing', () => {
    expect(settingsSectionToTracking('not-a-section')).toBe('configure_execution_mode');
  });
});
