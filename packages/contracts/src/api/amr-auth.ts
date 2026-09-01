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
