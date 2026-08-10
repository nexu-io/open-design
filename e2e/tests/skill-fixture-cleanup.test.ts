import { describe, expect, it, vi } from 'vitest';

import { cleanupSkillFixture } from '../lib/playwright/skill-fixture-cleanup.js';

function response(status: number, statusText: string) {
  return {
    ok: () => status >= 200 && status < 300,
    status: () => status,
    statusText: () => statusText,
  };
}

describe('cleanupSkillFixture', () => {
  it('accepts a successful delete after import', async () => {
    await expect(cleanupSkillFixture(
      vi.fn().mockResolvedValue(response(204, 'No Content')),
      { importCompleted: true, skillName: 'fixture' },
    )).resolves.toBeUndefined();
  });

  it('rejects transport failures instead of hiding worker-state leakage', async () => {
    await expect(cleanupSkillFixture(
      vi.fn().mockRejectedValue(new Error('daemon unavailable')),
      { importCompleted: true, skillName: 'fixture' },
    )).rejects.toThrow('daemon unavailable');
  });

  it('rejects a failed delete after the fixture was imported', async () => {
    await expect(cleanupSkillFixture(
      vi.fn().mockResolvedValue(response(500, 'Internal Server Error')),
      { importCompleted: true, skillName: 'fixture' },
    )).rejects.toThrow('Skill fixture cleanup failed for fixture: 500 Internal Server Error');
  });

  it('accepts not-found only when import never completed', async () => {
    await expect(cleanupSkillFixture(
      vi.fn().mockResolvedValue(response(404, 'Not Found')),
      { importCompleted: false, skillName: 'fixture' },
    )).resolves.toBeUndefined();

    await expect(cleanupSkillFixture(
      vi.fn().mockResolvedValue(response(404, 'Not Found')),
      { importCompleted: true, skillName: 'fixture' },
    )).rejects.toThrow('Skill fixture cleanup failed for fixture: 404 Not Found');
  });
});
