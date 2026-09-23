import { VELA_CLI_FAILURE_ENVELOPE_FIELDS, type CommentBatchPushRequest, type CommentBatchPushResponse } from '@open-design/contracts';
import { parseCommentBatchReceipt, validateCommentBatchRequest } from './comment-batch-receipt.js';
import type {
  CollabCloudComment,
  CollabCloudMemberDirectoryEntry,
  CollabMemberRole,
  CollabPresenceMember,
} from '@open-design/contracts';
import { CollabCloudError } from '../integrations/collab-cloud.js';
import {
  runVelaCommand,
  velaCommandStdout,
  type VelaCommandOptions,
  velaWorkspaceCommandOptions,
} from '../integrations/vela-command.js';

export type RunVelaCollab = (
  args: string[],
  workspaceId?: string,
  options?: Pick<VelaCommandOptions, 'input'>,
) => Promise<string>;

export interface VelaCliCollabClientOptions {
  run?: RunVelaCollab;
}

type MemberWire = {
  memberId?: unknown;
  displayName?: unknown;
  role?: unknown;
  avatarUrl?: unknown;
};

type PresenceWire = MemberWire & {
  filePath?: unknown;
  activity?: unknown;
  heartbeatAt?: unknown;
};

type PullCommentsWire = {
  comments?: unknown;
  latestSeq?: unknown;
};

/** Retain the service's author snapshot rather than hashing local identity IDs. */
function toCloudComment(value: unknown): CollabCloudComment {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return value as CollabCloudComment;
  }
  const wire = value as CollabCloudComment & { author?: unknown };
  const author = wire.author && typeof wire.author === 'object' && !Array.isArray(wire.author)
    ? wire.author as { authorKey?: unknown; displayName?: unknown }
    : null;
  if (!author) return wire;
  return {
    ...wire,
    ...(typeof author.authorKey === 'string' && author.authorKey.trim()
      ? { authorKey: author.authorKey }
      : {}),
    ...(typeof author.displayName === 'string' && author.displayName.trim()
      ? { authorDisplayName: author.displayName }
      : {}),
  };
}

export interface VelaCliPresenceHeartbeatInput {
  member: CollabPresenceMember;
  clientId?: string;
  filePath?: string | null;
  activity?: CollabPresenceMember['activity'];
}

export interface VelaCliPresenceLeaveInput {
  memberId: string;
  clientId?: string;
}

type PresenceActivity = Exclude<CollabPresenceMember['activity'], undefined>;

export function createVelaCliCollabClient(options: VelaCliCollabClientOptions = {}) {
  const run = options.run ?? defaultRunVelaCollab;

  async function runJson<T>(args: string[], workspaceId: string, commandOptions?: Pick<VelaCommandOptions, 'input'>): Promise<T> {
    const requestedWorkspaceId = workspaceId.trim();
    if (!requestedWorkspaceId) {
      throw new Error('explicit workspace scope is required');
    }
    let stdout: string;
    try {
      stdout = await run(args, requestedWorkspaceId, commandOptions);
    } catch (error) {
      throw collabCloudErrorFromVelaFailure(error) ?? error;
    }
    const trimmed = stdout.trim();
    if (!trimmed) return {} as T;
    try {
      return JSON.parse(trimmed) as T;
    } catch (cause) {
      throw new Error('Invalid JSON from Vela collaboration command', { cause });
    }
  }

  return {
    isConfigured(): boolean {
      return true;
    },

    async registerMember(
      _teamId: string,
      _memberId: string,
      input: { displayName: string; role: CollabMemberRole },
    ): Promise<CollabCloudMemberDirectoryEntry> {
      const args = ['member', 'register', '--display-name', input.displayName, '--role', input.role];
      const payload = await runJson<{ member?: MemberWire }>(args, _teamId);
      return toDirectoryEntry(payload.member);
    },

    async listMembers(_teamId: string): Promise<CollabCloudMemberDirectoryEntry[]> {
      const payload = await runJson<{ members?: MemberWire[] }>(
        ['member', 'list'],
        _teamId,
      );
      return Array.isArray(payload.members) ? payload.members.map(toDirectoryEntry) : [];
    },

    async pushCommentBatch(workspaceId: string, projectId: string, request: CommentBatchPushRequest): Promise<CommentBatchPushResponse> {
      if (!workspaceId.trim() || !projectId.trim()) throw new Error('explicit batch scope is required');
      validateCommentBatchRequest(request);
      // Snapshot before awaiting the process: correlation cannot follow caller mutation.
      const captured: CommentBatchPushRequest = { comments: request.comments.map(item => ({ ...item })) };
      const input = JSON.stringify(captured);
      let stdout: string;
      try {
        stdout = await run(['comment', 'push-batch', projectId, '--comment-file', '-', '--mode', 'align', '--json'],
          workspaceId.trim(), { input });
      } catch (error) {
        stdout = velaCommandStdout(error);
        if (!stdout.trim()) throw error;
      }
      return parseCommentBatchReceipt(stdout, captured);
    },

    async pushComment(
      _teamId: string,
      projectId: string,
      comment: CollabCloudComment,
    ): Promise<{ seq: number }> {
      const payload = await runJson<{ seq?: unknown; authorKey?: unknown; author?: { authorKey?: unknown } }>([
        'comment',
        'push',
        projectId,
        '--comment-file',
        '-',
      ], _teamId, { input: JSON.stringify(comment) });
      const authorKey = payload.author?.authorKey ?? payload.authorKey;
      return {
        seq: typeof payload.seq === 'number' ? payload.seq : 0,
        ...(typeof authorKey === 'string' && authorKey.trim() ? { authorKey: authorKey.trim() } : {}),
      };
    },

    async pullComments(
      _teamId: string,
      projectId: string,
      sinceSeq: number,
    ): Promise<{
      comments: CollabCloudComment[];
      latestSeq: number;
      notModified: boolean;
      etag: string | null;
    }> {
      const payload = await runJson<PullCommentsWire>([
        'comment',
        'pull',
        projectId,
        '--since-seq',
        String(sinceSeq),
        '--author-kinds',
        'member,user',
      ], _teamId);
      const comments = Array.isArray(payload.comments)
        ? payload.comments.map(toCloudComment)
        : [];
      return {
        comments,
        latestSeq: typeof payload.latestSeq === 'number' ? payload.latestSeq : sinceSeq,
        notModified: comments.length === 0,
        etag: null,
      };
    },

    async heartbeatPresence(
      projectId: string,
      input: VelaCliPresenceHeartbeatInput,
      workspaceId: string,
    ): Promise<CollabPresenceMember[]> {
      const args = [
        'presence',
        'heartbeat',
        projectId,
        '--client-id',
        input.clientId ?? input.member.memberId,
      ];
      const displayName = input.member.name?.trim();
      if (displayName) args.push('--display-name', displayName);
      if (input.filePath) args.push('--file-path', input.filePath);
      if (input.activity !== undefined && input.activity !== null) {
        args.push('--activity-json', JSON.stringify(input.activity));
      }
      const payload = await runJson<{ viewers?: PresenceWire[] }>(args, workspaceId);
      return Array.isArray(payload.viewers) ? payload.viewers.map(toPresenceMember) : [];
    },

    async listPresence(projectId: string, workspaceId: string): Promise<CollabPresenceMember[]> {
      const payload = await runJson<{ viewers?: PresenceWire[] }>([
        'presence',
        'list',
        projectId,
      ], workspaceId);
      return Array.isArray(payload.viewers) ? payload.viewers.map(toPresenceMember) : [];
    },

    async leavePresence(
      projectId: string,
      input: VelaCliPresenceLeaveInput,
      workspaceId: string,
    ): Promise<CollabPresenceMember[]> {
      const payload = await runJson<{ viewers?: PresenceWire[] }>([
        'presence',
        'leave',
        projectId,
        '--client-id',
        input.clientId ?? input.memberId,
      ], workspaceId);
      return Array.isArray(payload.viewers) ? payload.viewers.map(toPresenceMember) : [];
    },
  };
}

export type VelaCliCollabClient = ReturnType<typeof createVelaCliCollabClient>;

/**
 * Preserve a Vela command's machine-readable HTTP failure without ever
 * classifying its human stderr. `runVelaCommand` carries rejected stdout, and
 * structured command envelopes put the Go-defined fields at the root. Legacy
 * nested `error.code` remains accepted; both fields are required so a code
 * alone cannot cancel data.
 */
export function collabCloudErrorFromVelaFailure(error: unknown): CollabCloudError | null {
  const stdout = error !== null && typeof error === 'object'
    && typeof (error as { stdout?: unknown }).stdout === 'string'
    ? (error as { stdout: string }).stdout.trim()
    : '';
  if (!stdout) return null;
  let envelope: unknown;
  try {
    envelope = JSON.parse(stdout);
  } catch {
    return null;
  }
  if (envelope === null || typeof envelope !== 'object' || Array.isArray(envelope)) return null;
  const root = envelope as Record<string, unknown>;
  const nested = root[VELA_CLI_FAILURE_ENVELOPE_FIELDS.message];
  const detail = nested !== null && typeof nested === 'object' && !Array.isArray(nested)
    ? nested as Record<string, unknown>
    : null;
  const status = detail?.[VELA_CLI_FAILURE_ENVELOPE_FIELDS.status]
    ?? root[VELA_CLI_FAILURE_ENVELOPE_FIELDS.status];
  const code = detail?.code ?? root[VELA_CLI_FAILURE_ENVELOPE_FIELDS.code];
  const message = detail?.message ?? root[VELA_CLI_FAILURE_ENVELOPE_FIELDS.message];
  if (typeof status !== 'number' || !Number.isInteger(status) || typeof code !== 'string' || !code.trim()) return null;
  return new CollabCloudError(
    status,
    code,
    typeof message === 'string' ? message : undefined,
  );
}

function toDirectoryEntry(input: MemberWire | undefined): CollabCloudMemberDirectoryEntry {
  const memberId = typeof input?.memberId === 'string' ? input.memberId : '';
  const displayName =
    typeof input?.displayName === 'string' && input.displayName.trim()
      ? input.displayName
      : memberId;
  const role = isRole(input?.role) ? input.role : 'member';
  return { memberId, displayName, role };
}

function toPresenceMember(input: PresenceWire): CollabPresenceMember {
  const memberId = typeof input.memberId === 'string' ? input.memberId : '';
  const member: CollabPresenceMember = {
    memberId,
  };
  const displayName = typeof input.displayName === 'string'
    ? input.displayName.trim()
    : '';
  if (displayName && displayName !== memberId) {
    member.name = displayName;
  }
  if (isRole(input.role)) member.role = input.role;
  if (typeof input.avatarUrl === 'string' || input.avatarUrl === null) {
    member.avatarUrl = input.avatarUrl;
  }
  if (typeof input.filePath === 'string' || input.filePath === null) {
    member.filePath = input.filePath;
  }
  if (input.activity !== undefined) {
    member.activity = input.activity as PresenceActivity;
  }
  if (typeof input.heartbeatAt === 'string') {
    member.heartbeatAt = input.heartbeatAt;
  }
  return member;
}

function isRole(value: unknown): value is CollabMemberRole {
  return value === 'owner' || value === 'admin' || value === 'member';
}

/**
 * Wall-clock budget for presence spawns. Presence heartbeat/list/leave are
 * high-frequency lease traffic (the web client beats every 10s and every beat
 * spawns a CLI process); without a budget a wedged CLI piles up unbounded
 * children while the client keeps beating. Presence data is disposable — the
 * next beat re-establishes it — so a hung spawn is terminated rather than
 * awaited. Member commands retain their existing behavior.
 */
const PRESENCE_COMMAND_TIMEOUT_MS = 10_000;

// Comment transport deadlines are retryable failures, never share lifecycle signals.
const COMMENT_COMMAND_TIMEOUT_MS = 30_000;

/** Only a validated CLI envelope may supply status/code; omitted Go status stays null. */
function commentCommandError(error: unknown): Error {
  const classified = collabCloudErrorFromVelaFailure(error);
  if (classified) return classified;

  const original = error instanceof Error
    ? error
    : new Error('Vela comment command failed', { cause: error });
  let payload: unknown;
  try { payload = JSON.parse(velaCommandStdout(error)); } catch { return original; }
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return original;
  const wire = payload as Record<string, unknown>;
  const message = wire[VELA_CLI_FAILURE_ENVELOPE_FIELDS.message];
  const code = wire[VELA_CLI_FAILURE_ENVELOPE_FIELDS.code];
  const statusValue = wire[VELA_CLI_FAILURE_ENVELOPE_FIELDS.status];
  const status = typeof statusValue === 'number' && Number.isInteger(statusValue)
    && statusValue >= 400 && statusValue <= 599
    ? statusValue
    : null;
  if (typeof message !== 'string' || !message.trim() ||
      typeof code !== 'string' || !/^[A-Za-z0-9_-]+$/.test(code)) return original;
  return Object.assign(new Error(message, { cause: original }), { status, code });
}

const defaultRunVelaCollab: RunVelaCollab = (args, workspaceId, options) =>
  runVelaCommand(
    ['collab', ...args],
    {
      ...velaWorkspaceCommandOptions(workspaceId),
      ...options,
      ...(args[0] === 'presence'
        ? { timeoutMs: PRESENCE_COMMAND_TIMEOUT_MS }
        : args[0] === 'comment' && (args[1] === 'push' || args[1] === 'pull' || args[1] === 'push-batch')
          ? { timeoutMs: COMMENT_COMMAND_TIMEOUT_MS }
          : {}),
    },
  ).catch((error: unknown) => {
    throw args[0] === 'comment' && args[1] === 'push' ? commentCommandError(error) : error;
  });

export function shouldUseVelaCliCollabTransport(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (env.OD_WORKSPACE_CONTEXT_SOURCE?.trim() === 'vela') return true;
  const explicitTransport = env.OD_COLLAB_TRANSPORT?.trim();
  if (explicitTransport) return explicitTransport === 'vela-cli';
  if (env.OD_COLLAB_CLOUD_URL?.trim()) return false;
  return env.OD_TEAM_PROJECTS_TRANSPORT?.trim() === 'vela-cli' ||
    env.OD_RESOURCE_TRANSPORT?.trim() === 'vela-cli';
}

export function createVelaCliCollabClientFromEnv(
  env: NodeJS.ProcessEnv = process.env,
  options: Omit<VelaCliCollabClientOptions, 'run'> = {},
): VelaCliCollabClient | null {
  return shouldUseVelaCliCollabTransport(env)
    ? createVelaCliCollabClient(options)
    : null;
}
