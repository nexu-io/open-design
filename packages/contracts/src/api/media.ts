export const MEDIA_EXECUTION_MODES = [
  'enabled',
  'disabled',
] as const;

export type MediaExecutionMode = (typeof MEDIA_EXECUTION_MODES)[number];

export const MEDIA_SURFACES = [
  'image',
  'video',
  'audio',
] as const;

export type MediaSurface = (typeof MEDIA_SURFACES)[number];

export const MEDIA_TASK_STATUSES = [
  'queued',
  'running',
  'done',
  'failed',
  'interrupted',
] as const;

export type MediaTaskStatus = (typeof MEDIA_TASK_STATUSES)[number];

export interface ProjectMediaTaskFile {
  name: string;
  size?: number;
  /** Stable across an in-project rename/move and used to reconcile the final path. */
  mtime?: number;
  kind?: string;
  mime?: string;
}

/**
 * What to do next about a media generation that failed.
 *
 * This is the ONLY failure vocabulary a client — the agent that dispatched
 * the render, the chat host, a CLI caller — is meant to branch on. The
 * internal `code` stays for triage; it is not an answer to "so what now?",
 * and the moment it reached a user's screen it stopped being one at all
 * (「原因未分类(错误代码:MEDIA_DISPATCH_FAILED)」 is a support ticket, not a
 * next step).
 *
 * The values are the run-error ladder (`docs/design/run-errors/error-ux-design.md`
 * §3, mirrored in `apps/web/src/runtime/amr-guidance.ts`) applied to media, so
 * media failures do not grow a second, differently-shaped taxonomy:
 *
 * - rung 1 · the user can fix it right here — `revise-request`,
 *   `switch-model`, `open-settings`, `sign-in`
 * - rung 2 · nothing to fix, it may just work next time — `retry-later`
 * - rung 3 · this path cannot work; take a different one — `add-credit`,
 *   `update-app`, `unsupported`
 * - rung 4 · retrying is futile and we have no other lever — `contact-support`
 *
 * Two failures that put the user in the same place get the SAME value on
 * purpose: a missing OpenAI key and a model with no configured renderer are
 * different bugs and one sentence ("fill it in under Settings").
 */
export const MEDIA_FAILURE_NEXT_STEPS = [
  /** The request itself was refused. Reword it / swap the reference image. */
  'revise-request',
  /** This model cannot serve the request; another one can. */
  'switch-model',
  /** A credential or endpoint is missing or wrong in Settings. */
  'open-settings',
  /** The Open Design session behind an OD-owned model expired. */
  'sign-in',
  /** Credit is spent. Retrying cannot bring it back. */
  'add-credit',
  /** Transient: upstream wobble, throttling, timeout, local restart. */
  'retry-later',
  /** The installed app/runtime is too old to place the request at all. */
  'update-app',
  /** This run/project does not do this kind of generation, by policy. */
  'unsupported',
  /** We could not name a cause. Ours to fix, not the user's. */
  'contact-support',
] as const;

export type MediaFailureNextStep = (typeof MEDIA_FAILURE_NEXT_STEPS)[number];

export interface ProjectMediaTaskError {
  message: string;
  status?: number;
  code?: string;
  subject?: 'prompt' | 'input_image' | 'output_image';
  retryable?: boolean;
  /**
   * The classified next step. Always present on a failure the daemon
   * recorded: an absent value would push every consumer back to guessing from
   * `message`, which is the habit this field exists to end.
   */
  nextStep?: MediaFailureNextStep;
}

/** Everything a media failure can be classified from. All fields optional. */
export interface MediaFailureSignal {
  /**
   * The producer's stable code, when it published one. Never invent it: an
   * unrecognised code must NOT be promoted to a content refusal, or a user
   * gets sent off to rewrite a prompt that was never the problem.
   */
  code?: string | null | undefined;
  /** A real upstream HTTP status. Omit rather than defaulting it. */
  status?: number | null | undefined;
  /** The producer's diagnostic sentence. Read, never shown to a user. */
  message?: string | null | undefined;
  /** Only an explicit boolean counts; undefined means "the producer did not say". */
  retryable?: boolean | null | undefined;
  /** Model id, so an OD-owned (`vela/*`) credential failure is not read as a BYOK one. */
  model?: string | null | undefined;
}

const MEDIA_FAILURE_NEXT_STEP_BY_CODE: Readonly<Record<string, MediaFailureNextStep>> = {
  // Content policy. The one code that licenses "reword it".
  safety_rejection: 'revise-request',
  // Daemon/dispatcher policy for this run.
  MEDIA_EXECUTION_DISABLED: 'unsupported',
  MEDIA_SURFACE_DENIED: 'unsupported',
  // The run allows media but not THIS model — another allowed one exists.
  MEDIA_MODEL_DENIED: 'switch-model',
  // No renderer is wired for the selected model: a Settings problem, whether
  // the fix is a key or a different provider entry.
  STUB_PROVIDER_DISABLED: 'open-settings',
  // Local plumbing. Nothing upstream is wrong and nothing is spent.
  MEDIA_DISPATCHER_UNREACHABLE: 'retry-later',
  DAEMON_RESTART: 'retry-later',
  RATE_LIMITED: 'retry-later',
  UPSTREAM_UNAVAILABLE: 'retry-later',
  // The installed runtime cannot place the call at all.
  MEDIA_CLI_INCOMPATIBLE: 'update-app',
  // Money.
  AMR_INSUFFICIENT_BALANCE: 'add-credit',
  // Identity behind an OD-owned model.
  AMR_AUTH_REQUIRED: 'sign-in',
  AGENT_AUTH_REQUIRED: 'sign-in',
};

/**
 * Provider adapters throw a uniform `"<tag> <status>: <body>"` sentence
 * (`openai image 429: …`, `senseaudio tts 401: unauthorized`), and a few
 * throw the bare `"<verb> <status>"` form (`openai image fetch 404`). Those
 * two shapes are the only places an upstream status survives into a plain
 * `Error`, so they are the only ones read here. Both are anchored to the
 * short tag that opens the sentence, so a three-digit number inside the
 * truncated response body that follows cannot be mistaken for a status.
 */
const TAGGED_STATUS_RE = /^[A-Za-z][\w .\/-]{0,32}?\s([1-5]\d\d):\s/;
const BARE_STATUS_RE =
  /^[A-Za-z][\w .\/-]{0,32}?\b(?:fetch|download|submit|poll|content)\s+([1-5]\d\d)\b/i;

/** `no Fal API key — configure it in …`, `no OpenAI credential — …`. */
const MISSING_CREDENTIAL_RE = /\bno\s+(?:[\w.-]+\s+){0,3}(?:api key|credential)\b/i;
/** Every long-poll adapter gives up with this exact phrase. */
const RENDER_TIMED_OUT_RE = /\bdid not finish in time\b/i;

function nextStepForStatus(
  status: number,
  odOwnedModel: boolean,
): MediaFailureNextStep | undefined {
  if (status === 401 || status === 403) return odOwnedModel ? 'sign-in' : 'open-settings';
  if (status === 402) return 'add-credit';
  if (status === 404) return 'switch-model';
  if (status === 408 || status === 425 || status === 429) return 'retry-later';
  if (status >= 500 && status <= 599) return 'retry-later';
  return undefined;
}

function statusFromMessage(message: string): number | undefined {
  const tagged = TAGGED_STATUS_RE.exec(message);
  if (tagged?.[1]) return Number(tagged[1]);
  const bare = BARE_STATUS_RE.exec(message);
  if (bare?.[1]) return Number(bare[1]);
  return undefined;
}

/**
 * Classify a media failure into the one thing its reader should do next.
 *
 * Precedence is deliberate and narrows outward from proof to guess: a code the
 * producer published, then a real HTTP status, then the two message shapes
 * that provably carry a status, then a two-entry message allowlist, then the
 * producer's own retry verdict. Anything left is `contact-support` — "we could
 * not name it" is an honest answer and its copy still offers a retry, whereas
 * guessing `revise-request` would blame the user for our outage.
 */
export function mediaFailureNextStep(signal: MediaFailureSignal): MediaFailureNextStep {
  const code = typeof signal.code === 'string' ? signal.code.trim() : '';
  const byCode = code ? MEDIA_FAILURE_NEXT_STEP_BY_CODE[code] : undefined;
  if (byCode) return byCode;

  const model = typeof signal.model === 'string' ? signal.model.trim() : '';
  const odOwnedModel = model.startsWith('vela/');

  if (typeof signal.status === 'number' && Number.isFinite(signal.status)) {
    const byStatus = nextStepForStatus(signal.status, odOwnedModel);
    if (byStatus) return byStatus;
  }

  const message = typeof signal.message === 'string' ? signal.message : '';
  if (message) {
    const embedded = statusFromMessage(message);
    if (embedded !== undefined) {
      const byEmbedded = nextStepForStatus(embedded, odOwnedModel);
      if (byEmbedded) return byEmbedded;
    }
    if (MISSING_CREDENTIAL_RE.test(message)) return 'open-settings';
    if (RENDER_TIMED_OUT_RE.test(message)) return 'retry-later';
  }

  if (signal.retryable === true) return 'retry-later';
  return 'contact-support';
}

/** A project media task snapshot consumed by ChatPanel's per-output progress row. */
export interface ProjectMediaTask {
  taskId: string;
  /**
   * Creation order within the daemon's media task store. Compare it, never
   * persist or display it. `startedAt` ties on every parallel fan-out, so this
   * is the only field that keeps a batch's cells in their real positions
   * across polls. Absent from a producer that does not report it — fall back
   * to `startedAt` then.
   */
  sequence?: number;
  /**
   * Identity of the generation batch this task belongs to: same-run,
   * same-surface tasks whose lifetimes overlap, which is what a user perceives
   * as one "generate the illustrations" action. Absent means the producer did
   * not group; treat the task as a batch of one rather than guessing a total.
   */
  batchId?: string;
  /** 1-based position within `batchId`. The N in "N/M". */
  batchIndex?: number;
  /**
   * Tasks known in `batchId`. The M in "N/M". It grows while the batch is open
   * and freezes once its last member ends, so a progress row's denominator
   * never walks backwards. A one-at-a-time generation reports 1 here: the
   * product ruling is a single spinner, not a fabricated total.
   */
  batchSize?: number;
  runId?: string;
  status: MediaTaskStatus;
  startedAt: number;
  endedAt: number | null;
  elapsed: number;
  surface?: string;
  model?: string;
  progress: string[];
  progressCount: number;
  file?: ProjectMediaTaskFile;
  error?: ProjectMediaTaskError;
}

export interface ProjectMediaTasksResponse {
  tasks: ProjectMediaTask[];
}

export const MEDIA_POLICY_DENIAL_CODES = [
  'MEDIA_EXECUTION_DISABLED',
  'MEDIA_SURFACE_DENIED',
  'MEDIA_MODEL_DENIED',
] as const;

export type MediaPolicyDenialCode = (typeof MEDIA_POLICY_DENIAL_CODES)[number];

/**
 * Run-scoped policy controlling OpenDesign-owned media generation only.
 *
 * `allowedSurfaces` and `allowedModels` apply solely to `/api/tools/media/generate`
 * and in-run `od media generate`. External MCP media tools are intentionally
 * unaffected: provider policy for those belongs to the MCP server / orchestrator.
 */
export interface MediaExecutionPolicy {
  mode: MediaExecutionMode;
  allowedSurfaces?: MediaSurface[];
  allowedModels?: string[];
}

export const DEFAULT_MEDIA_EXECUTION_POLICY: MediaExecutionPolicy = {
  mode: 'enabled',
};

export interface MediaPolicyTarget {
  surface: MediaSurface;
  model?: string;
}

export interface MediaPolicyDenial {
  code: MediaPolicyDenialCode;
  message: string;
}

export function mediaExecutionPolicyDenial(
  policy: MediaExecutionPolicy,
  target: MediaPolicyTarget,
): MediaPolicyDenial | null {
  if (policy.mode === 'disabled') {
    return {
      code: 'MEDIA_EXECUTION_DISABLED',
      message: 'media generation is disabled for this run',
    };
  }
  if (
    Array.isArray(policy.allowedSurfaces) &&
    policy.allowedSurfaces.length > 0 &&
    !policy.allowedSurfaces.includes(target.surface)
  ) {
    return {
      code: 'MEDIA_SURFACE_DENIED',
      message: `media surface "${target.surface}" is not allowed for this run`,
    };
  }
  if (
    target.model &&
    Array.isArray(policy.allowedModels) &&
    policy.allowedModels.length > 0 &&
    !policy.allowedModels.includes(target.model)
  ) {
    return {
      code: 'MEDIA_MODEL_DENIED',
      message: `media model "${target.model}" is not allowed for this run`,
    };
  }
  return null;
}

/** Request for Open Design's deterministic local HyperFrames scaffold. */
export interface HyperFramesScaffoldRequest {
  /** Project-relative path in the form `.hyperframes-cache/<id>`. */
  compositionDir: string;
}

/** Files created before the agent authors the composition HTML. */
export interface HyperFramesScaffoldResponse {
  compositionDir: string;
  files: ['hyperframes.json', 'meta.json', 'index.html'];
}
