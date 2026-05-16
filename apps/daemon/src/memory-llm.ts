// @ts-nocheck
// LLM-driven memory extractor.
//
// The heuristic regex pack in `memory.ts` only catches explicit markers
// ("remember:", "记住", "我喜欢"…). For everything else — implicit
// preferences, role, ongoing-work context — we ask a small fast model
// to look at the just-finished turn and the existing memory and return
// a JSON list of facts to add.
//
// This module is fire-and-forget: the chat run finishes and triggers
// extraction in the background. Output lands in the same MD store so
// the next turn's prompt picks it up automatically.
//
// Provider selection (in order):
//   0. memory `.config.json` extraction override → user-supplied
//      provider/model/baseUrl/apiKey/apiVersion from the Memory model
//      picker. The override may pick any of four providers — anthropic,
//      openai, azure (openai-compatible at a per-resource URL), or
//      google gemini. This is the only path that lets a Local-CLI user
//      (no env-var key in the daemon's environment) point memory
//      extraction at, say, their personal Anthropic key with a
//      specific Haiku build instead of falling all the way through to
//      gpt-4o-mini. When the override carries the provider but no
//      apiKey we fall back to the corresponding env var (or the media-
//      config OpenAI key for openai/azure overrides) so a "I want to
//      switch to OpenAI but reuse my existing key" change costs zero
//      typing.
//   1. ANTHROPIC_API_KEY env → Claude Haiku 4.5 (cheapest + fastest path)
//   2. OPENAI_API_KEY env    → gpt-4o-mini
//   3. media-config OpenAI BYOK → gpt-4o-mini
//      (the key the user already typed into Settings → Media providers;
//       reuses an existing credential so Local-CLI users don't have to
//       paste it twice just to get LLM-side memory extraction)
//   4. nothing               → record a 'skipped: no-provider' attempt
//      so the UI can surface "configure a key to enable LLM memory"
//      instead of staying silent
//
// Every attempt — whether it actually called the model or short-circuited
// — produces a record in `memory-extractions.ts` so the settings panel
// can show running / skipped / success / failed states in real time.

import {
  composeMemoryBody,
  listMemoryEntries,
  readMemoryConfig,
  upsertMemoryEntry,
  memoryEvents,
} from './memory.js';
import {
  startExtraction,
  recordSkip,
  markProvider,
  markSkipped,
  markProposed,
  markSuccess,
  markFailed,
} from './memory-extractions.js';
import { resolveProviderConfig } from './media-config.js';

const SYSTEM_PROMPT = `You are a memory extractor for a personal AI design assistant.

Given the user's most recent message (and optionally the assistant's reply), plus a snapshot of the existing memory store, decide whether ANYTHING in this turn is worth remembering across future conversations.

A fact is worth remembering when ALL of these are true:
- It's about the user, their preferences, their tools, their ongoing work, OR a stable reference (a Linear board id, a Slack channel, a teammate name).
- It will plausibly still be true in a week.
- It would change how an assistant responds in a later, unrelated chat.

A fact is NOT worth remembering when ANY of these is true:
- It's a transient state (current task, what file they're editing right now).
- It's already captured in the existing memory.
- It's just the user asking a question or describing a one-off bug.
- It's something the assistant said about itself.
- It's a code snippet, an output, or a paste.

Output STRICT JSON in this exact shape — nothing else, no prose, no markdown fences:
{
  "entries": [
    { "type": "user|feedback|project|reference", "name": "short title (≤ 60 chars)", "description": "one-line summary (≤ 140 chars)", "body": "the actual remembered fact, 1-3 sentences" }
  ]
}

If there's nothing worth remembering, return: {"entries": []}

Type rules:
- user: who they are, role, expertise, long-term goals
- feedback: corrections / preferences about how to work ("don't add comments unless asked")
- project: ongoing initiatives, deadlines, why-decisions; usually time-bounded
- reference: pointers to external systems (Linear projects, Slack channels, dashboards)`;

// Provider defaults are centralised so the override path and the
// auto-pick path can't drift apart. When the user picks "Custom →
// anthropic" without typing a model, we still want the same
// claude-haiku-4-5 fallback the env path uses.
//
// Azure has no useful baseUrl default — every Azure resource has its
// own `https://<resource>.openai.azure.com` host, so the user must
// supply theirs. We still emit an empty default here so a missing
// override doesn't crash with `undefined` when accessed.
const PROVIDER_DEFAULTS = {
  anthropic: {
    model: 'claude-haiku-4-5',
    baseUrl: 'https://api.anthropic.com',
  },
  openai: {
    model: 'gpt-4o-mini',
    baseUrl: 'https://api.openai.com',
  },
  azure: {
    model: 'gpt-4o-mini',
    baseUrl: '',
    apiVersion: '2024-10-21',
  },
  google: {
    model: 'gemini-2.0-flash',
    baseUrl: 'https://generativelanguage.googleapis.com',
  },
  // Ollama Cloud speaks OpenAI-compatible chat-completions, so the
  // extractor just routes through callOpenAI with the ollama base URL
  // and the user's Ollama Cloud API key. The default model is a small
  // open-weight model so the auto-pick produces a deterministic answer
  // for users who haven't customised the picker; users who care can
  // pick anything off the picker's `Custom...` list.
  ollama: {
    model: 'gemma3:4b',
    baseUrl: 'https://ollama.com',
  },
};

// Map an explicit override provider to the env var the daemon should
// consult when the override doesn't carry its own apiKey. The fallback
// chain stays the same as before for anthropic/openai; azure uses the
// AZURE_OPENAI_API_KEY convention; google uses GOOGLE_API_KEY (matching
// the gemini SDK's expectation, with GEMINI_API_KEY as a secondary).
function envKeyFor(provider) {
  if (provider === 'anthropic') return process.env.ANTHROPIC_API_KEY?.trim() || '';
  if (provider === 'openai') return process.env.OPENAI_API_KEY?.trim() || '';
  if (provider === 'azure') {
    return (
      process.env.AZURE_OPENAI_API_KEY?.trim()
      || process.env.AZURE_API_KEY?.trim()
      || ''
    );
  }
  if (provider === 'google') {
    return (
      process.env.GOOGLE_API_KEY?.trim()
      || process.env.GEMINI_API_KEY?.trim()
      || ''
    );
  }
  if (provider === 'ollama') {
    return process.env.OLLAMA_API_KEY?.trim() || '';
  }
  return '';
}

// Map a chat agent id to the API protocol family it speaks under the
// hood. This is the bridge that makes "follow chat" actually mean
// something for memory extraction in CLI mode: when the user is on
// Claude Code (claude → anthropic) we don't want memory to silently
// fall through to whatever OpenAI key happens to be in media-config —
// that produces the very confusing "openai/gpt-4o-mini" attempts the
// user sees while they think they're "using Claude". Anything we don't
// recognise stays unconstrained (returns null) so the legacy
// cross-provider fallback can still kick in for setups we don't model.
function chatProtocolFromAgentId(agentId) {
  if (!agentId || typeof agentId !== 'string') return null;
  const id = agentId.trim().toLowerCase();
  if (id === 'claude') return 'anthropic';
  if (id === 'gemini') return 'google';
  // Codex, OpenCode, Qwen, DeepSeek, Kimi, Copilot, Pi, Kiro, Kilo,
  // Vibe, Devin, Hermes, Cursor-Agent, Qoder all use the OpenAI chat-
  // completions wire format.
  if (
    id === 'codex'
    || id === 'opencode'
    || id === 'qwen'
    || id === 'deepseek'
    || id === 'kimi'
    || id === 'copilot'
    || id === 'pi'
    || id === 'kiro'
    || id === 'kilo'
    || id === 'vibe'
    || id === 'devin'
    || id === 'hermes'
    || id === 'cursor-agent'
    || id === 'qoder'
  ) {
    return 'openai';
  }
  return null;
}

// Pick a provider in this order:
//   0. Memory config override → user-set provider/model/baseUrl/apiKey
//   1. Chat-protocol-constrained env var → if the chat is on Claude
//      Code (anthropic), only ANTHROPIC_API_KEY counts; Codex/OpenAI-
//      compatible CLIs only consult OPENAI_API_KEY (and the media-
//      config OpenAI key as a secondary fallback). This stops the
//      legacy "claude user, openai gpt-4o-mini extracts in the
//      background" surprise — if the matching key isn't configured,
//      we'd rather skip with 'no-provider' and surface that in the
//      history than quietly run on a different vendor's key.
//   2. BYOK chat-config snapshot → for API-mode chats (the picker is
//      on "Same as chat"), `/api/memory/extract` forwards the live
//      chat provider/key/baseUrl/apiVersion as `chatProvider`. We use
//      it directly with the per-protocol fast-model default so the
//      default extractor follows the chat configuration instead of
//      falling through to env / media-config which the daemon never
//      saw the user configure. The model deliberately overrides the
//      user-supplied `chatProvider.model` only when none was given —
//      memory should default to a cheaper/faster model than the chat
//      model the user is paying for.
//   3. (legacy fallback, only when we can't tell which CLI is in use
//      AND the caller didn't pass `chatProvider`)
//      ANTHROPIC_API_KEY env → Claude Haiku 4.5
//   4. (legacy fallback) OPENAI_API_KEY env → gpt-4o-mini
//   5. (legacy fallback) media-config OpenAI BYOK → gpt-4o-mini
//
// The `OD_MEMORY_MODEL` env continues to override the model name across
// (1)–(5) so power users don't lose that lever. It does NOT override the
// memory-config provider since that one carries an explicit user choice.
// `projectRoot` is required for the media-config path; `chatAgentId` is
// optional but recommended — without it we fall through to the legacy
// unconstrained chain, which is what the daemon used to do and what
// pre-context callers (the HTTP /api/memory/extract endpoint) still
// expect. `chatProvider` is the BYOK chat-config snapshot threaded
// through from the web app on a per-call basis (the daemon never
// persists BYOK creds, so this is the only signal we have for that
// mode).
async function pickProvider(projectRoot, dataDir, chatAgentId, chatProvider) {
  let override = null;
  if (dataDir) {
    try {
      const cfg = await readMemoryConfig(dataDir);
      if (cfg?.extraction?.provider) override = cfg.extraction;
    } catch (err) {
      console.warn(
        '[memory-llm] failed to read memory config override',
        err?.message ?? err,
      );
    }
  }
  if (override) {
    const defaults = PROVIDER_DEFAULTS[override.provider];
    const explicitKey =
      typeof override.apiKey === 'string' && override.apiKey.trim()
        ? override.apiKey.trim()
        : '';
    const envKey = envKeyFor(override.provider);
    let resolvedKey = explicitKey || envKey;
    let credentialSource = explicitKey
      ? 'memory-config'
      : (envKey ? 'env' : null);
    // Last-chance: an openai-shaped override (openai or azure) with no
    // explicit/env key can still borrow the media-config OpenAI key the
    // user already typed. Anthropic / google have no media counterpart
    // today.
    if (
      !resolvedKey
      && (override.provider === 'openai' || override.provider === 'azure')
      && projectRoot
    ) {
      try {
        const cred = await resolveProviderConfig(projectRoot, 'openai');
        if (cred?.apiKey?.trim()) {
          resolvedKey = cred.apiKey.trim();
          credentialSource = 'media-config';
        }
      } catch {
        // Ignore — we'll record a no-provider skip below.
      }
    }
    if (!resolvedKey) return null;
    const baseUrl =
      (typeof override.baseUrl === 'string' && override.baseUrl.trim())
      || defaults.baseUrl;
    if (override.provider === 'azure' && !baseUrl) {
      // Azure with no resource URL is unrecoverable — bail rather than
      // logging a confusing 404 from `https:///openai/deployments/...`.
      return null;
    }
    return {
      kind: override.provider,
      apiKey: resolvedKey,
      model:
        (typeof override.model === 'string' && override.model.trim())
        || defaults.model,
      baseUrl,
      apiVersion:
        override.provider === 'azure'
          ? (typeof override.apiVersion === 'string' && override.apiVersion.trim())
            || PROVIDER_DEFAULTS.azure.apiVersion
          : '',
      credentialSource,
    };
  }

  const envOverrideModel = (process.env.OD_MEMORY_MODEL || '').trim();

  // Chat-protocol-constrained branch (path 1). Only run when we know
  // which CLI is in use AND it maps to one of the four providers; we
  // refuse to wander out of the chat protocol's family even when an
  // env var for a different provider is set, because doing so produces
  // the "I'm using Claude but memory says openai gpt-4o-mini" surprise
  // the user reported.
  const chatProtocol = chatProtocolFromAgentId(chatAgentId);
  if (chatProtocol) {
    const envKey = envKeyFor(chatProtocol);
    if (envKey) {
      const defaults = PROVIDER_DEFAULTS[chatProtocol];
      return {
        kind: chatProtocol,
        apiKey: envKey,
        model: envOverrideModel || defaults.model,
        baseUrl:
          (chatProtocol === 'anthropic' && process.env.ANTHROPIC_BASE_URL)
          || (chatProtocol === 'openai' && process.env.OPENAI_BASE_URL)
          || defaults.baseUrl,
        apiVersion: chatProtocol === 'azure' ? defaults.apiVersion : '',
        credentialSource: 'env',
      };
    }
    // Secondary fallback for openai-compatible CLIs: the user already
    // typed an OpenAI key under Settings → Media providers, so we can
    // borrow it for memory extraction without making them paste it
    // twice. We do NOT try this for anthropic/google chats because the
    // media-config table only has openai-shaped credentials today.
    if (chatProtocol === 'openai' && projectRoot) {
      try {
        const cred = await resolveProviderConfig(projectRoot, 'openai');
        if (cred && typeof cred.apiKey === 'string' && cred.apiKey.trim()) {
          return {
            kind: 'openai',
            apiKey: cred.apiKey.trim(),
            model:
              envOverrideModel || cred.model || PROVIDER_DEFAULTS.openai.model,
            baseUrl: (cred.baseUrl && String(cred.baseUrl).trim())
              || PROVIDER_DEFAULTS.openai.baseUrl,
            apiVersion: '',
            credentialSource: 'media-config',
          };
        }
      } catch (err) {
        console.warn(
          '[memory-llm] media-config lookup failed (chat-constrained)',
          err?.message ?? err,
        );
      }
    }
    // The chat protocol is known but no key for it is available. Bail
    // out instead of wandering — recording 'skipped: no-provider' is
    // strictly more useful than silently running on a foreign vendor.
    return null;
  }

  // BYOK chat-config snapshot (path 2). The web app forwards the live
  // chat provider/key/baseUrl/apiVersion on every API-mode extraction
  // call so the daemon can run extraction against the same vendor the
  // user is chatting with — even though the daemon never persists
  // BYOK creds itself. Use the per-protocol fast-model default instead
  // of the chat model the user is paying for, so a memory pass on a
  // big chat model (gpt-4o, claude-sonnet-4-5) silently turns into a
  // cheap haiku/mini call. The caller can opt into using the chat
  // model verbatim by setting `chatProvider.model`.
  if (
    chatProvider
    && chatProvider.provider
    && PROVIDER_DEFAULTS[chatProvider.provider]
  ) {
    const apiKey =
      typeof chatProvider.apiKey === 'string' ? chatProvider.apiKey.trim() : '';
    if (apiKey) {
      const defaults = PROVIDER_DEFAULTS[chatProvider.provider];
      const baseUrl =
        (typeof chatProvider.baseUrl === 'string' && chatProvider.baseUrl.trim())
        || defaults.baseUrl;
      // Azure with no resource URL is unrecoverable — same guard as
      // the override path above.
      if (chatProvider.provider !== 'azure' || baseUrl) {
        const explicitModel =
          typeof chatProvider.model === 'string' && chatProvider.model.trim()
            ? chatProvider.model.trim()
            : '';
        return {
          kind: chatProvider.provider,
          apiKey,
          model: envOverrideModel || explicitModel || defaults.model,
          baseUrl,
          apiVersion:
            chatProvider.provider === 'azure'
              ? (typeof chatProvider.apiVersion === 'string'
                  && chatProvider.apiVersion.trim())
                || PROVIDER_DEFAULTS.azure.apiVersion
              : '',
          credentialSource: 'chat-byok',
        };
      }
    }
  }

  if (process.env.ANTHROPIC_API_KEY) {
    return {
      kind: 'anthropic',
      apiKey: process.env.ANTHROPIC_API_KEY,
      model: envOverrideModel || PROVIDER_DEFAULTS.anthropic.model,
      baseUrl:
        process.env.ANTHROPIC_BASE_URL || PROVIDER_DEFAULTS.anthropic.baseUrl,
      credentialSource: 'env',
    };
  }
  if (process.env.OPENAI_API_KEY) {
    return {
      kind: 'openai',
      apiKey: process.env.OPENAI_API_KEY,
      model: envOverrideModel || PROVIDER_DEFAULTS.openai.model,
      baseUrl: process.env.OPENAI_BASE_URL || PROVIDER_DEFAULTS.openai.baseUrl,
      credentialSource: 'env',
    };
  }
  // Fallback: reuse the OpenAI key the user already configured for media
  // generation. Most Local-CLI Claude users don't have an
  // ANTHROPIC_API_KEY in the daemon's environment (Claude Code logs in
  // via OAuth) but they often have an OpenAI key in Settings → Media
  // providers. Without this fallback the LLM extraction stage stays dark
  // for them and only the regex-based heuristic ever runs.
  if (projectRoot) {
    try {
      const cred = await resolveProviderConfig(projectRoot, 'openai');
      if (cred && typeof cred.apiKey === 'string' && cred.apiKey.trim()) {
        return {
          kind: 'openai',
          apiKey: cred.apiKey.trim(),
          model:
            envOverrideModel || cred.model || PROVIDER_DEFAULTS.openai.model,
          baseUrl: (cred.baseUrl && String(cred.baseUrl).trim())
            || PROVIDER_DEFAULTS.openai.baseUrl,
          credentialSource: 'media-config',
        };
      }
    } catch (err) {
      console.warn(
        '[memory-llm] failed to read media-config for fallback',
        err?.message ?? err,
      );
    }
  }
  return null;
}

function renderUserPayload({ userMessage, assistantMessage, currentMemory }) {
  const parts = [];
  parts.push('## Existing memory');
  parts.push(currentMemory && currentMemory.trim().length > 0
    ? currentMemory
    : '(empty)');
  parts.push('');
  parts.push('## User message');
  parts.push(String(userMessage || '').slice(0, 4000));
  if (assistantMessage && assistantMessage.trim().length > 0) {
    parts.push('');
    parts.push('## Assistant reply');
    parts.push(String(assistantMessage).slice(0, 4000));
  }
  parts.push('');
  parts.push(
    'Return ONLY the JSON object described in the system prompt — no prose, no fences.',
  );
  return parts.join('\n');
}

// 30s ceiling. The chat run has long since finished and the user is
// staring at the settings panel waiting for a green/red pill — leaving
// a half-dead fetch in flight for two minutes (the default undici
// connect timeout) makes the failure feel even worse than it is.
const FETCH_TIMEOUT_MS = 30_000;

// Append `/v1<suffix>` to a base URL only when the URL doesn't already
// carry an explicit `/vN` segment. Mirrors the same conditional path
// build the chat proxy and connection-test routes use, so a custom
// OpenAI-compatible endpoint whose saved baseUrl already contains
// `/v1` (local servers, proxies that re-host OpenAI under a fixed
// prefix) does not become `/v1/v1/chat/completions` and silently fail
// every memory extraction even though chat through the same provider
// works. Anthropic's `/v1/messages` and OpenAI's `/v1/chat/completions`
// both flow through this; Azure and Gemini build their URLs
// differently and don't need it.
function appendVersionedApiPath(baseUrl, suffix) {
  const url = new URL(baseUrl);
  const pathname = url.pathname.replace(/\/+$/, '');
  url.pathname = /\/v\d+(\/|$)/.test(pathname)
    ? `${pathname}${suffix}`
    : `${pathname}/v1${suffix}`;
  return url.toString();
}

// Build a standard AbortSignal that fires after FETCH_TIMEOUT_MS so a
// stalled provider call surfaces as a 'failed' record instead of
// hanging the attempt indefinitely.
function withTimeout(ms) {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    return AbortSignal.timeout(ms);
  }
  const controller = new AbortController();
  setTimeout(() => controller.abort(new Error(`timeout ${ms}ms`)), ms);
  return controller.signal;
}

// undici raises a generic `TypeError: fetch failed` on every network
// error and tucks the real cause under `err.cause` (a Node `Error` or
// `AggregateError` with `.code` / `.errors`). The settings UI just
// shows `error.message`, so without unwrapping the cause the user
// sees "fetch failed" with no clue whether DNS broke, the firewall
// reset the connection, or the request timed out. Surface the most
// useful piece — the OS error code if present, otherwise the cause's
// message — appended in parentheses. We deliberately don't include
// both: `cause.message` typically already embeds the code (e.g.
// "read ECONNRESET"), and showing "ECONNRESET · read ECONNRESET"
// would just double the noise.
function describeFetchError(err) {
  const head = err?.message || String(err);
  const cause = err?.cause;
  if (!cause) return head;
  const codeRaw = cause.code ? String(cause.code) : '';
  const msgRaw =
    cause.message && cause.message !== head ? String(cause.message) : '';
  // Prefer the OS error code on its own when the cause's message just
  // wraps it (the common case for ECONNRESET / ENOTFOUND / ETIMEDOUT).
  // Fall back to the message when there's no code, or when the message
  // adds detail beyond the code (e.g. "Hostname/IP does not match
  // certificate's altnames").
  let detail = '';
  if (codeRaw && msgRaw) {
    const m = msgRaw.toLowerCase();
    detail = m.includes(codeRaw.toLowerCase()) ? codeRaw : `${codeRaw}: ${msgRaw}`;
  } else {
    detail = codeRaw || msgRaw;
  }
  // AggregateError: surface the first inner code that adds new info.
  // Most of these are six identical DNS errors, so dedupe aggressively.
  if (!detail && Array.isArray(cause.errors)) {
    for (const inner of cause.errors) {
      const innerCode = inner?.code ? String(inner.code) : '';
      const innerMsg = inner?.message ? String(inner.message) : '';
      const candidate = innerCode || innerMsg;
      if (candidate) {
        detail = candidate;
        break;
      }
    }
  }
  return detail ? `${head} (${detail})` : head;
}

async function callAnthropic(provider, system, user) {
  let resp;
  try {
    resp = await fetch(appendVersionedApiPath(provider.baseUrl, '/messages'), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': provider.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: provider.model,
        max_tokens: 1024,
        system,
        messages: [{ role: 'user', content: user }],
      }),
      signal: withTimeout(FETCH_TIMEOUT_MS),
    });
  } catch (err) {
    throw new Error(describeFetchError(err));
  }
  if (!resp.ok) {
    throw new Error(`anthropic ${resp.status}: ${await resp.text().catch(() => '')}`);
  }
  const json = await resp.json();
  const block = (json?.content || []).find((b) => b?.type === 'text');
  return block?.text ?? '';
}

async function callOpenAI(provider, system, user) {
  let resp;
  try {
    resp = await fetch(
      appendVersionedApiPath(provider.baseUrl, '/chat/completions'),
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${provider.apiKey}`,
        },
        body: JSON.stringify({
          model: provider.model,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
        }),
        signal: withTimeout(FETCH_TIMEOUT_MS),
      },
    );
  } catch (err) {
    throw new Error(describeFetchError(err));
  }
  if (!resp.ok) {
    throw new Error(`openai ${resp.status}: ${await resp.text().catch(() => '')}`);
  }
  const json = await resp.json();
  return json?.choices?.[0]?.message?.content ?? '';
}

// Azure OpenAI speaks the same chat-completions JSON as OpenAI, but on
// a per-deployment URL and with `api-key:` instead of `Authorization:`.
// `provider.model` here is the Azure deployment name (the user typed it
// into the model field — that's what the chat picker calls "Deployment
// (Model)" too), not the underlying model family.
async function callAzure(provider, system, user) {
  const base = String(provider.baseUrl || '').replace(/\/+$/, '');
  const deployment = encodeURIComponent(provider.model);
  const apiVersion = encodeURIComponent(
    provider.apiVersion || PROVIDER_DEFAULTS.azure.apiVersion,
  );
  const url = `${base}/openai/deployments/${deployment}/chat/completions?api-version=${apiVersion}`;
  let resp;
  try {
    resp = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'api-key': provider.apiKey,
      },
      body: JSON.stringify({
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
      signal: withTimeout(FETCH_TIMEOUT_MS),
    });
  } catch (err) {
    throw new Error(describeFetchError(err));
  }
  if (!resp.ok) {
    throw new Error(`azure ${resp.status}: ${await resp.text().catch(() => '')}`);
  }
  const json = await resp.json();
  return json?.choices?.[0]?.message?.content ?? '';
}

// Google Gemini's REST surface uses a different request shape:
// system instructions go in `systemInstruction`, the conversation is
// `contents[]` with `role` + `parts`, and the API key is a query
// parameter rather than a header. `responseMimeType: application/json`
// gets us the strict JSON output the parser expects.
async function callGoogle(provider, system, user) {
  const base = String(provider.baseUrl || '').replace(/\/+$/, '');
  const model = encodeURIComponent(provider.model);
  const url = `${base}/v1beta/models/${model}:generateContent?key=${encodeURIComponent(provider.apiKey)}`;
  let resp;
  try {
    resp = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { role: 'system', parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: user }] }],
        generationConfig: { responseMimeType: 'application/json' },
      }),
      signal: withTimeout(FETCH_TIMEOUT_MS),
    });
  } catch (err) {
    throw new Error(describeFetchError(err));
  }
  if (!resp.ok) {
    throw new Error(`google ${resp.status}: ${await resp.text().catch(() => '')}`);
  }
  const json = await resp.json();
  const parts = json?.candidates?.[0]?.content?.parts;
  if (Array.isArray(parts)) {
    return parts.map((p) => (p && typeof p.text === 'string' ? p.text : '')).join('');
  }
  return '';
}

// Tolerant JSON parse — the model occasionally wraps output in ```json
// fences even when told not to. Strip those defensively.
function parseEntries(rawText) {
  if (typeof rawText !== 'string') return [];
  let text = rawText.trim();
  if (text.startsWith('```')) {
    text = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    // Last-ditch: pull the first {...} block.
    const match = /\{[\s\S]*\}/.exec(text);
    if (!match) return [];
    try {
      parsed = JSON.parse(match[0]);
    } catch {
      return [];
    }
  }
  const list = Array.isArray(parsed?.entries) ? parsed.entries : [];
  const validTypes = new Set(['user', 'feedback', 'project', 'reference']);
  return list
    .filter(
      (e) =>
        e &&
        typeof e === 'object' &&
        validTypes.has(e.type) &&
        typeof e.name === 'string' &&
        e.name.trim().length > 0 &&
        typeof e.body === 'string' &&
        e.body.trim().length > 0,
    )
    .slice(0, 6); // hard cap so a confused model can't flood the store
}

function alreadyKnown(existing, candidate) {
  const candKey = `${candidate.type}::${candidate.name.toLowerCase().trim()}`;
  for (const e of existing) {
    if (`${e.type}::${e.name.toLowerCase().trim()}` === candKey) return true;
  }
  return false;
}

export async function extractWithLLM(dataDir, input, options) {
  const projectRoot = options?.projectRoot ?? null;
  const chatAgentId = options?.chatAgentId ?? null;
  // BYOK chat-config snapshot — only present for API-mode calls
  // forwarded through `/api/memory/extract`. The daemon doesn't
  // persist BYOK creds, so this per-call signal is the *only* way
  // pickProvider() can run "Same as chat" extraction against the
  // user's actual chat provider.
  const chatProvider = options?.chatProvider ?? null;
  const userMessage = String(input?.userMessage || '').trim();

  const cfg = await readMemoryConfig(dataDir);
  if (!cfg.enabled) {
    recordSkip({ userMessage, reason: 'memory-disabled' });
    return [];
  }
  if (userMessage.length === 0) {
    recordSkip({ userMessage, reason: 'empty-message' });
    return [];
  }

  const provider = await pickProvider(
    projectRoot,
    dataDir,
    chatAgentId,
    chatProvider,
  );
  if (!provider) {
    recordSkip({ userMessage, reason: 'no-provider' });
    return [];
  }

  // Past this point we have a provider committed and an actual model
  // call about to happen — switch from one-shot skip records to a
  // running record we can update through phase transitions.
  const attemptId = startExtraction({ userMessage });
  markProvider(attemptId, {
    kind: provider.kind,
    model: provider.model,
    credentialSource: provider.credentialSource,
  });

  let currentMemory = '';
  let existingEntries = [];
  try {
    [currentMemory, existingEntries] = await Promise.all([
      composeMemoryBody(dataDir),
      listMemoryEntries(dataDir),
    ]);
  } catch {
    // Fresh store — proceed with empty context.
  }

  const userPayload = renderUserPayload({
    userMessage,
    assistantMessage: input?.assistantMessage,
    currentMemory,
  });

  let raw = '';
  try {
    if (provider.kind === 'anthropic') {
      raw = await callAnthropic(provider, SYSTEM_PROMPT, userPayload);
    } else if (provider.kind === 'azure') {
      raw = await callAzure(provider, SYSTEM_PROMPT, userPayload);
    } else if (provider.kind === 'google') {
      raw = await callGoogle(provider, SYSTEM_PROMPT, userPayload);
    } else {
      // openai or ollama — both speak the OpenAI chat-completions
      // wire shape, so callOpenAI handles them with just a different
      // base URL.
      raw = await callOpenAI(provider, SYSTEM_PROMPT, userPayload);
    }
  } catch (err) {
    // err.message is already pre-formatted by describeFetchError() when
    // the call layer caught a network error. For HTTP-level failures
    // (`anthropic 401: …`) the message is already user-facing too.
    console.warn(`[memory-llm] ${provider.kind} call failed`, err?.message ?? err);
    markFailed(attemptId, err);
    return [];
  }

  let proposed;
  try {
    proposed = parseEntries(raw);
  } catch (err) {
    markFailed(attemptId, err);
    return [];
  }
  markProposed(attemptId, proposed.length);
  if (proposed.length === 0) {
    markSuccess(attemptId, { writtenCount: 0, writtenIds: [] });
    return [];
  }

  const written = [];
  for (const cand of proposed) {
    if (alreadyKnown(existingEntries, cand)) continue;
    try {
      const entry = await upsertMemoryEntry(
        dataDir,
        {
          type: cand.type,
          name: String(cand.name).trim().slice(0, 80),
          description: String(cand.description || '').trim().slice(0, 200),
          body: String(cand.body).trim(),
        },
        // Suppress per-entry events; we batch a single 'extract' below
        // so the toast says "Memory updated (3 · LLM)" once.
        { silent: true, source: 'llm' },
      );
      written.push({
        id: entry.id,
        name: entry.name,
        description: entry.description,
        type: entry.type,
        updatedAt: entry.updatedAt,
      });
    } catch (err) {
      console.warn('[memory-llm] write failed', err?.message ?? err);
    }
  }

  if (written.length > 0) {
    memoryEvents.emit('change', {
      kind: 'extract',
      count: written.length,
      source: 'llm',
      at: Date.now(),
    });
  }

  markSuccess(attemptId, {
    writtenCount: written.length,
    writtenIds: written.map((e) => e.id),
  });

  return written;
}
