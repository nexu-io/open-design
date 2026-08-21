import { useCallback, useEffect, useRef, useState } from 'react';
import type { WorkspaceCollabContext } from '@open-design/contracts';
import { BackoffController } from '../lib/backoff';
import {
  WORKSPACE_CONTEXT_REFRESH_EVENT,
  resolveBoundProjectWorkspaceContext,
  workspaceContextRefreshHasVerifiedSelection,
  type WorkspaceContextState,
} from './useWorkspaceContext';
import { workspaceIdentityCacheKey } from './workspace-identity';

export interface ProjectRouteWorkspaceContextState {
  context: WorkspaceCollabContext | null;
  loading: boolean;
  failure?: 'forbidden' | 'unavailable';
  retry: () => void;
}

const PROJECT_ROUTE_RETRY_BASE_MS = 1_000;
const PROJECT_ROUTE_RETRY_MAX_MS = 30_000;

export function projectResourceReadsCanStart(
  persistedWorkspaceId: string | null | undefined,
  state: ProjectRouteWorkspaceContextState,
): boolean {
  return !(persistedWorkspaceId?.trim()) || state.context !== null;
}

/**
 * Resolve the caller authority for a project route from the project's
 * persisted Workspace binding.
 *
 * A fresh deep link often learns the project row before the shell's ambient
 * `/workspace/context` read completes. Waiting for that ambient read is both
 * slow and incorrect when the shell currently points at another Workspace.
 * The account directory already names the exact membership for the persisted
 * Workspace, so use it as the request witness and keep every project resource
 * dormant until that witness exists.
 *
 * An explicitly unbound project remains the compatibility lane: it settles
 * immediately with a null context so signed-out local CLI/BYOK projects keep
 * their legal headerless reads.
 */
export function useProjectRouteWorkspaceContext(
  persistedWorkspaceId: string | null | undefined,
  ambientState: WorkspaceContextState,
  bootstrapWorkspaceContext?: WorkspaceCollabContext | null,
): ProjectRouteWorkspaceContextState {
  const workspaceId = persistedWorkspaceId?.trim() ?? '';
  const [identityRefreshPending, setIdentityRefreshPending] = useState(false);
  const exactAmbientContext =
    !ambientState.identityChangePending
    && !identityRefreshPending
    && ambientState.context?.workspaceId === workspaceId
      ? ambientState.context
      : null;
  const exactAmbientIdentity = workspaceIdentityCacheKey(exactAmbientContext);
  const exactBootstrapContext =
    bootstrapWorkspaceContext?.workspaceId === workspaceId
    && bootstrapWorkspaceContext.workspaceMemberId.trim().length > 0
    && bootstrapWorkspaceContext.memberStatus === 'active'
    && bootstrapWorkspaceContext.lifecycleState !== 'deleted'
      ? bootstrapWorkspaceContext
      : null;
  const exactBootstrapIdentity = workspaceIdentityCacheKey(exactBootstrapContext);
  const initialExactContext = exactAmbientContext ?? exactBootstrapContext;
  const requestEpochRef = useRef(0);
  const consumedBootstrapContextRef = useRef<WorkspaceCollabContext | null>(null);
  const [refreshRevision, setRefreshRevision] = useState(0);
  const retryTimerRef = useRef<number | null>(null);
  const retryBackoffRef = useRef<BackoffController | null>(null);
  if (retryBackoffRef.current === null) {
    retryBackoffRef.current = new BackoffController({
      initialMs: PROJECT_ROUTE_RETRY_BASE_MS,
      maxMs: PROJECT_ROUTE_RETRY_MAX_MS,
      factor: 2,
      jitter: true,
    });
  }
  const clearScheduledRetry = useCallback(() => {
    if (retryTimerRef.current === null) return;
    window.clearTimeout(retryTimerRef.current);
    retryTimerRef.current = null;
  }, []);
  const resetRetryBackoff = useCallback(() => {
    clearScheduledRetry();
    retryBackoffRef.current?.reset();
  }, [clearScheduledRetry]);
  const retry = useCallback(() => {
    clearScheduledRetry();
    setRefreshRevision((current) => current + 1);
  }, [clearScheduledRetry]);
  const scheduleRetry = useCallback(() => {
    if (retryTimerRef.current !== null) return;
    const delay = retryBackoffRef.current?.nextDelay() ?? PROJECT_ROUTE_RETRY_BASE_MS;
    retryTimerRef.current = window.setTimeout(() => {
      retryTimerRef.current = null;
      setRefreshRevision((current) => current + 1);
    }, delay);
  }, []);
  const [resolved, setResolved] = useState<{
    workspaceId: string;
    state: Omit<ProjectRouteWorkspaceContextState, 'retry'>;
  }>(() => ({
    workspaceId,
    state: workspaceId
      ? { context: initialExactContext, loading: initialExactContext === null }
      : { context: null, loading: false },
  }));

  useEffect(() => {
    resetRetryBackoff();
    return () => {
      // Retire a directory read that settles after this project route unmounts
      // or changes Workspace, so it cannot arm a detached retry timer.
      requestEpochRef.current += 1;
      clearScheduledRetry();
    };
  }, [workspaceId, clearScheduledRetry, resetRetryBackoff]);

  useEffect(() => {
    const refresh = () => setRefreshRevision((current) => current + 1);
    const refreshAfterIdentityChange = () => {
      if (workspaceContextRefreshHasVerifiedSelection()) {
        // The server just verified a different ambient Workspace selection for
        // this same signed-in account. Keep the open project's exact authority
        // live while revalidating it in the background; blanking it here would
        // remount ProjectView every time the navigation rail changes.
        setRefreshRevision((current) => current + 1);
        return;
      }
      // An unseeded sign-in/sign-out refresh advances the account generation.
      // Retire both the in-flight directory read and the currently
      // resolved authority synchronously with that signal: retaining the old
      // context during the fresh lookup would let a newly mounted resource
      // effect emit one more wave with the previous account/member headers.
      requestEpochRef.current += 1;
      resetRetryBackoff();
      setIdentityRefreshPending(Boolean(workspaceId));
      setResolved({
        workspaceId,
        state: workspaceId
          ? { context: null, loading: true }
          : { context: null, loading: false },
      });
      setRefreshRevision((current) => current + 1);
    };
    window.addEventListener(WORKSPACE_CONTEXT_REFRESH_EVENT, refreshAfterIdentityChange);
    window.addEventListener('focus', refresh);
    window.addEventListener('pageshow', refresh);
    return () => {
      window.removeEventListener(WORKSPACE_CONTEXT_REFRESH_EVENT, refreshAfterIdentityChange);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('pageshow', refresh);
    };
  }, [workspaceId, resetRetryBackoff]);

  useEffect(() => {
    const requestEpoch = ++requestEpochRef.current;
    if (!workspaceId) {
      resetRetryBackoff();
      setIdentityRefreshPending(false);
      setResolved({
        workspaceId,
        state: { context: null, loading: false },
      });
      return;
    }
    if (exactAmbientContext) {
      resetRetryBackoff();
      setIdentityRefreshPending(false);
      setResolved({
        workspaceId,
        state: { context: exactAmbientContext, loading: false },
      });
      return;
    }
    if (
      exactBootstrapContext
      && consumedBootstrapContextRef.current !== exactBootstrapContext
    ) {
      // The object is a newly completed route/open witness. Accept it once even
      // if this long-lived hook observed focus or Workspace refresh events before
      // the project route existed; those revisions predate this exact witness.
      // Remember the object, not just its identity key, so a later refresh cannot
      // reuse the same snapshot while a genuinely new verification for the same
      // member remains adoptable.
      consumedBootstrapContextRef.current = exactBootstrapContext;
      resetRetryBackoff();
      setIdentityRefreshPending(false);
      setResolved({
        workspaceId,
        state: { context: exactBootstrapContext, loading: false },
      });
      return;
    }

    setResolved((current) => current.workspaceId === workspaceId
      ? {
          workspaceId,
          state: current.state.context
            ? current.state
            : { context: null, loading: true },
        }
      : {
          workspaceId,
          state: { context: null, loading: true },
        });
    void resolveBoundProjectWorkspaceContext(workspaceId, {
      fresh: refreshRevision > 0,
    }).then(
      (context) => {
        if (requestEpochRef.current !== requestEpoch) return;
        resetRetryBackoff();
        setIdentityRefreshPending(false);
        setResolved({
          workspaceId,
          state: context
            ? { context, loading: false }
            : { context: null, loading: false, failure: 'forbidden' },
        });
      },
      () => {
        if (requestEpochRef.current !== requestEpoch) return;
        setIdentityRefreshPending(false);
        setResolved((current) => ({
          workspaceId,
          // A rejected directory request proves nothing about this project's
          // membership. That includes account-level 401/403 responses: the
          // ambient shell owns reauthentication, while only a successful
          // directory response without this member is project-level denial.
          // Keep only an authority already verified for this exact persisted
          // Workspace; account changes synchronously cleared it above before
          // this request could start. A cold route with no witness still fails
          // closed with `context: null`.
          state: {
            context: current.workspaceId === workspaceId
              ? current.state.context
              : null,
            loading: false,
            failure: 'unavailable',
          },
        }));
        scheduleRetry();
      },
    );
  }, [
    workspaceId,
    exactAmbientIdentity,
    exactBootstrapIdentity,
    refreshRevision,
    resetRetryBackoff,
    scheduleRetry,
  ]);

  if (!workspaceId) return { context: null, loading: false, retry };
  if (exactAmbientContext) {
    return { context: exactAmbientContext, loading: false, retry };
  }
  if (resolved.workspaceId !== workspaceId) {
    return { context: null, loading: true, retry };
  }
  return { ...resolved.state, retry };
}
