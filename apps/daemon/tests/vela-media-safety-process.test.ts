import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  runVelaCommand,
  velaCommandStderr,
} from '../src/integrations/vela-command.js';
import {
  VELA_SAFETY_REJECTION_CODE,
  VelaMediaError,
  renderVelaImage,
} from '../src/media/vela.js';

// The process boundary itself, with a real child process.
//
// The sibling suite builds its rejections by hand, which proves the decoder but
// assumes the thing that was actually broken: that a non-zero exit still
// carries the CLI's stdout back to us. `vela image gen --json` writes the whole
// task object and only *then* exits 1, and the daemon used to reject with the
// bare exec error and drop that stdout. Nothing short of spawning a real
// process that behaves that way can show the recovery works.

let binDir: string;

/** A stand-in `vela` that reproduces the real CLI's failure protocol. */
function writeFakeVela(body: string): string {
  const path = join(binDir, 'vela');
  writeFileSync(path, body, 'utf8');
  chmodSync(path, 0o755);
  return path;
}

/** The task object the real CLI prints for a refused request. */
function safetyTaskJson(subject?: string): string {
  return JSON.stringify({
    task_id: 'mit_process_test',
    status: 'failed',
    model: 'seedream-5.0-pro',
    error: {
      code: 'safety_rejection',
      message: 'the request was rejected by a content safety policy',
      ...(subject ? { subject } : {}),
      retryable: false,
    },
  });
}

function imageInput(): Parameters<typeof renderVelaImage>[0] {
  return {
    aspect: undefined,
    imageRefs: [],
    model: 'seedream-5.0-pro',
    prompt: 'a portrait of a specific living public figure',
    quality: undefined,
    resolution: undefined,
    wireModel: undefined,
    workspaceId: 'team-1',
  } as unknown as Parameters<typeof renderVelaImage>[0];
}

beforeEach(() => {
  binDir = mkdtempSync(join(tmpdir(), 'od-vela-safety-'));
});

afterEach(() => {
  rmSync(binDir, { recursive: true, force: true });
});

describe('a real vela process that refuses and exits non-zero', () => {
	it('preserves stderr separately from the exec error message', async () => {
		const bin = writeFakeVela(
			'#!/bin/sh\necho "Error: perform media request GET /api/v1/media/images/tasks/mit_process_timeout: operation timed out" >&2\nexit 1\n',
		);
		const thrown = await runVelaCommand(['image', 'gen'], {
			env: { ...process.env, VELA_BIN: bin },
		}).catch((error: unknown) => error);

		expect(velaCommandStderr(thrown)).toContain('mit_process_timeout');
	});

	it('preserves an arbitrary provider code and safe message across the process boundary', async () => {
		const providerTask = JSON.stringify({
			task_id: 'mit_process_test',
			status: 'failed',
			model: 'seedream-5.0-pro',
			error: {
				code: 'sensitive_words_detected',
				message: 'sensitive_words_detected',
			},
		});
		const bin = writeFakeVela(
			`#!/bin/sh\ncat <<'JSON'\n${providerTask}\nJSON\nexit 1\n`,
		);

		const thrown = await renderVelaImage(imageInput(), (args, options) =>
			runVelaCommand(args, { ...options, env: { ...process.env, VELA_BIN: bin } }),
		).catch((error: unknown) => error);

		expect(thrown).toBeInstanceOf(VelaMediaError);
		expect((thrown as VelaMediaError).code).toBe('sensitive_words_detected');
		expect((thrown as VelaMediaError).message).toContain('sensitive_words_detected');
	});

  it('still yields the structured verdict, subject and all', async () => {
    // stdout carries the task; stderr carries the human line; exit is 1 --
    // exactly the real CLI's shape.
    const bin = writeFakeVela(
      `#!/bin/sh\ncat <<'JSON'\n${safetyTaskJson('prompt')}\nJSON\necho "image task mit_process_test failed: safety_rejection" >&2\nexit 1\n`,
    );

    const thrown = await renderVelaImage(imageInput(), (args, options) =>
      runVelaCommand(args, { ...options, env: { ...process.env, VELA_BIN: bin } }),
    ).catch((error: unknown) => error);

    expect(thrown).toBeInstanceOf(VelaMediaError);
    const verdict = thrown as VelaMediaError;
    expect(verdict.code).toBe(VELA_SAFETY_REJECTION_CODE);
    expect(verdict.subject).toBe('prompt');
    expect(verdict.retryable).toBe(false);
  });

  it('reports no subject when the supplier proved none', async () => {
    const bin = writeFakeVela(
      `#!/bin/sh\ncat <<'JSON'\n${safetyTaskJson()}\nJSON\nexit 1\n`,
    );

    const thrown = await renderVelaImage(imageInput(), (args, options) =>
      runVelaCommand(args, { ...options, env: { ...process.env, VELA_BIN: bin } }),
    ).catch((error: unknown) => error);

    expect((thrown as VelaMediaError).code).toBe(VELA_SAFETY_REJECTION_CODE);
    expect((thrown as VelaMediaError).subject).toBeUndefined();
  });

  // The negative half at the same boundary: a CLI that dies before producing
  // any task must not acquire a policy verdict from nowhere.
  it('leaves a crash with no task output as an ordinary failure', async () => {
    const bin = writeFakeVela(
      `#!/bin/sh\necho "vela: could not reach the control plane" >&2\nexit 3\n`,
    );

    const thrown = await renderVelaImage(imageInput(), (args, options) =>
      runVelaCommand(args, { ...options, env: { ...process.env, VELA_BIN: bin } }),
    ).catch((error: unknown) => error);

    expect(thrown).not.toBeInstanceOf(VelaMediaError);
    expect(thrown).toBeInstanceOf(Error);
  });
});
