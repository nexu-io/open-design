import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const e2eDir = path.resolve(scriptDir, '..');
const uiDir = path.join(e2eDir, 'ui');

type Command = () => Promise<void>;

const commands: Record<string, Command> = {
  clean: cleanArtifacts,
  help: async () => printUsage(),
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
    path.join(uiDir, 'reports', 'html'),
    path.join(uiDir, 'reports', 'playwright-html-report'),
    path.join(uiDir, 'reports', 'results.json'),
    path.join(uiDir, 'reports', 'junit.xml'),
    path.join(uiDir, '.DS_Store'),
  ];

  await Promise.all(targets.map((target) => rm(target, { recursive: true, force: true })));
  await mkdir(path.join(uiDir, 'reports', 'test-results'), { recursive: true });
  await mkdir(path.join(uiDir, '.od-data'), { recursive: true });

  console.log('Cleaned e2e UI Playwright artifacts.');
}

function printUsage(): void {
  console.log(`Usage: tsx scripts/playwright.ts <command>

Commands:
  clean    Remove e2e UI Playwright runtime data and reports
  help     Show this help
`);
}
