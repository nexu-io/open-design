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
