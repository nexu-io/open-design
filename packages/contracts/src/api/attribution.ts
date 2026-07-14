export const ATTRIBUTION_CLAIM_PATH = '/api/attribution/claim';

export type AttributionClaimSource =
  | 'mac_where_froms'
  | 'windows_zone_identifier'
  | 'installer_observation_file'
  | 'manual';

export type AttributionClaimPlatform = 'macos' | 'windows' | 'linux' | 'unknown';

export interface AttributionClaimRequest {
  token?: string | null;
  rawUrl?: string | null;
  source: AttributionClaimSource;
  platform?: AttributionClaimPlatform | null;
}

export type AttributionClaimStatus =
  | 'pending_consent'
  | 'pending_installation_id'
  | 'pending_ledger'
  | 'claimed'
  | 'already_claimed'
  | 'shared_installer'
  | 'not_found'
  | 'invalid';

export interface AttributionClaimResponse {
  ok: true;
  status: AttributionClaimStatus;
  found: boolean;
  pending: boolean;
  merged: boolean;
}
