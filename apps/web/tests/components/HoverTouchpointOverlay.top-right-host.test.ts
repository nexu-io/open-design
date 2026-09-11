import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const entryShellSource = readFileSync(
  resolve(process.cwd(), 'src/components/EntryShell.tsx'),
  'utf8',
);
const appSource = readFileSync(resolve(process.cwd(), 'src/App.tsx'), 'utf8');
const overlayStyles = readFileSync(
  resolve(process.cwd(), 'src/components/HoverTouchpointOverlay.module.css'),
  'utf8',
);

describe('HoverTouchpointOverlay top-right host', () => {
  it('mounts the authorized hover entry in the top-right campaign slot, not the shell root', () => {
    const topRightSlot = entryShellSource.indexOf('topRightSlot=');
    const hoverHost = entryShellSource.indexOf('<ProductionCampaignHover');
    expect(topRightSlot).toBeGreaterThanOrEqual(0);
    expect(hoverHost).toBeGreaterThan(topRightSlot);
    expect(entryShellSource.slice(hoverHost, hoverHost + 200)).toContain(
      'authenticated={amrLoggedIn === true}',
    );
    expect(entryShellSource.slice(hoverHost, hoverHost + 200)).toContain(
      'sessionSubject={amrAccountId}',
    );
    expect(appSource).not.toContain('<ProductionCampaignHover');
  });

  it('keeps the hover entry distinct from the account badge and removes its bottom-right positioning', () => {
    expect(entryShellSource).toContain('<ProductionCampaignBadge');
    expect(entryShellSource).toContain('not renamed from—the account badge');
    const entryRuleStart = overlayStyles.indexOf('.entry {');
    const entryRuleEnd = overlayStyles.indexOf('}', entryRuleStart);
    const entryRule = overlayStyles.slice(entryRuleStart, entryRuleEnd);
    expect(entryRule).toContain('position: relative');
    expect(entryRule).not.toContain('bottom:');
    expect(entryRule).not.toContain('right:');
    expect(entryRule).not.toContain('position: fixed');
  });
});
