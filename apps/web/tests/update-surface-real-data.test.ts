import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * Source-level guard for the update surfaces (#6156 follow-up).
 *
 * The placeholder implementation invented its own truth: a literal release
 * version, a `setInterval` that eased a fake download bar toward 100%, and a
 * 432 KB cover image committed next to it. Every one of those is a lie the UI
 * tells the user, and none of them is visible to a behavioural test once
 * deleted — so the invariant is pinned at the source level instead: the update
 * surfaces may only render data they were handed (the updater status snapshot,
 * the hosted highlights document, `/api/version`).
 */

const webRoot = dirname(dirname(fileURLToPath(import.meta.url)));

// The files allowed to render update/release information. Any new one belongs
// on this list so it inherits the guard.
const UPDATE_SURFACE_FILES = [
  'src/components/EntryShell.tsx',
  'src/components/UpdaterPopup.tsx',
  'src/components/WhatsNewPopup.tsx',
  'src/lib/updater.ts',
  'src/lib/whats-new.ts',
];

function readSurface(relativePath: string): string {
  return readFileSync(join(webRoot, relativePath), 'utf8');
}

describe('update surfaces render real data only', () => {
  it('carries no hardcoded release version literal', () => {
    // Any quoted `x.y.z` in these files is a version the UI would state as
    // fact without the daemon or the release feed having said it.
    const offenders = UPDATE_SURFACE_FILES.flatMap((relativePath) => {
      const matches = readSurface(relativePath).match(/['"`]\d+\.\d+\.\d+/g) ?? [];
      return matches.map((match) => `${relativePath}: ${match}`);
    });
    expect(offenders).toEqual([]);
  });

  it('runs no timer-driven progress simulation', () => {
    const offenders = UPDATE_SURFACE_FILES.filter((relativePath) =>
      /setInterval/.test(readSurface(relativePath)),
    );
    expect(offenders).toEqual([]);
  });

  it('keeps the placeholder update-reminder module and its cover art deleted', () => {
    for (const path of [
      'src/lib/update-reminder.ts',
      'src/components/UpdateReminderDialog.tsx',
      'src/components/UpdateReminderDialog.module.css',
      'public/update-reminder-cover.jpg',
    ]) {
      expect({ path, exists: existsSync(join(webRoot, path)) }).toEqual({ path, exists: false });
    }
  });
});
