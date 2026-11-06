export type ReasoningExecutionMode = 'enabled' | 'disabled' | 'allowlist';

export interface ReasoningExecutionPolicy {
  mode: ReasoningExecutionMode;
  allowedBaseUrls?: string[];
  allowedModels?: string[];
  denyProviderDiscovery?: boolean;
  denyConnectionTests?: boolean;
  denyFinalize?: boolean;
}

export interface ReasoningExecutionRequestFields {
  reasoningExecution?: ReasoningExecutionPolicy;
}
