// Role: CLI integration tests for od braze brief subcommand.
// Key Features: brief 마크다운 POST, briefPath 출력, --json 출력, 오류 처리
// Dependencies: node:http (mock server), node:child_process (subprocess), cli.ts (entry)
// Notes: runBraze는 cli.ts에서 export되지 않으므로 subprocess + 로컬 HTTP mock 서버 패턴 사용.
//        (cli-startup.test.ts와 동일 패턴). stdin 전달은 spawn + stdin.end() 패턴 사용
//        — promisify(execFile)의 input 옵션은 Node 24 ESM에서 EOF 전달이 불안정함.
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const daemonRoot = fileURLToPath(new URL('..', import.meta.url));
const cliEntry = fileURLToPath(new URL('../src/cli.ts', import.meta.url));

// mock HTTP 서버를 띄워서 지정 응답을 반환하는 헬퍼
async function withMockServer(
  handler: (req: http.IncomingMessage, res: http.ServerResponse) => void,
  fn: (daemonUrl: string) => Promise<void>,
) {
  const server = http.createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  const daemonUrl = `http://127.0.0.1:${port}`;
  try {
    await fn(daemonUrl);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

// CLI 서브프로세스를 tsx로 실행해 stdout/stderr 반환.
// spawn을 직접 사용해 stdin.end()로 명시적 EOF를 보냄 — promisify(execFile)+input 옵션은
// Node 24 ESM 컨텍스트에서 EOF 전달이 불안정해 stdin 읽기 서브커맨드가 hang됨.
async function runCli(
  args: string[],
  opts: { stdinData?: string; env?: NodeJS.ProcessEnv } = {},
): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    const child = spawn(
      process.execPath,
      ['--import', 'tsx', cliEntry, ...args],
      {
        cwd: daemonRoot,
        env: { ...process.env, ...opts.env },
        stdio: ['pipe', 'pipe', 'pipe'],
      },
    );

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString('utf8'); });
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString('utf8'); });

    // stdin 데이터를 쓰고 즉시 닫아 EOF 전달
    if (opts.stdinData != null) {
      child.stdin.write(opts.stdinData, 'utf8', () => {
        child.stdin.end();
      });
    } else {
      child.stdin.end();
    }

    child.on('close', (code) => {
      resolve({ stdout, stderr, code: code ?? 1 });
    });
    child.on('error', (err) => {
      resolve({ stdout, stderr: stderr + err.message, code: 1 });
    });
  });
}

describe('od braze brief', () => {
  it('POSTs markdown from stdin (-) and prints saved path', async () => {
    const received: { body: string; url: string } = { body: '', url: '' };

    await withMockServer(
      (req, res) => {
        received.url = req.url ?? '';
        let body = '';
        req.setEncoding('utf8');
        req.on('data', (chunk: string) => { body += chunk; });
        req.on('end', () => {
          received.body = body;
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(JSON.stringify({
            message: { id: 'm1', briefPath: 'braze/m1-t/brief.md' },
            path: 'braze/m1-t/brief.md',
          }));
        });
      },
      async (daemonUrl) => {
        const result = await runCli(
          ['braze', 'brief', 'm1', '--brief-file', '-', '--daemon-url', daemonUrl],
          { stdinData: '# Brief Content\nHello' },
        );

        expect(result.code).toBe(0);
        expect(received.url).toBe('/api/braze/messages/m1/brief');
        expect(JSON.parse(received.body)).toMatchObject({ markdown: '# Brief Content\nHello' });
        expect(result.stdout).toContain('brief saved');
        expect(result.stdout).toContain('m1');
      },
    );
  });

  it('prints JSON response when --json flag is used', async () => {
    const responseData = {
      message: { id: 'm2', briefPath: 'braze/m2-t/brief.md' },
      path: 'braze/m2-t/brief.md',
    };

    await withMockServer(
      (req, res) => {
        req.resume();
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(responseData));
      },
      async (daemonUrl) => {
        const result = await runCli(
          ['braze', 'brief', 'm2', '--brief-file', '-', '--json', '--daemon-url', daemonUrl],
          { stdinData: '# Plan' },
        );

        expect(result.code).toBe(0);
        const parsed = JSON.parse(result.stdout);
        expect(parsed).toMatchObject(responseData);
      },
    );
  });

  it('exits with non-zero code when server returns non-ok status', async () => {
    await withMockServer(
      (req, res) => {
        req.resume();
        res.writeHead(400, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'bad request' }));
      },
      async (daemonUrl) => {
        const result = await runCli(
          ['braze', 'brief', 'm3', '--brief-file', '-', '--daemon-url', daemonUrl],
          { stdinData: '# Brief' },
        );

        expect(result.code).not.toBe(0);
      },
    );
  });

  it('exits non-zero when --brief-file is omitted', async () => {
    await withMockServer(
      (req, res) => { req.resume(); res.writeHead(200); res.end('{}'); },
      async (daemonUrl) => {
        const result = await runCli(
          ['braze', 'brief', 'm4', '--daemon-url', daemonUrl],
        );
        expect(result.code).not.toBe(0);
        expect(result.stderr).toContain('--brief-file');
      },
    );
  });
});

describe('od braze get — briefPath 출력', () => {
  it('includes briefPath in tab-separated output when present', async () => {
    await withMockServer(
      (req, res) => {
        req.resume();
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({
          message: {
            id: 'm5',
            title: 'Test Message',
            status: 'planned',
            iamFormat: 'modal',
            deliveryModel: 'action_based',
            triggerEvent: 'session_start',
            variantCount: 1,
            briefPath: 'braze/m5-t/brief.md',
            variants: [],
          },
        }));
      },
      async (daemonUrl) => {
        const result = await runCli(
          ['braze', 'get', 'm5', '--daemon-url', daemonUrl],
        );

        expect(result.code).toBe(0);
        expect(result.stdout).toContain('briefPath');
        expect(result.stdout).toContain('braze/m5-t/brief.md');
      },
    );
  });

  it('does NOT print briefPath line when briefPath is absent', async () => {
    await withMockServer(
      (req, res) => {
        req.resume();
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({
          message: {
            id: 'm6',
            title: 'Test',
            status: 'draft',
            iamFormat: 'slideup',
            deliveryModel: 'scheduled',
            triggerEvent: 'push_click',
            variantCount: 1,
            variants: [],
          },
        }));
      },
      async (daemonUrl) => {
        const result = await runCli(
          ['braze', 'get', 'm6', '--daemon-url', daemonUrl],
        );

        expect(result.code).toBe(0);
        expect(result.stdout).not.toContain('briefPath');
      },
    );
  });
});
