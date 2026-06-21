export type ProviderCredentialSource = 'user' | 'deployment';

export interface UserProviderCredentialRequestFields {
  /**
   * Defaults to `user`, which preserves the existing direct BYOK request
   * shape. `deployment` tells the daemon to resolve the provider endpoint and
   * credential from administrator-managed server configuration.
   */
  credentialSource?: 'user';
  apiKey: string;
  baseUrl: string;
}

export interface DeploymentProviderCredentialRequestFields {
  credentialSource: 'deployment';
  protocol: 'openai';
  apiKey?: never;
  baseUrl?: never;
}

export type ProviderCredentialSourceRequestFields =
  | UserProviderCredentialRequestFields
  | DeploymentProviderCredentialRequestFields;

export type DeploymentProviderConfigKind =
  | 'available'
  | 'not_configured'
  | 'missing_config'
  | 'invalid_base_url'
  | 'invalid_run_session_config';

export interface DeploymentProviderConfigResponse {
  available: boolean;
  credentialSource: 'deployment';
  protocol: 'openai';
  label: string;
  kind: DeploymentProviderConfigKind;
  defaultModel?: string;
  displayHost?: string;
  detail?: string;
}
