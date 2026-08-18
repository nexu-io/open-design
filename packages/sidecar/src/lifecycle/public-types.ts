import type { SidecarControlJsonValue } from "../control/public-types.js";

export type SidecarLifecycleScope = Readonly<{
  channel: string;
  namespace: string;
}>;

/** Caller-owned identity. Sidecar stores and returns it, but never interprets it. */
export type SidecarLifecycleOwner = Readonly<{
  generation: number;
  incarnation: string;
  key: string;
  projection?: SidecarControlJsonValue;
}>;

export type SidecarLeaseCredential = Readonly<{
  id: string;
  token: string;
}>;

export type SidecarTransitionCredential = Readonly<{
  fence: number;
  id: string;
  token: string;
}>;

export type SidecarLeaseView = Readonly<{
  expiresAtMs: number;
  id: string;
  owner: SidecarLifecycleOwner;
}>;

export type SidecarTransitionView = Readonly<{
  expiresAtMs: number;
  fence: number;
  id: string;
  kind: string;
  owner: SidecarLifecycleOwner;
}>;

export type SidecarLifecycleSnapshot = Readonly<{
  leases: readonly SidecarLeaseView[];
  scope: SidecarLifecycleScope;
  transition: SidecarTransitionView | null;
}>;

export type SidecarAttachResult =
  | Readonly<{
      credential: SidecarLeaseCredential;
      lease: SidecarLeaseView;
      state: "attached";
    }>
  | Readonly<{
      reason: "transition-active";
      state: "blocked";
      transition: SidecarTransitionView;
    }>;

export type SidecarRenewLeaseResult =
  | Readonly<{ lease: SidecarLeaseView; state: "renewed" }>
  | Readonly<{
      reason: "expired-or-fenced" | "transition-active";
      state: "rejected";
      transition?: SidecarTransitionView;
    }>;

export type SidecarBeginTransitionResult =
  | Readonly<{
      credential: SidecarTransitionCredential;
      state: "acquired";
      transition: SidecarTransitionView;
    }>
  | Readonly<{
      occupants?: readonly SidecarLeaseView[];
      reason: "occupied" | "requester-expired-or-fenced" | "transition-active";
      state: "blocked";
      transition?: SidecarTransitionView;
    }>;

export type SidecarRenewTransitionResult =
  | Readonly<{ state: "renewed"; transition: SidecarTransitionView }>
  | Readonly<{ reason: "expired-or-fenced"; state: "rejected" }>;

export type SidecarTakeoverTransitionResult =
  | Readonly<{
      credential: SidecarTransitionCredential;
      state: "acquired";
      transition: SidecarTransitionView;
    }>
  | Readonly<{ reason: "expired-or-fenced"; state: "rejected" }>;

export type SidecarCompleteTransitionResult =
  | Readonly<{ state: "completed" }>
  | Readonly<{
      reason: "lease-expired-or-fenced" | "transition-expired-or-fenced";
      state: "rejected";
    }>;

export type SidecarAbortTransitionResult =
  | Readonly<{ state: "aborted" }>
  | Readonly<{ reason: "expired-or-fenced"; state: "rejected" }>;

export type SidecarLifecyclePlane = Readonly<{
  scope: SidecarLifecycleScope;
  attach(options: Readonly<{
    leaseMs: number;
    owner: SidecarLifecycleOwner;
    transition?: SidecarTransitionCredential;
  }>): Promise<SidecarAttachResult>;
  renewLease(options: Readonly<{
    credential: SidecarLeaseCredential;
    leaseMs: number;
    transition?: SidecarTransitionCredential;
  }>): Promise<SidecarRenewLeaseResult>;
  detach(credential: SidecarLeaseCredential): Promise<Readonly<{ detached: boolean }>>;
  beginTransition(options: Readonly<{
    kind: string;
    leaseMs: number;
    owner: SidecarLifecycleOwner;
    requester?: SidecarLeaseCredential;
  }>): Promise<SidecarBeginTransitionResult>;
  renewTransition(options: Readonly<{
    credential: SidecarTransitionCredential;
    leaseMs: number;
  }>): Promise<SidecarRenewTransitionResult>;
  takeoverTransition(options: Readonly<{
    credential: SidecarTransitionCredential;
    leaseMs: number;
    owner: SidecarLifecycleOwner;
  }>): Promise<SidecarTakeoverTransitionResult>;
  abortTransition(
    credential: SidecarTransitionCredential,
  ): Promise<SidecarAbortTransitionResult>;
  completeTransition(options: Readonly<{
    lease: SidecarLeaseCredential;
    transition: SidecarTransitionCredential;
  }>): Promise<SidecarCompleteTransitionResult>;
  snapshot(): Promise<SidecarLifecycleSnapshot>;
}>;

export type BootstrapSidecarLifecycleOptions = Readonly<{
  /** Stable namespace control root, outside an app generation or temporary directory. */
  controlRoot: string;
  guardSpinMs?: number;
  guardStaleMs?: number;
  maxLeaseMs?: number;
  now?: () => number;
  scope: SidecarLifecycleScope;
}>;

