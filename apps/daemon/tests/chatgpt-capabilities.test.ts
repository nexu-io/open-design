import { describe, expect, it } from 'vitest';

import {
  CHATGPT_STUDIO_COOKIE,
  chatGptCapabilityTtlSeconds,
  chatGptCapabilitySecret,
  chatGptStudioCookieToken,
  createChatGptCapabilityToken,
  verifyChatGptCapabilityToken,
} from '../src/services/chatgpt-capabilities.js';
import { chatGptTenantKey } from '../src/services/chatgpt-tenant-daemons.js';

const SECRET = 'test-capability-secret-that-is-long-enough';
const NOW = Date.parse('2026-07-16T10:00:00.000Z');

describe('ChatGPT artifact capabilities', () => {
  it('signs subject-hashed, project-scoped, expiring capabilities', () => {
    const token = createChatGptCapabilityToken({
      purpose: 'studio',
      tenantKey: chatGptTenantKey('user@example.com'),
      projectId: 'launch',
      conversationId: 'conversation-1',
      entryFile: 'site/index.html',
    }, SECRET, { nowMs: NOW, ttlSeconds: 600 });

    expect(token).not.toContain('user@example.com');
    expect(verifyChatGptCapabilityToken(token, SECRET, { nowMs: NOW + 599_000 })).toMatchObject({
      purpose: 'studio',
      projectId: 'launch',
      conversationId: 'conversation-1',
      entryFile: 'site/index.html',
    });
    expect(verifyChatGptCapabilityToken(token, SECRET, { nowMs: NOW + 600_000 })).toBeNull();
    expect(verifyChatGptCapabilityToken(`${token}tampered`, SECRET, { nowMs: NOW })).toBeNull();
  });

  it('reads only the exact Studio cookie and bounds configured TTL', () => {
    expect(chatGptStudioCookieToken(`other=1; ${CHATGPT_STUDIO_COOKIE}=signed.token; x=2`)).toBe(
      'signed.token',
    );
    expect(chatGptStudioCookieToken('other=1')).toBeNull();
    expect(chatGptCapabilityTtlSeconds({ OD_CHATGPT_CAPABILITY_TTL_SECONDS: '3600' })).toBe(3600);
    expect(chatGptCapabilitySecret({
      OD_CHATGPT_CAPABILITY_SIGNING_SECRET: '',
      OD_CHATGPT_TENANT_GATEWAY_SECRET: SECRET,
    })).toBe(SECRET);
    expect(() => chatGptCapabilityTtlSeconds({ OD_CHATGPT_CAPABILITY_TTL_SECONDS: '86401' })).toThrow(
      'between 1 and 86400',
    );
  });
});
