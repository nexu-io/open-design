export type AmrSessionState =
  | 'signed_out'
  | 'authenticated'
  | 'reauth_required';

export interface AmrSessionStatus {
  sessionState: AmrSessionState;
  /**
   * Non-secret digest of the active credential revision. It lets clients show
   * one notice per expired credential without exposing any credential value.
   */
  credentialRevision: string;
}

export interface AmrLogoutRequest {
  expectedAppUserId: string;
  expectedCredentialRevision: string;
}

export interface AmrLogoutResponse {
  ok: true;
  revocationPending: boolean;
  legacyCredentialNotRevoked: boolean;
}
