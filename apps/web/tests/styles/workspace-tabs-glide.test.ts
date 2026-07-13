import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const shellCss = readFileSync(new URL('../../src/styles/shell.css', import.meta.url), 'utf8');
const routinesCss = readFileSync(
  new URL('../../src/styles/viewer/routines.css', import.meta.url),
  'utf8',
);

describe('workspace tabs liquid-glass glide indicator', () => {
  it('is an absolute, non-interactive layer under the tabs with the snap bezier', () => {
    expect(shellCss).toMatch(
      /\.workspace-tabs-glide\s*\{[\s\S]*?position:\s*absolute;[\s\S]*?z-index:\s*0;[\s\S]*?pointer-events:\s*none;/,
    );
    // Overshoot bezier (y1 > 1) on both transform and width = the elastic snap.
    expect(shellCss).toMatch(
      /\.workspace-tabs-glide\s*\{[\s\S]*?transition:\s*\n?\s*transform 300ms cubic-bezier\(0\.32, 1\.28, 0\.36, 1\),\s*\n?\s*width 300ms cubic-bezier\(0\.32, 1\.28, 0\.36, 1\);/,
    );
    // Hidden until the hook has measured once; visible when stamped ready.
    expect(shellCss).toMatch(/\.workspace-tabs-glide\s*\{[\s\S]*?opacity:\s*0;/);
    expect(shellCss).toMatch(/\.workspace-tabs-glide\[data-ready\]\s*\{\s*opacity:\s*1;/);
  });

  it('neutralizes the static active pill only once the indicator is live', () => {
    // The un-gated .is-active pill stays as the SSR / no-JS fallback…
    expect(routinesCss).toMatch(
      /\.workspace-shell \.workspace-tab\.is-active\s*\{[\s\S]*?background:\s*#ffffff;/,
    );
    // …and is cleared only under [data-glide-ready].
    expect(routinesCss).toMatch(
      /\.workspace-shell \.workspace-tabs-strip\[data-glide-ready\] \.workspace-tab\.is-active\s*\{[\s\S]*?background:\s*transparent;[\s\S]*?border-color:\s*transparent;[\s\S]*?box-shadow:\s*none;/,
    );
  });

  it('keeps the accessibility fallbacks: reduced motion and reduced transparency', () => {
    expect(shellCss).toMatch(
      /@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]*?\.workspace-tabs-glide\s*\{\s*transition:\s*none;/,
    );
    expect(routinesCss).toMatch(
      /@media \(prefers-reduced-transparency: reduce\)\s*\{[\s\S]*?\.workspace-shell \.workspace-tabs-glide__pill\s*\{[\s\S]*?background:\s*var\(--bg-elevated\);[\s\S]*?backdrop-filter:\s*none;/,
    );
  });

  it('gives the SDF refraction state a pill-scale ring instead of the material default shadow', () => {
    expect(routinesCss).toMatch(
      /\.workspace-shell \.workspace-tabs-glide__pill\[data-od-glass-sdf\]\s*\{[\s\S]*?backdrop-filter:\s*var\(--flt\) blur\(12px\) saturate\(1\.35\);[\s\S]*?inset 0 1px 0\.5px var\(--glass-refract-ring-top\),/,
    );
  });
});
