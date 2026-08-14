import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { validateDesignSystemAdherence } from '../../src/design-systems/adherence.js';
import { loadDesignSystemRuntimePackage } from '../../src/design-systems/runtime.js';

const fixtureRoot = path.resolve(import.meta.dirname, '../fixtures/design-systems/runtime-v3');
const runtimePaths = {
  components: 'manifests/components.json',
  intents: 'manifests/intent-map.json',
  lint: 'rules/lint.json',
  fallback: 'rules/fallback.json',
} as const;

async function loadBundle() {
  const runtime = await loadDesignSystemRuntimePackage(fixtureRoot, runtimePaths);
  if (runtime.mode !== 'structured') throw new Error(`expected structured fixture, got ${runtime.mode}`);
  return runtime.bundle;
}

async function loadBundleWithSelectors(input: {
  component: string[];
  primary: string[];
}) {
  const bundle = await loadBundle();
  return {
    ...bundle,
    components: bundle.components.map((component) => component.definition.id !== 'Button'
      ? component
      : {
          ...component,
          definition: {
            ...component.definition,
            selectors: input.component,
            variants: {
              ...component.definition.variants,
              primary: {
                ...component.definition.variants!.primary!,
                selectors: input.primary,
              },
            },
          },
        }),
  };
}

describe('design-system adherence validation', () => {
  it('checks component, variant, state, and token reuse across related files', async () => {
    const report = validateDesignSystemAdherence({
      bundle: await loadBundle(),
      intent: 'account.settings.save',
      tokensCss: ':root { --accent: #245cff; }',
      artifacts: [
        {
          path: 'account-settings.html',
          mime: 'text/html',
          size: 86,
          content: '<button class="button button--primary">Save changes</button>',
        },
        {
          path: 'account-settings.css',
          mime: 'text/css',
          size: 220,
          content: `:root { --accent: #245cff; }
            .button { color: var(--accent); }
            .button--primary:hover { opacity: .9; }
            .button:focus-visible { outline: 2px solid var(--accent); }`,
        },
      ],
    });

    expect(report.status).toBe('passed');
    expect(report.nextAction).toBe('complete');
    expect(report.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'mapped-component-reuse', status: 'passed' }),
      expect.objectContaining({ id: 'variant-reuse', status: 'passed' }),
      expect.objectContaining({ id: 'declared-state', subject: 'Button.hover', status: 'passed' }),
      expect.objectContaining({ id: 'declared-state', subject: 'Button.focus', status: 'passed' }),
      expect.objectContaining({ id: 'unauthorized-token-reference', status: 'passed' }),
    ]));
  });

  it('fails a near-copy and returns concrete remediation', async () => {
    const report = validateDesignSystemAdherence({
      bundle: await loadBundle(),
      intent: 'account.settings.save',
      tokensCss: ':root { --accent: #245cff; }',
      artifacts: [{
        path: 'account-settings.html',
        mime: 'text/html',
        size: 90,
        content: '<button class="save-action" style="color: #123">Save changes</button>',
      }],
    });

    expect(report.status).toBe('failed');
    expect(report.nextAction).toBe('fix-and-rerun');
    expect(report.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'mapped-component-reuse',
        status: 'failed',
        remediation: expect.stringContaining('.button'),
      }),
      expect.objectContaining({
        id: 'unauthorized-color-literal',
        status: 'failed',
        message: expect.stringContaining('#123'),
      }),
    ]));
  });

  it('does not treat a base component class as proof that its interaction states exist', async () => {
    const report = validateDesignSystemAdherence({
      bundle: await loadBundle(),
      intent: 'account.settings.save',
      tokensCss: ':root { --accent: #245cff; }',
      artifacts: [{
        path: 'account-settings.html',
        mime: 'text/html',
        size: 160,
        content: '<style>.button { color: var(--accent); }</style><button class="button button--primary">Save changes</button>',
      }],
    });

    expect(report.status).toBe('failed');
    expect(report.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'declared-state', subject: 'Button.hover', status: 'failed' }),
      expect.objectContaining({ id: 'declared-state', subject: 'Button.focus', status: 'failed' }),
    ]));
  });

  it('does not count comment-only token references as executable token use', async () => {
    const report = validateDesignSystemAdherence({
      bundle: await loadBundle(),
      intent: 'account.settings.save',
      tokensCss: ':root { --accent: #245cff; }',
      artifacts: [
        {
          path: 'account-settings.html',
          size: 90,
          content: '<button class="button button--primary">Save changes</button>',
        },
        {
          path: 'account-settings.css',
          size: 180,
          content: `/* var(--accent) */
            .button--primary:hover { opacity: .9; }
            .button:focus-visible { outline: 2px solid currentColor; }`,
        },
        {
          path: 'note.ts',
          size: 50,
          content: 'const tokenExample = "var(--accent)";',
        },
      ],
    });

    expect(report.status).toBe('failed');
    expect(report.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'token-reference', status: 'failed' }),
    ]));
  });

  it('does not count comment-only component and variant selectors as reuse', async () => {
    const report = validateDesignSystemAdherence({
      bundle: await loadBundle(),
      intent: 'account.settings.save',
      tokensCss: ':root { --accent: #245cff; }',
      artifacts: [
        {
          path: 'account-settings.html',
          size: 180,
          content: '<!-- <button class="button button--primary">Save</button> --><div>Nothing rendered</div>',
        },
        {
          path: 'account-settings.css',
          size: 220,
          content: `.button { color: var(--accent); }
            .button--primary:hover { opacity: .9; }
            .button:focus-visible { outline: 2px solid var(--accent); }`,
        },
      ],
    });

    expect(report.status).toBe('failed');
    expect(report.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'mapped-component-reuse', status: 'failed' }),
      expect.objectContaining({ id: 'variant-reuse', status: 'failed' }),
    ]));
  });

  it('does not count JSX comments or strings as rendered component reuse', async () => {
    const report = validateDesignSystemAdherence({
      bundle: await loadBundle(),
      intent: 'account.settings.save',
      tokensCss: ':root { --accent: #245cff; }',
      artifacts: [{
        path: 'AccountSettings.tsx',
        size: 420,
        content: `export function AccountSettings() {
          const example = '<button className="button button--primary">Save</button>';
          // <button className="button button--primary">Save</button>
          return <>
            {/* <button className="button button--primary">Save</button> */}
            <style>{\`.button--primary:hover { opacity: .9; }
              .button:focus-visible { outline: 2px solid var(--accent); }\`}</style>
            <div style={{ color: 'var(--accent)' }}>Nothing rendered</div>
          </>;
        }`,
      }],
    });

    expect(report.status).toBe('failed');
    expect(report.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'mapped-component-reuse', status: 'failed' }),
      expect.objectContaining({ id: 'variant-reuse', status: 'failed' }),
    ]));
  });

  it('requires active custom-property declarations instead of comment-only token definitions', async () => {
    const report = validateDesignSystemAdherence({
      bundle: await loadBundle(),
      intent: 'account.settings.save',
      tokensCss: '/* :root { --accent: #245cff; } */',
      artifacts: [{
        path: 'account-settings.html',
        size: 260,
        content: `<style>.button { color: var(--accent); }
          .button--primary:hover { opacity: .9; }
          .button:focus-visible { outline: 2px solid var(--accent); }</style>
          <button class="button button--primary">Save changes</button>`,
      }],
    });

    expect(report.status).toBe('failed');
    expect(report.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'token-reference',
        status: 'failed',
        message: expect.stringContaining('no readable token definitions'),
      }),
    ]));
  });

  it('detects named colors and nested color functions outside token definitions', async () => {
    const report = validateDesignSystemAdherence({
      bundle: await loadBundle(),
      intent: 'account.settings.save',
      tokensCss: ':root { --accent: #245cff; }',
      artifacts: [
        {
          path: 'account-settings.html',
          size: 90,
          content: '<button class="button button--primary">Save changes</button>',
        },
        {
          path: 'account-settings.css',
          size: 300,
          content: `.button {
              color: red;
              background: color-mix(in srgb, var(--accent), white);
            }
            .button--primary:hover { opacity: .9; }
            .button:focus-visible { outline: 2px solid var(--accent); }`,
        },
      ],
    });

    expect(report.status).toBe('failed');
    expect(report.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'unauthorized-color-literal',
        status: 'failed',
        message: expect.stringContaining('red'),
      }),
    ]));
    const colorCheck = report.checks.find((check) => check.id === 'unauthorized-color-literal');
    expect(colorCheck?.message).toContain('color-mix(in srgb, var(--accent), white)');
  });

  it('rejects generated token definitions that override the active design system', async () => {
    const report = validateDesignSystemAdherence({
      bundle: await loadBundle(),
      intent: 'account.settings.save',
      tokensCss: ':root { --accent: #245cff; }',
      artifacts: [
        {
          path: 'account-settings.html',
          size: 90,
          content: '<button class="button button--primary">Save changes</button>',
        },
        {
          path: 'account-settings.css',
          size: 220,
          content: `:root { --accent: #123456; }
            .button { color: var(--accent); }
            .button--primary:hover { opacity: .9; }
            .button:focus-visible { outline: 2px solid var(--accent); }`,
        },
      ],
    });

    expect(report.status).toBe('failed');
    expect(report.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'unauthorized-color-literal',
        status: 'failed',
        message: expect.stringContaining('#123456'),
      }),
    ]));
  });

  it('does not treat a matching token value in a different scope as an active token definition', async () => {
    const report = validateDesignSystemAdherence({
      bundle: await loadBundle(),
      intent: 'account.settings.save',
      tokensCss: ':root { --accent: #245cff; }',
      artifacts: [
        {
          path: 'account-settings.html',
          size: 90,
          content: '<button class="button button--primary">Save changes</button>',
        },
        {
          path: 'account-settings.css',
          size: 220,
          content: `.account-settings { --accent: #245cff; }
            .button { color: var(--accent); }
            .button--primary:hover { opacity: .9; }
            .button:focus-visible { outline: 2px solid var(--accent); }`,
        },
      ],
    });

    expect(report.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'unauthorized-color-literal',
        status: 'failed',
        message: expect.stringContaining('#245cff'),
      }),
    ]));
  });

  it('recognizes declared classes in component source files without counting tag names as reuse', async () => {
    const report = validateDesignSystemAdherence({
      bundle: await loadBundle(),
      intent: 'account.settings.save',
      tokensCss: ':root { --accent: #245cff; }',
      artifacts: [{
        path: 'AccountSettings.tsx',
        mime: 'text/plain',
        size: 260,
        content: `export function AccountSettings() {
          return <>
            <style>{\`.button--primary:hover { opacity: .9; }
              .button:focus-visible { outline: 2px solid var(--accent); }\`}</style>
            <button className="button button--primary" style={{ color: 'var(--accent)' }}>
              Save changes
            </button>
          </>;
        }`,
      }],
    });

    expect(report.status).toBe('passed');
    expect(report.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'mapped-component-reuse', status: 'passed' }),
      expect.objectContaining({ id: 'variant-reuse', status: 'passed' }),
    ]));
  });

  it.each([
    {
      label: 'element name',
      markup: '<form><div data-role="primary" className="button button--primary">Save</div></form>',
    },
    {
      label: 'attribute value',
      markup: '<form><button data-role="secondary" className="button button--primary">Save</button></form>',
    },
    {
      label: 'parent combinator',
      markup: '<section><button data-role="primary" className="button button--primary">Save</button></section>',
    },
  ])('preserves the $label constraint when matching JSX selectors', async ({ markup }) => {
    const bundle = await loadBundleWithSelectors({
      component: ['form > button[data-role="primary"]'],
      primary: ['form > button[data-role="primary"].button--primary'],
    });
    const report = validateDesignSystemAdherence({
      bundle,
      intent: 'account.settings.save',
      tokensCss: ':root { --accent: #245cff; }',
      artifacts: [{
        path: 'AccountSettings.tsx',
        size: 420,
        content: `export function AccountSettings() {
          return <>
            <style>{\`.button--primary:hover { opacity: .9; }
              .button:focus-visible { outline: 2px solid var(--accent); }\`}</style>
            ${markup}
          </>;
        }`,
      }],
    });

    expect(report.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'mapped-component-reuse', status: 'failed' }),
      expect.objectContaining({ id: 'variant-reuse', status: 'failed' }),
    ]));
  });

  it('matches static classes inside a JSX template literal without discarding selector structure', async () => {
    const bundle = await loadBundleWithSelectors({
      component: ['form > button[data-role="primary"].button'],
      primary: ['form > button[data-role="primary"].button--primary'],
    });
    const report = validateDesignSystemAdherence({
      bundle,
      intent: 'account.settings.save',
      tokensCss: ':root { --accent: #245cff; }',
      artifacts: [{
        path: 'AccountSettings.tsx',
        size: 520,
        content: `export function AccountSettings({ disabled }: { disabled: boolean }) {
          return <>
            <style>{\`.button--primary:hover { opacity: .9; }
              .button:focus-visible { outline: 2px solid var(--accent); }\`}</style>
            <form>
              <button
                data-role="primary"
                className={\`button button--primary \${disabled ? 'is-disabled' : ''}\`}
                style={{ color: 'var(--accent)' }}
              >
                Save changes
              </button>
            </form>
          </>;
        }`,
      }],
    });

    expect(report.status).toBe('passed');
    expect(report.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'mapped-component-reuse', status: 'passed' }),
      expect.objectContaining({ id: 'variant-reuse', status: 'passed' }),
    ]));
  });

  it.each([
    ['css tag', 'css'],
    ['styled member tag', 'styled.button'],
  ])('checks raw colors in a %s CSS-in-JS template', async (_label, tag) => {
    const report = validateDesignSystemAdherence({
      bundle: await loadBundle(),
      intent: 'account.settings.save',
      tokensCss: ':root { --accent: #245cff; }',
      artifacts: [{
        path: 'AccountSettings.tsx',
        size: 620,
        content: `const generatedStyle = ${tag}\`
            .button { color: #123456; }
          \`;
          export function AccountSettings() {
            return <>
              <style>{\`.button--primary:hover { opacity: .9; }
                .button:focus-visible { outline: 2px solid var(--accent); }\`}</style>
              <button className="button button--primary" style={{ color: 'var(--accent)' }}>
                Save changes
              </button>
            </>;
          }`,
      }],
    });

    expect(report.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'unauthorized-color-literal',
        status: 'failed',
        message: expect.stringContaining('#123456'),
      }),
    ]));
  });

  it('checks raw colors in SVG presentation attributes', async () => {
    const report = validateDesignSystemAdherence({
      bundle: await loadBundle(),
      intent: 'account.settings.save',
      tokensCss: ':root { --accent: #245cff; }',
      artifacts: [{
        path: 'account-settings.svg',
        mime: 'image/svg+xml',
        size: 620,
        content: `<svg xmlns="http://www.w3.org/2000/svg">
          <style>
            .button { color: var(--accent); }
            .button--primary:hover { opacity: .9; }
            .button:focus-visible { outline: 2px solid var(--accent); }
          </style>
          <linearGradient id="accent-gradient">
            <stop offset="0" stop-color="#123456" />
          </linearGradient>
          <g class="button button--primary"><text>Save changes</text></g>
        </svg>`,
      }],
    });

    expect(report.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'unauthorized-color-literal',
        status: 'failed',
        message: expect.stringContaining('#123456'),
      }),
    ]));
  });

  it('keeps no-match output blocked until its marker and human confirmation exist', async () => {
    const missingMarker = validateDesignSystemAdherence({
      bundle: await loadBundle(),
      intent: 'workspace.delete.confirm',
      tokensCss: ':root { --accent: #245cff; }',
      artifacts: [{ path: 'delete.html', size: 20, content: '<div>Delete</div>' }],
    });
    expect(missingMarker).toMatchObject({
      status: 'failed',
      nextAction: 'fix-and-rerun',
    });

    const marked = validateDesignSystemAdherence({
      bundle: await loadBundle(),
      intent: 'workspace.delete.confirm',
      tokensCss: ':root { --accent: #245cff; }',
      artifacts: [{
        path: 'delete.html',
        size: 70,
        content: '<div data-ds-fallback="no-match">Pending component choice</div>',
      }],
    });
    expect(marked).toMatchObject({
      status: 'confirmation-required',
      nextAction: 'request-human-confirmation',
      summary: { failed: 0, needsConfirmation: 1 },
    });
  });

  it('does not accept fallback markers that exist only in comments or non-markup files', async () => {
    const report = validateDesignSystemAdherence({
      bundle: await loadBundle(),
      intent: 'workspace.delete.confirm',
      tokensCss: ':root { --accent: #245cff; }',
      artifacts: [
        {
          path: 'delete.html',
          size: 80,
          content: '<!-- data-ds-fallback="no-match" --><div>Pending component choice</div>',
        },
        {
          path: 'delete.css',
          size: 50,
          content: '/* data-ds-fallback="no-match" */',
        },
        {
          path: 'DeleteDialog.tsx',
          size: 100,
          content: 'const example = \'<div data-ds-fallback="no-match">Example</div>\'; export default () => <div />;',
        },
      ],
    });

    expect(report).toMatchObject({
      status: 'failed',
      nextAction: 'fix-and-rerun',
    });
    expect(report.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'fallback-marker', status: 'failed' }),
    ]));
  });
});
