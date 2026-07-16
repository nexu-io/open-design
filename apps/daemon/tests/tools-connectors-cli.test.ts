import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { runConnectorsToolCli } from '../src/tools-connectors-cli.js';

const ORIGINAL_ENV = { ...process.env };

const AUDIT_DESIGN_MD = `# Cherry Studio Design System

## Product Context

Cherry Studio is a desktop AI chat workspace with a dense shell, assistant navigation, model selection, and composer-first workflows. The design system should preserve the compact app frame, clear message hierarchy, and source-backed assets.

## Color Foundations

Use the captured primary green, dark theme surfaces, muted dividers, and neutral text colors from source evidence. Color rules must document backgrounds, elevated panels, borders, text, primary actions, and status states.

## Typography

Ubuntu is the core sans family. Use clear size steps for navigation, message content, titles, dense metadata, and button labels. Keep mono text for code-like paths, IDs, and technical details.

## Spacing And Layout

Use compact spacing, slim gutters, and split-pane app layout rules. Preserve sidebar density, toolbar rhythm, composer placement, and scrollable content regions.

## Components

Define buttons, inputs, assistant rows, message bubbles, model selectors, icon actions, settings controls, and status surfaces with concrete states and usage notes.

## Motion And Interaction

Use quick hover/focus feedback, subtle panel transitions, predictable loading states, and reduced-motion fallbacks for desktop productivity.

## Voice And Brand

Use direct product language. Keep labels calm, technical, and concise while preserving Cherry Studio naming and app terminology.

## Anti-patterns

Avoid generic marketing pages, oversized cards, invented palettes, missing source assets, and preview pages that do not show real product modules.
`;

const AUDIT_README = `# Cherry Studio Design System

This package captures a source-backed Open Design design system for a desktop AI chat workspace. It includes reusable rules, token CSS, focused review previews, preserved assets, preserved fonts, and an applied UI kit.

## Product Overview

Cherry Studio is a desktop AI chat workspace for multi-model assistant workflows. The source product provides assistant navigation, topic and message review, model selection, file-aware composer controls, settings panels, and compact cross-platform app chrome for Windows, macOS, and Linux. Use this package to preserve that dense productivity surface rather than turning the system into a generic landing page.

## Package Contents

- DESIGN.md is the canonical Open Design rules document.
- colors_and_type.css contains reusable variables for color, type, spacing, radius, and states.
- preview/ contains focused HTML cards for color, typography, spacing, components, and brand assets.
- ui_kits/app/ contains an applied interface example for future project reuse.
- assets/, build/, and fonts/ preserve source-backed brand, runtime icons, and typography evidence.

## Preview Manifest

- preview/colors-primary.html reviews the captured primary palette and semantic color roles.
- preview/colors-theme-light.html reviews light surfaces, borders, and text hierarchy.
- preview/typography-specimens.html reviews Ubuntu typography specimens and dense UI text.
- preview/spacing-tokens.html reviews compact layout rhythm, radius, and spacing rules.
- preview/components-buttons.html reviews core controls and component states.
- preview/brand-assets.html reviews preserved source assets, runtime icons, and fonts.

## Review Workflow

Start with DESIGN.md, compare the preview cards, then inspect the applied UI kit. Reuse assets and fonts directly when building product surfaces.
`;

const README_WITHOUT_PREVIEW_MANIFEST = AUDIT_README.replace(
  /\n## Preview Manifest\n\n[\s\S]*?\n## Review Workflow/u,
  '\n## Review Workflow',
);

const README_WITHOUT_PRODUCT_OVERVIEW = `# Cherry Studio Design System

https://github.com/cherryhq/cherry-studio

## Overview

- Category: Custom
- Surface: web
- Primary accent: #00b96b
- Background: #ffffff
- Foreground: #202124

## Generated Files

- DESIGN.md: canonical design system source.
- colors_and_type.css: reusable CSS variables for color and type.
- preview/: HTML review cards for type, color, spacing, components, and brand.
- assets/: logo and brand asset references.
- context/: structured source context captured during setup.
- ui_kits/app/: interactive interface preview.
- SKILL.md: agent-facing usage instructions.

## Source Context

Company/product context: https://github.com/cherryhq/cherry-studio
GitHub/code links: https://github.com/cherryhq/cherry-studio
`;

const README_WITHOUT_PACKAGE_REUSE_GUIDE = `# Cherry Studio Design System

## Product Overview

Cherry Studio is a desktop AI chat workspace for multi-model assistant workflows. The source product provides assistant navigation, topic and message review, model selection, file-aware composer controls, settings panels, and compact cross-platform app chrome for Windows, macOS, and Linux. Use this package to preserve that dense productivity surface rather than turning the system into a generic landing page.

## Visual Direction

The system uses compact app-shell layouts, source-backed green accents, neutral surfaces, preserved typography, and workflow-oriented copy. Keep future outputs dense, product-like, and grounded in captured evidence.
`;

const MARKDOWN_ONLY_AUDIT_SKILL = `# Cherry Studio Design System

Use this skill when creating Open Design artifacts that should match the Cherry Studio desktop AI chat workspace.

## Workflow

1. Read README.md, then DESIGN.md, and treat them as the source of truth.
2. Load colors_and_type.css for concrete tokens.
3. Inspect preview/ for focused review cards before inventing new styling.
4. Use ui_kits/app/ as the applied interface pattern for chat, assistant navigation, model controls, and composer surfaces.
5. Preserve source-backed assets and fonts from assets/ and fonts/.

## Output Rules

Keep layouts compact, app-like, and productivity-focused. Use real component states, avoid generic landing pages, and keep typography and spacing grounded in the captured evidence.
`;

const AUDIT_SKILL = `---
name: cherry-studio-design
description: Use this skill when creating Open Design artifacts that should match the Cherry Studio desktop AI chat workspace.
user-invocable: true
---

Read README.md, DESIGN.md, colors_and_type.css, the preview cards, preserved assets, build icons, fonts, source examples, and the modular UI kit before generating any new interface.

**What's inside:**
- Source-backed visual foundations, token CSS, assets, build icons, fonts, preview cards, source examples, and UI kit components.
- DESIGN.md as canonical rules and README.md as the package manifest.

**Source context:**
This design system is based on Cherry Studio source evidence captured from its repository and package assets. The source product is a desktop AI chat workspace with assistant navigation, model controls, chat surfaces, composer flows, and compact cross-platform app chrome.

**When to use this skill:**
- Creating source-backed Cherry Studio mockups, prototypes, or review artifacts.
- Designing new UI modules that need to match the extracted desktop app visual language.
- Building production-adjacent interfaces that should reuse preserved assets, fonts, and token CSS.

**How to use:**
Load colors_and_type.css, inspect preview/, reuse ui_kits/app/, and preserve compact app-like layouts grounded in the captured evidence instead of inventing a marketing page.

**Design system highlights:**
- Primary color: #00b96b with muted neutral surfaces.
- Typography: Ubuntu-backed sans family with compact app hierarchy.
- Layout: persistent sidebar, assistant rail, chat workspace, and composer.
- Interaction: subtle hover, active, focus, and disabled states for dense productivity UI.
`;

// Same complete, reusable SKILL.md as AUDIT_SKILL, but with the two reuse
// headings worded exactly as the skill_missing_reuse_sections warning instructs
// authors to write them — "What is inside" and "design-system highlights".
// Following the warning text must satisfy the validator, or an agent running
// --fail-on-warnings loops forever re-spelling these headings (#4435).
const SKILL_WITH_WARNING_WORDED_SECTIONS = AUDIT_SKILL
  .replace("**What's inside:**", '**What is inside:**')
  .replace('**Design system highlights:**', '**Design-system highlights:**');

const SKILL_WITHOUT_REUSE_SECTIONS = `---
name: cherry-studio-design
description: Use this skill when creating Open Design artifacts that should match the Cherry Studio desktop AI chat workspace.
user-invocable: true
---

Read README.md, DESIGN.md, colors_and_type.css, the preview cards, preserved assets, fonts, and the modular UI kit before generating any new interface.

This package is intended for reusable Open Design work, so future agents should keep the output grounded in captured evidence, use preserved assets instead of redrawing brand marks, keep app surfaces compact, and inspect preview cards before introducing any new component pattern. Treat it as a focused product design kit, not a generic style summary.

**How to use:**
Load colors_and_type.css and inspect preview/ before creating new artifacts. Reuse ui_kits/app when composing product-like screens and check README.md plus DESIGN.md before making visual decisions.
`;

const AUDIT_UI_KIT_README = `# Cherry Studio UI Kit

This UI kit contains source-backed recreations of the Cherry Studio desktop AI chat workspace. Use it as the applied interface reference when composing future prototypes or review surfaces.

## Structure

- \`index.html\` - Complete applied chat workspace demo that loads token CSS and component modules.
- \`components/\` - Reusable React components:
  - \`App.jsx\` - Composes the whole product-like surface.
  - \`Sidebar.jsx\` - Left navigation/sidebar shell.
  - \`AssistantsList.jsx\` - Assistant or thread list rail.
  - \`ChatArea.jsx\` - Main conversation workspace.
  - \`InputBar.jsx\` - Message composer surface.
  - \`MessageBubble.jsx\` - Message and feedback card pattern.

## Usage

Open \`index.html\` to review the composed interface. Copy component JSX files into new prototypes, import \`../../colors_and_type.css\`, and compose the role components rather than rebuilding a generic static mock.

## Design Notes

Keep the layout compact and app-like: persistent sidebar, assistant rail, scrollable chat area, and composer. Colors, typography, spacing, radius, and states come from \`colors_and_type.css\`.

## Source

Based on the captured Cherry Studio source evidence and preserved package assets.
`;

const REFERENCE_AUDIT_SKILL = `---
name: cherry-studio-design
description: Use this skill to generate well-branded interfaces and assets for Cherry Studio prototypes and production-adjacent UI.
user-invocable: true
---

Read README.md, colors_and_type.css, the preview cards, preserved fonts, and the modular UI kit before generating any new interface. This frontmatter-first shape matches Claude Design exported packages, which may not include a top-level Markdown heading.

**What's inside:**
- Visual foundations for colors, typography, spacing, radius, shadows, and interaction states.
- CSS design tokens in colors_and_type.css.
- Preserved brand assets and fonts.
- Preview cards showing the complete design-system review surface.
- UI kit with modular components for shell, sidebar, chat surfaces, and composer flows.

**Source context:**
This design system is based on Cherry Studio source evidence and package assets. The product is a desktop AI chat application with assistant navigation, multi-model conversations, settings surfaces, and app-shell layouts.

**When to use this skill:**
- Generating Cherry Studio-aligned prototypes, mockups, and reviewable HTML artifacts.
- Building production-adjacent UI that should reuse the extracted visual language.
- Creating app-like surfaces that need the source-backed assets, fonts, and layout conventions.

**How to use:**
Copy assets, load the token CSS, inspect the preview cards, then compose new HTML or app UI from the modular kit. Keep generated surfaces compact, workspace-oriented, and grounded in the captured evidence instead of inventing a marketing page.

**Design system highlights:**
- Colors: source-backed green accent with light and dark theme surfaces.
- Typography: Ubuntu family with compact desktop app sizing.
- Spacing and radius: dense sidebar, list, chat, and composer rhythm.
- Icons and assets: preserved brand and runtime assets instead of redrawn placeholders.
`;

const UNBOUND_FONT_AUDIT_TOKENS_CSS = `:root {
  --cherry-bg: #f7f8fa;
  --cherry-surface: #ffffff;
  --cherry-surface-muted: #f1f3f5;
  --cherry-fg: #202124;
  --cherry-muted: #73777f;
  --cherry-border: #dfe3e8;
  --cherry-primary: #00b96b;
  --cherry-primary-hover: #00a862;
  --cherry-danger: #ef4444;
  --cherry-font-sans: Ubuntu, Inter, ui-sans-serif, system-ui, sans-serif;
  --cherry-font-mono: SFMono-Regular, ui-monospace, monospace;
  --cherry-radius-sm: 6px;
  --cherry-radius-md: 10px;
  --cherry-space-1: 4px;
  --cherry-space-2: 8px;
  --cherry-space-3: 12px;
  --cherry-space-4: 16px;
}
`;

const AUDIT_TOKENS_CSS = `@font-face {
  font-family: 'Ubuntu';
  src: url('./fonts/ubuntu/Ubuntu-Regular.ttf') format('truetype');
  font-weight: 400;
  font-style: normal;
}

${UNBOUND_FONT_AUDIT_TOKENS_CSS}`;

const AUDIT_COMPONENT_FILES = [
  'App.jsx',
  'Sidebar.jsx',
  'AssistantsList.jsx',
  'ChatArea.jsx',
  'InputBar.jsx',
  'MessageBubble.jsx',
];

function auditHtml(title: string): string {
  const cards = Array.from({ length: 8 }, (_, index) => `<article><h2>${title} ${index + 1}</h2><p>Source-backed review content for compact desktop app surfaces, component states, spacing, typography, and reusable product modules.</p><button>Review state</button></article>`).join('');
  const brandAssets = title === 'brand-assets.html'
    ? `
    <section class="brand-assets">
      <img src="../assets/logo.png" alt="Cherry Studio logo" />
      <img src="../build/icon.png" alt="Cherry Studio app icon" />
    </section>`
    : '';
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${title}</title>
  <style>
    body { margin: 0; font-family: Ubuntu, Inter, sans-serif; background: #f7f8fa; color: #202124; }
    main { width: min(960px, calc(100vw - 48px)); margin: 40px auto; display: grid; gap: 16px; }
    article { border: 1px solid #dfe3e8; border-radius: 10px; background: #fff; padding: 16px; }
    .brand-assets { display: flex; gap: 16px; align-items: center; padding: 18px; background: #fff; border: 1px solid #dfe3e8; border-radius: 10px; }
    .brand-assets img { width: 72px; height: 72px; object-fit: contain; }
    button { border: 1px solid #00b96b; background: #00b96b; color: #fff; border-radius: 8px; padding: 8px 12px; }
  </style>
</head>
<body>
  <main>
    <h1>${title}</h1>
    <p>A focused review card that preserves product density, component rhythm, and real source-backed design evidence.</p>
    ${brandAssets}
    ${cards}
  </main>
</body>
</html>
`;
}

function auditUiKitIndex(componentFiles: string[] = AUDIT_COMPONENT_FILES): string {
  const scripts = componentFiles
    .map((fileName) => `  <script type="text/babel" src="components/${fileName}"></script>`)
    .join('\n');
  const componentNames = componentFiles.map((fileName) => fileName.replace(/\.(jsx|tsx|js|ts|html)$/u, ''));
  const componentCards = componentNames
    .map((componentName) => `<article><h2>${componentName}</h2><p>${componentName} is loaded from ui_kits/app/components/${componentName}.jsx and composed into this applied interface kit.</p></article>`)
    .join('\n      ');
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Cherry Studio UI kit</title>
  <script src="https://unpkg.com/react@18.3.1/umd/react.development.js"></script>
  <script src="https://unpkg.com/react-dom@18.3.1/umd/react-dom.development.js"></script>
  <script src="https://unpkg.com/@babel/standalone@7.29.0/babel.min.js"></script>
  <link rel="stylesheet" href="../../colors_and_type.css" />
  <style>
    body { margin: 0; min-height: 100vh; font-family: var(--cherry-font-sans); background: var(--cherry-bg); color: var(--cherry-fg); }
    main { width: min(1120px, calc(100vw - 48px)); margin: 32px auto; display: grid; gap: 16px; grid-template-columns: 240px 1fr; }
    aside, section { border: 1px solid var(--cherry-border); border-radius: var(--cherry-radius-md); background: var(--cherry-surface); padding: var(--cherry-space-4); }
    article { border: 1px solid var(--cherry-border); border-radius: var(--cherry-radius-sm); background: var(--cherry-surface-muted); padding: var(--cherry-space-3); }
  </style>
</head>
<body>
  <div id="root"></div>
${scripts}
  <script type="text/babel">
    const { ${componentNames[0] ?? 'App'} } = window;
    const root = ReactDOM.createRoot(document.getElementById('root'));
    root.render(<${componentNames[0] ?? 'App'} />);
  </script>
  <main>
    <aside><strong>Cherry Studio</strong><p>Loaded modular components: ${componentFiles.join(', ')}</p></aside>
    <section>
      <h1>Applied modular UI kit</h1>
      <p>This entry page loads the extracted token CSS and composes reusable component modules instead of standing alone as a generic mock.</p>
      ${componentCards}
    </section>
  </main>
</body>
</html>
`;
}

function auditComponent(componentName: string): string {
  return `const ${componentName}Items = [
  { id: 'primary', label: '${componentName} primary state', detail: 'Source-backed density, spacing, and active state.' },
  { id: 'secondary', label: '${componentName} secondary state', detail: 'Muted state with compact metadata and clear affordance.' },
  { id: 'review', label: '${componentName} review state', detail: 'Reusable review surface for future Open Design projects.' },
];

const ${componentName}Styles = {
  shell: { display: 'grid', gap: 12, padding: 16, border: '1px solid var(--cherry-border)', borderRadius: 12, background: 'var(--cherry-surface)' },
  header: { display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' },
  row: { display: 'grid', gap: 4, padding: '10px 12px', borderRadius: 10, background: 'var(--cherry-surface-muted)' },
  label: { fontWeight: 700, color: 'var(--cherry-fg)' },
  detail: { color: 'var(--cherry-muted)', fontSize: 13 },
  action: { border: '1px solid var(--cherry-primary)', background: 'var(--cherry-primary)', color: '#fff', borderRadius: 8, padding: '8px 10px' },
};

function ${componentName}({ title = '${componentName}', items = ${componentName}Items }) {
  return (
    <section style={${componentName}Styles.shell}>
      <header style={${componentName}Styles.header}>
        <strong>{title}</strong>
        <button type="button" style={${componentName}Styles.action}>Review</button>
      </header>
      {items.map((item) => (
        <article key={item.id} style={${componentName}Styles.row}>
          <span style={${componentName}Styles.label}>{item.label}</span>
          <span style={${componentName}Styles.detail}>{item.detail}</span>
        </article>
      ))}
    </section>
  );
}

window.${componentName} = ${componentName};
`;
}

function auditAppComponent(): string {
  return `const { Sidebar, AssistantsList, ChatArea } = window;

const appStyles = {
  container: {
    display: 'flex',
    width: '100%',
    minHeight: '720px',
    background: 'var(--cherry-bg)',
    color: 'var(--cherry-fg)'
  }
};

function App() {
  return (
    <div style={appStyles.container}>
      <Sidebar />
      <AssistantsList />
      <ChatArea />
    </div>
  );
}

window.App = App;
`;
}

function auditUiKitComponent(componentName: string): string {
  const baseName = componentName.replace(/\.(jsx|tsx|js|ts)$/u, '');
  return baseName === 'App' ? auditAppComponent() : auditComponent(baseName);
}

describe('connectors tool CLI', () => {
  let stdoutWrite: { mockRestore: () => void };
  let stderrWrite: { mockRestore: () => void };
  let stdoutOutput: string[];
  let stderrOutput: string[];
  let fetchMock: ReturnType<typeof vi.fn>;
  let cwd: string;

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    cwd = process.cwd();
    stdoutOutput = [];
    stderrOutput = [];
    stdoutWrite = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      stdoutOutput.push(String(chunk));
      return true;
    });
    stderrWrite = vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
      stderrOutput.push(String(chunk));
      return true;
    });
    fetchMock = vi.fn(async () => new Response(JSON.stringify({ connectors: [] }), { headers: { 'Content-Type': 'application/json' }, status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    stdoutWrite.mockRestore();
    stderrWrite.mockRestore();
    process.env = ORIGINAL_ENV;
    process.chdir(cwd);
  });

  async function installFailingLocalGithubTools(tmpDir: string): Promise<void> {
    const fakeBinDir = path.join(tmpDir, 'bin');
    await mkdir(fakeBinDir, { recursive: true });
    const fakeGitPath = path.join(fakeBinDir, 'git');
    await writeShellShim(fakeGitPath, `#!/bin/sh
echo "fatal: repository not found" >&2
exit 128
`);
    await writeCmdShim(fakeGitPath, '@echo off\r\necho fatal: repository not found 1>&2\r\nexit /b 128\r\n');
    process.env.PATH = `${fakeBinDir}${path.delimiter}${process.env.PATH ?? ''}`;
  }

  async function writeShellShim(commandPath: string, script: string): Promise<void> {
    await writeFile(commandPath, script, 'utf8');
    await chmod(commandPath, 0o755);
    if (process.platform !== 'win32') return;

    await writeFile(`${commandPath}.cmd`, `@echo off\r\nsh "%~dp0${path.basename(commandPath)}" %*\r\nexit /b %ERRORLEVEL%\r\n`, 'utf8');
  }

  async function writeCmdShim(commandPath: string, script: string): Promise<void> {
    if (process.platform === 'win32') {
      await writeFile(`${commandPath}.cmd`, script, 'utf8');
    }
  }

  async function cleanupTempDir(tmpDir: string): Promise<void> {
    process.chdir(cwd);
    await rm(tmpDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }

  it('appends curated useCase query params for connector listing', async () => {
    process.env.OD_DAEMON_URL = 'http://127.0.0.1:7456/base/';
    process.env.OD_TOOL_TOKEN = 'agent-run-token';
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ connectors: [] }), { headers: { 'Content-Type': 'application/json' }, status: 200 }));

    const result = await runConnectorsToolCli(['list', '--use-case', 'personal_daily_digest']);

    expect(result.exitCode).toBe(0);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:7456/base/api/tools/connectors/list?useCase=personal_daily_digest',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({ Authorization: 'Bearer agent-run-token' }),
      }),
    );
  });

  it('includes curation in compact connector output', async () => {
    process.env.OD_DAEMON_URL = 'http://127.0.0.1:7456';
    process.env.OD_TOOL_TOKEN = 'agent-run-token';
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
      connectors: [{
        id: 'slack',
        name: 'Slack',
        provider: 'composio',
        category: 'Communication',
        status: 'connected',
        tools: [{
          name: 'slack.slack_list_channels',
          description: 'List Slack channels',
          safety: { sideEffect: 'read', approval: 'auto', reason: 'read-only' },
          curation: { useCases: ['personal_daily_digest'], reason: 'Digest source' },
        }],
      }],
    }), { headers: { 'Content-Type': 'application/json' }, status: 200 }));

    const result = await runConnectorsToolCli(['list']);

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(stdoutOutput.join(''))).toEqual({
      ok: true,
      connectors: [{
        id: 'slack',
        name: 'Slack',
        provider: 'composio',
        category: 'Communication',
        status: 'connected',
        accountLabel: undefined,
        tools: [{
          name: 'slack.slack_list_channels',
          description: 'List Slack channels',
          safety: { sideEffect: 'read', approval: 'auto', reason: 'read-only' },
          curation: { useCases: ['personal_daily_digest'], reason: 'Digest source' },
          inputSchema: undefined,
        }],
      }],
    });
    expect(stderrOutput.join('')).toBe('');
  });

  it('writes GitHub design evidence through connected connector tools', async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'od-connectors-cli-'));
    process.chdir(tmpDir);
    process.env.OD_DAEMON_URL = 'http://127.0.0.1:7456';
    process.env.OD_TOOL_TOKEN = 'agent-run-token';
    await installFailingLocalGithubTools(tmpDir);

    const encode = (value: string) => Buffer.from(value, 'utf8').toString('base64');
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({
        connectors: [{
          id: 'github',
          name: 'GitHub',
          provider: 'composio',
          category: 'Developer',
          status: 'connected',
          tools: [{ name: 'github.github_get_repository_content' }],
        }],
      }), { headers: { 'Content-Type': 'application/json' }, status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        ok: true,
        output: { data: { default_branch: 'main', html_url: 'https://github.com/acme/ui' } },
      }), { headers: { 'Content-Type': 'application/json' }, status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        ok: true,
        output: { data: { path: 'README.md', encoding: 'base64', content: encode('# Acme UI') } },
      }), { headers: { 'Content-Type': 'application/json' }, status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        ok: true,
        output: { data: { tree: [
          { path: 'build/logo.png', type: 'blob' },
          { path: 'package.json', type: 'blob' },
          { path: 'src/pages/home/HomePage.tsx', type: 'blob' },
          { path: 'src/components/Button.tsx', type: 'blob' },
          { path: 'src/styles.css', type: 'blob' },
        ] } },
      }), { headers: { 'Content-Type': 'application/json' }, status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        ok: true,
        output: { data: { encoding: 'base64', content: Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString('base64') } },
      }), { headers: { 'Content-Type': 'application/json' }, status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        ok: true,
        output: { data: 'export function HomePage(){ return <main className="workspace" /> }' },
      }), { headers: { 'Content-Type': 'application/json' }, status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        ok: true,
        output: { data: ':root { --color-brand: #ff5500; --radius-md: 8px; }' },
      }), { headers: { 'Content-Type': 'application/json' }, status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        ok: true,
        output: { data: { content: { mimetype: 'text/plain', name: 'Button.tsx', s3url: 'https://signed.example/Button.tsx' } } },
      }), { headers: { 'Content-Type': 'application/json' }, status: 200 }))
      .mockResolvedValueOnce(new Response('export function Button(){ return <button className="rounded-md" /> }', { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        ok: true,
        output: { data: '{"dependencies":{"@radix-ui/react-slot":"latest"}}' },
      }), { headers: { 'Content-Type': 'application/json' }, status: 200 }));

    const result = await runConnectorsToolCli(['github-design-context', '--repo', 'acme/ui', '--max-files', '5']);

    expect(result.exitCode).toBe(0);
    const stdout = JSON.parse(stdoutOutput.join(''));
    expect(stdout).toEqual(expect.objectContaining({
      ok: true,
      repo: 'acme/ui',
      method: 'connector',
      outputPath: 'context/github/acme-ui.md',
      snapshotFiles: expect.arrayContaining([
        'context/github/acme-ui/files/build/logo.png',
        'context/github/acme-ui/files/src/pages/home/HomePage.tsx',
      ]),
      materializedFiles: expect.arrayContaining([
        'build/logo.png',
        'source_examples/src/pages/home/HomePage.tsx',
      ]),
    }));
    const evidenceNote = await readFile(path.join(tmpDir, 'context/github/acme-ui.md'), 'utf8');
    expect(evidenceNote).toContain('Connector platform fallback was used');
    expect(evidenceNote).toContain('Source Evidence Inventory');
    expect(evidenceNote).toContain('Package Files Materialized');
    expect(evidenceNote).toContain('`build/logo.png`');
    expect(evidenceNote).toContain('`source_examples/src/pages/home/HomePage.tsx`');
    expect(evidenceNote).toContain('Theme, tokens, and styling');
    expect(evidenceNote).toContain('Reusable components');
    expect(evidenceNote).toContain('ui_kits/app/index.html` must be a browser-reviewable component entry');
    expect(evidenceNote).toContain('ui_kits/app/components/App.jsx` (or equivalent app shell) must compose source-backed role components');
    expect(evidenceNote).toContain('Claude-style UI-kit entry skeleton for direct JSX kits');
    expect(evidenceNote).toContain('<script type="text/babel" src="components/ComponentName.jsx"></script>');
    expect(evidenceNote).toContain('ReactDOM.createRoot(document.getElementById("root"))');
    expect(evidenceNote).toContain('source_examples/');
    const materializedLogo = await readFile(path.join(tmpDir, 'build/logo.png'));
    expect([...materializedLogo]).toEqual([0x89, 0x50, 0x4e, 0x47]);
    await expect(readFile(path.join(tmpDir, 'source_examples/src/pages/home/HomePage.tsx'), 'utf8')).resolves.toContain('HomePage');
    await expect(readFile(path.join(tmpDir, 'context/github/acme-ui/files/src/components/Button.tsx'), 'utf8')).resolves.toContain('rounded-md');
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:7456/api/tools/connectors/execute',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('github.github_get_raw_repository_content'),
      }),
    );

    await cleanupTempDir(tmpDir);
  });

  it('writes bounded local design evidence snapshots from a linked folder', async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'od-local-context-'));
    process.chdir(tmpDir);
    const sourceDir = path.join(tmpDir, 'cherry-studio');
    await mkdir(path.join(sourceDir, 'src/components'), { recursive: true });
    await mkdir(path.join(sourceDir, 'src/pages/home'), { recursive: true });
    await mkdir(path.join(sourceDir, 'src/assets/fonts/ubuntu'), { recursive: true });
    await mkdir(path.join(sourceDir, 'build'), { recursive: true });
    await mkdir(path.join(tmpDir, 'build'), { recursive: true });
    await writeFile(path.join(sourceDir, 'README.md'), '# Cherry Studio\n\nDesktop AI chat workspace.');
    await writeFile(path.join(sourceDir, 'package.json'), JSON.stringify({ name: 'cherry-studio' }));
    await writeFile(path.join(sourceDir, 'src/styles.css'), ':root { --color-primary: #db6f57; }');
    await writeFile(path.join(sourceDir, 'src/components/Button.tsx'), 'export function Button() { return <button className="rounded-lg" />; }');
    await writeFile(path.join(sourceDir, 'src/pages/home/HomePage.tsx'), 'export function HomePage() { return <main />; }');
    await writeFile(path.join(sourceDir, 'src/assets/fonts/ubuntu/Ubuntu-Regular.ttf'), Buffer.from('font-data'));
    await writeFile(path.join(sourceDir, 'build/icon.png'), Buffer.from('source-icon'));
    await writeFile(path.join(sourceDir, 'build/logo.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    await writeFile(path.join(tmpDir, 'build/icon.png'), Buffer.from('existing-icon'));

    const result = await runConnectorsToolCli([
      'local-design-context',
      '--path',
      sourceDir,
      '--output',
      'context/local-code/cherry-studio.md',
      '--max-files',
      '10',
    ]);

    expect(result.exitCode).toBe(0);
    const output = JSON.parse(stdoutOutput.join(''));
    expect(output).toMatchObject({
      ok: true,
      sourcePath: sourceDir,
      method: 'local-folder',
      outputPath: 'context/local-code/cherry-studio.md',
      snapshotFiles: expect.arrayContaining([
        'context/local-code/cherry-studio/files/package.json',
        'context/local-code/cherry-studio/files/src/styles.css',
        'context/local-code/cherry-studio/files/src/components/Button.tsx',
        'context/local-code/cherry-studio/files/src/pages/home/HomePage.tsx',
        'context/local-code/cherry-studio/files/src/assets/fonts/ubuntu/Ubuntu-Regular.ttf',
        'context/local-code/cherry-studio/files/build/logo.png',
      ]),
      materializedFiles: expect.arrayContaining([
        'build/logo.png',
        'fonts/ubuntu/Ubuntu-Regular.ttf',
        'source_examples/src/pages/home/HomePage.tsx',
      ]),
    });
    expect(output.materializedFiles).not.toEqual(expect.arrayContaining(['build/icon.png']));
    const evidenceNote = await readFile(path.join(tmpDir, 'context/local-code/cherry-studio.md'), 'utf8');
    expect(evidenceNote).toContain('Local Design Evidence');
    expect(evidenceNote).toContain('Source Evidence Inventory');
    expect(evidenceNote).toContain('Package Files Materialized');
    expect(evidenceNote).toContain('`build/logo.png`');
    expect(evidenceNote).toContain('`fonts/ubuntu/Ubuntu-Regular.ttf`');
    expect(evidenceNote).toContain('`source_examples/src/pages/home/HomePage.tsx`');
    expect(evidenceNote).toContain('Brand assets and icons');
    expect(evidenceNote).toContain('root `build/` with their original filenames');
    expect(evidenceNote).toContain('Fonts');
    expect(evidenceNote).toContain('Claude Design-style package');
    expect(evidenceNote).toContain('ui_kits/app/index.html` must be a browser-reviewable component entry');
    expect(evidenceNote).toContain('ui_kits/app/components/App.jsx` (or equivalent app shell) must compose source-backed role components');
    expect(evidenceNote).toContain('Claude-style UI-kit entry skeleton for direct JSX kits');
    expect(evidenceNote).toContain('<script type="text/babel" src="components/ComponentName.jsx"></script>');
    expect(evidenceNote).toContain('ReactDOM.createRoot(document.getElementById("root"))');
    expect(evidenceNote).toContain('source_examples/');
    expect(evidenceNote).toContain('context/.../files/build/icon.png` -> `build/icon.png`');
    await expect(readFile(path.join(tmpDir, 'context/local-code/cherry-studio/files/src/styles.css'), 'utf8')).resolves.toContain('--color-primary');
    await expect(readFile(path.join(tmpDir, 'source_examples/src/pages/home/HomePage.tsx'), 'utf8')).resolves.toContain('HomePage');
    const materializedLogo = await readFile(path.join(tmpDir, 'build/logo.png'));
    expect([...materializedLogo]).toEqual([0x89, 0x50, 0x4e, 0x47]);
    await expect(readFile(path.join(tmpDir, 'build/icon.png'), 'utf8')).resolves.toBe('existing-icon');
    const materializedFont = await readFile(path.join(tmpDir, 'fonts/ubuntu/Ubuntu-Regular.ttf'));
    expect(materializedFont.toString()).toBe('font-data');
    const fontBytes = await readFile(path.join(tmpDir, 'context/local-code/cherry-studio/files/src/assets/fonts/ubuntu/Ubuntu-Regular.ttf'));
    expect(fontBytes.length).toBeGreaterThan(0);

    await cleanupTempDir(tmpDir);
  });

  it('prioritizes core app surfaces over nested tool buttons during local intake', async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'od-local-core-context-'));
    process.chdir(tmpDir);
    const sourceDir = path.join(tmpDir, 'cherry-core');
    const writeSource = async (relativePath: string, content = `export const marker = ${JSON.stringify(relativePath)};\n`) => {
      const fullPath = path.join(sourceDir, ...relativePath.split('/'));
      await mkdir(path.dirname(fullPath), { recursive: true });
      await writeFile(fullPath, content);
    };
    await writeSource('README.md', '# Cherry Core\n');
    await writeSource('package.json', JSON.stringify({ name: 'cherry-core' }));
    await writeSource('src/renderer/src/pages/home/HomePage.tsx');
    await writeSource('src/renderer/src/pages/home/Chat.tsx');
    await writeSource('src/renderer/src/pages/home/Inputbar/Inputbar.tsx');
    await writeSource('src/renderer/src/pages/home/Messages/Messages.tsx');
    await writeSource('src/renderer/src/pages/home/Tabs/components/AssistantList.tsx');
    await writeSource('src/renderer/src/pages/home/Inputbar/tools/components/AttachmentButton.tsx');
    await writeSource('src/renderer/src/pages/settings/AgentSettings/components/AdvancedSettings.tsx');
    await writeSource('src/renderer/src/pages/home/Messages/__tests__/MessageGroup.test.tsx');

    const result = await runConnectorsToolCli([
      'local-design-context',
      '--path',
      sourceDir,
      '--max-files',
      '7',
    ]);

    expect(result.exitCode).toBe(0);
    const output = JSON.parse(stdoutOutput.join(''));
    expect(output.snapshotFiles).toEqual(expect.arrayContaining([
      'context/local-code/cherry-core/files/src/renderer/src/pages/home/HomePage.tsx',
      'context/local-code/cherry-core/files/src/renderer/src/pages/home/Chat.tsx',
      'context/local-code/cherry-core/files/src/renderer/src/pages/home/Inputbar/Inputbar.tsx',
      'context/local-code/cherry-core/files/src/renderer/src/pages/home/Messages/Messages.tsx',
      'context/local-code/cherry-core/files/src/renderer/src/pages/home/Tabs/components/AssistantList.tsx',
    ]));
    expect(output.snapshotFiles).not.toEqual(expect.arrayContaining([
      'context/local-code/cherry-core/files/src/renderer/src/pages/home/Inputbar/tools/components/AttachmentButton.tsx',
      'context/local-code/cherry-core/files/src/renderer/src/pages/settings/AgentSettings/components/AdvancedSettings.tsx',
      'context/local-code/cherry-core/files/src/renderer/src/pages/home/Messages/__tests__/MessageGroup.test.tsx',
    ]));
    expect(output.materializedFiles).toEqual(expect.arrayContaining([
      'source_examples/src/renderer/src/pages/home/HomePage.tsx',
      'source_examples/src/renderer/src/pages/home/Chat.tsx',
      'source_examples/src/renderer/src/pages/home/Inputbar/Inputbar.tsx',
    ]));
    await expect(readFile(path.join(tmpDir, 'source_examples/src/renderer/src/pages/home/HomePage.tsx'), 'utf8')).resolves.toContain('HomePage.tsx');
    const evidenceNote = await readFile(path.join(tmpDir, 'context/local-code/cherry-core.md'), 'utf8');
    expect(evidenceNote).toContain('App shell and navigation');
    expect(evidenceNote).toContain('Chat and input surfaces');

    await cleanupTempDir(tmpDir);
  });

  it('passes a Claude Design-style design-system package audit', async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'od-package-audit-pass-'));
    process.chdir(tmpDir);
    await mkdir(path.join(tmpDir, 'preview'), { recursive: true });
    await mkdir(path.join(tmpDir, 'ui_kits/app'), { recursive: true });
    await mkdir(path.join(tmpDir, 'assets'), { recursive: true });
    await mkdir(path.join(tmpDir, 'build'), { recursive: true });
    await mkdir(path.join(tmpDir, 'fonts/ubuntu'), { recursive: true });
    await mkdir(path.join(tmpDir, 'context/local-code/cherry/files/src/components'), { recursive: true });
    await mkdir(path.join(tmpDir, 'context/local-code/cherry/files/src/pages/home'), { recursive: true });
    await mkdir(path.join(tmpDir, 'context/local-code/cherry/files/build'), { recursive: true });
    await writeFile(path.join(tmpDir, 'DESIGN.md'), AUDIT_DESIGN_MD);
    await writeFile(path.join(tmpDir, 'README.md'), AUDIT_README);
    await writeFile(path.join(tmpDir, 'SKILL.md'), AUDIT_SKILL);
    await writeFile(path.join(tmpDir, 'colors_and_type.css'), AUDIT_TOKENS_CSS);
    for (const fileName of [
      'colors-primary.html',
      'colors-theme-light.html',
      'typography-specimens.html',
      'spacing-tokens.html',
      'components-buttons.html',
      'brand-assets.html',
    ]) {
      await writeFile(path.join(tmpDir, 'preview', fileName), auditHtml(fileName));
    }
    await writeFile(path.join(tmpDir, 'ui_kits/app/index.html'), auditUiKitIndex());
    await writeFile(path.join(tmpDir, 'ui_kits/app/README.md'), AUDIT_UI_KIT_README);
    await mkdir(path.join(tmpDir, 'ui_kits/app/components'), { recursive: true });
    for (const componentName of AUDIT_COMPONENT_FILES) {
      await writeFile(
        path.join(tmpDir, 'ui_kits/app/components', componentName),
        auditUiKitComponent(componentName),
      );
    }
    await writeFile(path.join(tmpDir, 'assets/logo.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    await writeFile(path.join(tmpDir, 'build/icon.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    await writeFile(path.join(tmpDir, 'fonts/ubuntu/Ubuntu-Regular.ttf'), Buffer.from('font-data'));
    await writeFile(path.join(tmpDir, 'context/source-context.md'), [
      '# Design System Source Context',
      '',
      '## GitHub Repositories',
      '',
      '- None linked.',
      '',
      '## Local Code',
      '',
      'Linked folders readable by the local agent:',
      '- /tmp/cherry',
    ].join('\n'));
    await writeFile(path.join(tmpDir, 'context/local-code/cherry.md'), [
      '# Local Design Evidence: cherry',
      '',
      'Snapshot files written: 4',
      '',
      '### Brand assets and icons',
      '- assets/logo.png -> `context/local-code/cherry/files/assets/logo.png` (binary asset)',
      '- build/icon.png -> `context/local-code/cherry/files/build/icon.png` (binary asset)',
      '',
      '### Fonts',
      '- fonts/ubuntu/Ubuntu-Regular.ttf -> `context/local-code/cherry/files/fonts/ubuntu/Ubuntu-Regular.ttf` (binary asset)',
      '',
      '### Reusable components',
      '- src/components/Button.tsx -> `context/local-code/cherry/files/src/components/Button.tsx` (source)',
      '',
      '### Chat and input surfaces',
      '- src/pages/home/Chat.tsx -> `context/local-code/cherry/files/src/pages/home/Chat.tsx` (source)',
    ].join('\n'));
    await writeFile(path.join(tmpDir, 'context/local-code/cherry/files/src/tokens.css'), ':root { --color-primary: #00b96b; }');
    await writeFile(path.join(tmpDir, 'context/local-code/cherry/files/src/components/Button.tsx'), 'export function Button(){ return <button />; }');
    await writeFile(path.join(tmpDir, 'context/local-code/cherry/files/src/pages/home/Chat.tsx'), 'export function Chat(){ return <main><InputBar /><Messages /></main>; }');
    await writeFile(path.join(tmpDir, 'context/local-code/cherry/files/build/icon.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));

    const result = await runConnectorsToolCli(['design-system-package-audit', '--path', tmpDir]);

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(stdoutOutput.join(''))).toMatchObject({
      ok: true,
      errors: [],
    });

    await cleanupTempDir(tmpDir);
  });

  it('fails a design-system package audit when manifest docs point at old scaffold paths', async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'od-package-audit-stale-docs-'));
    process.chdir(tmpDir);
    await mkdir(path.join(tmpDir, 'preview'), { recursive: true });
    await mkdir(path.join(tmpDir, 'ui_kits/app/components'), { recursive: true });
    await mkdir(path.join(tmpDir, 'context/local-code/cherry/files/src/components'), { recursive: true });
    await writeFile(path.join(tmpDir, 'DESIGN.md'), AUDIT_DESIGN_MD);
    await writeFile(
      path.join(tmpDir, 'README.md'),
      `${AUDIT_README}\n\nLegacy review paths still mention preview/typography-scale.html and ui_kits/generated_interface/index.html.\n`,
    );
    await writeFile(path.join(tmpDir, 'SKILL.md'), AUDIT_SKILL);
    await writeFile(path.join(tmpDir, 'colors_and_type.css'), AUDIT_TOKENS_CSS);
    for (const fileName of [
      'colors-primary.html',
      'colors-theme-light.html',
      'typography-specimens.html',
      'spacing-tokens.html',
      'components-buttons.html',
      'brand-assets.html',
    ]) {
      await writeFile(path.join(tmpDir, 'preview', fileName), auditHtml(fileName));
    }
    await writeFile(path.join(tmpDir, 'ui_kits/app/index.html'), auditUiKitIndex(['Foundation.jsx', 'Navigation.jsx', 'Workspace.jsx']));
    await writeFile(path.join(tmpDir, 'ui_kits/app/README.md'), '# UI kit\n\nUse ui_kits/app/index.html and role components.\n');
    for (const componentName of ['Foundation.jsx', 'Navigation.jsx', 'Workspace.jsx']) {
      await writeFile(
        path.join(tmpDir, 'ui_kits/app/components', componentName),
        auditUiKitComponent(componentName),
      );
    }
    await writeFile(path.join(tmpDir, 'context/source-context.md'), '# Design System Source Context\n\n## Local Code\n\n- /tmp/cherry\n');
    await writeFile(path.join(tmpDir, 'context/local-code/cherry.md'), [
      '# Local Design Evidence: cherry',
      '',
      'Snapshot files written: 1',
      '',
      '### Reusable components',
      '- src/components/Button.tsx -> `context/local-code/cherry/files/src/components/Button.tsx` (source)',
    ].join('\n'));
    await writeFile(path.join(tmpDir, 'context/local-code/cherry/files/src/components/Button.tsx'), 'export function Button(){ return <button />; }');

    const result = await runConnectorsToolCli(['design-system-package-audit', '--path', tmpDir]);

    expect(result.exitCode).toBe(1);
    expect(JSON.parse(stdoutOutput.join('')).errors).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'stale_package_manifest_references',
        path: 'README.md',
        message: expect.stringContaining('preview/typography-scale.html'),
      }),
    ]));

    await cleanupTempDir(tmpDir);
  });

  it('fails a design-system package audit when package titles come from URL protocol text', async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'od-package-audit-protocol-title-'));
    process.chdir(tmpDir);
    await mkdir(path.join(tmpDir, 'preview'), { recursive: true });
    await mkdir(path.join(tmpDir, 'ui_kits/app'), { recursive: true });
    await writeFile(path.join(tmpDir, 'DESIGN.md'), AUDIT_DESIGN_MD);
    await writeFile(path.join(tmpDir, 'README.md'), AUDIT_README.replace('# Cherry Studio Design System', '# https Design System'));
    await writeFile(path.join(tmpDir, 'SKILL.md'), AUDIT_SKILL);
    await writeFile(path.join(tmpDir, 'colors_and_type.css'), AUDIT_TOKENS_CSS);
    for (const fileName of [
      'colors-primary.html',
      'colors-theme-light.html',
      'typography-specimens.html',
      'spacing-tokens.html',
      'components-buttons.html',
      'brand-assets.html',
    ]) {
      await writeFile(path.join(tmpDir, 'preview', fileName), auditHtml(fileName));
    }
    await writeFile(path.join(tmpDir, 'ui_kits/app/index.html'), auditUiKitIndex());

    const result = await runConnectorsToolCli(['design-system-package-audit', '--path', tmpDir]);

    expect(result.exitCode).toBe(1);
    expect(JSON.parse(stdoutOutput.join('')).errors).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'protocol_derived_title',
        path: 'README.md',
        message: expect.stringContaining('URL protocol text'),
      }),
    ]));

    await cleanupTempDir(tmpDir);
  });

  it('warns when SKILL.md is missing agent-discoverable frontmatter', async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'od-package-audit-skill-frontmatter-'));
    process.chdir(tmpDir);
    await mkdir(path.join(tmpDir, 'preview'), { recursive: true });
    await mkdir(path.join(tmpDir, 'ui_kits/app/components'), { recursive: true });
    await writeFile(path.join(tmpDir, 'DESIGN.md'), AUDIT_DESIGN_MD);
    await writeFile(path.join(tmpDir, 'README.md'), AUDIT_README);
    await writeFile(path.join(tmpDir, 'SKILL.md'), MARKDOWN_ONLY_AUDIT_SKILL);
    await writeFile(path.join(tmpDir, 'colors_and_type.css'), AUDIT_TOKENS_CSS);
    for (const fileName of [
      'colors-primary.html',
      'colors-theme-light.html',
      'typography-specimens.html',
      'spacing-tokens.html',
      'components-buttons.html',
      'brand-assets.html',
    ]) {
      await writeFile(path.join(tmpDir, 'preview', fileName), auditHtml(fileName));
    }
    await writeFile(path.join(tmpDir, 'ui_kits/app/index.html'), auditUiKitIndex());
    await writeFile(path.join(tmpDir, 'ui_kits/app/README.md'), '# UI kit\n');
    for (const componentName of AUDIT_COMPONENT_FILES) {
      await writeFile(
        path.join(tmpDir, 'ui_kits/app/components', componentName),
        auditUiKitComponent(componentName),
      );
    }

    const result = await runConnectorsToolCli(['design-system-package-audit', '--path', tmpDir]);

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(stdoutOutput.join('')).warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'missing_skill_frontmatter',
        path: 'SKILL.md',
        message: expect.stringContaining('YAML frontmatter'),
      }),
    ]));

    await cleanupTempDir(tmpDir);
  });

  it('warns when SKILL.md lacks Claude-style reusable skill sections', async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'od-package-audit-skill-sections-'));
    process.chdir(tmpDir);
    await mkdir(path.join(tmpDir, 'preview'), { recursive: true });
    await mkdir(path.join(tmpDir, 'ui_kits/app/components'), { recursive: true });
    await writeFile(path.join(tmpDir, 'DESIGN.md'), AUDIT_DESIGN_MD);
    await writeFile(path.join(tmpDir, 'README.md'), AUDIT_README);
    await writeFile(path.join(tmpDir, 'SKILL.md'), SKILL_WITHOUT_REUSE_SECTIONS);
    await writeFile(path.join(tmpDir, 'colors_and_type.css'), AUDIT_TOKENS_CSS);
    for (const fileName of [
      'colors-primary.html',
      'colors-theme-light.html',
      'typography-specimens.html',
      'spacing-tokens.html',
      'components-buttons.html',
      'brand-assets.html',
    ]) {
      await writeFile(path.join(tmpDir, 'preview', fileName), auditHtml(fileName));
    }
    await writeFile(path.join(tmpDir, 'ui_kits/app/index.html'), auditUiKitIndex());
    await writeFile(path.join(tmpDir, 'ui_kits/app/README.md'), AUDIT_UI_KIT_README);
    for (const componentName of AUDIT_COMPONENT_FILES) {
      await writeFile(
        path.join(tmpDir, 'ui_kits/app/components', componentName),
        auditUiKitComponent(componentName),
      );
    }

    const result = await runConnectorsToolCli(['design-system-package-audit', '--path', tmpDir]);

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(stdoutOutput.join('')).warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'skill_missing_reuse_sections',
        path: 'SKILL.md',
        message: expect.stringContaining('reusable Claude Design skill package'),
      }),
    ]));

    await cleanupTempDir(tmpDir);
  });

  it('accepts SKILL.md reuse sections worded exactly as the audit warning instructs (#4435)', async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'od-package-audit-skill-wording-'));
    process.chdir(tmpDir);
    await mkdir(path.join(tmpDir, 'preview'), { recursive: true });
    await mkdir(path.join(tmpDir, 'ui_kits/app/components'), { recursive: true });
    await writeFile(path.join(tmpDir, 'DESIGN.md'), AUDIT_DESIGN_MD);
    await writeFile(path.join(tmpDir, 'README.md'), AUDIT_README);
    await writeFile(path.join(tmpDir, 'SKILL.md'), SKILL_WITH_WARNING_WORDED_SECTIONS);
    await writeFile(path.join(tmpDir, 'colors_and_type.css'), AUDIT_TOKENS_CSS);
    for (const fileName of [
      'colors-primary.html',
      'colors-theme-light.html',
      'typography-specimens.html',
      'spacing-tokens.html',
      'components-buttons.html',
      'brand-assets.html',
    ]) {
      await writeFile(path.join(tmpDir, 'preview', fileName), auditHtml(fileName));
    }
    await writeFile(path.join(tmpDir, 'ui_kits/app/index.html'), auditUiKitIndex());
    await writeFile(path.join(tmpDir, 'ui_kits/app/README.md'), AUDIT_UI_KIT_README);
    for (const componentName of AUDIT_COMPONENT_FILES) {
      await writeFile(
        path.join(tmpDir, 'ui_kits/app/components', componentName),
        auditUiKitComponent(componentName),
      );
    }

    const result = await runConnectorsToolCli(['design-system-package-audit', '--path', tmpDir]);

    expect(result.exitCode).toBe(0);
    const warnings = JSON.parse(stdoutOutput.join('')).warnings ?? [];
    const reuseWarnings = warnings.filter(
      (warning: { code?: string }) => warning.code === 'skill_missing_reuse_sections',
    );
    expect(reuseWarnings).toEqual([]);

    await cleanupTempDir(tmpDir);
  });

  it('warns when README.md lacks a source-backed product overview', async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'od-package-audit-readme-overview-'));
    process.chdir(tmpDir);
    await mkdir(path.join(tmpDir, 'preview'), { recursive: true });
    await mkdir(path.join(tmpDir, 'ui_kits/app/components'), { recursive: true });
    await writeFile(path.join(tmpDir, 'DESIGN.md'), AUDIT_DESIGN_MD);
    await writeFile(path.join(tmpDir, 'README.md'), README_WITHOUT_PRODUCT_OVERVIEW);
    await writeFile(path.join(tmpDir, 'SKILL.md'), AUDIT_SKILL);
    await writeFile(path.join(tmpDir, 'colors_and_type.css'), AUDIT_TOKENS_CSS);
    for (const fileName of [
      'colors-primary.html',
      'colors-theme-light.html',
      'typography-specimens.html',
      'spacing-tokens.html',
      'components-buttons.html',
      'brand-assets.html',
    ]) {
      await writeFile(path.join(tmpDir, 'preview', fileName), auditHtml(fileName));
    }
    await writeFile(path.join(tmpDir, 'ui_kits/app/index.html'), auditUiKitIndex());
    await writeFile(path.join(tmpDir, 'ui_kits/app/README.md'), '# UI kit\n');
    for (const componentName of AUDIT_COMPONENT_FILES) {
      await writeFile(
        path.join(tmpDir, 'ui_kits/app/components', componentName),
        auditUiKitComponent(componentName),
      );
    }

    const result = await runConnectorsToolCli(['design-system-package-audit', '--path', tmpDir]);

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(stdoutOutput.join('')).warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'readme_missing_product_overview',
        path: 'README.md',
        message: expect.stringContaining('Product Overview'),
      }),
    ]));

    await cleanupTempDir(tmpDir);
  });

  it('warns when README.md lacks a Claude-style package reuse guide', async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'od-package-audit-readme-package-guide-'));
    process.chdir(tmpDir);
    await mkdir(path.join(tmpDir, 'preview'), { recursive: true });
    await mkdir(path.join(tmpDir, 'ui_kits/app/components'), { recursive: true });
    await writeFile(path.join(tmpDir, 'DESIGN.md'), AUDIT_DESIGN_MD);
    await writeFile(path.join(tmpDir, 'README.md'), README_WITHOUT_PACKAGE_REUSE_GUIDE);
    await writeFile(path.join(tmpDir, 'SKILL.md'), AUDIT_SKILL);
    await writeFile(path.join(tmpDir, 'colors_and_type.css'), AUDIT_TOKENS_CSS);
    for (const fileName of [
      'colors-primary.html',
      'colors-theme-light.html',
      'typography-specimens.html',
      'spacing-tokens.html',
      'components-buttons.html',
      'brand-assets.html',
    ]) {
      await writeFile(path.join(tmpDir, 'preview', fileName), auditHtml(fileName));
    }
    await writeFile(path.join(tmpDir, 'ui_kits/app/index.html'), auditUiKitIndex());
    await writeFile(path.join(tmpDir, 'ui_kits/app/README.md'), AUDIT_UI_KIT_README);
    for (const componentName of AUDIT_COMPONENT_FILES) {
      await writeFile(
        path.join(tmpDir, 'ui_kits/app/components', componentName),
        auditUiKitComponent(componentName),
      );
    }

    const result = await runConnectorsToolCli(['design-system-package-audit', '--path', tmpDir]);

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(stdoutOutput.join('')).warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'readme_missing_package_reuse_guide',
        path: 'README.md',
        message: expect.stringContaining('Claude Design package guide'),
      }),
    ]));

    await cleanupTempDir(tmpDir);
  });

  it('warns when README.md lacks a concrete preview manifest', async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'od-package-audit-readme-preview-manifest-'));
    process.chdir(tmpDir);
    await mkdir(path.join(tmpDir, 'preview'), { recursive: true });
    await mkdir(path.join(tmpDir, 'ui_kits/app/components'), { recursive: true });
    await writeFile(path.join(tmpDir, 'DESIGN.md'), AUDIT_DESIGN_MD);
    await writeFile(path.join(tmpDir, 'README.md'), README_WITHOUT_PREVIEW_MANIFEST);
    await writeFile(path.join(tmpDir, 'SKILL.md'), AUDIT_SKILL);
    await writeFile(path.join(tmpDir, 'colors_and_type.css'), AUDIT_TOKENS_CSS);
    for (const fileName of [
      'colors-primary.html',
      'colors-theme-light.html',
      'typography-specimens.html',
      'spacing-tokens.html',
      'components-buttons.html',
      'brand-assets.html',
    ]) {
      await writeFile(path.join(tmpDir, 'preview', fileName), auditHtml(fileName));
    }
    await writeFile(path.join(tmpDir, 'ui_kits/app/index.html'), auditUiKitIndex());
    await writeFile(path.join(tmpDir, 'ui_kits/app/README.md'), AUDIT_UI_KIT_README);
    for (const componentName of AUDIT_COMPONENT_FILES) {
      await writeFile(
        path.join(tmpDir, 'ui_kits/app/components', componentName),
        auditUiKitComponent(componentName),
      );
    }

    const result = await runConnectorsToolCli(['design-system-package-audit', '--path', tmpDir]);

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(stdoutOutput.join('')).warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'readme_missing_preview_manifest',
        path: 'README.md',
        message: expect.stringContaining('concrete preview manifest'),
      }),
    ]));

    await cleanupTempDir(tmpDir);
  });

  it('warns when the applied UI-kit README lacks a reuse guide', async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'od-package-audit-uikit-readme-'));
    process.chdir(tmpDir);
    await mkdir(path.join(tmpDir, 'preview'), { recursive: true });
    await mkdir(path.join(tmpDir, 'ui_kits/app/components'), { recursive: true });
    await writeFile(path.join(tmpDir, 'DESIGN.md'), AUDIT_DESIGN_MD);
    await writeFile(path.join(tmpDir, 'README.md'), AUDIT_README);
    await writeFile(path.join(tmpDir, 'SKILL.md'), AUDIT_SKILL);
    await writeFile(path.join(tmpDir, 'colors_and_type.css'), AUDIT_TOKENS_CSS);
    for (const fileName of [
      'colors-primary.html',
      'colors-theme-light.html',
      'typography-specimens.html',
      'spacing-tokens.html',
      'components-buttons.html',
      'brand-assets.html',
    ]) {
      await writeFile(path.join(tmpDir, 'preview', fileName), auditHtml(fileName));
    }
    await writeFile(path.join(tmpDir, 'ui_kits/app/index.html'), auditUiKitIndex());
    await writeFile(
      path.join(tmpDir, 'ui_kits/app/README.md'),
      '# UI kit\n\nThis package was migrated from an earlier workspace. Use index.html as the applied interface example.\n',
    );
    for (const componentName of AUDIT_COMPONENT_FILES) {
      await writeFile(
        path.join(tmpDir, 'ui_kits/app/components', componentName),
        auditUiKitComponent(componentName),
      );
    }

    const result = await runConnectorsToolCli(['design-system-package-audit', '--path', tmpDir]);

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(stdoutOutput.join('')).warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'ui_kit_readme_missing_reuse_guide',
        path: 'ui_kits/app/README.md',
        message: expect.stringContaining('usage workflow'),
      }),
    ]));

    await cleanupTempDir(tmpDir);
  });

  it('warns when build runtime icon evidence is not preserved in the package', async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'od-package-audit-build-assets-'));
    process.chdir(tmpDir);
    await mkdir(path.join(tmpDir, 'preview'), { recursive: true });
    await mkdir(path.join(tmpDir, 'ui_kits/app/components'), { recursive: true });
    await mkdir(path.join(tmpDir, 'assets'), { recursive: true });
    await mkdir(path.join(tmpDir, 'context/local-code/cherry/files/build'), { recursive: true });
    await writeFile(path.join(tmpDir, 'DESIGN.md'), AUDIT_DESIGN_MD);
    await writeFile(path.join(tmpDir, 'README.md'), AUDIT_README);
    await writeFile(path.join(tmpDir, 'SKILL.md'), AUDIT_SKILL);
    await writeFile(path.join(tmpDir, 'colors_and_type.css'), AUDIT_TOKENS_CSS);
    for (const fileName of [
      'colors-primary.html',
      'colors-theme-light.html',
      'typography-specimens.html',
      'spacing-tokens.html',
      'components-buttons.html',
      'brand-assets.html',
    ]) {
      await writeFile(path.join(tmpDir, 'preview', fileName), auditHtml(fileName));
    }
    await writeFile(path.join(tmpDir, 'ui_kits/app/index.html'), auditUiKitIndex());
    await writeFile(path.join(tmpDir, 'ui_kits/app/README.md'), '# UI kit\n');
    for (const componentName of AUDIT_COMPONENT_FILES) {
      await writeFile(
        path.join(tmpDir, 'ui_kits/app/components', componentName),
        auditUiKitComponent(componentName),
      );
    }
    await writeFile(path.join(tmpDir, 'assets/logo.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    await writeFile(path.join(tmpDir, 'context/source-context.md'), '# Design System Source Context\n\n## Local Code\n\n- /tmp/cherry\n');
    await writeFile(path.join(tmpDir, 'context/local-code/cherry.md'), [
      '# Local Design Evidence: cherry',
      '',
      'Snapshot files written: 2',
      '',
      '### Brand assets and icons',
      '- build/icon.ico -> `context/local-code/cherry/files/build/icon.ico` (binary asset)',
      '- build/tray_icon.png -> `context/local-code/cherry/files/build/tray_icon.png` (binary asset)',
    ].join('\n'));
    await writeFile(path.join(tmpDir, 'context/local-code/cherry/files/build/icon.ico'), Buffer.from([0x00, 0x00, 0x01, 0x00]));
    await writeFile(path.join(tmpDir, 'context/local-code/cherry/files/build/tray_icon.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));

    const result = await runConnectorsToolCli(['design-system-package-audit', '--path', tmpDir]);

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(stdoutOutput.join('')).warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'missing_build_assets',
        path: 'build/',
        message: expect.stringContaining('build/runtime icon asset'),
      }),
    ]));

    await cleanupTempDir(tmpDir);
  });

  it('warns when preserved build runtime assets do not match captured evidence bytes', async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'od-package-audit-fake-build-assets-'));
    process.chdir(tmpDir);
    await mkdir(path.join(tmpDir, 'preview'), { recursive: true });
    await mkdir(path.join(tmpDir, 'ui_kits/app/components'), { recursive: true });
    await mkdir(path.join(tmpDir, 'assets'), { recursive: true });
    await mkdir(path.join(tmpDir, 'build'), { recursive: true });
    await mkdir(path.join(tmpDir, 'context/local-code/cherry/files/build'), { recursive: true });
    await writeFile(path.join(tmpDir, 'DESIGN.md'), AUDIT_DESIGN_MD);
    await writeFile(path.join(tmpDir, 'README.md'), AUDIT_README);
    await writeFile(path.join(tmpDir, 'SKILL.md'), AUDIT_SKILL);
    await writeFile(path.join(tmpDir, 'colors_and_type.css'), AUDIT_TOKENS_CSS);
    for (const fileName of [
      'colors-primary.html',
      'colors-theme-light.html',
      'typography-specimens.html',
      'spacing-tokens.html',
      'components-buttons.html',
      'brand-assets.html',
    ]) {
      await writeFile(path.join(tmpDir, 'preview', fileName), auditHtml(fileName));
    }
    await writeFile(path.join(tmpDir, 'ui_kits/app/index.html'), auditUiKitIndex());
    await writeFile(path.join(tmpDir, 'ui_kits/app/README.md'), '# UI kit\n');
    for (const componentName of AUDIT_COMPONENT_FILES) {
      await writeFile(
        path.join(tmpDir, 'ui_kits/app/components', componentName),
        auditUiKitComponent(componentName),
      );
    }
    await writeFile(path.join(tmpDir, 'assets/logo.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    await writeFile(path.join(tmpDir, 'build/icon.png'), Buffer.from('redrawn-icon'));
    await writeFile(path.join(tmpDir, 'build/tray_icon.png'), Buffer.from('redrawn-tray'));
    await writeFile(path.join(tmpDir, 'context/source-context.md'), '# Design System Source Context\n\n## Local Code\n\n- /tmp/cherry\n');
    await writeFile(path.join(tmpDir, 'context/local-code/cherry.md'), [
      '# Local Design Evidence: cherry',
      '',
      'Snapshot files written: 2',
      '',
      '### Brand assets and icons',
      '- build/icon.png -> `context/local-code/cherry/files/build/icon.png` (binary asset)',
      '- build/tray_icon.png -> `context/local-code/cherry/files/build/tray_icon.png` (binary asset)',
    ].join('\n'));
    await writeFile(path.join(tmpDir, 'context/local-code/cherry/files/build/icon.png'), Buffer.from('source-icon'));
    await writeFile(path.join(tmpDir, 'context/local-code/cherry/files/build/tray_icon.png'), Buffer.from('source-tray'));

    const result = await runConnectorsToolCli(['design-system-package-audit', '--path', tmpDir]);

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(stdoutOutput.join('')).warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'build_assets_not_source_backed',
        path: 'build/',
        message: expect.stringContaining('byte-for-byte'),
      }),
    ]));

    await cleanupTempDir(tmpDir);
  });

  it('accepts preserved build runtime assets that match captured evidence bytes', async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'od-package-audit-source-build-assets-'));
    process.chdir(tmpDir);
    await mkdir(path.join(tmpDir, 'preview'), { recursive: true });
    await mkdir(path.join(tmpDir, 'ui_kits/app/components'), { recursive: true });
    await mkdir(path.join(tmpDir, 'assets'), { recursive: true });
    await mkdir(path.join(tmpDir, 'build'), { recursive: true });
    await mkdir(path.join(tmpDir, 'context/local-code/cherry/files/build'), { recursive: true });
    await writeFile(path.join(tmpDir, 'DESIGN.md'), AUDIT_DESIGN_MD);
    await writeFile(path.join(tmpDir, 'README.md'), AUDIT_README);
    await writeFile(path.join(tmpDir, 'SKILL.md'), AUDIT_SKILL);
    await writeFile(path.join(tmpDir, 'colors_and_type.css'), AUDIT_TOKENS_CSS);
    for (const fileName of [
      'colors-primary.html',
      'colors-theme-light.html',
      'typography-specimens.html',
      'spacing-tokens.html',
      'components-buttons.html',
      'brand-assets.html',
    ]) {
      await writeFile(path.join(tmpDir, 'preview', fileName), auditHtml(fileName));
    }
    await writeFile(path.join(tmpDir, 'ui_kits/app/index.html'), auditUiKitIndex());
    await writeFile(path.join(tmpDir, 'ui_kits/app/README.md'), '# UI kit\n');
    for (const componentName of AUDIT_COMPONENT_FILES) {
      await writeFile(
        path.join(tmpDir, 'ui_kits/app/components', componentName),
        auditUiKitComponent(componentName),
      );
    }
    const sourceIcon = Buffer.from('source-icon');
    const sourceTray = Buffer.from('source-tray');
    await writeFile(path.join(tmpDir, 'assets/logo.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    await writeFile(path.join(tmpDir, 'build/icon.png'), sourceIcon);
    await writeFile(path.join(tmpDir, 'build/tray_icon.png'), sourceTray);
    await writeFile(path.join(tmpDir, 'context/source-context.md'), '# Design System Source Context\n\n## Local Code\n\n- /tmp/cherry\n');
    await writeFile(path.join(tmpDir, 'context/local-code/cherry.md'), [
      '# Local Design Evidence: cherry',
      '',
      'Snapshot files written: 2',
      '',
      '### Brand assets and icons',
      '- build/icon.png -> `context/local-code/cherry/files/build/icon.png` (binary asset)',
      '- build/tray_icon.png -> `context/local-code/cherry/files/build/tray_icon.png` (binary asset)',
    ].join('\n'));
    await writeFile(path.join(tmpDir, 'context/local-code/cherry/files/build/icon.png'), sourceIcon);
    await writeFile(path.join(tmpDir, 'context/local-code/cherry/files/build/tray_icon.png'), sourceTray);

    const result = await runConnectorsToolCli(['design-system-package-audit', '--path', tmpDir]);

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(stdoutOutput.join('')).warnings).not.toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'build_assets_not_source_backed',
      }),
    ]));

    await cleanupTempDir(tmpDir);
  });

  it('warns when the brand-assets preview redraws instead of referencing preserved assets', async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'od-package-audit-brand-preview-assets-'));
    process.chdir(tmpDir);
    await mkdir(path.join(tmpDir, 'preview'), { recursive: true });
    await mkdir(path.join(tmpDir, 'ui_kits/app/components'), { recursive: true });
    await mkdir(path.join(tmpDir, 'assets'), { recursive: true });
    await mkdir(path.join(tmpDir, 'build'), { recursive: true });
    await writeFile(path.join(tmpDir, 'DESIGN.md'), AUDIT_DESIGN_MD);
    await writeFile(path.join(tmpDir, 'README.md'), AUDIT_README);
    await writeFile(path.join(tmpDir, 'SKILL.md'), AUDIT_SKILL);
    await writeFile(path.join(tmpDir, 'colors_and_type.css'), AUDIT_TOKENS_CSS);
    for (const fileName of [
      'colors-primary.html',
      'colors-theme-light.html',
      'typography-specimens.html',
      'spacing-tokens.html',
      'components-buttons.html',
    ]) {
      await writeFile(path.join(tmpDir, 'preview', fileName), auditHtml(fileName));
    }
    await writeFile(path.join(tmpDir, 'preview/brand-assets.html'), auditHtml('redrawn-brand-assets'));
    await writeFile(path.join(tmpDir, 'ui_kits/app/index.html'), auditUiKitIndex());
    await writeFile(path.join(tmpDir, 'ui_kits/app/README.md'), '# UI kit\n');
    for (const componentName of AUDIT_COMPONENT_FILES) {
      await writeFile(
        path.join(tmpDir, 'ui_kits/app/components', componentName),
        auditUiKitComponent(componentName),
      );
    }
    await writeFile(path.join(tmpDir, 'assets/logo.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    await writeFile(path.join(tmpDir, 'build/icon.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));

    const result = await runConnectorsToolCli(['design-system-package-audit', '--path', tmpDir]);

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(stdoutOutput.join('')).warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'brand_assets_preview_not_using_preserved_assets',
        path: 'preview/brand-assets.html',
        message: expect.stringContaining('real logos/icons'),
      }),
    ]));

    await cleanupTempDir(tmpDir);
  });

  it('fails a design-system package audit when modular UI-kit components are placeholders', async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'od-package-audit-thin-components-'));
    process.chdir(tmpDir);
    await mkdir(path.join(tmpDir, 'preview'), { recursive: true });
    await mkdir(path.join(tmpDir, 'ui_kits/app/components'), { recursive: true });
    await mkdir(path.join(tmpDir, 'context/local-code/cherry/files/src/components'), { recursive: true });
    await writeFile(path.join(tmpDir, 'DESIGN.md'), AUDIT_DESIGN_MD);
    await writeFile(path.join(tmpDir, 'README.md'), AUDIT_README);
    await writeFile(path.join(tmpDir, 'SKILL.md'), AUDIT_SKILL);
    await writeFile(path.join(tmpDir, 'colors_and_type.css'), AUDIT_TOKENS_CSS);
    for (const fileName of [
      'colors-primary.html',
      'colors-theme-light.html',
      'typography-specimens.html',
      'spacing-tokens.html',
      'components-buttons.html',
      'brand-assets.html',
    ]) {
      await writeFile(path.join(tmpDir, 'preview', fileName), auditHtml(fileName));
    }
    await writeFile(path.join(tmpDir, 'ui_kits/app/index.html'), auditUiKitIndex(['App.jsx', 'Sidebar.jsx', 'ChatArea.jsx']));
    await writeFile(path.join(tmpDir, 'ui_kits/app/README.md'), '# UI kit\n');
    for (const componentName of ['App.jsx', 'Sidebar.jsx', 'ChatArea.jsx']) {
      await writeFile(
        path.join(tmpDir, 'ui_kits/app/components', componentName),
        `export function ${componentName.replace(/\.jsx$/u, '')}(){ return <section>${componentName}</section>; }\n`,
      );
    }
    await writeFile(path.join(tmpDir, 'context/source-context.md'), '# Design System Source Context\n\n## Local Code\n\n- /tmp/cherry\n');
    await writeFile(path.join(tmpDir, 'context/local-code/cherry.md'), [
      '# Local Design Evidence: cherry',
      '',
      'Snapshot files written: 1',
      '',
      '### Reusable components',
      '- src/components/Button.tsx -> `context/local-code/cherry/files/src/components/Button.tsx` (source)',
    ].join('\n'));
    await writeFile(path.join(tmpDir, 'context/local-code/cherry/files/src/components/Button.tsx'), 'export function Button(){ return <button />; }');

    const result = await runConnectorsToolCli(['design-system-package-audit', '--path', tmpDir]);

    expect(result.exitCode).toBe(1);
    expect(JSON.parse(stdoutOutput.join('')).errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'thin_modular_ui_kit', path: 'ui_kits/app/components/' }),
    ]));

    await cleanupTempDir(tmpDir);
  });

  it('fails a design-system package audit when the UI-kit entry does not load its modules or token CSS', async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'od-package-audit-disconnected-uikit-'));
    process.chdir(tmpDir);
    await mkdir(path.join(tmpDir, 'preview'), { recursive: true });
    await mkdir(path.join(tmpDir, 'ui_kits/app/components'), { recursive: true });
    await mkdir(path.join(tmpDir, 'context/local-code/cherry/files/src/components'), { recursive: true });
    await writeFile(path.join(tmpDir, 'DESIGN.md'), AUDIT_DESIGN_MD);
    await writeFile(path.join(tmpDir, 'README.md'), AUDIT_README);
    await writeFile(path.join(tmpDir, 'SKILL.md'), AUDIT_SKILL);
    await writeFile(path.join(tmpDir, 'colors_and_type.css'), AUDIT_TOKENS_CSS);
    for (const fileName of [
      'colors-primary.html',
      'colors-theme-light.html',
      'typography-specimens.html',
      'spacing-tokens.html',
      'components-buttons.html',
      'brand-assets.html',
    ]) {
      await writeFile(path.join(tmpDir, 'preview', fileName), auditHtml(fileName));
    }
    await writeFile(path.join(tmpDir, 'ui_kits/app/index.html'), auditHtml('Disconnected UI kit'));
    await writeFile(path.join(tmpDir, 'ui_kits/app/README.md'), '# UI kit\n');
    for (const componentName of ['Foundation.jsx', 'Navigation.jsx', 'Workspace.jsx']) {
      await writeFile(
        path.join(tmpDir, 'ui_kits/app/components', componentName),
        auditUiKitComponent(componentName),
      );
    }
    await writeFile(path.join(tmpDir, 'context/source-context.md'), '# Design System Source Context\n\n## Local Code\n\n- /tmp/cherry\n');
    await writeFile(path.join(tmpDir, 'context/local-code/cherry.md'), [
      '# Local Design Evidence: cherry',
      '',
      'Snapshot files written: 1',
      '',
      '### Reusable components',
      '- src/components/Button.tsx -> `context/local-code/cherry/files/src/components/Button.tsx` (source)',
    ].join('\n'));
    await writeFile(path.join(tmpDir, 'context/local-code/cherry/files/src/components/Button.tsx'), 'export function Button(){ return <button />; }');

    const result = await runConnectorsToolCli(['design-system-package-audit', '--path', tmpDir]);

    expect(result.exitCode).toBe(1);
    expect(JSON.parse(stdoutOutput.join('')).errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'ui_kit_missing_token_stylesheet', path: 'ui_kits/app/index.html' }),
      expect.objectContaining({ code: 'ui_kit_index_missing_component_references', path: 'ui_kits/app/index.html' }),
    ]));

    await cleanupTempDir(tmpDir);
  });

  it('fails a design-system package audit when the UI-kit entry lists modules without rendering them', async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'od-package-audit-unmounted-uikit-'));
    process.chdir(tmpDir);
    await mkdir(path.join(tmpDir, 'preview'), { recursive: true });
    await mkdir(path.join(tmpDir, 'ui_kits/app/components'), { recursive: true });
    await mkdir(path.join(tmpDir, 'context/local-code/cherry/files/src/components'), { recursive: true });
    await writeFile(path.join(tmpDir, 'DESIGN.md'), AUDIT_DESIGN_MD);
    await writeFile(path.join(tmpDir, 'README.md'), AUDIT_README);
    await writeFile(path.join(tmpDir, 'SKILL.md'), AUDIT_SKILL);
    await writeFile(path.join(tmpDir, 'colors_and_type.css'), AUDIT_TOKENS_CSS);
    for (const fileName of [
      'colors-primary.html',
      'colors-theme-light.html',
      'typography-specimens.html',
      'spacing-tokens.html',
      'components-buttons.html',
      'brand-assets.html',
    ]) {
      await writeFile(path.join(tmpDir, 'preview', fileName), auditHtml(fileName));
    }
    await writeFile(path.join(tmpDir, 'ui_kits/app/index.html'), [
      '<!doctype html><html><head>',
      '<link rel="stylesheet" href="../../colors_and_type.css" />',
      '</head><body><main><h1>Disconnected module list</h1></main>',
      '<script type="text/babel" src="components/Foundation.jsx"></script>',
      '<script type="text/babel" src="components/Navigation.jsx"></script>',
      '<script type="text/babel" src="components/Workspace.jsx"></script>',
      '</body></html>',
    ].join('\n'));
    await writeFile(path.join(tmpDir, 'ui_kits/app/README.md'), '# UI kit\n');
    for (const componentName of ['Foundation.jsx', 'Navigation.jsx', 'Workspace.jsx']) {
      await writeFile(
        path.join(tmpDir, 'ui_kits/app/components', componentName),
        auditUiKitComponent(componentName),
      );
    }
    await writeFile(path.join(tmpDir, 'context/source-context.md'), '# Design System Source Context\n\n## Local Code\n\n- /tmp/cherry\n');
    await writeFile(path.join(tmpDir, 'context/local-code/cherry.md'), [
      '# Local Design Evidence: cherry',
      '',
      'Snapshot files written: 1',
      '',
      '### Reusable components',
      '- src/components/Button.tsx -> `context/local-code/cherry/files/src/components/Button.tsx` (source)',
    ].join('\n'));
    await writeFile(path.join(tmpDir, 'context/local-code/cherry/files/src/components/Button.tsx'), 'export function Button(){ return <button />; }');

    const result = await runConnectorsToolCli(['design-system-package-audit', '--path', tmpDir]);

    expect(result.exitCode).toBe(1);
    expect(JSON.parse(stdoutOutput.join('')).errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'ui_kit_index_missing_runtime_bootstrap', path: 'ui_kits/app/index.html' }),
      expect.objectContaining({ code: 'ui_kit_index_missing_component_composition', path: 'ui_kits/app/index.html' }),
    ]));

    await cleanupTempDir(tmpDir);
  });

  it('fails a design-system package audit when JSX components are loaded without browser runtime scripts', async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'od-package-audit-missing-jsx-runtime-'));
    process.chdir(tmpDir);
    await mkdir(path.join(tmpDir, 'preview'), { recursive: true });
    await mkdir(path.join(tmpDir, 'ui_kits/app/components'), { recursive: true });
    await mkdir(path.join(tmpDir, 'context/local-code/cherry/files/src/pages/home'), { recursive: true });
    await writeFile(path.join(tmpDir, 'DESIGN.md'), AUDIT_DESIGN_MD);
    await writeFile(path.join(tmpDir, 'README.md'), AUDIT_README);
    await writeFile(path.join(tmpDir, 'SKILL.md'), AUDIT_SKILL);
    await writeFile(path.join(tmpDir, 'colors_and_type.css'), AUDIT_TOKENS_CSS);
    for (const fileName of [
      'colors-primary.html',
      'colors-theme-light.html',
      'typography-specimens.html',
      'spacing-tokens.html',
      'components-buttons.html',
      'brand-assets.html',
    ]) {
      await writeFile(path.join(tmpDir, 'preview', fileName), auditHtml(fileName));
    }
    await writeFile(path.join(tmpDir, 'ui_kits/app/index.html'), [
      '<!doctype html><html><head>',
      '<link rel="stylesheet" href="../../colors_and_type.css" />',
      '</head><body><div id="root"></div>',
      '<script type="text/babel" src="components/Sidebar.jsx"></script>',
      '<script type="text/babel" src="components/AssistantsList.jsx"></script>',
      '<script type="text/babel" src="components/ChatArea.jsx"></script>',
      '<script type="text/babel" src="components/InputBar.jsx"></script>',
      '<script type="text/babel" src="components/MessageBubble.jsx"></script>',
      '<script type="text/babel" src="components/App.jsx"></script>',
      '<script type="text/babel">const { App } = window; const root = ReactDOM.createRoot(document.getElementById("root")); root.render(<App />);</script>',
      '</body></html>',
    ].join('\n'));
    await writeFile(path.join(tmpDir, 'ui_kits/app/README.md'), '# UI kit\n');
    for (const componentName of AUDIT_COMPONENT_FILES) {
      await writeFile(
        path.join(tmpDir, 'ui_kits/app/components', componentName),
        auditUiKitComponent(componentName),
      );
    }
    await writeFile(path.join(tmpDir, 'context/source-context.md'), '# Design System Source Context\n\n## Local Code\n\n- /tmp/cherry\n');
    await writeFile(path.join(tmpDir, 'context/local-code/cherry.md'), [
      '# Local Design Evidence: cherry',
      '',
      'Snapshot files written: 1',
      '',
      '### Chat and input surfaces',
      '- src/pages/home/Chat.tsx -> `context/local-code/cherry/files/src/pages/home/Chat.tsx` (source)',
    ].join('\n'));
    await writeFile(path.join(tmpDir, 'context/local-code/cherry/files/src/pages/home/Chat.tsx'), 'export function Chat(){ return <main><InputBar /><Messages /></main>; }');

    const result = await runConnectorsToolCli(['design-system-package-audit', '--path', tmpDir]);

    expect(result.exitCode).toBe(1);
    expect(JSON.parse(stdoutOutput.join('')).errors).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'ui_kit_index_missing_jsx_runtime',
        path: 'ui_kits/app/index.html',
      }),
    ]));

    await cleanupTempDir(tmpDir);
  });

  it('fails a design-system package audit when script-loaded JSX components do not expose browser globals', async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'od-package-audit-missing-browser-global-'));
    process.chdir(tmpDir);
    await mkdir(path.join(tmpDir, 'preview'), { recursive: true });
    await mkdir(path.join(tmpDir, 'ui_kits/app/components'), { recursive: true });
    await mkdir(path.join(tmpDir, 'context/local-code/cherry/files/src/pages/home'), { recursive: true });
    await writeFile(path.join(tmpDir, 'DESIGN.md'), AUDIT_DESIGN_MD);
    await writeFile(path.join(tmpDir, 'README.md'), AUDIT_README);
    await writeFile(path.join(tmpDir, 'SKILL.md'), AUDIT_SKILL);
    await writeFile(path.join(tmpDir, 'colors_and_type.css'), AUDIT_TOKENS_CSS);
    for (const fileName of [
      'colors-primary.html',
      'colors-theme-light.html',
      'typography-specimens.html',
      'spacing-tokens.html',
      'components-buttons.html',
      'brand-assets.html',
    ]) {
      await writeFile(path.join(tmpDir, 'preview', fileName), auditHtml(fileName));
    }
    await writeFile(path.join(tmpDir, 'ui_kits/app/index.html'), auditUiKitIndex());
    await writeFile(path.join(tmpDir, 'ui_kits/app/README.md'), '# UI kit\n');
    for (const componentName of AUDIT_COMPONENT_FILES) {
      await writeFile(
        path.join(tmpDir, 'ui_kits/app/components', componentName),
        componentName === 'Sidebar.jsx'
          ? 'function Sidebar(){ return <aside>Sidebar</aside>; }\n'
          : auditUiKitComponent(componentName),
      );
    }
    await writeFile(path.join(tmpDir, 'context/source-context.md'), '# Design System Source Context\n\n## Local Code\n\n- /tmp/cherry\n');
    await writeFile(path.join(tmpDir, 'context/local-code/cherry.md'), [
      '# Local Design Evidence: cherry',
      '',
      'Snapshot files written: 1',
      '',
      '### Chat and input surfaces',
      '- src/pages/home/Chat.tsx -> `context/local-code/cherry/files/src/pages/home/Chat.tsx` (source)',
    ].join('\n'));
    await writeFile(path.join(tmpDir, 'context/local-code/cherry/files/src/pages/home/Chat.tsx'), 'export function Chat(){ return <main><InputBar /><Messages /></main>; }');

    const result = await runConnectorsToolCli(['design-system-package-audit', '--path', tmpDir]);

    expect(result.exitCode).toBe(1);
    expect(JSON.parse(stdoutOutput.join('')).errors).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'ui_kit_component_missing_browser_global',
        path: 'ui_kits/app/components/Sidebar.jsx',
        message: expect.stringContaining('window.Sidebar'),
      }),
    ]));

    await cleanupTempDir(tmpDir);
  });

  it('fails a design-system package audit when chat evidence lacks UI-kit role coverage', async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'od-package-audit-missing-roles-'));
    process.chdir(tmpDir);
    await mkdir(path.join(tmpDir, 'preview'), { recursive: true });
    await mkdir(path.join(tmpDir, 'ui_kits/app/components'), { recursive: true });
    await mkdir(path.join(tmpDir, 'assets'), { recursive: true });
    await mkdir(path.join(tmpDir, 'fonts/ubuntu'), { recursive: true });
    await mkdir(path.join(tmpDir, 'context/local-code/cherry/files/src/pages/home'), { recursive: true });
    await writeFile(path.join(tmpDir, 'DESIGN.md'), AUDIT_DESIGN_MD);
    await writeFile(path.join(tmpDir, 'README.md'), AUDIT_README);
    await writeFile(path.join(tmpDir, 'SKILL.md'), AUDIT_SKILL);
    await writeFile(path.join(tmpDir, 'colors_and_type.css'), AUDIT_TOKENS_CSS);
    for (const fileName of [
      'colors-primary.html',
      'colors-theme-light.html',
      'typography-specimens.html',
      'spacing-tokens.html',
      'components-buttons.html',
      'brand-assets.html',
    ]) {
      await writeFile(path.join(tmpDir, 'preview', fileName), auditHtml(fileName));
    }
    await writeFile(path.join(tmpDir, 'ui_kits/app/index.html'), auditUiKitIndex(['App.jsx', 'Sidebar.jsx', 'ChatArea.jsx']));
    await writeFile(path.join(tmpDir, 'ui_kits/app/README.md'), '# UI kit\n');
    for (const componentName of ['App.jsx', 'Sidebar.jsx', 'ChatArea.jsx']) {
      await writeFile(
        path.join(tmpDir, 'ui_kits/app/components', componentName),
        auditUiKitComponent(componentName),
      );
    }
    await writeFile(path.join(tmpDir, 'assets/logo.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    await writeFile(path.join(tmpDir, 'fonts/ubuntu/Ubuntu-Regular.ttf'), Buffer.from('font-data'));
    await writeFile(path.join(tmpDir, 'context/source-context.md'), '# Design System Source Context\n\n## Local Code\n\n- /tmp/cherry\n');
    await writeFile(path.join(tmpDir, 'context/local-code/cherry.md'), [
      '# Local Design Evidence: cherry',
      '',
      'Snapshot files written: 1',
      '',
      '### Chat and input surfaces',
      '- src/pages/home/Chat.tsx -> `context/local-code/cherry/files/src/pages/home/Chat.tsx` (source)',
    ].join('\n'));
    await writeFile(path.join(tmpDir, 'context/local-code/cherry/files/src/pages/home/Chat.tsx'), 'export function Chat(){ return <main><InputBar /><Messages /></main>; }');

    const result = await runConnectorsToolCli(['design-system-package-audit', '--path', tmpDir]);

    expect(result.exitCode).toBe(1);
    expect(JSON.parse(stdoutOutput.join('')).errors).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'missing_ui_kit_component_roles',
        path: 'ui_kits/app/components/',
        message: expect.stringContaining('assistant/list rail'),
      }),
    ]));

    await cleanupTempDir(tmpDir);
  });

  it('fails a design-system package audit when the app shell does not compose role components', async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'od-package-audit-uncomposed-app-'));
    process.chdir(tmpDir);
    await mkdir(path.join(tmpDir, 'preview'), { recursive: true });
    await mkdir(path.join(tmpDir, 'ui_kits/app/components'), { recursive: true });
    await mkdir(path.join(tmpDir, 'context/local-code/cherry/files/src/pages/home'), { recursive: true });
    await writeFile(path.join(tmpDir, 'DESIGN.md'), AUDIT_DESIGN_MD);
    await writeFile(path.join(tmpDir, 'README.md'), AUDIT_README);
    await writeFile(path.join(tmpDir, 'SKILL.md'), AUDIT_SKILL);
    await writeFile(path.join(tmpDir, 'colors_and_type.css'), AUDIT_TOKENS_CSS);
    for (const fileName of [
      'colors-primary.html',
      'colors-theme-light.html',
      'typography-specimens.html',
      'spacing-tokens.html',
      'components-buttons.html',
      'brand-assets.html',
    ]) {
      await writeFile(path.join(tmpDir, 'preview', fileName), auditHtml(fileName));
    }
    await writeFile(path.join(tmpDir, 'ui_kits/app/index.html'), auditUiKitIndex());
    await writeFile(path.join(tmpDir, 'ui_kits/app/README.md'), '# UI kit\n');
    for (const componentName of AUDIT_COMPONENT_FILES) {
      await writeFile(
        path.join(tmpDir, 'ui_kits/app/components', componentName),
        componentName === 'App.jsx' ? auditComponent('App') : auditUiKitComponent(componentName),
      );
    }
    await writeFile(path.join(tmpDir, 'context/source-context.md'), '# Design System Source Context\n\n## Local Code\n\n- /tmp/cherry\n');
    await writeFile(path.join(tmpDir, 'context/local-code/cherry.md'), [
      '# Local Design Evidence: cherry',
      '',
      'Snapshot files written: 1',
      '',
      '### Chat and input surfaces',
      '- src/pages/home/Chat.tsx -> `context/local-code/cherry/files/src/pages/home/Chat.tsx` (source)',
    ].join('\n'));
    await writeFile(path.join(tmpDir, 'context/local-code/cherry/files/src/pages/home/Chat.tsx'), 'export function Chat(){ return <main><InputBar /><Messages /></main>; }');

    const result = await runConnectorsToolCli(['design-system-package-audit', '--path', tmpDir]);

    expect(result.exitCode).toBe(1);
    expect(JSON.parse(stdoutOutput.join('')).errors).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'ui_kit_app_missing_role_composition',
        path: 'ui_kits/app/components/App.jsx',
        message: expect.stringContaining('Sidebar, AssistantsList, ChatArea'),
      }),
    ]));

    await cleanupTempDir(tmpDir);
  });

  it('fails a design-system package audit when rich binary evidence is collapsed to one asset and font', async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'od-package-audit-thin-binaries-'));
    process.chdir(tmpDir);
    await mkdir(path.join(tmpDir, 'preview'), { recursive: true });
    await mkdir(path.join(tmpDir, 'ui_kits/app/components'), { recursive: true });
    await mkdir(path.join(tmpDir, 'assets'), { recursive: true });
    await mkdir(path.join(tmpDir, 'fonts/ubuntu'), { recursive: true });
    await mkdir(path.join(tmpDir, 'context/local-code/cherry/files/build'), { recursive: true });
    await mkdir(path.join(tmpDir, 'context/local-code/cherry/files/src/assets/fonts/ubuntu'), { recursive: true });
    await writeFile(path.join(tmpDir, 'DESIGN.md'), AUDIT_DESIGN_MD);
    await writeFile(path.join(tmpDir, 'README.md'), AUDIT_README);
    await writeFile(path.join(tmpDir, 'SKILL.md'), AUDIT_SKILL);
    await writeFile(path.join(tmpDir, 'colors_and_type.css'), AUDIT_TOKENS_CSS);
    for (const fileName of [
      'colors-primary.html',
      'colors-theme-light.html',
      'typography-specimens.html',
      'spacing-tokens.html',
      'components-buttons.html',
      'brand-assets.html',
    ]) {
      await writeFile(path.join(tmpDir, 'preview', fileName), auditHtml(fileName));
    }
    await writeFile(path.join(tmpDir, 'ui_kits/app/index.html'), auditUiKitIndex());
    await writeFile(path.join(tmpDir, 'ui_kits/app/README.md'), '# UI kit\n');
    for (const componentName of AUDIT_COMPONENT_FILES) {
      await writeFile(
        path.join(tmpDir, 'ui_kits/app/components', componentName),
        auditUiKitComponent(componentName),
      );
    }
    await writeFile(path.join(tmpDir, 'assets/logo.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    await writeFile(path.join(tmpDir, 'fonts/ubuntu/Ubuntu-Regular.ttf'), Buffer.from('font-data'));
    for (const fileName of ['icon.png', 'logo.png', 'tray_icon.png']) {
      await writeFile(path.join(tmpDir, 'context/local-code/cherry/files/build', fileName), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    }
    for (const fileName of ['Ubuntu-Regular.ttf', 'Ubuntu-Medium.ttf', 'Ubuntu-Bold.ttf']) {
      await writeFile(path.join(tmpDir, 'context/local-code/cherry/files/src/assets/fonts/ubuntu', fileName), Buffer.from('font-data'));
    }
    await writeFile(path.join(tmpDir, 'context/source-context.md'), '# Design System Source Context\n\n## Local Code\n\n- /tmp/cherry\n');
    await writeFile(path.join(tmpDir, 'context/local-code/cherry.md'), [
      '# Local Design Evidence: cherry',
      '',
      'Snapshot files written: 6',
      '',
      '### Brand assets and icons',
      '- build/icon.png -> `context/local-code/cherry/files/build/icon.png` (binary asset)',
      '- build/logo.png -> `context/local-code/cherry/files/build/logo.png` (binary asset)',
      '- build/tray_icon.png -> `context/local-code/cherry/files/build/tray_icon.png` (binary asset)',
      '',
      '### Fonts',
      '- src/assets/fonts/ubuntu/Ubuntu-Regular.ttf -> `context/local-code/cherry/files/src/assets/fonts/ubuntu/Ubuntu-Regular.ttf` (binary asset)',
      '- src/assets/fonts/ubuntu/Ubuntu-Medium.ttf -> `context/local-code/cherry/files/src/assets/fonts/ubuntu/Ubuntu-Medium.ttf` (binary asset)',
      '- src/assets/fonts/ubuntu/Ubuntu-Bold.ttf -> `context/local-code/cherry/files/src/assets/fonts/ubuntu/Ubuntu-Bold.ttf` (binary asset)',
    ].join('\n'));

    const result = await runConnectorsToolCli(['design-system-package-audit', '--path', tmpDir]);

    expect(result.exitCode).toBe(1);
    expect(JSON.parse(stdoutOutput.join('')).errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'insufficient_preserved_assets', path: 'assets/' }),
      expect.objectContaining({ code: 'insufficient_preserved_fonts', path: 'fonts/' }),
    ]));

    await cleanupTempDir(tmpDir);
  });

  it('fails a design-system package audit when preserved fonts are not bound in token CSS', async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'od-package-audit-font-binding-'));
    process.chdir(tmpDir);
    await mkdir(path.join(tmpDir, 'preview'), { recursive: true });
    await mkdir(path.join(tmpDir, 'ui_kits/app/components'), { recursive: true });
    await mkdir(path.join(tmpDir, 'fonts/ubuntu'), { recursive: true });
    await mkdir(path.join(tmpDir, 'context/local-code/cherry/files/fonts/ubuntu'), { recursive: true });
    await writeFile(path.join(tmpDir, 'DESIGN.md'), AUDIT_DESIGN_MD);
    await writeFile(path.join(tmpDir, 'README.md'), AUDIT_README);
    await writeFile(path.join(tmpDir, 'SKILL.md'), AUDIT_SKILL);
    await writeFile(path.join(tmpDir, 'colors_and_type.css'), UNBOUND_FONT_AUDIT_TOKENS_CSS);
    for (const fileName of [
      'colors-primary.html',
      'colors-theme-light.html',
      'typography-specimens.html',
      'spacing-tokens.html',
      'components-buttons.html',
      'brand-assets.html',
    ]) {
      await writeFile(path.join(tmpDir, 'preview', fileName), auditHtml(fileName));
    }
    await writeFile(path.join(tmpDir, 'ui_kits/app/index.html'), auditUiKitIndex());
    await writeFile(path.join(tmpDir, 'ui_kits/app/README.md'), '# UI kit\n');
    for (const componentName of AUDIT_COMPONENT_FILES) {
      await writeFile(
        path.join(tmpDir, 'ui_kits/app/components', componentName),
        auditUiKitComponent(componentName),
      );
    }
    await writeFile(path.join(tmpDir, 'fonts/ubuntu/Ubuntu-Regular.ttf'), Buffer.from('font-data'));
    await writeFile(path.join(tmpDir, 'context/local-code/cherry/files/fonts/ubuntu/Ubuntu-Regular.ttf'), Buffer.from('font-data'));
    await writeFile(path.join(tmpDir, 'context/source-context.md'), '# Design System Source Context\n\n## Local Code\n\n- /tmp/cherry\n');
    await writeFile(path.join(tmpDir, 'context/local-code/cherry.md'), [
      '# Local Design Evidence: cherry',
      '',
      'Snapshot files written: 1',
      '',
      '### Fonts',
      '- fonts/ubuntu/Ubuntu-Regular.ttf -> `context/local-code/cherry/files/fonts/ubuntu/Ubuntu-Regular.ttf` (binary asset)',
    ].join('\n'));

    const result = await runConnectorsToolCli(['design-system-package-audit', '--path', tmpDir]);

    expect(result.exitCode).toBe(1);
    expect(JSON.parse(stdoutOutput.join('')).errors).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'font_tokens_not_bound',
        path: 'colors_and_type.css',
        message: expect.stringContaining('does not bind them'),
      }),
    ]));

    await cleanupTempDir(tmpDir);
  });

  it('warns when visual artifacts do not reference source-backed component names', async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'od-package-audit-generic-visuals-'));
    process.chdir(tmpDir);
    await mkdir(path.join(tmpDir, 'preview'), { recursive: true });
    await mkdir(path.join(tmpDir, 'ui_kits/app/components'), { recursive: true });
    await mkdir(path.join(tmpDir, 'context/local-code/cherry/files/src/components'), { recursive: true });
    await writeFile(path.join(tmpDir, 'DESIGN.md'), AUDIT_DESIGN_MD);
    await writeFile(path.join(tmpDir, 'README.md'), AUDIT_README);
    await writeFile(path.join(tmpDir, 'SKILL.md'), AUDIT_SKILL);
    await writeFile(path.join(tmpDir, 'colors_and_type.css'), AUDIT_TOKENS_CSS);
    for (const fileName of [
      'colors-primary.html',
      'colors-theme-light.html',
      'typography-specimens.html',
      'spacing-tokens.html',
      'components-buttons.html',
      'brand-assets.html',
    ]) {
      await writeFile(path.join(tmpDir, 'preview', fileName), auditHtml(fileName));
    }
    await writeFile(path.join(tmpDir, 'ui_kits/app/index.html'), auditUiKitIndex(['Foundation.jsx', 'Navigation.jsx', 'Workspace.jsx']));
    await writeFile(path.join(tmpDir, 'ui_kits/app/README.md'), '# UI kit\n');
    for (const componentName of ['Foundation.jsx', 'Navigation.jsx', 'Workspace.jsx']) {
      await writeFile(
        path.join(tmpDir, 'ui_kits/app/components', componentName),
        auditUiKitComponent(componentName),
      );
    }
    await writeFile(path.join(tmpDir, 'context/source-context.md'), '# Design System Source Context\n\n## Local Code\n\n- /tmp/cherry\n');
    await writeFile(path.join(tmpDir, 'context/local-code/cherry.md'), [
      '# Local Design Evidence: cherry',
      '',
      'Snapshot files written: 6',
      '',
      '### Reusable components',
      '- src/components/ToolbarSurface.tsx -> `context/local-code/cherry/files/src/components/ToolbarSurface.tsx` (source)',
      '- src/components/ArtifactPanel.tsx -> `context/local-code/cherry/files/src/components/ArtifactPanel.tsx` (source)',
      '- src/components/ProviderAvatar.tsx -> `context/local-code/cherry/files/src/components/ProviderAvatar.tsx` (source)',
      '- src/components/SettingsForm.tsx -> `context/local-code/cherry/files/src/components/SettingsForm.tsx` (source)',
      '- src/components/TransferCard.tsx -> `context/local-code/cherry/files/src/components/TransferCard.tsx` (source)',
      '- src/components/CodePreview.tsx -> `context/local-code/cherry/files/src/components/CodePreview.tsx` (source)',
    ].join('\n'));
    for (const componentName of ['ToolbarSurface', 'ArtifactPanel', 'ProviderAvatar', 'SettingsForm', 'TransferCard', 'CodePreview']) {
      await writeFile(path.join(tmpDir, 'context/local-code/cherry/files/src/components', `${componentName}.tsx`), `export function ${componentName}(){ return null; }`);
    }

    const result = await runConnectorsToolCli(['design-system-package-audit', '--path', tmpDir]);

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(stdoutOutput.join('')).warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'generic_visual_artifacts',
        path: 'preview/',
        message: expect.stringContaining('ToolbarSurface'),
      }),
    ]));

    stdoutOutput = [];
    const strictResult = await runConnectorsToolCli(['design-system-package-audit', '--path', tmpDir, '--fail-on-warnings']);

    expect(strictResult.exitCode).toBe(1);
    expect(JSON.parse(stdoutOutput.join(''))).toMatchObject({
      ok: false,
      errors: [],
      warnings: expect.arrayContaining([
        expect.objectContaining({ code: 'generic_visual_artifacts', path: 'preview/' }),
      ]),
    });

    await cleanupTempDir(tmpDir);
  });

  it('warns when focused preview cards do not apply tokens to source components', async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'od-package-audit-preview-source-context-'));
    process.chdir(tmpDir);
    await mkdir(path.join(tmpDir, 'preview'), { recursive: true });
    await mkdir(path.join(tmpDir, 'ui_kits/app/components'), { recursive: true });
    await mkdir(path.join(tmpDir, 'context/local-code/cherry/files/src/components'), { recursive: true });
    await writeFile(path.join(tmpDir, 'DESIGN.md'), AUDIT_DESIGN_MD);
    await writeFile(path.join(tmpDir, 'README.md'), AUDIT_README);
    await writeFile(path.join(tmpDir, 'SKILL.md'), AUDIT_SKILL);
    await writeFile(path.join(tmpDir, 'colors_and_type.css'), AUDIT_TOKENS_CSS);
    for (const fileName of [
      'colors-primary.html',
      'colors-theme-light.html',
      'typography-specimens.html',
      'brand-assets.html',
    ]) {
      await writeFile(path.join(tmpDir, 'preview', fileName), auditHtml(fileName));
    }
    await writeFile(path.join(tmpDir, 'preview/spacing-radius.html'), auditHtml('spacing-radius token swatches only'));
    await writeFile(path.join(tmpDir, 'preview/components-buttons.html'), auditHtml('components-buttons generic controls only'));
    const componentFiles = ['App.jsx', 'Sidebar.jsx', 'AssistantsList.jsx', 'ChatArea.jsx', 'InputBar.jsx', 'MessageBubble.jsx'];
    await writeFile(path.join(tmpDir, 'ui_kits/app/index.html'), auditUiKitIndex(componentFiles));
    await writeFile(path.join(tmpDir, 'ui_kits/app/README.md'), AUDIT_UI_KIT_README);
    for (const componentName of componentFiles) {
      await writeFile(
        path.join(tmpDir, 'ui_kits/app/components', componentName),
        auditUiKitComponent(componentName),
      );
    }
    await writeFile(path.join(tmpDir, 'context/source-context.md'), '# Design System Source Context\n\n## Local Code\n\n- /tmp/cherry\n');
    await writeFile(path.join(tmpDir, 'context/local-code/cherry.md'), [
      '# Local Design Evidence: cherry',
      '',
      'Snapshot files written: 6',
      '',
      '### Reusable components',
      '- src/components/Sidebar.tsx -> `context/local-code/cherry/files/src/components/Sidebar.tsx` (source)',
      '- src/components/AssistantsList.tsx -> `context/local-code/cherry/files/src/components/AssistantsList.tsx` (source)',
      '- src/components/ChatArea.tsx -> `context/local-code/cherry/files/src/components/ChatArea.tsx` (source)',
      '- src/components/InputBar.tsx -> `context/local-code/cherry/files/src/components/InputBar.tsx` (source)',
      '- src/components/MessageBubble.tsx -> `context/local-code/cherry/files/src/components/MessageBubble.tsx` (source)',
      '- src/components/SettingsForm.tsx -> `context/local-code/cherry/files/src/components/SettingsForm.tsx` (source)',
    ].join('\n'));
    for (const componentName of ['Sidebar', 'AssistantsList', 'ChatArea', 'InputBar', 'MessageBubble', 'SettingsForm']) {
      await writeFile(path.join(tmpDir, 'context/local-code/cherry/files/src/components', `${componentName}.tsx`), `export function ${componentName}(){ return null; }`);
    }

    const result = await runConnectorsToolCli(['design-system-package-audit', '--path', tmpDir]);

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(stdoutOutput.join('')).warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'preview_cards_missing_source_component_context',
        path: 'preview/',
        message: expect.stringContaining('preview/spacing-radius.html'),
      }),
    ]));

    await cleanupTempDir(tmpDir);
  });

  it('warns when rich component evidence is not preserved as source examples outside context', async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'od-package-audit-source-examples-'));
    process.chdir(tmpDir);
    await mkdir(path.join(tmpDir, 'preview'), { recursive: true });
    await mkdir(path.join(tmpDir, 'ui_kits/app/components'), { recursive: true });
    await mkdir(path.join(tmpDir, 'context/local-code/cherry/files/src/components'), { recursive: true });
    await writeFile(path.join(tmpDir, 'DESIGN.md'), AUDIT_DESIGN_MD);
    await writeFile(path.join(tmpDir, 'README.md'), AUDIT_README);
    await writeFile(path.join(tmpDir, 'SKILL.md'), AUDIT_SKILL);
    await writeFile(path.join(tmpDir, 'colors_and_type.css'), AUDIT_TOKENS_CSS);
    for (const fileName of [
      'colors-primary.html',
      'colors-theme-light.html',
      'typography-specimens.html',
      'spacing-tokens.html',
      'components-buttons.html',
      'brand-assets.html',
    ]) {
      await writeFile(path.join(tmpDir, 'preview', fileName), auditHtml(fileName));
    }
    const componentFiles = [...AUDIT_COMPONENT_FILES, 'PreviewCard.jsx'];
    await writeFile(path.join(tmpDir, 'ui_kits/app/index.html'), auditUiKitIndex(componentFiles));
    await writeFile(path.join(tmpDir, 'ui_kits/app/README.md'), '# UI kit\n');
    for (const componentName of componentFiles) {
      await writeFile(
        path.join(tmpDir, 'ui_kits/app/components', componentName),
        auditUiKitComponent(componentName),
      );
    }
    await writeFile(path.join(tmpDir, 'context/source-context.md'), '# Design System Source Context\n\n## Local Code\n\n- /tmp/cherry\n');
    await writeFile(path.join(tmpDir, 'context/local-code/cherry.md'), [
      '# Local Design Evidence: cherry',
      '',
      'Snapshot files written: 6',
      '',
      '### Reusable components',
      '- src/components/Sidebar.tsx -> `context/local-code/cherry/files/src/components/Sidebar.tsx` (source)',
      '- src/components/AssistantsList.tsx -> `context/local-code/cherry/files/src/components/AssistantsList.tsx` (source)',
      '- src/components/ChatArea.tsx -> `context/local-code/cherry/files/src/components/ChatArea.tsx` (source)',
      '- src/components/InputBar.tsx -> `context/local-code/cherry/files/src/components/InputBar.tsx` (source)',
      '- src/components/MessageBubble.tsx -> `context/local-code/cherry/files/src/components/MessageBubble.tsx` (source)',
      '- src/components/PreviewCard.tsx -> `context/local-code/cherry/files/src/components/PreviewCard.tsx` (source)',
    ].join('\n'));
    for (const componentName of ['Sidebar', 'AssistantsList', 'ChatArea', 'InputBar', 'MessageBubble', 'PreviewCard']) {
      await writeFile(path.join(tmpDir, 'context/local-code/cherry/files/src/components', `${componentName}.tsx`), `export function ${componentName}(){ return null; }`);
    }

    const result = await runConnectorsToolCli(['design-system-package-audit', '--path', tmpDir]);

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(stdoutOutput.join('')).warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'missing_source_component_examples',
        path: 'source_examples/',
        message: expect.stringContaining('source-backed component example'),
      }),
    ]));

    await cleanupTempDir(tmpDir);
  });

  it('warns when source-backed examples are only tiny stubs', async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'od-package-audit-thin-source-examples-'));
    process.chdir(tmpDir);
    await mkdir(path.join(tmpDir, 'preview'), { recursive: true });
    await mkdir(path.join(tmpDir, 'ui_kits/app/components'), { recursive: true });
    await mkdir(path.join(tmpDir, 'source_examples'), { recursive: true });
    await mkdir(path.join(tmpDir, 'context/local-code/cherry/files/src/components'), { recursive: true });
    await writeFile(path.join(tmpDir, 'DESIGN.md'), AUDIT_DESIGN_MD);
    await writeFile(path.join(tmpDir, 'README.md'), AUDIT_README);
    await writeFile(path.join(tmpDir, 'SKILL.md'), AUDIT_SKILL);
    await writeFile(path.join(tmpDir, 'colors_and_type.css'), AUDIT_TOKENS_CSS);
    for (const fileName of [
      'colors-primary.html',
      'colors-theme-light.html',
      'typography-specimens.html',
      'spacing-tokens.html',
      'components-buttons.html',
      'brand-assets.html',
    ]) {
      await writeFile(path.join(tmpDir, 'preview', fileName), auditHtml(fileName));
    }
    const componentFiles = [...AUDIT_COMPONENT_FILES, 'PreviewCard.jsx'];
    await writeFile(path.join(tmpDir, 'ui_kits/app/index.html'), auditUiKitIndex(componentFiles));
    await writeFile(path.join(tmpDir, 'ui_kits/app/README.md'), '# UI kit\n');
    for (const componentName of componentFiles) {
      await writeFile(
        path.join(tmpDir, 'ui_kits/app/components', componentName),
        auditUiKitComponent(componentName),
      );
    }
    await writeFile(path.join(tmpDir, 'context/source-context.md'), '# Design System Source Context\n\n## Local Code\n\n- /tmp/cherry\n');
    await writeFile(path.join(tmpDir, 'context/local-code/cherry.md'), [
      '# Local Design Evidence: cherry',
      '',
      'Snapshot files written: 6',
      '',
      '### Reusable components',
      '- src/components/Sidebar.tsx -> `context/local-code/cherry/files/src/components/Sidebar.tsx` (source)',
      '- src/components/AssistantsList.tsx -> `context/local-code/cherry/files/src/components/AssistantsList.tsx` (source)',
      '- src/components/ChatArea.tsx -> `context/local-code/cherry/files/src/components/ChatArea.tsx` (source)',
      '- src/components/InputBar.tsx -> `context/local-code/cherry/files/src/components/InputBar.tsx` (source)',
      '- src/components/MessageBubble.tsx -> `context/local-code/cherry/files/src/components/MessageBubble.tsx` (source)',
      '- src/components/PreviewCard.tsx -> `context/local-code/cherry/files/src/components/PreviewCard.tsx` (source)',
    ].join('\n'));
    for (const componentName of ['Sidebar', 'AssistantsList', 'ChatArea', 'InputBar', 'MessageBubble', 'PreviewCard']) {
      await writeFile(path.join(tmpDir, 'context/local-code/cherry/files/src/components', `${componentName}.tsx`), `export function ${componentName}(){ return <section>${componentName}</section>; }`);
    }
    for (const componentName of ['Sidebar', 'AssistantsList', 'ChatArea']) {
      await writeFile(path.join(tmpDir, 'source_examples', `${componentName}.tsx`), `export function ${componentName}(){ return null; }\n`);
    }

    const result = await runConnectorsToolCli(['design-system-package-audit', '--path', tmpDir]);

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(stdoutOutput.join('')).warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'thin_source_component_examples',
        path: 'source_examples/',
        message: expect.stringContaining('filename-only stubs'),
      }),
    ]));

    await cleanupTempDir(tmpDir);
  });

  it('fails a design-system package audit when evidence-backed artifacts are missing', async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'od-package-audit-fail-'));
    process.chdir(tmpDir);
    await mkdir(path.join(tmpDir, 'preview'), { recursive: true });
    await mkdir(path.join(tmpDir, 'ui_kits/generated_interface'), { recursive: true });
    await mkdir(path.join(tmpDir, 'context'), { recursive: true });
    await writeFile(path.join(tmpDir, 'DESIGN.md'), '# Incomplete\n');
    await writeFile(path.join(tmpDir, 'preview/typography-scale.html'), '<!doctype html>');
    await writeFile(path.join(tmpDir, 'ui_kits/generated_interface/index.html'), '<!doctype html>');
    await writeFile(path.join(tmpDir, 'context/source-context.md'), [
      '# Design System Source Context',
      '',
      '## GitHub Repositories',
      '',
      '- https://github.com/acme/ui',
      '',
      '## Local Code',
      '',
      'Linked folders readable by the local agent:',
      '- /tmp/acme-ui',
    ].join('\n'));

    const result = await runConnectorsToolCli(['design-system-package-audit', '--path', tmpDir]);

    expect(result.exitCode).toBe(1);
    const output = JSON.parse(stdoutOutput.join(''));
    expect(output.ok).toBe(false);
    expect(output.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'missing_required_file', path: 'README.md' }),
      expect.objectContaining({ code: 'missing_github_evidence' }),
      expect.objectContaining({ code: 'missing_local_evidence' }),
      expect.objectContaining({ code: 'old_generated_interface' }),
    ]));

    await cleanupTempDir(tmpDir);
  });

  it('can audit an external Claude Design reference package without DESIGN.md', async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'od-package-audit-reference-'));
    process.chdir(tmpDir);
    await mkdir(path.join(tmpDir, 'preview'), { recursive: true });
    await mkdir(path.join(tmpDir, 'ui_kits/app'), { recursive: true });
    await mkdir(path.join(tmpDir, 'assets'), { recursive: true });
    await mkdir(path.join(tmpDir, 'fonts/ubuntu'), { recursive: true });
    await writeFile(path.join(tmpDir, 'README.md'), AUDIT_README);
    await writeFile(path.join(tmpDir, 'SKILL.md'), REFERENCE_AUDIT_SKILL);
    await writeFile(path.join(tmpDir, 'colors_and_type.css'), AUDIT_TOKENS_CSS);
    for (const fileName of [
      'colors-primary.html',
      'colors-theme-light.html',
      'colors-theme-dark.html',
      'typography-specimens.html',
      'spacing-tokens.html',
      'spacing-radius.html',
      'components-buttons.html',
      'components-inputs.html',
      'brand-assets.html',
    ]) {
      await writeFile(path.join(tmpDir, 'preview', fileName), auditHtml(fileName));
    }
    await writeFile(path.join(tmpDir, 'ui_kits/app/index.html'), auditUiKitIndex());
    await writeFile(path.join(tmpDir, 'ui_kits/app/README.md'), '# UI kit\n');
    await mkdir(path.join(tmpDir, 'ui_kits/app/components'), { recursive: true });
    for (const componentName of AUDIT_COMPONENT_FILES) {
      await writeFile(
        path.join(tmpDir, 'ui_kits/app/components', componentName),
        auditUiKitComponent(componentName),
      );
    }
    await writeFile(path.join(tmpDir, 'assets/logo.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    await writeFile(path.join(tmpDir, 'fonts/ubuntu/Ubuntu-Regular.ttf'), Buffer.from('font-data'));

    const strict = await runConnectorsToolCli(['design-system-package-audit', '--path', tmpDir]);
    expect(strict.exitCode).toBe(1);
    expect(JSON.parse(stdoutOutput.join('')).errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'missing_required_file', path: 'DESIGN.md' }),
    ]));

    stdoutOutput = [];
    const reference = await runConnectorsToolCli(['design-system-package-audit', '--path', tmpDir, '--reference-package']);
    expect(reference.exitCode).toBe(0);
    expect(JSON.parse(stdoutOutput.join(''))).toMatchObject({
      ok: true,
      errors: [],
      warnings: expect.arrayContaining([
        expect.objectContaining({ code: 'missing_open_design_rules', path: 'DESIGN.md' }),
      ]),
    });

    await cleanupTempDir(tmpDir);
  });

  it('falls back to bounded connector directory browsing when the repository tree is too large', async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'od-connectors-cli-'));
    process.chdir(tmpDir);
    process.env.OD_DAEMON_URL = 'http://127.0.0.1:7456';
    process.env.OD_TOOL_TOKEN = 'agent-run-token';
    await installFailingLocalGithubTools(tmpDir);

    const encode = (value: string) => Buffer.from(value, 'utf8').toString('base64');
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({
        connectors: [{
          id: 'github',
          name: 'GitHub',
          provider: 'composio',
          category: 'Developer',
          status: 'connected',
          tools: [{ name: 'github.github_get_repository_content' }],
        }],
      }), { headers: { 'Content-Type': 'application/json' }, status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        ok: true,
        output: { data: { default_branch: 'main', html_url: 'https://github.com/acme/ui' } },
      }), { headers: { 'Content-Type': 'application/json' }, status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        ok: true,
        output: { data: { path: 'README.md', encoding: 'base64', content: encode('# Acme UI') } },
      }), { headers: { 'Content-Type': 'application/json' }, status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        error: { code: 'CONNECTOR_OUTPUT_TOO_LARGE', message: 'connector output exceeds max serialized size' },
      }), { headers: { 'Content-Type': 'application/json' }, status: 502 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        ok: true,
        output: { data: { content: [
          { path: 'package.json', type: 'file' },
          { path: 'src', type: 'dir' },
          { path: 'docs', type: 'dir' },
        ] } },
      }), { headers: { 'Content-Type': 'application/json' }, status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        ok: true,
        output: { data: { content: [
          { path: 'src/styles.css', type: 'file' },
          { path: 'src/components', type: 'dir' },
        ] } },
      }), { headers: { 'Content-Type': 'application/json' }, status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        ok: true,
        output: { data: { content: [{ path: 'src/components/Button.tsx', type: 'file' }] } },
      }), { headers: { 'Content-Type': 'application/json' }, status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        ok: true,
        output: { data: '{"dependencies":{"@radix-ui/react-slot":"latest"}}' },
      }), { headers: { 'Content-Type': 'application/json' }, status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        ok: true,
        output: { data: ':root { --color-brand: #ff5500; }' },
      }), { headers: { 'Content-Type': 'application/json' }, status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        ok: true,
        output: { data: 'export function Button(){ return <button /> }' },
      }), { headers: { 'Content-Type': 'application/json' }, status: 200 }));

    const result = await runConnectorsToolCli(['github-design-context', '--repo', 'acme/ui', '--max-files', '3', '--require-connector']);

    expect(result.exitCode).toBe(0);
    const stdout = JSON.parse(stdoutOutput.join(''));
    expect(stdout).toEqual(expect.objectContaining({
      ok: true,
      method: 'connector',
      warnings: expect.arrayContaining([
        expect.stringContaining('Recursive tree connector read failed'),
      ]),
    }));
    await expect(readFile(path.join(tmpDir, 'context/github/acme-ui.md'), 'utf8')).resolves.toContain('bounded directory browsing');
    await expect(readFile(path.join(tmpDir, 'context/github/acme-ui.md'), 'utf8')).resolves.toContain('src/components/Button.tsx');
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:7456/api/tools/connectors/execute',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('github.github_get_repository_content'),
      }),
    );

    await cleanupTempDir(tmpDir);
  });

  it('continues bounded GitHub intake when repository metadata is too large', async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'od-connectors-cli-'));
    process.chdir(tmpDir);
    process.env.OD_DAEMON_URL = 'http://127.0.0.1:7456';
    process.env.OD_TOOL_TOKEN = 'agent-run-token';
    await installFailingLocalGithubTools(tmpDir);

    const encode = (value: string) => Buffer.from(value, 'utf8').toString('base64');
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({
        connectors: [{
          id: 'github',
          name: 'GitHub',
          provider: 'composio',
          category: 'Developer',
          status: 'connected',
          tools: [{ name: 'github.github_get_repository_content' }],
        }],
      }), { headers: { 'Content-Type': 'application/json' }, status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        error: { code: 'CONNECTOR_OUTPUT_TOO_LARGE', message: 'connector output exceeds max serialized size' },
      }), { headers: { 'Content-Type': 'application/json' }, status: 502 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        ok: true,
        output: { data: { path: 'README.md', encoding: 'base64', content: encode('# Huge Repo UI') } },
      }), { headers: { 'Content-Type': 'application/json' }, status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        error: { code: 'CONNECTOR_OUTPUT_TOO_LARGE', message: 'connector output exceeds max serialized size' },
      }), { headers: { 'Content-Type': 'application/json' }, status: 502 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        ok: true,
        output: { data: { content: [
          { path: 'package.json', type: 'file' },
          { path: 'src', type: 'dir' },
        ] } },
      }), { headers: { 'Content-Type': 'application/json' }, status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        ok: true,
        output: { data: { content: [
          { path: 'src/styles.css', type: 'file' },
        ] } },
      }), { headers: { 'Content-Type': 'application/json' }, status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        ok: true,
        output: { data: ':root { --color-brand: #ff5500; }' },
      }), { headers: { 'Content-Type': 'application/json' }, status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        ok: true,
        output: { data: '{"dependencies":{"@radix-ui/react-slot":"latest"}}' },
      }), { headers: { 'Content-Type': 'application/json' }, status: 200 }));

    const result = await runConnectorsToolCli(['github-design-context', '--repo', 'acme/huge-ui', '--max-files', '2', '--require-connector']);

    expect(result.exitCode).toBe(0);
    const stdout = JSON.parse(stdoutOutput.join(''));
    expect(stdout).toEqual(expect.objectContaining({
      ok: true,
      method: 'connector',
      warnings: expect.arrayContaining([
        expect.stringContaining('Repository metadata connector read failed'),
        expect.stringContaining('Recursive tree connector read failed'),
      ]),
    }));
    await expect(readFile(path.join(tmpDir, 'context/github/acme-huge-ui.md'), 'utf8')).resolves.toContain('Huge Repo UI');
    await expect(readFile(path.join(tmpDir, 'context/github/acme-huge-ui/files/src/styles.css'), 'utf8')).resolves.toContain('--color-brand');

    await cleanupTempDir(tmpDir);
  });

  it('uses shallow local git clone before connector-backed intake', async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'od-connectors-cli-'));
    process.chdir(tmpDir);
    process.env.OD_DAEMON_URL = 'http://127.0.0.1:7456';
    process.env.OD_TOOL_TOKEN = 'agent-run-token';

    const fakeBinDir = path.join(tmpDir, 'bin');
    await mkdir(fakeBinDir, { recursive: true });
    const fakeGitPath = path.join(fakeBinDir, 'git');
    await writeShellShim(fakeGitPath, `#!/bin/sh
for last do :; done
mkdir -p "$last/src"
mkdir -p "$last/build"
mkdir -p "$last/fonts/ubuntu"
cat > "$last/README.md" <<'EOF'
# Fallback UI
EOF
cat > "$last/package.json" <<'EOF'
{"dependencies":{"@radix-ui/react-dialog":"latest"}}
EOF
cat > "$last/src/styles.css" <<'EOF'
:root { --color-brand: #dc5b3e; --radius-md: 10px; }
EOF
printf '\\211PNG\\r\\n\\032\\n' > "$last/build/icon.png"
printf '\\211PNG\\r\\n\\032\\n' > "$last/build/logo.png"
printf 'font-data' > "$last/fonts/ubuntu/Ubuntu-Regular.ttf"
`);
    await writeCmdShim(fakeGitPath, [
      '@echo off',
      'for %%A in (%*) do set "last=%%~A"',
      'mkdir "%last%\\src"',
      'mkdir "%last%\\build"',
      'mkdir "%last%\\fonts\\ubuntu"',
      '> "%last%\\README.md" echo # Fallback UI',
      '> "%last%\\package.json" echo {"dependencies":{"@radix-ui/react-dialog":"latest"}}',
      '> "%last%\\src\\styles.css" echo :root { --color-brand: #dc5b3e; --radius-md: 10px; }',
      '> "%last%\\build\\icon.png" echo PNG',
      '> "%last%\\build\\logo.png" echo PNG',
      '> "%last%\\fonts\\ubuntu\\Ubuntu-Regular.ttf" echo font-data',
      'exit /b 0',
      '',
    ].join('\r\n'));
    process.env.PATH = `${fakeBinDir}${path.delimiter}${process.env.PATH ?? ''}`;

    const encode = (value: string) => Buffer.from(value, 'utf8').toString('base64');
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({
        connectors: [{
          id: 'github',
          name: 'GitHub',
          provider: 'composio',
          category: 'Developer',
          status: 'connected',
          tools: [{ name: 'github.github_get_repository_content' }],
        }],
      }), { headers: { 'Content-Type': 'application/json' }, status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        ok: true,
        output: { data: { default_branch: 'main', html_url: 'https://github.com/acme/rate-limited-ui' } },
      }), { headers: { 'Content-Type': 'application/json' }, status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        ok: true,
        output: { data: { path: 'README.md', encoding: 'base64', content: encode('# Connector README') } },
      }), { headers: { 'Content-Type': 'application/json' }, status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        error: { code: 'CONNECTOR_OUTPUT_TOO_LARGE', message: 'connector output exceeds max serialized size' },
      }), { headers: { 'Content-Type': 'application/json' }, status: 502 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        ok: true,
        output: { data: { content: [
          { path: 'package.json', type: 'file' },
          { path: 'src', type: 'dir' },
        ] } },
      }), { headers: { 'Content-Type': 'application/json' }, status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        ok: true,
        output: { data: { content: [
          { path: 'src/styles.css', type: 'file' },
        ] } },
      }), { headers: { 'Content-Type': 'application/json' }, status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        error: { code: 'CONNECTOR_RATE_LIMITED', message: 'connector tool rate limit exceeded' },
      }), { headers: { 'Content-Type': 'application/json' }, status: 429 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        error: { code: 'CONNECTOR_RATE_LIMITED', message: 'connector tool rate limit exceeded' },
      }), { headers: { 'Content-Type': 'application/json' }, status: 429 }));

    const result = await runConnectorsToolCli(['github-design-context', '--repo', 'acme/rate-limited-ui', '--max-files', '6', '--require-connector']);

    expect(result.exitCode).toBe(0);
    const stdout = JSON.parse(stdoutOutput.join(''));
    expect(stdout).toEqual(expect.objectContaining({
      ok: true,
      method: 'git-clone',
      localCloneMethod: 'git',
      snapshotFiles: expect.arrayContaining([
        'context/github/acme-rate-limited-ui/files/package.json',
        'context/github/acme-rate-limited-ui/files/build/icon.png',
        'context/github/acme-rate-limited-ui/files/build/logo.png',
        'context/github/acme-rate-limited-ui/files/fonts/ubuntu/Ubuntu-Regular.ttf',
        'context/github/acme-rate-limited-ui/files/src/styles.css',
      ]),
      warnings: [],
    }));
    const evidenceNote = await readFile(path.join(tmpDir, 'context/github/acme-rate-limited-ui.md'), 'utf8');
    expect(evidenceNote).toContain('This-device intake was used through local git or GitHub CLI.');
    expect(evidenceNote).toContain('Source Evidence Inventory');
    expect(evidenceNote).toContain('Brand assets and icons');
    expect(evidenceNote).toContain('root `build/` with their original filenames');
    expect(evidenceNote).toContain('Fonts');
    expect(evidenceNote).toContain('Binary Assets Preserved');
    expect(evidenceNote).toContain('build/icon.png');
    expect(evidenceNote).toContain('Claude Design-style package');
    expect(evidenceNote).toContain('context/.../files/build/icon.png` -> `build/icon.png`');
    await expect(readFile(path.join(tmpDir, 'context/github/acme-rate-limited-ui/files/src/styles.css'), 'utf8')).resolves.toContain('--color-brand');
    const iconBytes = await readFile(path.join(tmpDir, 'context/github/acme-rate-limited-ui/files/build/icon.png'));
    expect(iconBytes.length).toBeGreaterThan(0);
    const fontBytes = await readFile(path.join(tmpDir, 'context/github/acme-rate-limited-ui/files/fonts/ubuntu/Ubuntu-Regular.ttf'));
    expect(fontBytes.length).toBeGreaterThan(0);

    await cleanupTempDir(tmpDir);
  });

  it('uses GitHub CLI authenticated clone before connector fallback', async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'od-connectors-cli-'));
    process.chdir(tmpDir);
    process.env.OD_DAEMON_URL = 'http://127.0.0.1:7456';
    process.env.OD_TOOL_TOKEN = 'agent-run-token';

    const fakeBinDir = path.join(tmpDir, 'bin');
    await mkdir(fakeBinDir, { recursive: true });
    const fakeGitPath = path.join(fakeBinDir, 'git');
    await writeShellShim(fakeGitPath, `#!/bin/sh
echo "fatal: could not read Username for 'https://github.com': terminal prompts disabled" >&2
exit 128
`);
    await writeCmdShim(fakeGitPath, "@echo off\r\necho fatal: could not read Username for 'https://github.com': terminal prompts disabled 1>&2\r\nexit /b 128\r\n");
    const fakeGhPath = path.join(fakeBinDir, 'gh');
    await writeShellShim(fakeGhPath, `#!/bin/sh
if [ "$1" = "--version" ]; then
  echo "gh version 2.0.0"
  exit 0
fi
if [ "$1" = "auth" ] && [ "$2" = "status" ]; then
  echo "Logged in to github.com account qiongyu" >&2
  exit 0
fi
if [ "$1" = "repo" ] && [ "$2" = "clone" ]; then
  dest="$4"
  mkdir -p "$dest/src"
  cat > "$dest/README.md" <<'EOF'
# Private UI
EOF
  cat > "$dest/package.json" <<'EOF'
{"dependencies":{"@radix-ui/react-tabs":"latest"}}
EOF
  cat > "$dest/src/theme.css" <<'EOF'
:root { --color-brand: #f15a24; --space-md: 16px; }
EOF
  exit 0
fi
echo "unexpected gh args: $*" >&2
exit 1
`);
    await writeCmdShim(fakeGhPath, [
      '@echo off',
      'if "%~1"=="--version" echo gh version 2.0.0& exit /b 0',
      'if "%~1"=="auth" if "%~2"=="status" echo Logged in to github.com account qiongyu 1>&2& exit /b 0',
      'if "%~1"=="repo" if "%~2"=="clone" (',
      '  mkdir "%~4\\src"',
      '  > "%~4\\README.md" echo # Private UI',
      '  > "%~4\\package.json" echo {"dependencies":{"@radix-ui/react-tabs":"latest"}}',
      '  > "%~4\\src\\theme.css" echo :root { --color-brand: #f15a24; --space-md: 16px; }',
      '  exit /b 0',
      ')',
      'echo unexpected gh args: %* 1>&2',
      'exit /b 1',
      '',
    ].join('\r\n'));
    process.env.PATH = `${fakeBinDir}${path.delimiter}${process.env.PATH ?? ''}`;

    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({
        connectors: [{
          id: 'github',
          name: 'GitHub',
          provider: 'composio',
          category: 'Developer',
          status: 'connected',
        }],
      }), { headers: { 'Content-Type': 'application/json' }, status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        error: { message: 'repository access denied' },
      }), { headers: { 'Content-Type': 'application/json' }, status: 403 }));

    const result = await runConnectorsToolCli(['github-design-context', '--repo', 'acme/private-ui', '--require-connector']);

    expect(result.exitCode).toBe(0);
    const stdout = JSON.parse(stdoutOutput.join(''));
    expect(stdout).toEqual(expect.objectContaining({
      ok: true,
      method: 'git-clone',
      localCloneMethod: 'gh-cli',
      snapshotFiles: expect.arrayContaining([
        'context/github/acme-private-ui/files/package.json',
        'context/github/acme-private-ui/files/src/theme.css',
      ]),
      warnings: expect.arrayContaining([
        expect.stringContaining('GitHub CLI clone'),
      ]),
    }));
    await expect(readFile(path.join(tmpDir, 'context/github/acme-private-ui.md'), 'utf8')).resolves.toContain('GitHub CLI authenticated clone');
    await expect(readFile(path.join(tmpDir, 'context/github/acme-private-ui.md'), 'utf8')).resolves.toContain('This-device intake was used through local git or GitHub CLI.');
    await expect(readFile(path.join(tmpDir, 'context/github/acme-private-ui/files/src/theme.css'), 'utf8')).resolves.toContain('--color-brand');
    expect(fetchMock).not.toHaveBeenCalled();

    await cleanupTempDir(tmpDir);
  });

  it('reports GitHub CLI login when connector and local clone cannot read a repository', async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'od-connectors-cli-'));
    process.chdir(tmpDir);
    process.env.OD_DAEMON_URL = 'http://127.0.0.1:7456';
    process.env.OD_TOOL_TOKEN = 'agent-run-token';

    const fakeBinDir = path.join(tmpDir, 'bin');
    await mkdir(fakeBinDir, { recursive: true });
    const fakeGitPath = path.join(fakeBinDir, 'git');
    await writeShellShim(fakeGitPath, `#!/bin/sh
echo "fatal: repository not found" >&2
exit 128
`);
    await writeCmdShim(fakeGitPath, '@echo off\r\necho fatal: repository not found 1>&2\r\nexit /b 128\r\n');
    const fakeGhPath = path.join(fakeBinDir, 'gh');
    await writeShellShim(fakeGhPath, `#!/bin/sh
if [ "$1" = "--version" ]; then
  echo "gh version 2.0.0"
  exit 0
fi
if [ "$1" = "auth" ] && [ "$2" = "status" ]; then
  echo "You are not logged into any GitHub hosts" >&2
  exit 1
fi
echo "unexpected gh args: $*" >&2
exit 1
`);
    await writeCmdShim(fakeGhPath, [
      '@echo off',
      'if "%~1"=="--version" echo gh version 2.0.0& exit /b 0',
      'if "%~1"=="auth" if "%~2"=="status" echo You are not logged into any GitHub hosts 1>&2& exit /b 1',
      'echo unexpected gh args: %* 1>&2',
      'exit /b 1',
      '',
    ].join('\r\n'));
    process.env.PATH = `${fakeBinDir}${path.delimiter}${process.env.PATH ?? ''}`;

    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({
        connectors: [{
          id: 'github',
          name: 'GitHub',
          provider: 'composio',
          category: 'Developer',
          status: 'connected',
        }],
      }), { headers: { 'Content-Type': 'application/json' }, status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        error: { message: 'repository access denied' },
      }), { headers: { 'Content-Type': 'application/json' }, status: 403 }));

    const result = await runConnectorsToolCli(['github-design-context', '--repo', 'acme/private-ui', '--require-connector']);

    expect(result.exitCode).toBe(1);
    expect(stderrOutput.join('')).toContain('Required GitHub repository intake could not read the repository through git, GitHub CLI, or connector');
    expect(stderrOutput.join('')).toContain('gh auth login --web');
    await expect(readFile(path.join(tmpDir, 'context/github/acme-private-ui.md'), 'utf8')).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await cleanupTempDir(tmpDir);
  });
});