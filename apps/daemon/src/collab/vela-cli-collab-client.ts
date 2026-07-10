import { execFile } from 'node:child_process';
import type {
  CollabCloudComment,
  CollabCloudMemberDirectoryEntry,
  CollabMemberRole,
  CollabPresenceMember,
} from '@open-design/contracts';
import { amrVelaProfileEnv } from '../integrations/vela-profile.js';

export type RunVelaCollab = (args: string[]) => Promise<string>;

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

  async function runJson<T>(args: string[]): Promise<T> {
    const stdout = await run(args);
    const trimmed = stdout.trim();
    if (!trimmed) return {} as T;
    return JSON.parse(trimmed) as T;
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
      const payload = await runJson<{ member?: MemberWire }>(args);
      return toDirectoryEntry(payload.member);
    },

    async listMembers(_teamId: string): Promise<CollabCloudMemberDirectoryEntry[]> {
      const payload = await runJson<{ members?: MemberWire[] }>(['member', 'list']);
      return Array.isArray(payload.members) ? payload.members.map(toDirectoryEntry) : [];
    },

    async pushComment(
      _teamId: string,
      projectId: string,
      comment: CollabCloudComment,
    ): Promise<{ seq: number }> {
      const payload = await runJson<{ seq?: unknown }>([
        'comment',
        'push',
        projectId,
        '--comment-json',
        JSON.stringify(comment),
      ]);
      return { seq: typeof payload.seq === 'number' ? payload.seq : 0 };
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
      ]);
      const comments = Array.isArray(payload.comments)
        ? (payload.comments as CollabCloudComment[])
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
      const payload = await runJson<{ viewers?: PresenceWire[] }>(args);
      return Array.isArray(payload.viewers) ? payload.viewers.map(toPresenceMember) : [];
    },

    async listPresence(projectId: string): Promise<CollabPresenceMember[]> {
      const payload = await runJson<{ viewers?: PresenceWire[] }>([
        'presence',
        'list',
        projectId,
      ]);
      return Array.isArray(payload.viewers) ? payload.viewers.map(toPresenceMember) : [];
    },

    async leavePresence(
      projectId: string,
      input: VelaCliPresenceLeaveInput,
    ): Promise<CollabPresenceMember[]> {
      const payload = await runJson<{ viewers?: PresenceWire[] }>([
        'presence',
        'leave',
        projectId,
        '--client-id',
        input.clientId ?? input.memberId,
      ]);
      return Array.isArray(payload.viewers) ? payload.viewers.map(toPresenceMember) : [];
    },
  };
}

export type VelaCliCollabClient = ReturnType<typeof createVelaCliCollabClient>;

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
  const member: CollabPresenceMember = {
    memberId: typeof input.memberId === 'string' ? input.memberId : '',
    role: isRole(input.role) ? input.role : 'member',
  };
  if (typeof input.displayName === 'string' && input.displayName.trim()) {
    member.name = input.displayName.trim();
  }
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

const defaultRunVelaCollab: RunVelaCollab = (args) =>
  new Promise<string>((resolve, reject) => {
    const bin = process.env.OD_VELA_BIN?.trim() || 'vela';
    execFile(
      bin,
      ['collab', ...args],
      { env: buildVelaCollabEnv(), maxBuffer: 16 * 1024 * 1024 },
      (error, stdout) => {
        if (error) reject(error);
        else resolve(stdout);
      },
    );
  });

export function buildVelaCollabEnv(
  env: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  // OPEN_DESIGN_AMR_PROFILE remains the daemon-level default, but an explicit
  // VELA_PROFILE/AMR_HOME/VELA_API_URL on the daemon process must win so local
  // multi-user tools-dev runs can point each daemon at a different CLI profile.
  return { ...amrVelaProfileEnv(env), ...env };
}

export function shouldUseVelaCliCollabTransport(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const explicitTransport = env.OD_COLLAB_TRANSPORT?.trim();
  if (explicitTransport) return explicitTransport === 'vela-cli';
  if (env.OD_COLLAB_CLOUD_URL?.trim()) return false;
  return env.OD_TEAM_PROJECTS_TRANSPORT?.trim() === 'vela-cli' ||
    env.OD_RESOURCE_TRANSPORT?.trim() === 'vela-cli';
}

export function createVelaCliCollabClientFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): VelaCliCollabClient | null {
  return shouldUseVelaCliCollabTransport(env) ? createVelaCliCollabClient() : null;
}
