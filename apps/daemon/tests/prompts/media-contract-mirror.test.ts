import { spawn, spawnSync } from 'node:child_process';
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { composeSystemPrompt as composeByokSystemPrompt } from '@open-design/contracts';
import { describe, expect, it } from 'vitest';
import { MEDIA_GENERATION_CONTRACT as daemonGenerationContract } from '../../src/prompts/media-contract.js';

// `MEDIA_USER_REPLY_CONTRACT` exists twice: the daemon owns the copy that
// composeSystemPrompt actually renders, and packages/contracts carries an
// identical one. Nothing imports the contracts copy today, which is precisely
// what makes the duplication dangerous — editing it looks like changing
// behaviour and changes nothing.
//
// That already happened: the three-outcome refusal wording was added to the
// contracts copy alone, so the primary agent flow kept describing a
// content-safety refusal as a temporary outage. This test is the cheap guard
// against a repeat. Delete it only by deleting one of the two copies.

function templateBody(path: string): string {
  const source = readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8');
  const marker = 'export const MEDIA_USER_REPLY_CONTRACT = `';
  const start = source.indexOf(marker);
  if (start < 0) throw new Error(`MEDIA_USER_REPLY_CONTRACT not found in ${path}`);
  let index = start + marker.length;
  // Scan for the terminating backtick, skipping escaped ones -- the body
  // itself contains \` around inline code, so a naive search truncates it.
  while (index < source.length) {
    if (source[index] === '\\') {
      index += 2;
      continue;
    }
    if (source[index] === '`') return source.slice(start + marker.length, index);
    index += 1;
  }
  throw new Error(`unterminated template literal in ${path}`);
}

describe('MEDIA_USER_REPLY_CONTRACT mirrors', () => {
  const daemonBody = templateBody('../../src/prompts/media-contract.ts');
  const contractsBody = templateBody(
    '../../../../packages/contracts/src/prompts/media-contract.ts',
  );

  it('keeps the daemon copy and the contracts copy identical', () => {
    expect(daemonBody).toBe(contractsBody);
  });

  it('carries safe English and Simplified Chinese failure categories', () => {
    const normalized = daemonBody.replace(/\s+/g, ' ');
    expect(daemonBody).toContain('图片已生成');
    expect(daemonBody).toContain('图片未生成：内容安全策略拒绝了该请求');
    expect(daemonBody).toContain('MEDIA_EXECUTION_DISABLED');
    expect(daemonBody).toContain('本次任务未启用图片生成');
    expect(daemonBody).toContain('STUB_PROVIDER_DISABLED');
    expect(daemonBody).toContain('所选图片模型未配置可用的生成器');
    expect(daemonBody).toContain('MEDIA_DISPATCHER_UNREACHABLE');
    expect(daemonBody).toContain('无法连接本地媒体生成调度器');
    expect(daemonBody).toContain('MEDIA_DISPATCH_NOT_INVOKED');
    expect(daemonBody).toContain('未调用媒体生成调度器');
    expect(daemonBody).toContain('MEDIA_DISPATCH_FAILED');
    expect(daemonBody).toContain('媒体生成调度失败，原因未分类');
    expect(normalized).toContain('Media generation was disabled for this run');
    expect(normalized).toContain('The selected image model has no configured renderer');
    expect(normalized).toContain('The local media dispatcher could not be reached');
    expect(normalized).toContain('The media dispatcher was not invoked');
    expect(normalized).toContain('The media dispatcher failed for an unclassified reason');
    expect(daemonBody).toContain('safety_rejection');
    expect(daemonBody).toContain('错误代码：\\`MEDIA_EXECUTION_DISABLED\\`');
    expect(daemonBody).toContain('错误代码：\\`{code}\\`');
    expect(normalized).toContain('structured dispatcher or provider error');
    expect(daemonBody).not.toContain('图片生成服务暂时不可用');
  });

  it('carries the Windows PowerShell process invocation for media generate and media wait', () => {
    expect(contractsBody).not.toContain('& $env:OD_NODE_BIN $env:OD_BIN media generate');
  });
});

function extractPowershellBlocks(contractBody: string): string[] {
  const re = /```powershell\r?\n([\s\S]*?)```/g;
  const blocks: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(contractBody)) !== null) {
    const block = m[1];
    if (block !== undefined) blocks.push(block);
  }
  return blocks;
}

const renderedContracts = [
  { name: 'daemon', body: daemonGenerationContract },
  { name: 'BYOK', body: composeByokSystemPrompt({ skillMode: 'image' }) },
] as const;

function workflowBlock(contract: string): string {
  const block = extractPowershellBlocks(contract).find((candidate) =>
    candidate.includes('function Invoke-OdMedia'),
  );
  if (!block) throw new Error('PowerShell generate/wait workflow block not found');
  return block;
}

function findWindowsPowerShellExecutables(): string[] {
  if (process.platform !== 'win32') return [];
  const candidates = ['powershell.exe', 'pwsh.exe'];
  return candidates.filter((candidate) => {
    const probe = spawnSync(candidate, [
      '-NoLogo',
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      'exit 0',
    ]);
    return probe.status === 0;
  });
}

const powerShellExecutables = findWindowsPowerShellExecutables();
const prompt = [
  'Warm "studio" portrait with soft window light and deliberate negative space.',
  'Keep this multiline text intact: café, 東京, $literal, `backtick`, & | < > ; ().',
  'Preserve quotes and backslashes exactly: "glass" C:\\references\\final\\',
  "'@",
  '[IO.File]::WriteAllText($env:OD_TEST_SIDE_EFFECT, "executed")',
  "$prompt = @'",
  'Use a restrained palette, realistic skin texture, and a long editorial composition.',
  'Repeat this deterministic long-form direction without truncation: foreground texture, midground subject separation, background falloff, restrained highlights, and natural shadow detail.\n'.repeat(
    64,
  ),
].join('\n');
const projectId = 'project with "quoted" spaces and trailing\\';
const outputFileName = 'résumé-東京.png';
const diagnosticMarker = 'progress café 東京';

const stubSource = String.raw`
const fs = require('node:fs');
const path = require('node:path');

const args = process.argv.slice(2);
const promptIndex = args.indexOf('--prompt-file');
const promptPath = promptIndex >= 0 ? args[promptIndex + 1] : undefined;
const entry = {
  argv: args,
  promptPath,
  prompt: promptPath ? fs.readFileSync(promptPath, 'utf8') : undefined,
};
fs.appendFileSync(process.env.OD_STUB_LOG, JSON.stringify(entry) + '\n');
process.stderr.write(process.env.OD_STUB_RUN_ID + ':' + args[1] + '\n');

const delayUntil = Date.now() + 150;
while (Date.now() < delayUntil) {
  // Keep redirected streams open long enough for concurrent fixture runs to overlap.
}
process.stdout.write('s'.repeat(80 * 1024) + '\n');
process.stderr.write('progress café 東京 ' + 'e'.repeat(80 * 1024) + '\n');

if (args[0] !== 'media') {
  process.stderr.write('expected media command\n');
  process.exitCode = 9;
} else if (args[1] === 'generate') {
  if (process.env.OD_STUB_MODE === 'immediate') {
    process.stdout.write(JSON.stringify({ file: { name: 'résumé-東京.png', kind: 'image' } }) + '\n');
  } else {
    process.stdout.write(JSON.stringify({ taskId: process.env.OD_STUB_RUN_ID + '-task', nextSince: 1 }) + '\n');
  }
} else if (args[1] === 'wait') {
  const statePath = path.join(process.env.OD_STUB_STATE_DIR, process.env.OD_STUB_RUN_ID + '.txt');
  const count = fs.existsSync(statePath) ? Number(fs.readFileSync(statePath, 'utf8')) + 1 : 1;
  fs.writeFileSync(statePath, String(count));
  if (count === 1) {
    process.stdout.write(JSON.stringify({ taskId: args[2], status: 'running', nextSince: 2 }) + '\n');
    process.exitCode = 2;
  } else {
    process.stdout.write(JSON.stringify({ file: { name: 'résumé-東京.png', kind: 'image' } }) + '\n');
  }
} else {
  process.stderr.write('unexpected media subcommand\n');
  process.exitCode = 9;
}
`;

interface StubInvocation {
  argv: string[];
  promptPath?: string;
  prompt?: string;
}

interface PowerShellResult {
  contract: string;
  powerShell: string;
  mode: 'immediate' | 'queued';
  runId: string;
  status: number | null;
  stdout: string;
  stderr: string;
  invocations: StubInvocation[];
}

function instrumentedScript(block: string): string {
  const executableBlock = block.replace(
    '$promptBase64 = "<base64-encoded UTF-8 full prompt>"',
    '$promptBase64 = $env:OD_TEST_PROMPT_BASE64',
  );
  if (executableBlock === block) throw new Error('prompt placeholder not found');

  return executableBlock;
}

function executePowerShellExample(options: {
  contract: string;
  block: string;
  powerShell: string;
  mode: 'immediate' | 'queued';
  root: string;
  runtimePath: string;
  stubPath: string;
  runId: string;
}): Promise<PowerShellResult> {
  const scriptPath = join(options.root, `${options.runId}.ps1`);
  const logPath = join(options.root, `${options.runId}.ndjson`);
  writeFileSync(scriptPath, instrumentedScript(options.block), 'utf8');

  return new Promise((resolve, reject) => {
    const child = spawn(
      options.powerShell,
      [
        '-NoLogo',
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        scriptPath,
      ],
      {
        env: {
          ...process.env,
          TEMP: options.root,
          TMP: options.root,
          OD_NODE_BIN: options.runtimePath,
          OD_BIN: options.stubPath,
          OD_PROJECT_ID: projectId,
          OD_TEST_PROMPT_BASE64: Buffer.from(prompt, 'utf8').toString('base64'),
          OD_TEST_SIDE_EFFECT: join(options.root, 'prompt-injection-side-effect.txt'),
          OD_STUB_MODE: options.mode,
          OD_STUB_RUN_ID: options.runId,
          OD_STUB_LOG: logPath,
          OD_STUB_STATE_DIR: options.root,
        },
        windowsHide: true,
      },
    );
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk;
    });
    child.on('error', reject);
    child.on('close', (status) => {
      const invocations = existsSync(logPath)
        ? readFileSync(logPath, 'utf8')
            .trim()
            .split(/\r?\n/)
            .filter(Boolean)
            .map((line) => JSON.parse(line) as StubInvocation)
        : [];
      resolve({
        contract: options.contract,
        powerShell: options.powerShell,
        mode: options.mode,
        runId: options.runId,
        status,
        stdout,
        stderr,
        invocations,
      });
    });
  });
}

describe('MEDIA_GENERATION_CONTRACT Windows PowerShell guidance', () => {
  it('keeps the executable generate/wait workflow identical in both rendered contracts', () => {
    const blocks = renderedContracts.map(({ body }) => workflowBlock(body));
    expect(prompt.length).toBeGreaterThan(8_000);
    expect(blocks[0]).toBe(blocks[1]);
    expect(blocks[0]).toContain('--prompt-file');
    expect(blocks[0]).toContain('ConvertTo-OdProcessArgument');
    expect(blocks[0]).toContain('$PSBoundParameters.ContainsKey("Prompt")');
    expect(blocks[0]).not.toContain('$null -ne $Prompt');
    expect(blocks[0]).toContain(
      '$promptBase64 = "<base64-encoded UTF-8 full prompt>"',
    );
    expect(blocks[0]).toContain('[Convert]::FromBase64String($promptBase64)');
    expect(blocks[0]).not.toContain("$prompt = @'");
    expect(blocks[0]).toContain('[guid]::NewGuid()');
    expect(blocks[0]).toContain('New-Object System.Diagnostics.ProcessStartInfo');
    expect(blocks[0]).toContain('$startInfo.Arguments = $arguments');
    expect(blocks[0]).toContain('$startInfo.RedirectStandardOutput = $true');
    expect(blocks[0]).toContain('$startInfo.RedirectStandardError = $true');
    expect(blocks[0]).toContain('$startInfo.StandardOutputEncoding = [Text.UTF8Encoding]::new($false)');
    expect(blocks[0]).toContain('$startInfo.StandardErrorEncoding = [Text.UTF8Encoding]::new($false)');
    expect(blocks[0]).toContain('$p.StandardOutput.ReadToEndAsync()');
    expect(blocks[0]).toContain('$p.StandardError.ReadToEndAsync()');
    expect(blocks[0]).toContain(
      '$diagnosticBytes = [Text.UTF8Encoding]::new($false).GetBytes($diagnostics)',
    );
    expect(blocks[0]).toContain('$standardError = [Console]::OpenStandardError()');
    expect(blocks[0]).toContain(
      '$standardError.Write($diagnosticBytes, 0, $diagnosticBytes.Length)',
    );
    expect(blocks[0]).toContain('$standardError.Flush()');
    expect(blocks[0]).not.toContain('[Console]::Error.Write($diagnostics)');
    expect(blocks[0]).toContain('[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)');
    expect(blocks[0]).toContain('[Console]::Out.WriteLine($finalResult)');
    expect(blocks[0]).toContain('[Console]::OutputEncoding = $previousOutputEncoding');
    expect(blocks[0]).toContain('$p.WaitForExit()');
    expect(blocks[0]).toContain('$p.Dispose()');
    expect(blocks[0]).not.toContain('Start-Process');
    expect(blocks[0]).toMatch(/try \{[\s\S]*finally \{/);
    expect(prompt).toContain("\n'@\n");
    for (const block of blocks) {
      expect(instrumentedScript(block)).toContain(
        '$promptBase64 = $env:OD_TEST_PROMPT_BASE64',
      );
    }
  });

  it.skipIf(process.platform !== 'win32')(
    'executes immediate and queued workflows in Windows PowerShell and pwsh',
    async () => {
      expect(powerShellExecutables).toEqual(['powershell.exe', 'pwsh.exe']);
      const root = mkdtempSync(join(tmpdir(), 'open design [media] contract '));
      const runtimePath = join(root, 'stub node runtime with spaces.exe');
      const stubPath = join(root, 'stub runtime with spaces.cjs');
      copyFileSync(process.execPath, runtimePath);
      if (process.platform !== 'win32') chmodSync(runtimePath, 0o755);
      writeFileSync(stubPath, stubSource, 'utf8');
      try {
        const runs = powerShellExecutables.flatMap((powerShell) =>
          renderedContracts.flatMap(({ name, body }) =>
            (['immediate', 'queued'] as const).map((mode) => ({
              contract: name,
              block: workflowBlock(body),
              powerShell,
              mode,
              root,
              runtimePath,
              stubPath,
              runId: `${powerShell === 'powershell.exe' ? 'windows-powershell' : 'pwsh'}-${name.toLowerCase()}-${mode}`,
            })),
          ),
        );
        const results = await Promise.all(runs.map(executePowerShellExample));
        const promptPaths = new Set<string>();

        for (const result of results) {
          const context =
            `${result.powerShell}/${result.contract}/${result.mode}: ` +
            `stdout=${JSON.stringify(result.stdout)}, ` +
            `stderrPrefix=${JSON.stringify(result.stderr.slice(0, 256))}, ` +
            `stderrLength=${result.stderr.length}`;
          expect(result.status, context).toBe(0);
          expect(result.stdout.trim(), context).not.toBe('');
          let finalResult: unknown;
          try {
            finalResult = JSON.parse(result.stdout.trim());
          } catch (error) {
            throw new Error(`${context}: ${String(error)}`);
          }
          expect(finalResult, context).toEqual({
            file: { name: outputFileName, kind: 'image' },
          });
          expect(result.stderr, context).toContain(diagnosticMarker);
          expect(Buffer.byteLength(result.stderr, 'utf8'), context).toBeGreaterThan(
            64 * 1024 * result.invocations.length,
          );
          expect(
            result.stderr
              .trim()
              .split(/\r?\n/)
              .filter((line) => line.startsWith(`${result.runId}:`)),
          ).toEqual(
            result.mode === 'immediate'
              ? [`${result.runId}:generate`]
              : [
                  `${result.runId}:generate`,
                  `${result.runId}:wait`,
                  `${result.runId}:wait`,
                ],
          );

          const generate = result.invocations[0];
          expect(generate?.argv).toEqual([
            'media',
            'generate',
            '--project',
            projectId,
            '--surface',
            'image',
            '--model',
            'gpt-image-2',
            '--output',
            'output.png',
            '--prompt-file',
            generate?.promptPath,
          ]);
          expect(generate?.prompt).toBe(prompt);
          expect(generate?.promptPath).toEqual(expect.any(String));
          expect(promptPaths.has(generate!.promptPath!)).toBe(false);
          promptPaths.add(generate!.promptPath!);
          expect(generate?.promptPath && existsSync(generate.promptPath)).toBe(false);
          expect(generate?.promptPath && existsSync(dirname(generate.promptPath))).toBe(false);

          if (result.mode === 'immediate') {
            expect(result.invocations).toHaveLength(1);
          } else {
            expect(result.invocations.map(({ argv }) => argv)).toEqual([
              generate?.argv,
              ['media', 'wait', `${result.runId}-task`, '--since', '1'],
              ['media', 'wait', `${result.runId}-task`, '--since', '2'],
            ]);
          }
        }

        expect(readdirSync(root).some((name) => name.startsWith('od-media-'))).toBe(false);
        expect(existsSync(join(root, 'prompt-injection-side-effect.txt'))).toBe(false);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    },
  );
});
