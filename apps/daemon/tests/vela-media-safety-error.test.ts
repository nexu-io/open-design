import { describe, expect, it } from 'vitest';
import { velaCommandStdout } from '../src/integrations/vela-command.js';
import {
  VELA_SAFETY_REJECTION_CODE,
  VelaMediaError,
  renderVelaImage,
  velaMediaErrorFromFailure,
} from '../src/media/vela.js';

// Vela publishes a stable, provider-neutral verdict for a refused image
// request and prints it on stdout even as the command exits non-zero. Before
// this suite, the daemon rejected with the bare exec error and dropped that
// stdout, so a content-safety refusal and a provider outage were
// indistinguishable by the time they reached the user.

/** The shape `vela image gen --json` writes for a refused request. */
function velaTaskJson(
  error: Record<string, unknown> | undefined,
): string {
  return `${JSON.stringify({
    task_id: 'mit_test',
    status: 'failed',
    model: 'seedream-5.0-pro',
    ...(error ? { error } : {}),
  })}\n`;
}

/** An exec rejection carrying the CLI's stdout, as vela-command now attaches it. */
function failedCommand(stdout: string): Error & { stdout?: string; code?: number } {
  const error = new Error('Command failed: vela image gen') as Error & {
    stdout?: string;
    code?: number;
  };
  error.code = 1;
  error.stdout = stdout;
  return error;
}

describe('velaCommandStdout', () => {
  it('reads back the stdout a failed command carried', () => {
    expect(velaCommandStdout(failedCommand('{"a":1}'))).toBe('{"a":1}');
  });

  it('returns an empty string when the failure carried none', () => {
    expect(velaCommandStdout(new Error('boom'))).toBe('');
    expect(velaCommandStdout(undefined)).toBe('');
    expect(velaCommandStdout(null)).toBe('');
    expect(velaCommandStdout('a string rejection')).toBe('');
  });
});

describe('velaMediaErrorFromFailure', () => {
	it.each([
		['sensitive_words_detected', 'sensitive_words_detected'],
		['content_policy_violation', 'Content policy rejected the prompt'],
		[
			'InputTextSensitiveContentDetected',
			'The request failed because the input text may contain sensitive information',
		],
	])('preserves provider error %s and its message', (code, message) => {
		const decoded = velaMediaErrorFromFailure(
			failedCommand(velaTaskJson({ code, message })),
			'image gen',
		);

		expect(decoded).toBeInstanceOf(VelaMediaError);
		expect(decoded?.code).toBe(code);
		expect(decoded?.message).toContain(message);
		expect(decoded?.retryable).toBeUndefined();
	});

  it('rebuilds a safety rejection with its subject and retryability', () => {
    const decoded = velaMediaErrorFromFailure(
      failedCommand(
        velaTaskJson({
          code: 'safety_rejection',
          message: 'the request was rejected by a content safety policy',
          subject: 'prompt',
          retryable: false,
        }),
      ),
      'image gen',
    );

    expect(decoded).toBeInstanceOf(VelaMediaError);
    expect(decoded?.code).toBe(VELA_SAFETY_REJECTION_CODE);
    expect(decoded?.subject).toBe('prompt');
    expect(decoded?.retryable).toBe(false);
    expect(decoded?.message).toContain('content safety policy');
  });

  it.each(['prompt', 'input_image', 'output_image'] as const)(
    'accepts the %s subject',
    (subject) => {
      const decoded = velaMediaErrorFromFailure(
        failedCommand(velaTaskJson({ code: 'safety_rejection', subject })),
        'image gen',
      );
      expect(decoded?.subject).toBe(subject);
    },
  );

  // Vela omits the subject whenever the upstream supplier could not prove one.
  // Guessing here would blame the prompt for a reference image, so the field
  // must stay undefined and let the caller name both.
  it('leaves the subject undefined when the producer proved none', () => {
    const decoded = velaMediaErrorFromFailure(
      failedCommand(velaTaskJson({ code: 'safety_rejection', retryable: false })),
      'image gen',
    );
    expect(decoded?.code).toBe(VELA_SAFETY_REJECTION_CODE);
    expect(decoded?.subject).toBeUndefined();
  });

  it('ignores a subject outside the known vocabulary', () => {
    const decoded = velaMediaErrorFromFailure(
      failedCommand(
        velaTaskJson({ code: 'safety_rejection', subject: 'something_new' }),
      ),
      'image gen',
    );
    expect(decoded?.subject).toBeUndefined();
  });

  // `retryable` absent must stay absent: an older Vela never sent the field,
  // and defaulting it to false would tell a user a transient outage is
  // permanent.
  it('leaves retryable undefined when the producer did not say', () => {
    const decoded = velaMediaErrorFromFailure(
      failedCommand(velaTaskJson({ code: 'provider_error' })),
      'image gen',
    );
    expect(decoded?.code).toBe('provider_error');
    expect(decoded?.retryable).toBeUndefined();
  });

  // The negative half. Everything below must keep its original error so an
  // unrelated failure is never reported to the user as a policy refusal.
  it.each([
    ['a crash with no stdout at all', failedCommand('')],
    ['a non-JSON stdout', failedCommand('vela: command not found\n')],
    ['task JSON with no error block', failedCommand(velaTaskJson(undefined))],
    ['an error block with no code', failedCommand(velaTaskJson({ message: 'x' }))],
    ['an error block with an empty code', failedCommand(velaTaskJson({ code: '' }))],
    ['a plain rejection', new Error('spawn ENOENT')],
    ['a JSON array on stdout', failedCommand('[1,2,3]')],
  ])('returns undefined for %s', (_label, error) => {
    expect(velaMediaErrorFromFailure(error, 'image gen')).toBeUndefined();
  });

  // A refusal must never be inferred from prose. Only the structured code
  // decides, so a message that merely mentions safety stays generic.
  it('does not promote safety wording in a message to a rejection code', () => {
    const decoded = velaMediaErrorFromFailure(
      failedCommand(
        velaTaskJson({
          code: 'provider_error',
          message: 'content safety policy check could not be reached',
        }),
      ),
      'image gen',
    );
    expect(decoded?.code).toBe('provider_error');
    expect(decoded?.code).not.toBe(VELA_SAFETY_REJECTION_CODE);
  });
});

// The invariant that matters at the call site: a refused image request must
// leave renderVelaImage as a typed verdict, not as "Command failed with exit
// code 1". This is the assertion that goes red on main, where the CLI's stdout
// never survives the rejection.
describe('renderVelaImage', () => {
  const input = {
    aspect: undefined,
    imageRefs: [],
    model: 'seedream-5.0-pro',
    prompt: 'a portrait in the style of a specific living artist',
    quality: undefined,
    resolution: undefined,
    wireModel: undefined,
    workspaceId: 'team-1',
  } as unknown as Parameters<typeof renderVelaImage>[0];

  it('surfaces a content-safety refusal as a typed VelaMediaError', async () => {
    const runCommand = (async () => {
      throw failedCommand(
        velaTaskJson({
          code: 'safety_rejection',
          message: 'the request was rejected by a content safety policy',
          subject: 'prompt',
          retryable: false,
        }),
      );
    }) as unknown as Parameters<typeof renderVelaImage>[1];

    const thrown = await renderVelaImage(input, runCommand).catch(
      (error: unknown) => error,
    );

    expect(thrown).toBeInstanceOf(VelaMediaError);
    expect((thrown as VelaMediaError).code).toBe(VELA_SAFETY_REJECTION_CODE);
    expect((thrown as VelaMediaError).subject).toBe('prompt');
    expect((thrown as VelaMediaError).retryable).toBe(false);
  });

  it('leaves an unclassified command failure exactly as it was', async () => {
    const original = failedCommand('vela: connection refused\n');
    const runCommand = (async () => {
      throw original;
    }) as unknown as Parameters<typeof renderVelaImage>[1];

    const thrown = await renderVelaImage(input, runCommand).catch(
      (error: unknown) => error,
    );

    expect(thrown).toBe(original);
    expect(thrown).not.toBeInstanceOf(VelaMediaError);
  });
});
