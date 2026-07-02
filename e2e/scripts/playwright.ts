import { spawn } from 'node:child_process';
import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { getUiP0Group, listUiP0GroupNames, uiP0Groups } from '../lib/playwright/suites.ts';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const e2eDir = path.resolve(scriptDir, '..');
const uiDir = path.join(e2eDir, 'ui');

type Command = () => Promise<void>;

const commands: Record<string, Command> = {
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
  clean                   Remove e2e UI Playwright runtime data and reports
  list-ui-groups [--json] List named UI P0 groups
  run-ui-group <name>     Run a named UI P0 group
  help                    Show this help
`);
}
