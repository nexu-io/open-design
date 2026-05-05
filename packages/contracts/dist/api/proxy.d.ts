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
    maxTokens?: number;
    apiVersion?: string;
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
//# sourceMappingURL=proxy.d.ts.map