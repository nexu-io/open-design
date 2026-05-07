export type ProxyMessageRole = 'system' | 'user' | 'assistant' | 'tool';

export interface ProxyMessage {
  role: ProxyMessageRole;
  content: string;
}

export interface ProxyStreamRequest {
  baseUrl: string;
  apiKey: string;
  model: string;
  systemPrompt?: string;
  messages: ProxyMessage[];
  // Caps the upstream completion length. Defaults to 8192 when unset so
  // pre-existing clients keep their old behavior.
  maxTokens?: number;
}

export interface ProxyStreamStartPayload {
  model?: string;
}

export interface ProxyStreamDeltaPayload {
  delta: string;
}

export interface ProxyStreamEndPayload {
  code?: number;
}
