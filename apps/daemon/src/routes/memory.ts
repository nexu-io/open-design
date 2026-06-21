import type { Express } from 'express';
import type { RouteDeps } from '../server-context.js';

import {
  buildMemoryTree,
  composeMemoryBody,
  deleteMemoryEntry,
  extractFromMessage,
  listMemoryEntries,
  maskMemoryExtractionConfig,
  memoryDir,
  memoryEvents,
  readMemoryConfig,
  readMemoryEntry,
  readMemoryIndex,
  updateMemoryTreeNode,
  upsertMemoryEntry,
  writeMemoryConfig,
  writeMemoryIndex,
} from '../memory.js';
import {
  clearExtractions as clearMemoryExtractions,
  listExtractions as listMemoryExtractions,
  removeExtraction as removeMemoryExtraction,
} from '../memory-extractions.js';
import {
  extractMemoryFromConnectors,
  suggestMemoryFromConnectors,
} from '../memory-connectors.js';

export interface RegisterMemoryRoutesDeps extends RouteDeps<'http' | 'paths' | 'appConfig'> {}

type UnknownRecord = Record<string, unknown>;
type MemoryType = 'user' | 'feedback' | 'project' | 'reference';
type MemoryExtractionProvider = 'anthropic' | 'openai' | 'azure' | 'google' | 'ollama';

interface MemoryExtractionPatch {
  provider: MemoryExtractionProvider;
  model?: string;
  baseUrl?: string;
  apiKey?: string;
  apiVersion?: string;
}

interface MemoryConfigPatch {
  enabled?: boolean;
  chatExtractionEnabled?: boolean;
  extraction?: MemoryExtractionPatch | null;
}

interface MemoryEntryInput {
  id?: string;
  name: string;
  description?: string;
  type: MemoryType;
  body?: string;
}

interface MemoryAppConfigLike {
  agentId?: string;
  agentModels?: Record<string, { model?: string }>;
}

function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === 'object' ? (value as UnknownRecord) : {};
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function isMemoryType(value: unknown): value is MemoryType {
  return value === 'user' || value === 'feedback' || value === 'project' || value === 'reference';
}

function isExtractionProvider(value: unknown): value is MemoryExtractionProvider {
  return (
    value === 'anthropic'
    || value === 'openai'
    || value === 'azure'
    || value === 'google'
    || value === 'ollama'
  );
}

export function registerMemoryRoutes(app: Express, ctx: RegisterMemoryRoutesDeps) {
  const { RUNTIME_DATA_DIR, PROJECT_ROOT, PROJECTS_DIR } = ctx.paths;
  const { createSseResponse, requireLocalDaemonRequest } = ctx.http;
  const { readAppConfig } = ctx.appConfig;

  // ----- Memory store -----------------------------------------------------
  // Markdown-on-disk memory under <dataDir>/memory/. The daemon folds these
  // into every system prompt (gated by `enabled`) and the chat run loop
  // calls `/api/memory/extract` after each turn to sediment new facts.
  app.get('/api/memory', async (_req, res) => {
    try {
      const [config, index, entries] = await Promise.all([
        readMemoryConfig(RUNTIME_DATA_DIR),
        readMemoryIndex(RUNTIME_DATA_DIR),
        listMemoryEntries(RUNTIME_DATA_DIR),
      ]);
      res.json({
        enabled: config.enabled,
        chatExtractionEnabled: config.chatExtractionEnabled,
        rootDir: memoryDir(RUNTIME_DATA_DIR),
        index,
        entries,
        extraction: maskMemoryExtractionConfig(config.extraction),
      });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // Static sub-resources (`/index`, `/config`, `/extract`) registered
  // BEFORE the `:id` catch-alls so an `index` / `config` / `extract` slug
  // can't shadow the real handlers.
  app.get('/api/memory/tree', async (_req, res) => {
    try {
      const [config, tree] = await Promise.all([
        readMemoryConfig(RUNTIME_DATA_DIR),
        buildMemoryTree(RUNTIME_DATA_DIR),
      ]);
      res.json({
        enabled: config.enabled,
        rootDir: memoryDir(RUNTIME_DATA_DIR),
        tree,
      });
    } catch (err) {
      res.status(500).json({ error: errorMessage(err) });
    }
  });

  app.patch('/api/memory/tree/:id', async (req, res) => {
    try {
      const body = asRecord(req.body);
      const entry = await updateMemoryTreeNode(
        RUNTIME_DATA_DIR,
        req.params.id,
        body,
      );
      const tree = await buildMemoryTree(RUNTIME_DATA_DIR);
      res.json({ entry, tree });
    } catch (err) {
      const message = errorMessage(err);
      res.status(message === 'memory not found' ? 404 : 400).json({ error: message });
    }
  });

  app.put('/api/memory/index', async (req, res) => {
    try {
      const body = asRecord(req.body);
      const index = typeof body.index === 'string' ? body.index : '';
      await writeMemoryIndex(RUNTIME_DATA_DIR, index, undefined);
      res.json({ index });
    } catch (err) {
      res.status(400).json({ error: errorMessage(err) });
    }
  });

  app.patch('/api/memory/config', async (req, res) => {
    try {
      const body = asRecord(req.body);
      const patch: MemoryConfigPatch = {};
      if (typeof body.enabled === 'boolean') patch.enabled = body.enabled;
      if (typeof body.chatExtractionEnabled === 'boolean') {
        patch.chatExtractionEnabled = body.chatExtractionEnabled;
      }
      // Three-state extraction handling so the UI can: (a) leave the
      // override alone (omit `extraction`), (b) clear it back to
      // auto-pick (`extraction: null`), or (c) commit a custom override
      // (`extraction: { provider, ... }`). For the apiKey field we
      // need *four* states because the masked GET surfaces only an
      // `apiKeyTail` (the secret never round-trips):
      //   - field absent      → preserve the stored key (UI re-saves
      //                          a settings form without re-typing
      //                          the secret).
      //   - field === ''      → CLEAR the stored key (the picker's
      //                          drift-resync effect fires this when
      //                          the user clears their BYOK chat
      //                          API key — keeping the old daemon-
      //                          side credential would silently keep
      //                          calling the provider after the user
      //                          intentionally removed it from the
      //                          chat picker, which the reviewer
      //                          flagged as a credential-sync bug).
      //   - field === 'sk-…'  → replace with the new key.
      //   - provider differs  → ignore stored key entirely.
      if (Object.prototype.hasOwnProperty.call(body, 'extraction')) {
        if (body.extraction === null) {
          patch.extraction = null;
        } else if (body.extraction && typeof body.extraction === 'object') {
          const incoming = body.extraction as UnknownRecord;
          const current = await readMemoryConfig(RUNTIME_DATA_DIR);
          const currentExtraction = current.extraction as MemoryExtractionPatch | null;
          const apiKeyOmitted = !Object.prototype.hasOwnProperty.call(
            incoming,
            'apiKey',
          );
          const sameProvider =
            !!currentExtraction
            && currentExtraction.provider === incoming.provider;
          let nextApiKey = '';
          if (typeof incoming.apiKey === 'string' && incoming.apiKey) {
            nextApiKey = incoming.apiKey;
          } else if (apiKeyOmitted && sameProvider) {
            nextApiKey = currentExtraction?.apiKey ?? '';
          }
          if (!isExtractionProvider(incoming.provider)) {
            throw new Error('invalid extraction provider');
          }
          const nextExtraction: MemoryExtractionPatch = {
            provider: incoming.provider,
            apiKey: nextApiKey,
          };
          if (typeof incoming.model === 'string') nextExtraction.model = incoming.model;
          if (typeof incoming.baseUrl === 'string') nextExtraction.baseUrl = incoming.baseUrl;
          // Azure-only; ignored by the validator for the other providers.
          // We forward whatever the UI sent (or the previously-stored
          // value when the UI omits the field) so re-saving an azure
          // override without re-typing the api-version doesn't blank it.
          const apiVersion =
            typeof incoming.apiVersion === 'string'
              ? incoming.apiVersion
              : currentExtraction?.apiVersion;
          if (typeof apiVersion === 'string') nextExtraction.apiVersion = apiVersion;
          patch.extraction = nextExtraction;
        }
      }
      const next = await writeMemoryConfig(RUNTIME_DATA_DIR, patch);
      res.json({
        enabled: next.enabled,
        chatExtractionEnabled: next.chatExtractionEnabled,
        extraction: maskMemoryExtractionConfig(next.extraction),
      });
    } catch (err) {
      res.status(400).json({ error: errorMessage(err) });
    }
  });

  // SSE feed of memory mutations. The web settings panel subscribes to
  // this and re-fetches on every event; toast UIs can listen for
  // `kind === 'extract'` and surface a small "Memory updated (N new)"
  // notification. Payload shape: MemoryChangeEvent (see ./memory.ts).
  //
  // The same connection also forwards `extraction` events — one per LLM
  // extraction phase transition — so the settings panel can render a
  // live "recent extractions" list. We multiplex on a single SSE stream
  // so the browser opens one connection instead of two.
  app.get('/api/memory/events', async (_req, res) => {
    const sse = createSseResponse(res);
    sse.send('connected', { at: Date.now() });
    const onChange = (event: unknown) => {
      sse.send('change', event);
    };
    const onExtraction = (event: unknown) => {
      sse.send('extraction', event);
    };
    memoryEvents.on('change', onChange);
    memoryEvents.on('extraction', onExtraction);
    res.on('close', () => {
      memoryEvents.off('change', onChange);
      memoryEvents.off('extraction', onExtraction);
    });
  });

  // Recent LLM-extraction attempts (newest first; capped server-side).
  // Surfaces skip reasons, in-flight calls, success counts, and errors
  // so the settings panel can show "why didn't memory update?" at a
  // glance instead of leaving the user to guess.
  app.get('/api/memory/extractions', async (_req, res) => {
    try {
      res.json({ extractions: listMemoryExtractions() });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // Drop the entire extraction history. Registered BEFORE the `:id`
  // catch-all so a literal "/api/memory/extractions" can still be
  // cleared with `curl -X DELETE`.
  app.delete('/api/memory/extractions', async (_req, res) => {
    try {
      const removed = clearMemoryExtractions();
      res.json({ removed });
    } catch (err) {
      res.status(400).json({ error: errorMessage(err) });
    }
  });

  app.delete('/api/memory/extractions/:id', async (req, res) => {
    try {
      const removed = removeMemoryExtraction(req.params.id);
      res.json({ removed });
    } catch (err) {
      res.status(400).json({ error: errorMessage(err) });
    }
  });

  app.post('/api/memory/connectors/suggest', requireLocalDaemonRequest, async (req, res) => {
    try {
      const body = asRecord(req.body);
      const connectorIds = Array.isArray(body.connectorIds)
        ? body.connectorIds
          .filter((id: unknown): id is string => typeof id === 'string')
          .map((id: string) => id.trim())
          .filter(Boolean)
          .slice(0, 12)
        : undefined;
      const query =
        typeof body.query === 'string' ? body.query.trim().slice(0, 240) : '';
      const projectId =
        typeof body.projectId === 'string' && body.projectId.trim()
          ? body.projectId.trim()
          : null;
      const appConfig = (await readAppConfig(RUNTIME_DATA_DIR).catch(() => ({}))) as MemoryAppConfigLike;
      const chatAgentId =
        typeof body.chatAgentId === 'string' && body.chatAgentId.trim()
          ? body.chatAgentId.trim()
          : typeof appConfig.agentId === 'string' && appConfig.agentId.trim()
            ? appConfig.agentId.trim()
            : null;
      const requestChatModel =
        typeof body.chatModel === 'string' && body.chatModel.trim()
          ? body.chatModel.trim()
          : null;
      const chatModel =
        requestChatModel
        || (chatAgentId && appConfig.agentModels?.[chatAgentId]?.model
          ? appConfig.agentModels[chatAgentId].model ?? null
          : null);
      const options = {
        projectsRoot: PROJECTS_DIR,
        projectRoot: PROJECT_ROOT,
        ...(projectId ? { projectId } : {}),
        ...(connectorIds ? { connectorIds } : {}),
        ...(query ? { query } : {}),
        ...(chatAgentId ? { chatAgentId } : {}),
        ...(chatModel ? { chatModel } : {}),
      };
      const result = await suggestMemoryFromConnectors(RUNTIME_DATA_DIR, options);
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: errorMessage(err) });
    }
  });

  app.post('/api/memory/connectors/extract', requireLocalDaemonRequest, async (req, res) => {
    try {
      const body = asRecord(req.body);
      const connectorIds = Array.isArray(body.connectorIds)
        ? body.connectorIds
          .filter((id: unknown): id is string => typeof id === 'string')
          .map((id: string) => id.trim())
          .filter(Boolean)
          .slice(0, 12)
        : undefined;
      const query =
        typeof body.query === 'string' ? body.query.trim().slice(0, 240) : '';
      const projectId =
        typeof body.projectId === 'string' && body.projectId.trim()
          ? body.projectId.trim()
          : null;
      const appConfig = (await readAppConfig(RUNTIME_DATA_DIR).catch(() => ({}))) as MemoryAppConfigLike;
      const chatAgentId =
        typeof body.chatAgentId === 'string' && body.chatAgentId.trim()
          ? body.chatAgentId.trim()
          : typeof appConfig.agentId === 'string' && appConfig.agentId.trim()
            ? appConfig.agentId.trim()
            : null;
      const requestChatModel =
        typeof body.chatModel === 'string' && body.chatModel.trim()
          ? body.chatModel.trim()
          : null;
      const chatModel =
        requestChatModel
        || (chatAgentId && appConfig.agentModels?.[chatAgentId]?.model
          ? appConfig.agentModels[chatAgentId].model ?? null
          : null);
      const options = {
        projectsRoot: PROJECTS_DIR,
        projectRoot: PROJECT_ROOT,
        ...(projectId ? { projectId } : {}),
        ...(connectorIds ? { connectorIds } : {}),
        ...(query ? { query } : {}),
        ...(chatAgentId ? { chatAgentId } : {}),
        ...(chatModel ? { chatModel } : {}),
      };
      const result = await extractMemoryFromConnectors(RUNTIME_DATA_DIR, options);
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: errorMessage(err) });
    }
  });

  // Imperative extract — used by CLI chats internally and by BYOK /
  // API-mode chats from the web app, which never reach the chat-run
  // path on the daemon. Mirrors the two-phase hook the daemon's chat
  // route applies inline:
  //
  //   - Pre-turn (only `userMessage` supplied): run the synchronous
  //     heuristic regex pack so explicit "remember: X" / "我是 X"
  //     markers land in memory before the prompt is composed, and the
  //     same turn's assistant reply already reflects them.
  //   - Post-turn (`userMessage` + `assistantMessage` supplied): queue
  //     the LLM extractor in the background — it speaks SSE /
  //     extraction-history on its own and may take several seconds, so
  //     we don't block the HTTP response on it. The heuristic is
  //     skipped on this branch because the caller already ran it
  //     pre-turn; running it twice would double the
  //     `recordHeuristic({...})` rows in the extraction history for
  //     every turn.
  //
  // External callers (curl, replay tools) that pass only
  // `userMessage` keep the legacy behaviour: heuristic-only.
  app.post('/api/memory/extract', async (req, res) => {
    try {
      const body = asRecord(req.body);
      const userMessage =
        typeof body.userMessage === 'string' ? body.userMessage : '';
      const assistantMessage =
        typeof body.assistantMessage === 'string' ? body.assistantMessage : '';
      const hasAssistant = assistantMessage.trim().length > 0;
      const memoryConfig = await readMemoryConfig(RUNTIME_DATA_DIR);
      if (memoryConfig.chatExtractionEnabled === false) {
        return res.json({ changed: [], attemptedLLM: false });
      }
      const changed = hasAssistant
        ? []
        : await extractFromMessage(RUNTIME_DATA_DIR, userMessage);
      // BYOK chat config — only forwarded by the web app for API-mode
      // chats. We strip the surface to the five fields pickProvider()
      // actually consumes and validate the provider against the four
      // shapes the extractor speaks; an unknown / missing provider
      // means "let the legacy chain decide" so a malformed payload
      // can't override the env / media-config fallbacks.
      const rawChat = body.chatProvider;
      let chatProvider = null;
      if (rawChat && typeof rawChat === 'object') {
        const chatConfig = rawChat as UnknownRecord;
        const provider = chatConfig.provider;
        if (
          provider === 'anthropic'
          || provider === 'openai'
          || provider === 'azure'
          || provider === 'google'
          || provider === 'ollama'
        ) {
          chatProvider = {
            provider,
            apiKey: typeof chatConfig.apiKey === 'string' ? chatConfig.apiKey : '',
            baseUrl: typeof chatConfig.baseUrl === 'string' ? chatConfig.baseUrl : '',
            apiVersion:
              typeof chatConfig.apiVersion === 'string' ? chatConfig.apiVersion : '',
            model: typeof chatConfig.model === 'string' ? chatConfig.model : '',
          };
        }
      }
      let attemptedLLM = false;
      if (userMessage.trim().length > 0 && hasAssistant) {
        attemptedLLM = true;
        void import('../memory-llm.js')
          .then(({ extractWithLLM }) =>
            extractWithLLM(
              RUNTIME_DATA_DIR,
              { userMessage, assistantMessage },
              {
                projectRoot: PROJECT_ROOT,
                chatAgentId: null,
                chatProvider,
              },
            ),
          )
          .catch((err) =>
            console.warn('[memory-llm] background failed (http extract)', err),
          );
      }
      res.json({ changed, attemptedLLM });
    } catch (err) {
      res.status(400).json({ error: errorMessage(err) });
    }
  });

  // Composed memory body for the system prompt. Daemon-side chat runs
  // call `composeMemoryBody()` directly; the web app (BYOK / API mode)
  // can't import daemon internals, so this endpoint exposes the same
  // string the daemon would have folded into the system prompt for a
  // CLI run. `ProjectView.composedSystemPrompt()` calls it before each
  // BYOK turn and passes the result into `composeSystemPrompt`'s
  // `memoryBody` field — without this, the Memory tab is a no-op for
  // BYOK users even though the UI saves model/index/entries for them.
  app.get('/api/memory/system-prompt', async (_req, res) => {
    try {
      const body = await composeMemoryBody(RUNTIME_DATA_DIR);
      res.json({ body });
    } catch (err) {
      res.status(500).json({ error: errorMessage(err) });
    }
  });

  app.post('/api/memory', async (req, res) => {
    try {
      const body = asRecord(req.body);
      if (!isMemoryType(body.type) || typeof body.name !== 'string') {
        throw new Error('memory entry requires `name` and a valid `type`');
      }
      const entry = await upsertMemoryEntry(
        RUNTIME_DATA_DIR,
        body as unknown as MemoryEntryInput,
        undefined,
      );
      res.json({ entry });
    } catch (err) {
      res.status(400).json({ error: errorMessage(err) });
    }
  });

  app.get('/api/memory/:id', async (req, res) => {
    try {
      const entry = await readMemoryEntry(RUNTIME_DATA_DIR, req.params.id);
      if (!entry) return res.status(404).json({ error: 'memory not found' });
      res.json({ entry });
    } catch (err) {
      res.status(400).json({ error: errorMessage(err) });
    }
  });

  app.put('/api/memory/:id', async (req, res) => {
    try {
      const body = asRecord(req.body);
      if (!isMemoryType(body.type) || typeof body.name !== 'string') {
        throw new Error('memory entry requires `name` and a valid `type`');
      }
      const entry = await upsertMemoryEntry(
        RUNTIME_DATA_DIR,
        {
          ...(body as unknown as MemoryEntryInput),
          id: req.params.id,
        },
        undefined,
      );
      res.json({ entry });
    } catch (err) {
      res.status(400).json({ error: errorMessage(err) });
    }
  });

  app.delete('/api/memory/:id', async (req, res) => {
    try {
      await deleteMemoryEntry(RUNTIME_DATA_DIR, req.params.id);
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: errorMessage(err) });
    }
  });

}
