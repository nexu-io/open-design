export type ProviderCredentialSource = 'user' | 'deployment';

export interface ProviderCredentialSourceRequestFields {
  /**
   * Defaults to `user`, which preserves the existing direct BYOK request
   * shape. `deployment` tells the daemon to resolve the provider endpoint and
   * credential from administrator-managed server configuration.
   */
  credentialSource?: ProviderCredentialSource;
}

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
