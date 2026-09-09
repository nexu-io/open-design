import { useEffect, useMemo, useRef, useState } from 'react';
import {
  type ProjectScopedPreviewNavigation,
  type ProjectScopedPreviewNavigationResult,
} from '../providers/registry';
import {
  PROJECT_PREVIEW_NAVIGATION_REFRESH_AHEAD_MS,
  projectPreviewNavigationCache,
  type ProjectPreviewNavigationRequest,
} from './project-preview-navigation-cache';
import {
  buildPreviewSessionNavigation,
  type PreviewSessionNavigation,
  type PreviewSessionNavigationPolicy,
} from './preview-session-navigation';

interface ProjectPreviewNavigationSource {
  get(
    request: ProjectPreviewNavigationRequest,
  ): Promise<ProjectScopedPreviewNavigationResult>;
}

export interface UseProjectScopedPreviewNavigationOptions
  extends ProjectPreviewNavigationRequest {
  enabled?: boolean;
  /** Keep the same owner's last-good document visible while minting is paused. */
  retainLastGoodWhenDisabled?: boolean;
  /** Optional stable test/provider override. Do not recreate it during render. */
  cache?: ProjectPreviewNavigationSource;
  now?: () => number;
  refreshAheadMs?: number;
}

export interface UseProjectPreviewSessionNavigationOptions
  extends UseProjectScopedPreviewNavigationOptions {
  policy: PreviewSessionNavigationPolicy;
}

export interface ProjectScopedPreviewNavigationState {
  scoped: ProjectScopedPreviewNavigation | null;
  loading: boolean;
  unavailable: boolean;
  expiresAt: number | null;
}

export interface ProjectPreviewSessionNavigationState {
  navigation: PreviewSessionNavigation | null;
  loading: boolean;
  unavailable: boolean;
  expiresAt: number | null;
}

export interface UsePreviewSessionNavigationFromScopeOptions {
  scopedState: ProjectScopedPreviewNavigationState;
  /** Null until an old daemon's document policy has been classified locally. */
  policy: PreviewSessionNavigationPolicy | null;
}

interface LoadedScopedNavigationState extends ProjectScopedPreviewNavigationState {
  ownerKey: string;
  loadKey: string | null;
  lastGoodScoped: ProjectScopedPreviewNavigation | null;
  renewalFailures: number;
}

const EMPTY_SCOPED_STATE: LoadedScopedNavigationState = {
  ownerKey: '',
  loadKey: null,
  scoped: null,
  lastGoodScoped: null,
  loading: false,
  unavailable: false,
  expiresAt: null,
  renewalFailures: 0,
};

const RENEWAL_RETRY_BASE_MS = 1_000;
const RENEWAL_RETRY_MAX_MS = 30_000;

function stableKey(parts: readonly string[]): string {
  return parts.join('\0');
}

function sameNavigation(
  left: PreviewSessionNavigation | null,
  right: PreviewSessionNavigation,
): boolean {
  return left?.sessionId === right.sessionId
    && left.documentVersion === right.documentVersion
    && left.url === right.url
    && left.runtimeProtocol === right.runtimeProtocol
    && left.sandboxProfile === right.sandboxProfile
    && left.deck === right.deck;
}

/**
 * Resolve and renew the scoped real-URL capability for one FileViewer slot.
 *
 * A revision update retains the previous capability while the replacement is
 * being minted, allowing PreviewSession to keep last-good content visible.
 * Project, file, or authorization changes fail closed and never expose the
 * previous owner's scoped URL.
 */
export function useProjectScopedPreviewNavigation({
  projectId,
  fileName,
  revisionKey,
  authorizationKey,
  enabled = true,
  retainLastGoodWhenDisabled = false,
  cache = projectPreviewNavigationCache,
  now = Date.now,
  refreshAheadMs = PROJECT_PREVIEW_NAVIGATION_REFRESH_AHEAD_MS,
}: UseProjectScopedPreviewNavigationOptions): ProjectScopedPreviewNavigationState {
  const ownerKey = stableKey([authorizationKey, projectId, fileName]);
  const loadKey = stableKey([ownerKey, revisionKey]);
  const request = useMemo<ProjectPreviewNavigationRequest>(() => ({
    projectId,
    fileName,
    revisionKey,
    authorizationKey,
  }), [authorizationKey, fileName, projectId, revisionKey]);
  const requestGenerationRef = useRef(0);
  const [state, setState] = useState<LoadedScopedNavigationState>(EMPTY_SCOPED_STATE);

  useEffect(() => {
    const generation = ++requestGenerationRef.current;
    if (!enabled) {
      setState((previous) => previous.ownerKey === ownerKey
        ? {
            ...previous,
            loadKey: null,
            scoped: null,
            loading: false,
            unavailable: false,
            renewalFailures: 0,
          }
        : { ...EMPTY_SCOPED_STATE, ownerKey });
      return;
    }

    setState((previous) => previous.ownerKey === ownerKey
      ? {
          ...previous,
          loadKey: null,
          scoped: null,
          loading: true,
          unavailable: false,
          expiresAt: null,
          renewalFailures: 0,
        }
      : { ...EMPTY_SCOPED_STATE, ownerKey, loading: true });

    void cache.get(request).then((result) => {
      if (requestGenerationRef.current !== generation) return;
      if (!result) {
        setState((previous) => ({
          ...previous,
          ownerKey,
          loadKey,
          scoped: null,
          lastGoodScoped: null,
          loading: false,
          unavailable: true,
          expiresAt: null,
          renewalFailures: 0,
        }));
        return;
      }
      const scoped = result;
      setState(() => ({
        ownerKey,
        loadKey,
        scoped,
        lastGoodScoped: scoped,
        loading: false,
        unavailable: false,
        expiresAt: scoped.renewalScope.expiresAt,
        renewalFailures: 0,
      }));
    }).catch(() => {
      if (requestGenerationRef.current !== generation) return;
      setState((previous) => ({
        ...previous,
        ownerKey,
        loadKey,
        scoped: null,
        lastGoodScoped: null,
        loading: false,
        unavailable: true,
        expiresAt: null,
        renewalFailures: 0,
      }));
    });

    return () => {
      if (requestGenerationRef.current === generation) {
        requestGenerationRef.current += 1;
      }
    };
  }, [cache, enabled, loadKey, ownerKey, request]);

  useEffect(() => {
    if (
      !enabled
      || state.ownerKey !== ownerKey
      || state.loadKey !== loadKey
      || !state.scoped
    ) return;
    const delay = state.renewalFailures > 0
      ? Math.min(
          RENEWAL_RETRY_MAX_MS,
          RENEWAL_RETRY_BASE_MS * (2 ** Math.min(state.renewalFailures - 1, 5)),
        )
      : Math.max(
          0,
          state.scoped.renewalScope.expiresAt - now() - Math.max(0, refreshAheadMs),
        );
    const generation = requestGenerationRef.current;
    const timer = window.setTimeout(() => {
      void cache.get(request).then((result) => {
        if (requestGenerationRef.current !== generation) return;
        if (!result) {
          setState((previous) => previous.ownerKey === ownerKey
            && previous.loadKey === loadKey
            ? {
                ...previous,
                unavailable: true,
                renewalFailures: previous.renewalFailures + 1,
              }
            : previous);
          return;
        }
        const scoped = result;
        setState((previous) => {
          if (previous.ownerKey !== ownerKey || previous.loadKey !== loadKey) return previous;
          const needsAnotherAttempt = scoped.renewalScope.expiresAt
            <= now() + Math.max(0, refreshAheadMs);
          return {
            ...previous,
            scoped,
            lastGoodScoped: scoped,
            unavailable: false,
            expiresAt: scoped.renewalScope.expiresAt,
            renewalFailures: needsAnotherAttempt ? previous.renewalFailures + 1 : 0,
          };
        });
      }).catch(() => {
        if (requestGenerationRef.current !== generation) return;
        setState((previous) => previous.ownerKey === ownerKey
          && previous.loadKey === loadKey
          ? {
              ...previous,
              unavailable: true,
              renewalFailures: previous.renewalFailures + 1,
            }
          : previous);
      });
    }, delay);
    return () => window.clearTimeout(timer);
  }, [cache, enabled, loadKey, now, ownerKey, refreshAheadMs, request, state]);

  if (!enabled) {
    if (retainLastGoodWhenDisabled && state.ownerKey === ownerKey) {
      return {
        scoped: state.lastGoodScoped,
        loading: false,
        unavailable: false,
        expiresAt: state.expiresAt,
      };
    }
    return {
      scoped: null,
      loading: false,
      unavailable: false,
      expiresAt: null,
    };
  }
  if (state.ownerKey !== ownerKey) {
    return {
      scoped: null,
      loading: true,
      unavailable: false,
      expiresAt: null,
    };
  }
  return {
    scoped: state.lastGoodScoped,
    loading: state.loading,
    unavailable: state.unavailable,
    expiresAt: state.expiresAt,
  };
}

/**
 * Bind a scoped URL capability to the document policy chosen for this render.
 * Policy discovery is deliberately separate from scope acquisition: learning
 * more about a document must not mint another credential or restart renewal.
 */
export function useProjectPreviewSessionNavigation({
  policy,
  ...scopeOptions
}: UseProjectPreviewSessionNavigationOptions): ProjectPreviewSessionNavigationState {
  const scopedState = useProjectScopedPreviewNavigation(scopeOptions);
  return usePreviewSessionNavigationFromScope({ scopedState, policy });
}

/**
 * Map an already-owned scope to a document navigation without coupling policy
 * discovery to credential acquisition. A null policy deliberately preserves
 * an existing last-good document but cannot start an unclassified one.
 */
export function usePreviewSessionNavigationFromScope({
  scopedState,
  policy,
}: UsePreviewSessionNavigationFromScopeOptions): ProjectPreviewSessionNavigationState {
  const stablePolicy = useMemo<PreviewSessionNavigationPolicy>(() => ({
    sandboxProfile: policy?.sandboxProfile ?? 'normal',
    guards: {
      storage: policy?.guards.storage ?? false,
      focus: policy?.guards.focus ?? false,
      redirect: policy?.guards.redirect ?? false,
    },
    deck: policy?.deck ?? false,
  }), [
    policy?.deck,
    policy?.guards.focus,
    policy?.guards.redirect,
    policy?.guards.storage,
    policy?.sandboxProfile,
  ]);
  const navigationRef = useRef<PreviewSessionNavigation | null>(null);

  if (!scopedState.scoped) {
    navigationRef.current = null;
  } else if (scopedState.scoped.previewPolicy || policy) {
    const navigation = buildPreviewSessionNavigation(scopedState.scoped, stablePolicy);
    if (!sameNavigation(navigationRef.current, navigation)) {
      navigationRef.current = navigation;
    }
  }

  return {
    navigation: navigationRef.current,
    loading: scopedState.loading
      || (scopedState.scoped !== null && !scopedState.scoped.previewPolicy && policy === null),
    unavailable: scopedState.unavailable,
    expiresAt: scopedState.expiresAt,
  };
}
