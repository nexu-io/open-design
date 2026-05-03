// @ts-nocheck
// Per-provider credentials for the media dispatcher.
//
// The frontend Settings dialog pushes API keys here via PUT
// /api/media/config; the daemon persists them to .od/media-config.json
// and reads them at generation time. Environment variables override the
// stored values so power users can keep keys out of the workspace
// folder altogether (`OD_OPENAI_API_KEY=… node daemon/cli.js`).
//
// The file is intentionally simple JSON — no encryption, no schema
// versioning yet. The daemon listens on 127.0.0.1 only and the workspace
// is already trusted, so adding a vault here would mostly be theatre.
// We DO mask keys when reading via the GET endpoint so the UI doesn't
// echo secrets back into the DOM.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { MEDIA_PROVIDERS } from './media-models.js';

const PROVIDER_IDS = MEDIA_PROVIDERS.map((p) => p.id);

const ENV_KEYS = {
  // OPENAI_API_KEY is the canonical env for the standard OpenAI API.
  // AZURE_API_KEY / AZURE_OPENAI_API_KEY are the canonical envs Azure
  // OpenAI examples use — we share the openai provider slot so a user
  // who pastes an Azure deployment URL into the OpenAI Base URL field
  // gets the credential picked up automatically.
  openai: [
    'OD_OPENAI_API_KEY',
    'OPENAI_API_KEY',
    'AZURE_API_KEY',
    'AZURE_OPENAI_API_KEY',
  ],
  volcengine: ['OD_VOLCENGINE_API_KEY', 'ARK_API_KEY', 'VOLCENGINE_API_KEY'],
  // OD_GROK_API_KEY first (the project-reserved override, same shape as
  // every other provider above), then XAI_API_KEY as the canonical
  // upstream env per docs.x.ai quickstart — so users who already export
  // it for the official SDK don't have to re-paste into Settings.
  grok: ['OD_GROK_API_KEY', 'XAI_API_KEY'],
  bfl: ['OD_BFL_API_KEY', 'BFL_API_KEY'],
  fal: ['OD_FAL_KEY', 'FAL_KEY'],
  replicate: ['OD_REPLICATE_API_TOKEN', 'REPLICATE_API_TOKEN'],
  google: ['OD_GOOGLE_API_KEY', 'GOOGLE_API_KEY', 'GEMINI_API_KEY'],
  kling: ['OD_KLING_API_KEY', 'KLING_API_KEY'],
  midjourney: ['OD_MIDJOURNEY_API_KEY'],
  minimax: ['OD_MINIMAX_API_KEY', 'MINIMAX_API_KEY'],
  suno: ['OD_SUNO_API_KEY'],
  udio: ['OD_UDIO_API_KEY'],
  elevenlabs: ['OD_ELEVENLABS_API_KEY', 'ELEVENLABS_API_KEY'],
  fishaudio: ['OD_FISHAUDIO_API_KEY', 'FISH_AUDIO_API_KEY'],
};

function configFile(projectRoot) {
  return path.join(projectRoot, '.od', 'media-config.json');
}

async function readStored(projectRoot) {
  try {
    const raw = await readFile(configFile(projectRoot), 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && parsed.providers) {
      return parsed.providers;
    }
    return {};
  } catch (err) {
    if (err && err.code === 'ENOENT') return {};
    throw err;
  }
}

async function writeStored(projectRoot, providers) {
  const file = configFile(projectRoot);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify({ providers }, null, 2), 'utf8');
}

function readEnvKey(providerId) {
  const keys = ENV_KEYS[providerId];
  if (!keys) return null;
  for (const k of keys) {
    const v = process.env[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return null;
}

function readNestedString(obj, keys) {
  let cur = obj;
  for (const key of keys) {
    if (!cur || typeof cur !== 'object') return '';
    cur = cur[key];
  }
  return typeof cur === 'string' && cur.trim() ? cur.trim() : '';
}

async function readJsonIfPresent(file) {
  try {
    const raw = await readFile(file, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (err) {
    if (err && err.code === 'ENOENT') return null;
    // Auth files are best-effort fallbacks. A malformed local auth cache
    // should not break the Settings page or hide stored provider config.
    return null;
  }
}

function tokenFromHermesAuth(data) {
  const providerToken = readNestedString(data, [
    'providers',
    'openai-codex',
    'tokens',
    'access_token',
  ]);
  if (providerToken) return providerToken;

  const pool =
    data && typeof data === 'object'
      ? data.credential_pool && data.credential_pool['openai-codex']
      : null;
  if (Array.isArray(pool)) {
    for (const item of pool) {
      const token = readNestedString(item, ['access_token']);
      if (token) return token;
    }
  }
  return '';
}

function tokenFromCodexAuth(data) {
  const oauthToken = readNestedString(data, ['tokens', 'access_token']);
  if (oauthToken) return { token: oauthToken, source: 'oauth-codex' };

  const apiKey = readNestedString(data, ['OPENAI_API_KEY']);
  if (apiKey) return { token: apiKey, source: 'codex-auth' };

  return null;
}

async function resolveOpenAIOAuthCredential() {
  const home = homedir();
  const hermesAuth = await readJsonIfPresent(
    path.join(home, '.hermes', 'auth.json'),
  );
  const hermesToken = tokenFromHermesAuth(hermesAuth);
  if (hermesToken) {
    return { apiKey: hermesToken, source: 'oauth-hermes' };
  }

  const codexAuth = await readJsonIfPresent(
    path.join(home, '.codex', 'auth.json'),
  );
  const codexToken = tokenFromCodexAuth(codexAuth);
  if (codexToken) {
    return { apiKey: codexToken.token, source: codexToken.source };
  }

  return null;
}

/**
 * Resolve credentials for a provider. Env vars win, then stored config,
 * then OpenAI/Codex OAuth for the OpenAI media provider.
 * Returns { apiKey, baseUrl } where either may be empty string.
 */
export async function resolveProviderConfig(projectRoot, providerId) {
  const stored = await readStored(projectRoot);
  const entry = stored[providerId] || {};
  const envKey = readEnvKey(providerId);
  const oauth =
    providerId === 'openai' && !envKey && !entry.apiKey
      ? await resolveOpenAIOAuthCredential()
      : null;
  return {
    apiKey: envKey || entry.apiKey || oauth?.apiKey || '',
    baseUrl: entry.baseUrl || '',
  };
}

/**
 * Read the full config for the GET endpoint. API keys are masked so the
 * frontend can show "••••" + a "configured" indicator without leaking
 * the secret back into the DOM.
 */
export async function readMaskedConfig(projectRoot) {
  const stored = await readStored(projectRoot);
  const providers = {};
  for (const id of PROVIDER_IDS) {
    const entry = stored[id] || {};
    const envKey = readEnvKey(id);
    const hasStoredKey = typeof entry.apiKey === 'string' && entry.apiKey.length > 0;
    const oauth =
      id === 'openai' && !envKey && !hasStoredKey
        ? await resolveOpenAIOAuthCredential()
        : null;
    providers[id] = {
      configured: Boolean(envKey || hasStoredKey || oauth?.apiKey),
      source: envKey ? 'env' : hasStoredKey ? 'stored' : oauth?.source || 'unset',
      // Show last 4 chars only when stored locally; never echo env-var
      // or OAuth secrets so power users don't accidentally see them in
      // the DOM.
      apiKeyTail: hasStoredKey ? entry.apiKey.slice(-4) : '',
      baseUrl: entry.baseUrl || '',
    };
  }
  return { providers };
}

/**
 * Write the supplied {providerId: {apiKey, baseUrl}} map. Empty
 * apiKey deletes the entry. Unknown provider IDs are ignored. We
 * deliberately replace the whole map rather than merging so the
 * UI's "clear key" affordance just sends an empty string.
 *
 * Safety: if the incoming payload is empty but the on-disk config
 * currently has providers, we log a WARN to stderr. This catches
 * accidental wipes (e.g. a fresh-localStorage browser bootstrap
 * pushing `{providers: {}}` onto a daemon that had keys from a
 * previous session) without silently destroying the user's data.
 */
export async function writeConfig(projectRoot, body) {
  const incoming = body && typeof body === 'object' ? body.providers || {} : {};
  const force = Boolean(body && typeof body === 'object' && body.force === true);
  const next = {};
  for (const id of PROVIDER_IDS) {
    const entry = incoming[id];
    if (!entry || typeof entry !== 'object') continue;
    const apiKey =
      typeof entry.apiKey === 'string' && entry.apiKey.trim()
        ? entry.apiKey.trim()
        : '';
    const baseUrl =
      typeof entry.baseUrl === 'string' && entry.baseUrl.trim()
        ? entry.baseUrl.trim()
        : '';
    if (!apiKey && !baseUrl) continue;
    next[id] = { apiKey, baseUrl };
  }
  if (Object.keys(next).length === 0) {
    const prior = await readStored(projectRoot);
    const priorIds = Object.keys(prior).filter(
      (id) => prior[id] && (prior[id].apiKey || prior[id].baseUrl),
    );
    if (priorIds.length > 0) {
      if (!force) {
        const err = new Error(
          `refusing to wipe ${priorIds.length} configured provider(s) without force=true: ${priorIds.join(', ')}`,
        );
        err.status = 409;
        throw err;
      }
      try {
        console.error(
          `[media-config] WARN: incoming PUT empty, would wipe ${priorIds.length} configured provider(s): ${priorIds.join(', ')}`,
        );
      } catch {
        // best-effort logging only
      }
    }
  }
  await writeStored(projectRoot, next);
  return readMaskedConfig(projectRoot);
}
