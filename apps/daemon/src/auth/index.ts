/**
 * @module auth
 *
 * Barrel for daemon authentication/authorization concerns: desktop-auth (HMAC
 * session secret), api-token-auth (API token env gating), origin validation
 * (same-origin request gate), and tool-token grants.
 */
export * from './desktop-auth.js';
export * from './api-token-auth.js';
export * from './origin-validation.js';
export * from './tool-tokens.js';
