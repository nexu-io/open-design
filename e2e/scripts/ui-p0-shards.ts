import { spawn } from 'node:child_process';

type Shard = {
  grep: string;
  files: string[];
};

const shards: Record<string, Shard> = {
  smoke: {
    grep: String.raw`\[P0\]`,
    files: ['ui/critical-smoke.test.ts'],
  },
  'settings-smoke': {
    grep: String.raw`\[P0\].*settings dialog`,
    files: ['ui/critical-smoke.test.ts'],
  },
  'entry-onboarding': {
    grep: String.raw`\[P0\]`,
    files: [
      'ui/entry-chrome-flows.test.ts',
      'ui/entry-configuration-flows.test.ts',
      'ui/amr-onboarding.test.ts',
      'ui/api-empty-response.test.ts',
    ],
  },
  'project-workspace': {
    grep: String.raw`\[P0\]`,
    files: [
      'ui/app.test.ts',
      'ui/app-design-files.test.ts',
      'ui/app-manual-edit.test.ts',
      'ui/project-management-flows.test.ts',
      'ui/workspace-keyboard-flows.test.ts',
    ],
  },
  'workspace-restoration': {
    grep: String.raw`\[P0\]`,
    files: ['ui/app-restoration.test.ts'],
  },
  'runtime-recovery': {
    grep: String.raw`\[P0\]`,
    files: [
      'ui/real-daemon-run.test.ts',
      'ui/amr-run-failure-recovery.test.ts',
      'ui/amr-logout-requires-relogin.test.ts',
      'ui/settings-local-cli-codex-fallback.test.ts',
    ],
  },
  'settings-connectors': {
    grep: String.raw`\[P0\]`,
    files: [
      'ui/settings-api-protocol.test.ts',
      'ui/settings-connectors-auth-happy-path.test.ts',
      'ui/settings-connectors-auth-recovery.test.ts',
    ],
  },
};

const commandName = process.argv[2] ?? 'help';

if (commandName === 'help') {
  printUsage();
} else if (commandName === 'list') {
  console.log(Object.keys(shards).join('\n'));
} else {
  const shard = shards[commandName];
  if (shard == null) {
    console.error(`Unknown UI P0 shard: ${commandName}`);
    printUsage();
    process.exitCode = 1;
  } else {
    await runPlaywright(shard);
  }
}

async function runPlaywright(shard: Shard): Promise<void> {
  const args = ['test', '-c', 'playwright.config.ts', ...shard.files, '--grep', shard.grep];
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
  console.log(`Usage: tsx scripts/ui-p0-shards.ts <shard>

Shards:
${Object.keys(shards)
  .map((name) => `  ${name}`)
  .join('\n')}

Commands:
  list    Print shard names
  help    Show this help
`);
}
