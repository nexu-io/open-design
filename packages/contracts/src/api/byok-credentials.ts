import type { ByokChatProtocol } from './chat.js';

export interface ByokCredentialProfile {
  id: string;
  label: string;
  protocol: ByokChatProtocol;
  baseUrl: string;
  model: string;
  apiVersion?: string;
  requiresApiKey: boolean;
  configured: boolean;
  keyTail?: string;
  createdAt: number;
  updatedAt: number;
}

export interface UpsertByokCredentialProfileRequest {
  id?: string;
  label: string;
  protocol: ByokChatProtocol;
  baseUrl: string;
  model: string;
  apiVersion?: string;
  requiresApiKey?: boolean;
  /**
   * Accepted only by the loopback daemon write endpoint. Never returned,
   * persisted in profile metadata, accepted by run APIs, or placed in a URL.
   */
  apiKey?: string;
}

export interface ByokCredentialProfilesResponse {
  available: boolean;
  backend: string;
  profiles: ByokCredentialProfile[];
}

export interface ByokCredentialProfileResponse {
  profile: ByokCredentialProfile;
}
