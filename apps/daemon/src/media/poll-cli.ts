export interface MediaPollOptions {
  totalBudgetMs?: number;
  stillRunningExitCode?: number;
}

interface MediaTaskFile {
  warnings?: unknown;
  providerError?: unknown;
  providerId?: unknown;
  size?: unknown;
  name?: unknown;
}

interface MediaTaskError {
  message?: unknown;
  status?: unknown;
}

interface MediaTaskSnapshot {
  status?: unknown;
  progress?: unknown;
  nextSince?: unknown;
  file?: MediaTaskFile;
  error?: MediaTaskError;
}

export interface MediaPollCliDeps {
  fetch: typeof globalThis.fetch;
  surfaceFetchError: (error: unknown, daemonUrl: string) => void;
  writeStdout: (text: string) => void;
  writeStderr: (text: string) => void;
  exit: (code: number) => never;
  now?: () => number;
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

function numericStatus(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export async function runPollUntilDoneOrBudget(
  daemonUrl: string,
  taskId: string,
  sinceStart: number,
  options: MediaPollOptions = {},
  deps: MediaPollCliDeps,
): Promise<void> {
  const totalBudgetMs = typeof options.totalBudgetMs === 'number' ? options.totalBudgetMs : 25_000;
  const perCallTimeoutMs = 4_000;
  const stillRunningExitCode =
    typeof options.stillRunningExitCode === 'number' ? options.stillRunningExitCode : 2;
  const now = deps.now ?? Date.now;
  const startedAt = now();
  const url = `${daemonUrl.replace(/\/$/, '')}/api/media/tasks/${encodeURIComponent(taskId)}/wait`;

  let since = Number.isFinite(sinceStart) ? sinceStart : 0;
  let lastSnapshot: MediaTaskSnapshot | undefined;

  while (now() - startedAt < totalBudgetMs) {
    const remaining = totalBudgetMs - (now() - startedAt);
    const callTimeout = Math.max(500, Math.min(perCallTimeoutMs, remaining));
    let response: Response;
    try {
      response = await deps.fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ since, timeoutMs: callTimeout }),
      });
    } catch (error: unknown) {
      deps.surfaceFetchError(error, daemonUrl);
      deps.exit(3);
    }
    if (response.status === 404) {
      deps.writeStderr(`task ${taskId} not found (expired or never queued)\n`);
      deps.exit(4);
    }
    if (!response.ok) {
      const text = await response.text();
      deps.writeStderr(`daemon ${response.status}: ${text}\n`);
      deps.exit(4);
    }

    let snapshot: MediaTaskSnapshot;
    try {
      snapshot = await response.json() as MediaTaskSnapshot;
    } catch {
      deps.writeStderr('daemon returned non-JSON for /wait\n');
      deps.exit(4);
    }
    lastSnapshot = snapshot;
    if (Array.isArray(snapshot.progress)) {
      for (const line of snapshot.progress) {
        deps.writeStderr(`${String(line)}\n`);
        deps.writeStdout(`# ${String(line)}\n`);
      }
    }
    if (typeof snapshot.nextSince === 'number') since = snapshot.nextSince;

    if (snapshot.status === 'done') {
      const file = snapshot.file ?? {};
      const warnings = Array.isArray(file.warnings) ? file.warnings : [];
      for (const warning of warnings) {
        if (typeof warning === 'string' && warning) deps.writeStderr(`WARN: ${warning}\n`);
      }
      if (file.providerError) {
        const provider = stringValue(file.providerId, 'provider');
        deps.writeStderr(
          `WARN: ${provider} call failed — wrote stub fallback (${String(file.size)} bytes) to ${String(file.name)}\n`,
        );
        deps.writeStderr(`WARN: reason: ${String(file.providerError)}\n`);
        deps.writeStderr(
          'WARN: surface this verbatim to the user. Do NOT claim the stub is the final result.\n',
        );
      }
      deps.writeStdout(`${JSON.stringify({ file })}\n`);
      deps.exit(file.providerError ? 5 : 0);
    }
    if (snapshot.status === 'failed' || snapshot.status === 'interrupted') {
      const status = snapshot.status;
      const message = stringValue(snapshot.error?.message, `task ${status}`);
      deps.writeStderr(`task ${status}: ${message}\n`);
      deps.writeStdout(
        `${JSON.stringify({ taskId, status, error: snapshot.error ?? {} })}\n`,
      );
      deps.exit(numericStatus(snapshot.error?.status, 5));
    }
  }

  const handoff = {
    taskId,
    status: stringValue(lastSnapshot?.status, 'running'),
    nextSince: since,
    elapsed: Math.round((now() - startedAt) / 1000),
  };
  deps.writeStdout(`${JSON.stringify(handoff)}\n`);
  const stillRunningHint = stillRunningExitCode === 0
    ? 'This is a successful queued/running handoff, not a failure.'
    : `exit code ${stillRunningExitCode} = still running.`;
  deps.writeStderr(
    `task ${taskId} still running after ${handoff.elapsed}s. ` +
      `Run \`"$OD_NODE_BIN" "$OD_BIN" media wait ${taskId} --since ${since}\` to continue in an agent runtime ` +
      `(${stillRunningHint})\n`,
  );
  deps.exit(stillRunningExitCode);
}
