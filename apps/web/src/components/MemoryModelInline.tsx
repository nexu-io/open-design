// Inline "Memory model" picker — sits right next to the chat model
// dropdown (both in CLI mode and BYOK mode) inside Settings →
// Configure execution mode.
//
// Why one tiny dropdown instead of a separate panel:
// User feedback was explicit — the memory extractor isn't a parallel
// feature, it's "the same provider/CLI as chat, with a different (and
// usually cheaper) model". So the picker is a single field that
// borrows the surrounding chat picker's protocol, key, base URL, and
// (for Azure) api-version automatically. The user only chooses the
// model id.
//
// Three render branches:
//   - "Same as chat" (default): clears the override on the daemon —
//     auto-pick chooses a fast default on the chat protocol's key.
//   - A suggested model: stores { provider: chatProtocol, model, ... }
//     so the daemon calls the chat protocol's endpoint with the
//     reduced model. In CLI mode the provider is *derived* from the
//     picked model id (claude-* → anthropic, gemini-* → google,
//     everything else → openai) since the CLI itself isn't an API
//     provider.
//   - "Custom..." sentinel: opens a free-text input. Same persistence
//     as the suggested branch.
//
// Persistence: PATCH /api/memory/config. The daemon stores the chosen
// override under <dataDir>/memory/.config.json and reads it on every
// extraction attempt — a single PATCH propagates without a daemon
// restart.

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useState,
} from 'react';
import { useT } from '../i18n';
import type {
  MemoryExtractionConfig as MemoryExtractionConfigShape,
  MemoryExtractionMaskedConfig,
  MemoryExtractionProvider,
  MemoryListResponse,
} from '@open-design/contracts';
import type { ApiProtocol, ExecMode } from '../types';
import {
  SUGGESTED_MODELS_BY_PROTOCOL,
} from '../state/apiProtocols';
import { CUSTOM_MODEL_SENTINEL } from './modelOptions';

interface Props {
  mode: ExecMode;
  // BYOK context (only meaningful when mode === 'api'). The picker
  // copies these straight into the saved override so the daemon can
  // call the API without a second round trip through the user.
  apiProtocol: ApiProtocol;
  chatApiKey: string;
  chatBaseUrl: string;
  chatApiVersion: string;
  // The chat model is shown next to the "Same as chat" pill so the
  // user can see what the auto-default picks today.
  chatModel: string;
  // CLI context (only meaningful when mode === 'daemon'). Used to seed
  // the dropdown options with the same model list the chat picker
  // shows for the selected agent.
  cliModelOptions?: readonly string[];
  // The currently-selected CLI agent id. Used to derive a chat
  // protocol family in CLI mode (claude → anthropic, codex → openai,
  // gemini → google, …) so the dropdown's "Same as chat" label can
  // show the actual provider the daemon will call, and so the user
  // sees a clear "needs an X API key" hint instead of being surprised
  // when extraction silently lands on whatever foreign vendor key
  // happens to be in media-config.
  cliAgentId?: string | null;
}

// "No override" sentinel — distinct from CUSTOM_MODEL_SENTINEL so the
// reducer can switch between "clear override" and "let me type" cleanly.
const SAME_AS_CHAT_SENTINEL = '__same_as_chat__';

// Pattern-match a model id back to a provider/protocol. CLI mode has
// no surrounding ApiProtocol to lean on, so we read the prefix the
// same way the chat picker would: claude-* → Anthropic API, gemini-*
// → Google Gemini, everything else → OpenAI-compatible (the lingua
// franca of CLI agents — Codex, Qwen, DeepSeek, MiniMax all speak it).
function inferProviderFromModel(modelId: string): MemoryExtractionProvider {
  const id = modelId.trim().toLowerCase();
  if (id.startsWith('claude') || id.includes('/claude')) return 'anthropic';
  if (id.startsWith('gemini') || id.includes('/gemini')) return 'google';
  return 'openai';
}

// Map a CLI agent id to the API protocol family it speaks. Mirrors the
// daemon-side `chatProtocolFromAgentId()` in `memory-llm.ts` exactly —
// keep the two tables in sync so the UI's "Same as chat" label and the
// daemon's auto-pick agree on which provider memory will actually call.
function chatProtocolFromAgent(
  agentId: string | null | undefined,
): MemoryExtractionProvider | null {
  if (!agentId) return null;
  const id = agentId.trim().toLowerCase();
  if (id === 'claude') return 'anthropic';
  if (id === 'gemini') return 'google';
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

async function fetchMemoryExtraction(): Promise<MemoryExtractionMaskedConfig | null> {
  try {
    const resp = await fetch('/api/memory');
    if (!resp.ok) return null;
    const json = (await resp.json()) as MemoryListResponse;
    return json.extraction ?? null;
  } catch {
    return null;
  }
}

async function saveMemoryExtraction(
  extraction: MemoryExtractionConfigShape | null,
): Promise<MemoryExtractionMaskedConfig | null | undefined> {
  const resp = await fetch('/api/memory/config', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ extraction }),
  });
  if (!resp.ok) return undefined;
  const json = (await resp.json()) as {
    enabled: boolean;
    extraction: MemoryExtractionMaskedConfig | null;
  };
  return json.extraction ?? null;
}

export function MemoryModelInline({
  mode,
  apiProtocol,
  chatApiKey,
  chatBaseUrl,
  chatApiVersion,
  chatModel,
  cliModelOptions,
  cliAgentId,
}: Props) {
  const t = useT();
  const [config, setConfig] = useState<MemoryExtractionMaskedConfig | null>(
    null,
  );
  const [customEditing, setCustomEditing] = useState(false);
  const [customDraft, setCustomDraft] = useState('');
  const [busy, setBusy] = useState(false);
  // Brief inline confirmation after Save / clear so the user knows
  // their click did something even though the dropdown just settles.
  const [flash, setFlash] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchMemoryExtraction().then((next) => {
      if (cancelled) return;
      setConfig(next);
      if (next?.model) setCustomDraft(next.model);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!flash) return;
    const id = setTimeout(() => setFlash(null), 1600);
    return () => clearTimeout(id);
  }, [flash]);

  // The protocol the daemon will actually call when extraction fires.
  // BYOK: whatever protocol the chat picker has selected. CLI: derived
  // from the agent id (claude → anthropic, codex → openai, …) so the
  // memory dropdown can label its default with the real provider
  // instead of the misleading openai-fallback that the daemon used to
  // land on for Claude Code users.
  const effectiveChatProtocol: MemoryExtractionProvider | null =
    mode === 'api' ? apiProtocol : chatProtocolFromAgent(cliAgentId);

  const modelOptions = useMemo<readonly string[]>(() => {
    if (mode === 'api') return SUGGESTED_MODELS_BY_PROTOCOL[apiProtocol];
    return cliModelOptions ?? [];
  }, [mode, apiProtocol, cliModelOptions]);

  const savedModel = config?.model ?? '';
  const savedInOptions =
    Boolean(savedModel) && modelOptions.includes(savedModel);
  const customActive = customEditing || (Boolean(savedModel) && !savedInOptions);
  const selectValue = !savedModel
    ? SAME_AS_CHAT_SENTINEL
    : customActive
      ? CUSTOM_MODEL_SENTINEL
      : savedModel;

  // Build the override payload to PATCH for a given model id.
  //   - BYOK: provider + key + baseUrl + apiVersion all come from the
  //     surrounding chat config so the daemon can hit the API without
  //     a second round-trip through the user.
  //   - CLI: there's no chat key to borrow. We derive a provider —
  //     preferring the agent-id mapping (claude → anthropic) over
  //     model-id pattern matching (claude-haiku-4-5 also says
  //     anthropic, but `default` doesn't say anything) — and let the
  //     daemon's pickProvider fall back to env vars or the media-
  //     config OpenAI key. In practice this means CLI users still
  //     need an env-var or media-config key for memory extraction to
  //     fire — exactly the behaviour they had before this picker
  //     existed; the picker just lets them pin the model.
  const buildOverride = useCallback(
    (modelId: string): MemoryExtractionConfigShape => {
      const trimmedModel = modelId.trim();
      if (mode === 'api') {
        return {
          provider: apiProtocol,
          model: trimmedModel,
          baseUrl: chatBaseUrl.trim(),
          apiKey: chatApiKey,
          apiVersion: apiProtocol === 'azure' ? chatApiVersion.trim() : '',
        };
      }
      const provider =
        chatProtocolFromAgent(cliAgentId)
        ?? inferProviderFromModel(trimmedModel);
      return {
        provider,
        model: trimmedModel,
        baseUrl: '',
        apiKey: '',
        apiVersion: '',
      };
    },
    [mode, apiProtocol, chatApiKey, chatBaseUrl, chatApiVersion, cliAgentId],
  );

  const persist = useCallback(
    async (
      next: MemoryExtractionConfigShape | null,
      options?: { silent?: boolean },
    ) => {
      setBusy(true);
      try {
        const result = await saveMemoryExtraction(next);
        if (result !== undefined) {
          setConfig(result);
          // Skip the "Saved!" flash on background re-syncs (provider
          // tab swap, base-URL keystroke autosave, key rotation). The
          // user didn't click anything here; flashing every keystroke
          // would feel like the picker is "fighting" them.
          if (!options?.silent) {
            setFlash(
              next === null
                ? t('settings.memoryModelInlineFlashCleared')
                : t('settings.memoryModelInlineFlashSaved'),
            );
          }
        }
      } finally {
        setBusy(false);
      }
    },
    [t],
  );

  // Re-sync the saved memory override when the surrounding BYOK chat
  // config drifts. The picker initially captures provider / key /
  // baseUrl / apiVersion at click time, but if the user later swaps the
  // protocol tab, rotates the API key, or edits the base URL, the
  // background memory extractor would otherwise keep calling the *old*
  // vendor / credential — directly contradicting the picker's "borrows
  // the surrounding chat picker's protocol, key, base URL, and
  // api-version automatically" promise.
  //
  // We compare the persisted (masked) shape against the live chat
  // props field by field; the masked config exposes the last 4 chars
  // of the saved key as `apiKeyTail`, which is enough to detect a
  // rotation without ever round-tripping the secret back to the
  // browser. A 300 ms debounce coalesces the keystroke-granularity
  // prop updates that a parent autosave dialog typically streams in,
  // so we don't spam PATCH /api/memory/config on every character.
  useEffect(() => {
    if (mode !== 'api') return;
    if (busy) return;
    if (customEditing) return;
    if (!config || !config.model) return;
    const trimmedBaseUrl = chatBaseUrl.trim();
    const newTail = (chatApiKey || '').slice(-4);
    const azureVersion = apiProtocol === 'azure' ? chatApiVersion.trim() : '';
    const drift =
      config.provider !== apiProtocol
      || config.baseUrl !== trimmedBaseUrl
      || config.apiVersion !== azureVersion
      || config.apiKeyTail !== newTail;
    if (!drift) return;
    const handle = setTimeout(() => {
      void persist(buildOverride(config.model), { silent: true });
    }, 300);
    return () => clearTimeout(handle);
  }, [
    mode,
    apiProtocol,
    chatApiKey,
    chatBaseUrl,
    chatApiVersion,
    config,
    busy,
    customEditing,
    buildOverride,
    persist,
  ]);

  const onSelectChange = useCallback(
    async (value: string) => {
      if (value === SAME_AS_CHAT_SENTINEL) {
        setCustomEditing(false);
        setCustomDraft('');
        await persist(null);
        return;
      }
      if (value === CUSTOM_MODEL_SENTINEL) {
        // Just open the input — don't PATCH yet. The user can type a
        // model id and press the Save button below; clicking the
        // dropdown again before saving collapses the input and reverts
        // to the previous saved value.
        setCustomEditing(true);
        setCustomDraft(savedModel || '');
        return;
      }
      setCustomEditing(false);
      await persist(buildOverride(value));
    },
    [persist, buildOverride, savedModel],
  );

  const onSaveCustom = useCallback(async () => {
    const trimmed = customDraft.trim();
    if (!trimmed) return;
    await persist(buildOverride(trimmed));
    setCustomEditing(false);
  }, [customDraft, persist, buildOverride]);

  // CLI mode with no models advertised by the agent — fall back to a
  // simple "Same as chat" / "Custom..." pair so the picker is still
  // usable. (Some CLIs don't expose a `models` command; the chat
  // picker shows the same fallback there.)
  const showSuggestedOptions = modelOptions.length > 0;

  // Stable unique id for the labelling span so multiple instances of
  // this picker (or instances rendered alongside other Memory pickers)
  // never collide on a global selector. The select uses
  // `aria-labelledby` to point at *just* the short title — never the
  // hint paragraph, never the flash status — so Playwright's
  // `getByLabel('Memory model')` resolves to a single combobox and
  // `getByLabel('API key' / 'Model')` on the surrounding chat form
  // can't accidentally cross-match the hint copy here.
  const labelId = useId();

  // The wrapper used to be a <label>, which made the select's
  // accessible name absorb every text descendant (the flash status,
  // the hint paragraph). The reviewer asked for a non-label wrapper so
  // the labelling element is just the short title; we now use a div
  // with an explicit id-based association via `aria-labelledby`.
  return (
    <div className="field">
      <span id={labelId} className="field-label">
        {t('settings.memoryModelInlineLabel')}
      </span>
      {flash ? (
        <span
          role="status"
          aria-live="polite"
          style={{
            display: 'inline-block',
            marginLeft: 8,
            marginTop: -2,
            fontSize: 11,
            fontWeight: 500,
            color: 'var(--text-success, #1f7a3a)',
            textTransform: 'none',
            letterSpacing: 0,
          }}
        >
          {flash}
        </span>
      ) : null}
      <select
        aria-labelledby={labelId}
        value={selectValue}
        disabled={busy}
        onChange={(e) => void onSelectChange(e.target.value)}
      >
        <option value={SAME_AS_CHAT_SENTINEL}>
          {effectiveChatProtocol
            ? t('settings.memoryModelInlineSameAsChatWithProvider', {
                provider: effectiveChatProtocol,
              })
            : chatModel
              ? t('settings.memoryModelInlineSameAsChatWithModel', {
                  model: chatModel,
                })
              : t('settings.memoryModelInlineSameAsChat')}
        </option>
        {showSuggestedOptions
          ? modelOptions.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))
          : null}
        <option value={CUSTOM_MODEL_SENTINEL}>
          {t('settings.modelCustom')}
        </option>
      </select>
      {customActive ? (
        <div
          className="field-row"
          style={{ marginTop: 6, display: 'flex', gap: 6 }}
        >
          <input
            type="text"
            aria-label={t('settings.memoryModelInlineLabel')}
            value={customDraft}
            placeholder={t('settings.modelCustomPlaceholder')}
            onChange={(e) => setCustomDraft(e.target.value.trimStart())}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void onSaveCustom();
              }
            }}
          />
          <button
            type="button"
            className="ghost"
            onClick={() => void onSaveCustom()}
            disabled={busy || !customDraft.trim()}
          >
            {t('common.save')}
          </button>
        </div>
      ) : null}
      <p className="hint" style={{ marginTop: 4, fontSize: 11 }}>
        {mode === 'api'
          ? t('settings.memoryModelInlineHintByok')
          : effectiveChatProtocol
            ? t('settings.memoryModelInlineHintCliConstrained', {
                provider: effectiveChatProtocol,
              })
            : t('settings.memoryModelInlineHintCli')}
      </p>
    </div>
  );
}
