import { describe, expect, it } from 'vitest';
import { extractComponentsManifest } from '../src/design-systems/components-manifest.js';

function findGroup(manifest: ReturnType<typeof extractComponentsManifest>, id: string) {
  return manifest.groups.find((group) => group.id === id);
}

const FIXTURE = `<!doctype html>
<html>
<head>
<style>
.navbar-button-thing { color: var(--primary); }
.button { background: var(--accent); }
.button-primary { background: var(--accent-2); }
.btn-secondary { color: var(--text); }
.btn { padding: var(--pad); }
</style>
</head>
<body>
<button class="button">Save</button>
<a class="btn">link</a>
<a class="cta-banner">cta</a>
<button class="navbar-button-thing"></button>
</body>
</html>`;

describe('navbar-button-thing anchored matcher (#6250 PerishCode round-2 reviewer follow-up)', () => {
  it('does NOT admit .navbar-button-thing into Buttons.selectors via /\\bbutton\\b/i (hyphen word-boundary leak)', () => {
    const manifest = extractComponentsManifest({ brandId: 'test', fixtureHtml: FIXTURE });
    const buttons = findGroup(manifest, 'buttons');
    expect(buttons).toBeDefined();
    expect(buttons?.selectors).toEqual(
      expect.arrayContaining(['.button', '.button-primary', '.btn', '.btn-secondary']),
    );
    expect(buttons?.selectors).not.toContain('.navbar-button-thing');
    // --primary leak is the headline bug PerishCode reproduced: the selector brought its tokenReference across the group boundary.
    expect(buttons?.tokenReferences).not.toContain('--primary');
  });

  it('preserves Button classMatchers (button, btn, cta-banner still classified; navbar-button-thing NOT)', () => {
    const manifest = extractComponentsManifest({ brandId: 'test', fixtureHtml: FIXTURE });
    const buttons = findGroup(manifest, 'buttons');
    expect(buttons).toBeDefined();
    // classMatchers anchor with ^btn|^button|^cta — navbar-button-thing doesn't start with any, so it never enters Buttons.classes.
    expect(buttons?.classes).toEqual(expect.arrayContaining(['button', 'btn', 'cta-banner']));
    expect(buttons?.classes).not.toContain('navbar-button-thing');
  });
});
