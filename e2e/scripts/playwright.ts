import { spawn } from 'node:child_process';
import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { chromium } from '@playwright/test';

import { auditDeckLayout } from '../lib/playwright/deck-layout-audit.ts';
import { getUiP0Group, listUiP0GroupNames, uiP0Groups } from '../lib/playwright/suites.ts';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const e2eDir = path.resolve(scriptDir, '..');
const uiDir = path.join(e2eDir, 'ui');

type Command = () => Promise<void>;

const commands: Record<string, Command> = {
  'audit-deck-layout': auditDeckLayoutCommand,
  clean: cleanArtifacts,
  help: async () => printUsage(),
  'list-ui-groups': listUiGroups,
  'run-ui-group': runUiGroup,
};

const commandName = process.argv[2] ?? 'help';
const command = commands[commandName];

if (command == null) {
  console.error(`Unknown e2e Playwright helper command: ${commandName}`);
  printUsage();
  process.exitCode = 1;
} else {
  await command();
}

async function cleanArtifacts(): Promise<void> {
  const targets = [
    path.join(uiDir, '.od-data'),
    path.join(uiDir, 'test-results'),
    path.join(uiDir, 'reports', 'test-results'),
    path.join(uiDir, 'reports', 'visual-test-results'),
    path.join(uiDir, 'reports', 'html'),
    path.join(uiDir, 'reports', 'playwright-html-report'),
    path.join(uiDir, 'reports', 'results.json'),
    path.join(uiDir, 'reports', 'visual-results.json'),
    path.join(uiDir, 'reports', 'visual-screenshots'),
    path.join(uiDir, 'reports', 'visual-report'),
    path.join(uiDir, 'reports', 'junit.xml'),
    path.join(uiDir, '.DS_Store'),
  ];

  await Promise.all(targets.map((target) => rm(target, { recursive: true, force: true })));
  await mkdir(path.join(uiDir, 'reports', 'test-results'), { recursive: true });
  await mkdir(path.join(uiDir, '.od-data'), { recursive: true });

  console.log('Cleaned e2e UI Playwright artifacts.');
}

async function auditDeckLayoutCommand(): Promise<void> {
  let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null;
  try {
    const options = parseDeckLayoutAuditArgs(process.argv.slice(3));
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({
      deviceScaleFactor: 1,
      viewport: { width: 1920, height: 1080 },
    });
    await page.goto(pathToFileURL(options.artifactPath).href, {
      waitUntil: 'domcontentloaded',
    });

    const report = await auditDeckLayout(page, options);
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = report.summary.passed ? 0 : 1;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(
      JSON.stringify(
        {
          error: 'deck-layout-audit-infrastructure-failure',
          message,
        },
        null,
        2,
      ),
    );
    process.exitCode = 2;
  } finally {
    await browser?.close();
  }
}

function parseDeckLayoutAuditArgs(args: string[]): {
  artifactPath: string;
  outputDir: string;
  slideIndex?: number;
  slideLabel?: string;
} {
  const artifactPath = args[0];
  if (artifactPath == null || artifactPath.startsWith('--')) {
    throw new Error('Missing deck HTML path.');
  }

  let outputDir: string | undefined;
  let slideIndex: number | undefined;
  let slideLabel: string | undefined;

  for (let index = 1; index < args.length; index += 1) {
    const flag = args[index];
    const value = args[index + 1];
    if (flag == null || !flag.startsWith('--')) {
      throw new Error(`Unexpected positional argument: ${flag ?? ''}`);
    }
    if (value == null || value.startsWith('--')) {
      throw new Error(`Missing value for ${flag}.`);
    }

    if (flag === '--out') {
      outputDir = value;
    } else if (flag === '--slide-index') {
      const parsed = Number(value);
      if (!Number.isInteger(parsed) || parsed < 1) {
        throw new Error('--slide-index must be a positive 1-based integer.');
      }
      slideIndex = parsed;
    } else if (flag === '--slide-label') {
      if (value.length === 0) {
        throw new Error('--slide-label must not be empty.');
      }
      slideLabel = value;
    } else {
      throw new Error(`Unknown audit-deck-layout option: ${flag}`);
    }
    index += 1;
  }

  if (outputDir == null) {
    throw new Error('Missing required --out <directory>.');
  }

  return {
    artifactPath: path.resolve(artifactPath),
    outputDir: path.resolve(outputDir),
    ...(slideIndex == null ? {} : { slideIndex }),
    ...(slideLabel == null ? {} : { slideLabel }),
  };
}

async function listUiGroups(): Promise<void> {
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(uiP0Groups, null, 2));
    return;
  }

  console.log(listUiP0GroupNames().join('\n'));
}

async function runUiGroup(): Promise<void> {
  const groupName = process.argv[3];
  if (groupName == null || groupName.length === 0) {
    console.error('Missing UI group name.');
    printUsage();
    process.exitCode = 1;
    return;
  }

  const group = getUiP0Group(groupName);
  if (group == null) {
    console.error(`Unknown UI group: ${groupName}`);
    printUsage();
    process.exitCode = 1;
    return;
  }

  const args = ['test', '-c', 'playwright.config.ts', ...group.files, '--grep', group.grep];
  if (group.workers != null) {
    args.push(`--workers=${group.workers}`);
  }
  const child = spawn('playwright', args, {
    env: group.fullyParallel
      ? { ...process.env, OD_PLAYWRIGHT_FULLY_PARALLEL: '1' }
      : process.env,
    stdio: 'inherit',
    shell: false,
  });

  const exitCode = await new Promise<number | null>((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code) => resolve(code));
  });
  process.exitCode = exitCode ?? 1;
}

function printUsage(): void {
  console.log(`Usage: tsx scripts/playwright.ts <command>

Commands:
  audit-deck-layout <html> --out <dir> [--slide-index N] [--slide-label <label>]
                          Audit every slide on the canonical 1920×1080 canvas.
                          --slide-index is 1-based; selectors add screenshots
                          without narrowing the full-deck audit.
  clean                   Remove e2e UI Playwright runtime data and reports
  list-ui-groups [--json] List named UI P0 groups
  run-ui-group <name>     Run a named UI P0 group
  help                    Show this help
`);
}
