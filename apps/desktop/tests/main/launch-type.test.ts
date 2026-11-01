import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { beginLaunchMarker, classifyLaunchType, COLD_IDLE_MS } from '../../src/main/launch-type.js';

describe('process launch classification', () => {
  const now = 10_000_000;
  const base = { now, version: '2.0.0', osUptimeSeconds: 5000, marker: { version: '2.0.0', lastRunAt: now - 1000 } };
  it('classifies no marker, install/upgrade, OS reboot and long idle as cold', () => {
    expect(classifyLaunchType({ ...base, marker: null })).toBe('cold');
    expect(classifyLaunchType({ ...base, version: '2.1.0' })).toBe('cold');
    expect(classifyLaunchType({ ...base, osUptimeSeconds: 0.5 })).toBe('cold');
    expect(classifyLaunchType({ ...base, marker: { ...base.marker, lastRunAt: now - COLD_IDLE_MS - 1 } })).toBe('cold');
  });
  it('keeps a recent same-version launch warm, with explicit boundary and clock reversal', () => {
    expect(classifyLaunchType(base)).toBe('warm');
    expect(classifyLaunchType({ ...base, marker: { ...base.marker, lastRunAt: now - COLD_IDLE_MS } })).toBe('warm');
    expect(classifyLaunchType({ ...base, now: 0 })).toBe('cold');
    expect(classifyLaunchType({ ...base, marker: { ...base.marker, lastRunAt: NaN } })).toBe('cold');
  });
  it('persists a small crash fallback and records the actual end time on clean quit', () => {
    const root = mkdtempSync(join(tmpdir(), 'launch-marker-'));
    const clock = vi.spyOn(Date, 'now').mockReturnValue(now);
    try {
      const first = beginLaunchMarker(root, '2.0.0');
      expect(first.launchType).toBe('cold');
      clock.mockReturnValue(now + COLD_IDLE_MS * 2);
      first.end();
      clock.mockReturnValue(now + COLD_IDLE_MS * 2 + 1000);
      expect(beginLaunchMarker(root, '2.0.0').launchType).toBe('warm');
      expect(beginLaunchMarker(root, '2.1.0').launchType).toBe('cold');
      writeFileSync(join(root, 'stability-launch.json'), '{broken');
      expect(beginLaunchMarker(root, '2.1.0').launchType).toBe('cold');
    } finally { clock.mockRestore(); rmSync(root, { recursive: true, force: true }); }
  });
});
