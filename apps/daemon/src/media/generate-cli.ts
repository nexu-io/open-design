import { parseFlags, type CliFlags } from '../cli-args.js';

const MEDIA_GENERATE_STRING_FLAGS = new Set([
  'project', 'surface', 'model', 'prompt', 'output', 'aspect', 'length', 'duration',
  'prompt-influence', 'voice', 'audio-kind', 'composition-dir', 'image', 'daemon-url',
  'language',
]);
const MEDIA_GENERATE_BOOLEAN_FLAGS = new Set(['help', 'h', 'loop']);

type MediaSurface = 'image' | 'video' | 'audio';

export interface MediaGeneratePollOptions {
  stillRunningExitCode?: number;
}

export interface MediaGenerateCliDeps {
  resolveDaemonUrl: (flags: CliFlags) => Promise<string>;
  env: Readonly<Record<string, string | undefined>>;
  fetch: typeof globalThis.fetch;
  surfaceFetchError: (error: unknown, daemonUrl: string) => void;
  pollUntilDoneOrBudget: (
    daemonUrl: string,
    taskId: string,
    since: number,
    options?: MediaGeneratePollOptions,
  ) => Promise<void>;
  writeStderr: (text: string) => void;
  printHelp: () => void;
  exit: (code: number) => never;
}

function stringFlag(flags: CliFlags, key: string): string | undefined {
  return typeof flags[key] === 'string' ? flags[key] : undefined;
}

export async function runMediaGenerate(
  rawArgs: readonly string[],
  deps: MediaGenerateCliDeps,
): Promise<void> {
  let flags: CliFlags;
  try {
    flags = parseFlags(rawArgs, {
      string: MEDIA_GENERATE_STRING_FLAGS,
      boolean: MEDIA_GENERATE_BOOLEAN_FLAGS,
    });
  } catch (error: unknown) {
    deps.writeStderr(`${error instanceof Error ? error.message : String(error)}\n`);
    deps.printHelp();
    deps.exit(2);
  }

  const daemonUrl = await deps.resolveDaemonUrl(flags);
  const projectId = stringFlag(flags, 'project') ?? deps.env.OD_PROJECT_ID;
  const token = deps.env.OD_TOOL_TOKEN;
  if (!projectId && !token) {
    deps.writeStderr(
      'project id required. Pass --project <id> or set OD_PROJECT_ID. The daemon injects this when it spawns the code agent.\n',
    );
    deps.exit(2);
  }

  const surface = stringFlag(flags, 'surface');
  if (!surface || !(['image', 'video', 'audio'] as const).includes(surface as MediaSurface)) {
    deps.writeStderr('--surface must be one of: image | video | audio\n');
    deps.exit(2);
  }
  const model = stringFlag(flags, 'model');
  if (!model) {
    deps.writeStderr('--model required (see http://<daemon>/api/media/models)\n');
    deps.exit(2);
  }

  const body: Record<string, unknown> = {
    surface,
    model,
    prompt: stringFlag(flags, 'prompt'),
    output: stringFlag(flags, 'output'),
    aspect: stringFlag(flags, 'aspect'),
    voice: stringFlag(flags, 'voice'),
    audioKind: stringFlag(flags, 'audio-kind'),
    compositionDir: stringFlag(flags, 'composition-dir'),
    image: stringFlag(flags, 'image'),
    language: stringFlag(flags, 'language'),
  };
  const length = stringFlag(flags, 'length');
  const duration = stringFlag(flags, 'duration');
  const promptInfluence = stringFlag(flags, 'prompt-influence');
  if (length != null) body.length = Number(length);
  if (duration != null) body.duration = Number(duration);
  if (promptInfluence != null) body.promptInfluence = Number(promptInfluence);
  if (flags.loop === true) body.loop = true;

  const base = daemonUrl.replace(/\/$/, '');
  const url = token
    ? `${base}/api/tools/media/generate`
    : `${base}/api/projects/${encodeURIComponent(projectId!)}/media/generate`;
  let response: Response;
  try {
    response = await deps.fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });
  } catch (error: unknown) {
    deps.surfaceFetchError(error, daemonUrl);
    deps.exit(3);
  }
  if (!response.ok) {
    deps.writeStderr(`daemon ${response.status}: ${await response.text()}\n`);
    deps.exit(4);
  }

  const accepted = await response.json() as { taskId?: unknown; status?: unknown };
  if (!accepted.taskId) {
    deps.writeStderr('daemon did not return a taskId\n');
    deps.exit(4);
  }
  const taskId = String(accepted.taskId);
  deps.writeStderr(`task ${taskId} queued (${accepted.status || 'queued'})\n`);
  await deps.pollUntilDoneOrBudget(daemonUrl, taskId, 0, { stillRunningExitCode: 0 });
}
