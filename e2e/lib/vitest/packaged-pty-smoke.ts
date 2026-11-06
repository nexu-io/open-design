export type PackagedPtySmokePlatform = 'darwin' | 'win32';

export type PackagedPtySmokeResult = {
  cleanup: {
    projectStatus: number | null;
    terminalStatus: number | null;
  };
  exitCode: number | null;
  marker: string;
  output: string;
  projectCreateStatus: number;
  projectId: string;
  projectSeedStatus: number;
  stdinStatus: number;
  terminalCreateStatus: number;
  terminalId: string;
};

export function assertPackagedPtySmokeResult(value: unknown): PackagedPtySmokeResult {
  if (
    value == null ||
    typeof value !== 'object' ||
    typeof (value as Partial<PackagedPtySmokeResult>).marker !== 'string' ||
    typeof (value as Partial<PackagedPtySmokeResult>).output !== 'string' ||
    typeof (value as Partial<PackagedPtySmokeResult>).projectId !== 'string' ||
    typeof (value as Partial<PackagedPtySmokeResult>).terminalId !== 'string'
  ) {
    throw new Error(`unexpected packaged PTY smoke value: ${JSON.stringify(value)}`);
  }
  return value as PackagedPtySmokeResult;
}

export function packagedPtySmokeCommand(platform: PackagedPtySmokePlatform): string {
  return platform === 'win32'
    ? [
        'set "OD_PTY_VALUE=PTY_OK"',
        'echo OD_PACKAGED_%OD_PTY_VALUE%',
        'exit /b 0',
        '',
      ].join('\r\n')
    : `printf 'OD_PACKAGED_%s\\n' 'PTY_OK'; exit 0\n`;
}

/**
 * Runs inside the packaged renderer through `tools-pack inspect --expr`.
 * It exercises the daemon's real node-pty HTTP/SSE surface, then removes the
 * terminal and project it created even when the assertion path fails.
 */
export function packagedPtySmokeExpression(platform: PackagedPtySmokePlatform): string {
  const marker = 'OD_PACKAGED_PTY_OK';
  const shell = platform === 'win32' ? 'cmd.exe' : '/bin/sh';
  const command = packagedPtySmokeCommand(platform);

  return `
    (async () => {
      const marker = ${JSON.stringify(marker)};
      const projectId = 'packaged-pty-smoke-' + Date.now().toString(36);
      let projectCreated = false;
      let terminalId = null;
      let source = null;
      let terminalCleanupStatus = null;
      let projectCleanupStatus = null;
      let result = null;
      let failure = null;

      try {
        const projectResponse = await fetch('/api/projects', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: projectId, name: 'Packaged PTY smoke' }),
        });
        projectCreated = projectResponse.ok;
        if (!projectResponse.ok) {
          throw new Error('PTY smoke project create failed: ' + projectResponse.status);
        }

        // Generic project creation records the project but intentionally does
        // not create its managed directory until the first file is written.
        // Seed one file so the PTY's cwd matches a real, usable project.
        const projectSeedResponse = await fetch(
          '/api/projects/' + encodeURIComponent(projectId) + '/files',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: 'pty-smoke.txt',
              content: 'packaged PTY smoke\\n',
              encoding: 'utf8',
            }),
          },
        );
        if (!projectSeedResponse.ok) {
          throw new Error('PTY smoke project seed failed: ' + projectSeedResponse.status);
        }

        const terminalResponse = await fetch(
          '/api/projects/' + encodeURIComponent(projectId) + '/terminals',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cols: 80, rows: 24, shell: ${JSON.stringify(shell)} }),
          },
        );
        const terminalBody = await terminalResponse.json().catch(() => null);
        terminalId = terminalBody?.terminal?.id ?? null;
        if (!terminalResponse.ok || typeof terminalId !== 'string') {
          throw new Error(
            'PTY smoke terminal create failed: ' +
              terminalResponse.status +
              ' ' +
              JSON.stringify(terminalBody),
          );
        }

        const terminalPath =
          '/api/projects/' +
          encodeURIComponent(projectId) +
          '/terminals/' +
          encodeURIComponent(terminalId);
        let stdinStatus = 0;
        let output = '';
        const exitPromise = new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            source?.close();
            reject(new Error('PTY smoke timed out; output=' + JSON.stringify(output)));
          }, 15000);

          source = new EventSource(terminalPath + '/stream');
          source.addEventListener('data', (event) => {
            try {
              const payload = JSON.parse(event.data);
              if (typeof payload?.data === 'string') output += payload.data;
            } catch {
              // Ignore malformed chunks; the terminal exit/timeout remains authoritative.
            }
          });
          source.addEventListener('exit', (event) => {
            clearTimeout(timeout);
            source?.close();
            try {
              const payload = JSON.parse(event.data);
              resolve(typeof payload?.code === 'number' ? payload.code : null);
            } catch {
              resolve(null);
            }
          });
        });
        const stdinPromise = fetch(terminalPath + '/stdin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ data: ${JSON.stringify(command)} }),
        }).then((stdinResponse) => {
          stdinStatus = stdinResponse.status;
          if (!stdinResponse.ok) {
            throw new Error('PTY smoke stdin failed: ' + stdinResponse.status);
          }
        });
        const [, exitCode] = await Promise.all([stdinPromise, exitPromise]);

        result = {
          exitCode,
          marker,
          output,
          projectCreateStatus: projectResponse.status,
          projectId,
          projectSeedStatus: projectSeedResponse.status,
          stdinStatus,
          terminalCreateStatus: terminalResponse.status,
          terminalId,
        };
      } catch (error) {
        failure = error;
      } finally {
        source?.close();
        if (typeof terminalId === 'string') {
          const terminalCleanup = await fetch(
            '/api/projects/' +
              encodeURIComponent(projectId) +
              '/terminals/' +
              encodeURIComponent(terminalId),
            { method: 'DELETE' },
          ).catch(() => null);
          terminalCleanupStatus = terminalCleanup?.status ?? null;
        }
        if (projectCreated) {
          const projectCleanup = await fetch(
            '/api/projects/' + encodeURIComponent(projectId),
            { method: 'DELETE' },
          ).catch(() => null);
          projectCleanupStatus = projectCleanup?.status ?? null;
        }
      }

      if (failure != null) throw failure;
      return {
        ...result,
        cleanup: {
          projectStatus: projectCleanupStatus,
          terminalStatus: terminalCleanupStatus,
        },
      };
    })()
  `;
}
