import type { ProjectContentTransferState } from '@open-design/contracts';

export interface ProjectContentTransferScope {
  projectId: string;
  workspaceId: string;
  resourceTeamId: string;
  viewerMemberId: string;
  ownerMemberId: string;
}

declare const projectContentTransferTokenBrand: unique symbol;

/**
 * Opaque capability for completing one exact transfer generation. Runtime
 * membership is also checked, so a structurally copied token cannot finish a
 * transfer.
 */
export interface ProjectContentTransferToken {
  readonly generation: number;
  readonly scopeKey: string;
  readonly [projectContentTransferTokenBrand]: true;
}

export interface ProjectContentTransferStart {
  token: ProjectContentTransferToken;
  state: ProjectContentTransferState;
}

export interface ProjectContentTransferStateStore {
  begin(
    scope: ProjectContentTransferScope,
    version?: number,
  ): ProjectContentTransferStart;
  finish(
    scope: ProjectContentTransferScope,
    token: ProjectContentTransferToken,
    version?: number,
  ): ProjectContentTransferState | null;
  read(scope: ProjectContentTransferScope): ProjectContentTransferState | null;
}

export interface ProjectContentTransferStateStoreOptions {
  now?: () => number;
  onChange?: (
    scope: ProjectContentTransferScope,
    state: ProjectContentTransferState,
  ) => void;
}

interface StoredTransfer {
  scope: ProjectContentTransferScope;
  generation: number;
  state: ProjectContentTransferState;
}

const scopeKey = (scope: ProjectContentTransferScope): string =>
  JSON.stringify([
    scope.projectId,
    scope.workspaceId,
    scope.resourceTeamId,
    scope.viewerMemberId,
    scope.ownerMemberId,
  ]);

const copyScope = (
  scope: ProjectContentTransferScope,
): ProjectContentTransferScope => Object.freeze({ ...scope });

/**
 * Process-local transfer snapshot used by both project SSE and
 * `/collab/status`.
 *
 * A project id alone is not a safe identity: the same id can be observed
 * across workspace/resource/owner bindings. Each actual begin also issues a
 * fresh opaque generation token. Only that exact token together with the same
 * scope may finish the current transfer, so a versionless event or an older
 * async completion cannot hide a newer transfer.
 */
export function createProjectContentTransferStateStore(
  options: ProjectContentTransferStateStoreOptions = {},
): ProjectContentTransferStateStore {
  const states = new Map<string, StoredTransfer>();
  const generations = new Map<string, number>();
  const issuedTokens = new WeakSet<object>();
  const now = options.now ?? Date.now;

  const nextTimestamp = (previous?: ProjectContentTransferState): number =>
    Math.max(now(), (previous?.updatedAt ?? Number.NEGATIVE_INFINITY) + 1);

  const publish = (
    key: string,
    scope: ProjectContentTransferScope,
    generation: number,
    state: ProjectContentTransferState,
  ): ProjectContentTransferState => {
    states.set(key, { scope, generation, state });
    options.onChange?.(scope, state);
    return state;
  };

  return {
    begin(inputScope, version) {
      const scope = copyScope(inputScope);
      const key = scopeKey(scope);
      const previous = states.get(key);
      const generation = (generations.get(key) ?? 0) + 1;
      generations.set(key, generation);
      const token = Object.freeze({
        generation,
        scopeKey: key,
      }) as ProjectContentTransferToken;
      issuedTokens.add(token);
      const at = nextTimestamp(previous?.state);
      const state = publish(key, scope, generation, {
        status: 'downloading',
        ...(version != null ? { version } : {}),
        startedAt:
          previous?.state.status === 'downloading'
            ? previous.state.startedAt
            : at,
        updatedAt: at,
      });
      return { token, state };
    },

    finish(inputScope, token, version) {
      const key = scopeKey(inputScope);
      const previous = states.get(key);
      if (!previous) return null;
      if (
        !issuedTokens.has(token)
        || token.scopeKey !== key
        || token.generation !== previous.generation
      ) {
        return previous.state;
      }
      if (previous.state.status === 'idle') return previous.state;
      const at = nextTimestamp(previous.state);
      const resolvedVersion = version ?? previous.state.version;
      return publish(key, previous.scope, previous.generation, {
        status: 'idle',
        ...(resolvedVersion != null ? { version: resolvedVersion } : {}),
        startedAt: previous.state.startedAt,
        updatedAt: at,
      });
    },

    read(scope) {
      return states.get(scopeKey(scope))?.state ?? null;
    },
  };
}
