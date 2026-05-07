// @ts-nocheck
import { spawn } from 'node:child_process';
import path from 'node:path';

const ACP_PROTOCOL_VERSION = 1;
const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_STAGE_TIMEOUT_MS = 180_000;

function sendRpc(writable, id, method, params) {
  writable.write(
    `${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`,
  );
}

function sendRpcResult(writable, id, result) {
  writable.write(`${JSON.stringify({ jsonrpc: '2.0', id, result })}\n`);
}

function isJsonRpcId(value) {
  return typeof value === 'number' || typeof value === 'string';
}

function rpcErrorMessage(raw) {
  if (!raw || typeof raw !== 'object' || !raw.error || typeof raw.error !== 'object') {
    return '';
  }
  const message =
    typeof raw.error.message === 'string'
      ? raw.error.message
      : typeof raw.error.code === 'number'
        ? String(raw.error.code)
        : 'json-rpc error';
  return typeof raw.id === 'number'
    ? `json-rpc id ${raw.id}: ${message}`
    : message;
}

function formatUsage(usage) {
  if (!usage || typeof usage !== 'object') return null;
  const out = {};
  if (typeof usage.inputTokens === 'number') out.input_tokens = usage.inputTokens;
  if (typeof usage.outputTokens === 'number') out.output_tokens = usage.outputTokens;
  if (typeof usage.cachedReadTokens === 'number') {
    out.cached_read_tokens = usage.cachedReadTokens;
  }
  if (typeof usage.thoughtTokens === 'number') out.thought_tokens = usage.thoughtTokens;
  if (typeof usage.totalTokens === 'number') out.total_tokens = usage.totalTokens;
  return Object.keys(out).length > 0 ? out : null;
}

function choosePermissionOutcome(options) {
  const list = Array.isArray(options) ? options : [];
  const approveForSession = list.find((option) => option?.optionId === 'approve_for_session');
  if (approveForSession) return 'approve_for_session';
  const allowAlways = list.find((option) => option?.kind === 'allow_always');
  if (allowAlways?.optionId) return allowAlways.optionId;
  const allowOnce = list.find((option) => option?.kind === 'allow_once');
  if (allowOnce?.optionId) return allowOnce.optionId;
  return null;
}

function normalizeModels(models, defaultModelOption) {
  const available = Array.isArray(models?.availableModels) ? models.availableModels : [];
  const currentModelId =
    typeof models?.currentModelId === 'string' ? models.currentModelId : null;
  const seen = new Set([defaultModelOption.id]);
  const out = [defaultModelOption];
  for (const model of available) {
    const id = typeof model?.modelId === 'string' ? model.modelId.trim() : '';
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const name = typeof model?.name === 'string' ? model.name.trim() : '';
    const isCurrent = id === currentModelId;
    const labelBase = name && name !== id ? `${name} (${id})` : id;
    out.push({ id, label: isCurrent ? `${labelBase} • current` : labelBase });
  }
  return out;
}

export function createJsonLineStream(onMessage) {
  let buffer = '';
  return {
    feed(chunk) {
      buffer += chunk;
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          onMessage(JSON.parse(trimmed), trimmed);
        } catch {
          // Ignore non-JSON log lines on stdout.
        }
      }
    },
    flush() {
      const trimmed = buffer.trim();
      buffer = '';
      if (!trimmed) return;
      try {
        onMessage(JSON.parse(trimmed), trimmed);
      } catch {
        // Ignore trailing non-JSON log lines on stdout.
      }
    },
  };
}

export async function detectAcpModels({
  bin,
  args,
  cwd = process.cwd(),
  timeoutMs = DEFAULT_TIMEOUT_MS,
  clientName = 'open-design-detect',
  clientVersion = 'runtime-adapter',
  defaultModelOption = { id: 'default', label: 'Default (CLI config)' },
}) {
  return await new Promise((resolve, reject) => {
    const child = spawn(bin, args, {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env },
    });
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');

    let settled = false;
    let stderrBuf = '';
    let expectedId = 1;
    let nextId = 2;

    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        child.stdin.end();
      } catch {}
      fn(value);
    };

    const fail = (message) => {
      finish(reject, new Error(message));
      if (!child.killed) child.kill('SIGTERM');
    };

    const writeRpc = (id, method, params) => {
      try {
        sendRpc(child.stdin, id, method, params);
      } catch (err) {
        fail(`stdin write failed: ${err.message}`);
      }
    };

    const sendSessionNew = () => {
      expectedId = nextId;
      writeRpc(nextId, 'session/new', {
        cwd: path.resolve(cwd),
        mcpServers: [],
      });
      nextId += 1;
    };

    const parser = createJsonLineStream((raw) => {
      const rpcErr = rpcErrorMessage(raw);
      if (rpcErr) {
        fail(rpcErr);
        return;
      }
      if (raw.id !== expectedId || !raw.result || typeof raw.result !== 'object') return;
      if (expectedId === 1) {
        sendSessionNew();
        return;
      }
      if (expectedId === 2) {
        const models = normalizeModels(raw.result.models, defaultModelOption);
        finish(resolve, models);
        if (!child.killed) child.kill('SIGTERM');
      }
    });

    child.stdout.on('data', (chunk) => parser.feed(chunk));
    child.stdout.on('close', () => parser.flush());
    child.stdin.on('error', (err) => fail(`stdin error: ${err.message}`));
    child.stderr.on('data', (chunk) => {
      stderrBuf = `${stderrBuf}${chunk}`.slice(-16_000);
    });
    child.on('error', (err) => fail(`spawn failed: ${err.message}`));
    child.on('close', (code, signal) => {
      parser.flush();
      if (!settled) {
        const errTail = stderrBuf.trim();
        const suffix = errTail ? ` stderr=${errTail}` : '';
        fail(`ACP model detection exited code=${code} signal=${signal ?? 'none'}${suffix}`);
      }
    });

    const timer = setTimeout(() => {
      fail(`ACP model detection timed out after ${timeoutMs}ms`);
    }, timeoutMs);

    writeRpc(1, 'initialize', {
      protocolVersion: ACP_PROTOCOL_VERSION,
      clientCapabilities: { terminal: false },
      clientInfo: { name: clientName, version: clientVersion },
    });
  });
}

export function attachAcpSession({
  child,
  prompt,
  cwd,
  model,
  send,
  clientName = 'open-design',
  clientVersion = 'runtime-adapter',
  stageTimeoutMs = DEFAULT_STAGE_TIMEOUT_MS,
}) {
  const runStartedAt = Date.now();
  const effectiveCwd = path.resolve(cwd || process.cwd());
  let expectedId = 1;
  let nextId = 2;
  let promptRequestId = null;
  let sessionId = null;
  let activeModel = null;
  let emittedThinkingStart = false;
  let emittedFirstTokenStatus = false;
  let finished = false;
  let fatal = false;
  let stageTimer = null;

  const resetStageTimer = (label) => {
    clearTimeout(stageTimer);
    stageTimer = setTimeout(() => {
      fail(`ACP ${label} timed out after ${stageTimeoutMs}ms`);
    }, stageTimeoutMs);
  };

  const clearStageTimer = () => {
    clearTimeout(stageTimer);
    stageTimer = null;
  };

  const fail = (message) => {
    if (finished) return;
    finished = true;
    fatal = true;
    clearStageTimer();
    send('error', { message });
    if (!child.killed) child.kill('SIGTERM');
  };

  const writeRpc = (id, method, params, timeoutLabel) => {
    resetStageTimer(timeoutLabel);
    try {
      sendRpc(child.stdin, id, method, params);
    } catch (err) {
      fail(`stdin write failed: ${err.message}`);
    }
  };

  const sendPrompt = () => {
    promptRequestId = nextId;
    expectedId = promptRequestId;
    writeRpc(
      promptRequestId,
      'session/prompt',
      {
        sessionId,
        prompt: [{ type: 'text', text: prompt }],
      },
      'session/prompt',
    );
    nextId += 1;
  };

  const replyPermission = (raw) => {
    const optionId = choosePermissionOutcome(raw.params?.options);
    if (!optionId || !isJsonRpcId(raw.id)) {
      fail(`unhandled ACP permission request: ${JSON.stringify(raw)}`);
      return;
    }
    resetStageTimer('session/request_permission');
    try {
      sendRpcResult(child.stdin, raw.id, {
        outcome: { outcome: 'selected', optionId },
      });
    } catch (err) {
      fail(`stdin write failed: ${err.message}`);
    }
  };

  const parser = createJsonLineStream((raw, rawLine) => {
    resetStageTimer('response');
    const rpcErr = rpcErrorMessage(raw);
    if (rpcErr) {
      fail(rpcErr);
      return;
    }
    if (raw.method === 'session/request_permission') {
      replyPermission(raw);
      return;
    }
    if (raw.method === 'session/update' && raw.params?.update) {
      const update = raw.params.update;
      if (update.sessionUpdate === 'agent_thought_chunk') {
        const text = update.content?.text;
        if (typeof text === 'string' && text.length > 0) {
          if (!emittedThinkingStart) {
            emittedThinkingStart = true;
            send('agent', { type: 'thinking_start' });
          }
          send('agent', { type: 'thinking_delta', delta: text });
        }
        return;
      }
      if (update.sessionUpdate === 'agent_message_chunk') {
        const text = update.content?.text;
        if (typeof text === 'string' && text.length > 0) {
          if (!emittedFirstTokenStatus) {
            emittedFirstTokenStatus = true;
            send('agent', {
              type: 'status',
              label: 'streaming',
              ttftMs: Date.now() - runStartedAt,
            });
          }
          send('agent', { type: 'text_delta', delta: text });
        }
        return;
      }
      return;
    }
    if (raw.id !== expectedId || !raw.result || typeof raw.result !== 'object') {
      return;
    }
    if (expectedId === 1) {
      expectedId = nextId;
      writeRpc(
        nextId,
        'session/new',
        {
          cwd: effectiveCwd,
          mcpServers: [],
        },
        'session/new',
      );
      nextId += 1;
      return;
    }
    if (expectedId === 2) {
      sessionId = typeof raw.result.sessionId === 'string' ? raw.result.sessionId : null;
      activeModel =
        typeof raw.result.models?.currentModelId === 'string'
          ? raw.result.models.currentModelId
          : null;
      if (sessionId && activeModel) {
        send('agent', { type: 'status', label: 'model', model: activeModel });
      }
      if (sessionId && model && model !== 'default') {
        expectedId = nextId;
        writeRpc(
          nextId,
          'session/set_model',
          {
            sessionId,
            modelId: model,
          },
          'session/set_model',
        );
        nextId += 1;
        return;
      }
      if (!sessionId) {
        fail(`invalid session/new response: ${rawLine}`);
        return;
      }
      sendPrompt();
      return;
    }
    if (promptRequestId !== null && raw.id === promptRequestId) {
      const usage = formatUsage(raw.result.usage);
      if (usage) {
        send('agent', {
          type: 'usage',
          usage,
          durationMs: Date.now() - runStartedAt,
        });
      }
      finished = true;
      clearStageTimer();
      child.stdin.end();
      return;
    }
    if (sessionId && model && model !== 'default' && raw.id === expectedId) {
      activeModel = model;
      send('agent', { type: 'status', label: 'model', model: activeModel });
      sendPrompt();
    }
  });

  child.stdout.on('data', (chunk) => parser.feed(chunk));
  child.on('close', () => {
    clearStageTimer();
    parser.flush();
  });
  child.on('error', (err) => fail(err.message));
  child.stdin.on('error', (err) => fail(`stdin error: ${err.message}`));

  writeRpc(1, 'initialize', {
    protocolVersion: ACP_PROTOCOL_VERSION,
    clientCapabilities: { terminal: false },
    clientInfo: { name: clientName, version: clientVersion },
  }, 'initialize');

  return {
    hasFatalError() {
      return fatal;
    },
  };
}
