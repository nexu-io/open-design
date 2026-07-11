import { describe, expect, it } from 'vitest';

import {
  previewViewportIcon,
  previewViewportStyle,
  previewScaleShellStyle,
  manualEditPreviewShellStyle,
  manualEditFloatingPanelStyle,
  manualEditHoverIconStyle,
  getDeployProviderOption,
  normalizeCloudflareDomainPrefixInput,
  isValidCloudflareDomainPrefixInput,
  deployResultState,
  publicShareUrlForDeployment,
  deploymentTimestamp,
  compareDeploymentsByNewest,
  shareUrlForDeployment,
  pickLatestShareDeployment,
  mergeManualEditInspectorStyles,
  manualEditInspectorStyleValue,
  manualEditPersistedValueMatchesSavedSnapshot,
  cancelManualEditPendingStyleSnapshot,
} from '../../../src/features/file-viewer/rules';
import type { DeploymentInfo } from '@open-design/contracts';
import type { ManualEditStyles, ManualEditTarget } from '../../../src/edit-mode/types';

describe('previewViewportIcon', () => {
  it('maps each viewport id to its RemixIcon name', () => {
    expect(previewViewportIcon('desktop')).toBe('computer-line');
    expect(previewViewportIcon('tablet')).toBe('tablet-line');
    expect(previewViewportIcon('mobile')).toBe('smartphone-line');
  });
});

describe('previewViewportStyle', () => {
  it('returns an empty style object for desktop (no fixed frame)', () => {
    expect(previewViewportStyle('desktop', 1)).toEqual({});
  });

  it('emits CSS custom properties sized to the mobile preset', () => {
    const style = previewViewportStyle('mobile', 1, { width: 1200, height: 900 });
    expect(style['--preview-viewport-width']).toBe('390px');
    expect(style['--preview-viewport-height']).toBe('844px');
    expect(style['--preview-user-scale']).toBe(1);
  });
});

describe('previewScaleShellStyle / manualEditPreviewShellStyle', () => {
  it('scales the desktop shell by percentage', () => {
    expect(previewScaleShellStyle('desktop', 0.5)).toEqual({
      width: '200%',
      height: '200%',
      transform: 'scale(0.5)',
      transformOrigin: '0 0',
    });
  });

  it('uses viewport CSS vars for non-desktop viewports', () => {
    expect(previewScaleShellStyle('tablet', 1)).toEqual({
      width: 'var(--preview-viewport-width)',
      height: 'var(--preview-viewport-height)',
      transform: 'scale(var(--preview-scale, 1))',
      transformOrigin: '0 0',
    });
  });

  it('freezes a pixel width on desktop when frozenWidth is set', () => {
    const style = manualEditPreviewShellStyle('desktop', 0.5, 800);
    expect(style.width).toBe('1600px');
  });

  it('falls back to previewScaleShellStyle when no frozen width applies', () => {
    expect(manualEditPreviewShellStyle('tablet', 1, 800)).toEqual(previewScaleShellStyle('tablet', 1));
    expect(manualEditPreviewShellStyle('desktop', 1, null)).toEqual(previewScaleShellStyle('desktop', 1));
  });
});

function makeTarget(rect: { x: number; y: number; width: number; height: number }): ManualEditTarget {
  return { rect } as ManualEditTarget;
}

describe('manualEditFloatingPanelStyle', () => {
  it('places the panel to the right of the target when it fits', () => {
    const style = manualEditFloatingPanelStyle(makeTarget({ x: 10, y: 10, width: 50, height: 20 }), 1, {
      width: 1200,
      height: 800,
    });
    expect(style.left).toBe(72);
    expect(style.width).toBe(320);
  });

  it('flips to the left of the target when there is no room on the right', () => {
    const style = manualEditFloatingPanelStyle(makeTarget({ x: 1000, y: 10, width: 50, height: 20 }), 1, {
      width: 1200,
      height: 800,
    });
    expect(style.left).toBeLessThan(1000);
  });
});

describe('manualEditHoverIconStyle', () => {
  it('anchors the hover icon to the top-right corner of the target', () => {
    const style = manualEditHoverIconStyle(makeTarget({ x: 100, y: 100, width: 50, height: 20 }), 1, {
      width: 1200,
      height: 800,
    });
    expect(style.width).toBe(26);
    expect(style.height).toBe(26);
    expect(style.left).toBe(120);
  });
});

describe('getDeployProviderOption', () => {
  it('returns the matching provider option', () => {
    expect(getDeployProviderOption('cloudflare-pages').labelKey).toBe('fileViewer.cloudflarePagesProvider');
  });

  it('falls back to the first option for an unknown id', () => {
    expect(getDeployProviderOption('nope' as never).id).toBe('vercel-self');
  });
});

describe('cloudflare domain prefix validation', () => {
  it('lowercases and trims the prefix', () => {
    expect(normalizeCloudflareDomainPrefixInput('  MySite  ')).toBe('mysite');
  });

  it('accepts a valid subdomain-safe prefix', () => {
    expect(isValidCloudflareDomainPrefixInput('my-site-1')).toBe(true);
  });

  it('rejects a prefix starting or ending with a hyphen', () => {
    expect(isValidCloudflareDomainPrefixInput('-my-site')).toBe(false);
    expect(isValidCloudflareDomainPrefixInput('my-site-')).toBe(false);
  });
});

describe('deployResultState', () => {
  it('classifies known statuses', () => {
    expect(deployResultState('protected')).toBe('protected');
    expect(deployResultState('failed')).toBe('failed');
    expect(deployResultState('conflict')).toBe('failed');
    expect(deployResultState('pending')).toBe('delayed');
    expect(deployResultState('link-delayed')).toBe('delayed');
    expect(deployResultState(undefined)).toBe('ready');
  });
});

function makeDeployment(overrides: Partial<DeploymentInfo> = {}): DeploymentInfo {
  return {
    id: 'dep-1',
    providerId: 'vercel-self',
    fileName: 'index.html',
    status: 'ready',
    url: 'https://example.vercel.app',
    createdAt: 1000,
    updatedAt: 2000,
    ...overrides,
  } as DeploymentInfo;
}

describe('publicShareUrlForDeployment', () => {
  it('returns empty string for a missing deployment', () => {
    expect(publicShareUrlForDeployment(null)).toBe('');
  });

  it('prefers the ready custom domain over the plain url', () => {
    const deployment = makeDeployment({
      cloudflarePages: {
        customDomain: { status: 'ready', url: 'https://custom.example.com' },
      },
    } as Partial<DeploymentInfo>);
    expect(publicShareUrlForDeployment(deployment)).toBe('https://custom.example.com');
  });

  it('falls back to pages.dev when no custom domain is ready', () => {
    const deployment = makeDeployment({
      cloudflarePages: { pagesDev: { status: 'ready', url: 'https://x.pages.dev' } },
    } as Partial<DeploymentInfo>);
    expect(publicShareUrlForDeployment(deployment)).toBe('https://x.pages.dev');
  });

  it('returns empty string when the deployment is not in a ready state', () => {
    expect(publicShareUrlForDeployment(makeDeployment({ status: 'failed' }))).toBe('');
  });
});

describe('deploymentTimestamp / compareDeploymentsByNewest', () => {
  it('prefers updatedAt over createdAt', () => {
    expect(deploymentTimestamp(makeDeployment({ updatedAt: 500, createdAt: 100 }))).toBe(500);
  });

  it('parses a string timestamp when numeric fields are absent', () => {
    const iso = '2024-01-01T00:00:00.000Z';
    expect(deploymentTimestamp(makeDeployment({ updatedAt: undefined, createdAt: iso as unknown as number }))).toBe(
      Date.parse(iso),
    );
  });

  it('sorts newest first', () => {
    const older = makeDeployment({ id: 'a', updatedAt: 100 });
    const newer = makeDeployment({ id: 'b', updatedAt: 200 });
    expect([older, newer].sort(compareDeploymentsByNewest).map((d) => d.id)).toEqual(['b', 'a']);
  });
});

describe('shareUrlForDeployment', () => {
  it('uses the cloudflare custom domain when the provider is cloudflare-pages', () => {
    const deployment = makeDeployment({
      providerId: 'cloudflare-pages',
      cloudflarePages: { customDomain: { status: 'ready', url: 'https://custom.example.com' } },
    } as Partial<DeploymentInfo>);
    expect(shareUrlForDeployment(deployment)).toBe('https://custom.example.com');
  });

  it('falls back to the plain url otherwise', () => {
    expect(shareUrlForDeployment(makeDeployment({ url: 'https://plain.example.com' }))).toBe(
      'https://plain.example.com',
    );
  });
});

describe('pickLatestShareDeployment', () => {
  it('picks the newest non-failed deployment across providers', () => {
    const vercel = makeDeployment({ providerId: 'vercel-self', updatedAt: 100, url: 'https://a.example.com' });
    const cloudflare = makeDeployment({
      providerId: 'cloudflare-pages',
      updatedAt: 200,
      url: 'https://b.example.com',
    });
    expect(
      pickLatestShareDeployment({ 'vercel-self': vercel, 'cloudflare-pages': cloudflare })?.providerId,
    ).toBe('cloudflare-pages');
  });

  it('skips failed deployments and returns null if none qualify', () => {
    const failed = makeDeployment({ status: 'failed' });
    expect(pickLatestShareDeployment({ 'vercel-self': failed })).toBeNull();
  });
});

function makeManualEditStyles(overrides: Partial<ManualEditStyles> = {}): ManualEditStyles {
  return { color: '', backgroundColor: '', borderColor: '', ...overrides } as ManualEditStyles;
}

describe('manualEditInspectorStyleValue / normalizeManualEditInspectorColor', () => {
  it('normalizes a 3-digit hex color to 6 digits', () => {
    expect(manualEditInspectorStyleValue('color', '#F00')).toBe('#ff0000');
  });

  it('converts rgb() to hex', () => {
    expect(manualEditInspectorStyleValue('backgroundColor', 'rgb(255, 0, 0)')).toBe('#ff0000');
  });

  it('treats fully-transparent rgba as empty', () => {
    expect(manualEditInspectorStyleValue('color', 'rgba(0, 0, 0, 0)')).toBe('');
  });

  it('passes non-color facets through unchanged', () => {
    expect(manualEditInspectorStyleValue('fontSize', '18px')).toBe('18px');
  });
});

describe('mergeManualEditInspectorStyles', () => {
  it('prefers the source-of-truth style over the live preview style', () => {
    const merged = mergeManualEditInspectorStyles(
      makeManualEditStyles({ color: '#111111' }),
      makeManualEditStyles({ color: '#222222' }),
    );
    expect(merged.color).toBe('#111111');
  });

  it('falls back to the preview style when the source has none', () => {
    const merged = mergeManualEditInspectorStyles(
      makeManualEditStyles({ color: '' }),
      makeManualEditStyles({ color: '#222222' }),
    );
    expect(merged.color).toBe('#222222');
  });
});

describe('manualEditPersistedValueMatchesSavedSnapshot', () => {
  it('treats equivalent color representations as matching', () => {
    expect(manualEditPersistedValueMatchesSavedSnapshot('color', '#FF0000', 'rgb(255, 0, 0)')).toBe(true);
  });

  it('treats different values as non-matching', () => {
    expect(manualEditPersistedValueMatchesSavedSnapshot('color', '#ff0000', '#00ff00')).toBe(false);
  });
});

describe('cancelManualEditPendingStyleSnapshot', () => {
  it('drops only the cancelled keys from the pending save', () => {
    const pending = { id: 'cta', styles: { fontSize: '18px', color: '#fff' }, label: 'CTA', version: 1 };
    const next = cancelManualEditPendingStyleSnapshot(pending, 'cta', ['fontSize']);
    expect(next?.styles).toEqual({ color: '#fff' });
  });

  it('clears the pending save entirely once every key is cancelled', () => {
    const pending = { id: 'cta', styles: { fontSize: '18px' }, label: 'CTA', version: 1 };
    expect(cancelManualEditPendingStyleSnapshot(pending, 'cta', ['fontSize'])).toBeNull();
  });

  it('leaves a pending save for a different target untouched', () => {
    const pending = { id: 'hero', styles: { fontSize: '18px' }, label: 'Hero', version: 1 };
    expect(cancelManualEditPendingStyleSnapshot(pending, 'cta', ['fontSize'])).toBe(pending);
  });
});
