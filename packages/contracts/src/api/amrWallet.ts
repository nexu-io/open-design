export type AmrWalletSnapshotStatus = 'signed_out' | 'available' | 'unavailable';

export type AmrWalletSnapshotSource = 'vela_api' | 'daemon_cache' | 'unavailable';

export type AmrWalletSnapshotErrorCode =
  | 'signed_out'
  | 'missing_control_key'
  | 'unauthorized'
  | 'network'
  | 'upstream';

export interface AmrWalletSnapshotUser {
  id?: string;
  email?: string;
  name?: string;
  plan?: string;
}

export interface AmrWalletSnapshotError {
  code: AmrWalletSnapshotErrorCode;
  message: string;
}

export interface AmrWalletSnapshot {
  status: AmrWalletSnapshotStatus;
  profile: string;
  user: AmrWalletSnapshotUser | null;
  balanceUsd: string | null;
  updatedAt: string | null;
  fetchedAt: string;
  stale: boolean;
  source: AmrWalletSnapshotSource;
  error?: AmrWalletSnapshotError;
}

export const AMR_WALLET_SNAPSHOT_STATUSES: readonly AmrWalletSnapshotStatus[] = [
  'signed_out',
  'available',
  'unavailable',
] as const;
