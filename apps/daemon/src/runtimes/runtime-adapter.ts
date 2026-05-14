import type { ChildProcess } from 'node:child_process';

import { attachAcpSession, type AcpMcpServerInput } from '../acp.js';
import { createClaudeStreamHandler } from '../claude-stream.js';
import { createCopilotStreamHandler } from '../copilot-stream.js';
import { createJsonEventStreamHandler } from '../json-event-stream.js';
import { attachPiRpcSession } from '../pi-rpc.js';
import { createQoderStreamHandler } from '../qoder-stream.js';
import type { RuntimeAgentDef } from './types.js';

export const RUNTIME_STREAM_FORMATS = [
  'plain',
  'claude-stream-json',
  'qoder-stream-json',
  'copilot-stream-json',
  'json-event-stream',
  'pi-rpc',
  'acp-json-rpc',
] as const;

export type RuntimeStreamFormat = typeof RUNTIME_STREAM_FORMATS[number];
export type RuntimeStdinMode = 'pipe' | 'ignore';
export type RuntimeSend = (event: string, payload: unknown) => void;
export type RuntimeAgentEvent = Record<string, unknown>;

export type RuntimeSessionHandle = {
  abort?: () => void;
  hasFatalError?: () => boolean;
  completedSuccessfully?: () => boolean;
};

export type RuntimeAttachContext = {
  child: ChildProcess;
  prompt: string;
  cwd?: string;
  model?: string | null;
  imagePaths?: string[];
  uploadRoot?: string;
  mcpServers?: AcpMcpServerInput[];
  send: RuntimeSend;
  emitAgentEvent?: (event: RuntimeAgentEvent) => void;
  emitRuntimeError?: (message: string, details?: { raw?: unknown }) => void;
};

export type RuntimeExit = {
  code: number | null;
  signal: NodeJS.Signals | null;
  canceled?: boolean;
};

export type RuntimeAttachment = {
  session: RuntimeSessionHandle | null;
  trackingSubstantiveOutput: boolean;
  producedSubstantiveOutput(): boolean;
  streamError(): string | null;
  classifyClose(exit: RuntimeExit): 'succeeded' | 'failed' | 'canceled';
};

type MutableRuntimeAttachment = RuntimeAttachment & {
  markProducedOutput(event: RuntimeAgentEvent): void;
  markStreamError(message: string): void;
};

export type RuntimeAdapter = {
  readonly id: string;
  readonly displayName: string;
  readonly streamFormat: RuntimeStreamFormat;
  readonly eventParser: string;
  supportsCritiqueTheater(): boolean;
  acceptsExternalMcpServers(): boolean;
  stdinMode(): RuntimeStdinMode;
  shouldWritePromptToStdin(): boolean;
  attach(context: RuntimeAttachContext): RuntimeAttachment;
};

const SUBSTANTIVE_AGENT_EVENT_TYPES = new Set([
  'text_delta',
  'thinking_delta',
  'tool_use',
  'tool_result',
  'artifact',
]);

function isRuntimeStreamFormat(value: string): value is RuntimeStreamFormat {
  return RUNTIME_STREAM_FORMATS.includes(value as RuntimeStreamFormat);
}

function requireStdout(child: ChildProcess, runtimeId: string) {
  if (!child.stdout) {
    throw new Error(`Runtime ${runtimeId} child process is missing stdout`);
  }
  return child.stdout;
}

function createAttachmentState(trackingSubstantiveOutput: boolean): MutableRuntimeAttachment {
  let producedOutput = false;
  let error: string | null = null;

  return {
    session: null,
    trackingSubstantiveOutput,
    producedSubstantiveOutput() {
      return producedOutput;
    },
    streamError() {
      return error;
    },
    classifyClose(exit) {
      if (exit.canceled) return 'canceled';
      if (this.session?.hasFatalError?.()) return 'failed';
      if (error) return 'failed';
      if (
        exit.code === 0 &&
        trackingSubstantiveOutput &&
        !producedOutput
      ) {
        return 'failed';
      }
      const cleanForcedShutdown =
        exit.code === null &&
        exit.signal === 'SIGTERM' &&
        this.session?.completedSuccessfully?.() === true;
      return exit.code === 0 || cleanForcedShutdown ? 'succeeded' : 'failed';
    },
    markProducedOutput(event: RuntimeAgentEvent) {
      if (
        typeof event.type === 'string' &&
        SUBSTANTIVE_AGENT_EVENT_TYPES.has(event.type)
      ) {
        producedOutput = true;
      }
    },
    markStreamError(message: string) {
      error = error ?? message;
    },
  };
}

export function createRuntimeAdapter(def: RuntimeAgentDef): RuntimeAdapter {
  const streamFormat = def.streamFormat || 'plain';
  if (!isRuntimeStreamFormat(streamFormat)) {
    throw new Error(
      `Unsupported streamFormat "${streamFormat}" for runtime "${def.id}"`,
    );
  }

  const eventParser = def.eventParser || def.id;

  function emitRuntimeError(
    context: RuntimeAttachContext,
    message: string,
    details?: { raw?: unknown },
  ): void {
    if (context.emitRuntimeError) {
      context.emitRuntimeError(message, details);
      return;
    }
    context.send('error', details?.raw === undefined ? { message } : { message, raw: details.raw });
  }

  return {
    id: def.id,
    displayName: def.name,
    streamFormat,
    eventParser,
    supportsCritiqueTheater() {
      return streamFormat === 'plain';
    },
    acceptsExternalMcpServers() {
      return streamFormat === 'acp-json-rpc';
    },
    stdinMode() {
      return def.promptViaStdin || streamFormat === 'acp-json-rpc'
        ? 'pipe'
        : 'ignore';
    },
    shouldWritePromptToStdin() {
      return Boolean(def.promptViaStdin && streamFormat !== 'pi-rpc');
    },
    attach(context: RuntimeAttachContext): RuntimeAttachment {
      const emitAgentEvent = context.emitAgentEvent ?? ((event) => context.send('agent', event));
      const createObservedAttachment = () => {
        const state = createAttachmentState(true);
        const observeAgentEvent = (event: RuntimeAgentEvent) => {
          if (event.type === 'error') {
            const message = String(event.message || 'Agent stream error');
            state.markStreamError(message);
            emitRuntimeError(context, message, { raw: event.raw });
            return;
          }
          state.markProducedOutput(event);
          emitAgentEvent(event);
        };
        return { state, observeAgentEvent };
      };

      if (streamFormat === 'plain') {
        const state = createAttachmentState(false);
        requireStdout(context.child, def.id).on('data', (chunk) => {
          context.send('stdout', { chunk });
        });
        return state;
      }

      if (streamFormat === 'claude-stream-json') {
        const state = createAttachmentState(false);
        const handler = createClaudeStreamHandler(emitAgentEvent);
        requireStdout(context.child, def.id).on('data', (chunk) => handler.feed(String(chunk)));
        context.child.on('close', () => handler.flush());
        return state;
      }

      if (streamFormat === 'qoder-stream-json') {
        const { state, observeAgentEvent } = createObservedAttachment();
        const handler = createQoderStreamHandler(observeAgentEvent);
        requireStdout(context.child, def.id).on('data', (chunk) => handler.feed(String(chunk)));
        context.child.on('close', () => handler.flush());
        return state;
      }

      if (streamFormat === 'copilot-stream-json') {
        const state = createAttachmentState(false);
        const handler = createCopilotStreamHandler(emitAgentEvent);
        requireStdout(context.child, def.id).on('data', (chunk) => handler.feed(String(chunk)));
        context.child.on('close', () => handler.flush());
        return state;
      }

      if (streamFormat === 'json-event-stream') {
        const { state, observeAgentEvent } = createObservedAttachment();
        const handler = createJsonEventStreamHandler(eventParser, observeAgentEvent);
        requireStdout(context.child, def.id).on('data', (chunk) => handler.feed(String(chunk)));
        context.child.on('close', () => handler.flush());
        return state;
      }

      if (streamFormat === 'pi-rpc') {
        const { state, observeAgentEvent } = createObservedAttachment();
        state.session = attachPiRpcSession({
          child: context.child,
          prompt: context.prompt,
          ...(context.cwd === undefined ? {} : { cwd: context.cwd }),
          ...(context.model === undefined ? {} : { model: context.model }),
          ...(def.supportsImagePaths
            ? { imagePaths: context.imagePaths ?? [] }
            : { imagePaths: [] }),
          ...(context.uploadRoot === undefined ? {} : { uploadRoot: context.uploadRoot }),
          send: (channel, payload) => {
            if (channel === 'agent' && payload && typeof payload === 'object') {
              observeAgentEvent(payload as RuntimeAgentEvent);
              return;
            }
            if (channel === 'error') {
              const message = String(
                payload && typeof payload === 'object' && 'message' in payload
                  ? payload.message
                  : 'Pi session error',
              );
              state.markStreamError(message);
              emitRuntimeError(context, message);
              return;
            }
            context.send(channel, payload);
          },
        });
        return state;
      }

      const state = createAttachmentState(false);
      state.session = attachAcpSession({
        child: context.child,
        prompt: context.prompt,
        ...(context.cwd === undefined ? {} : { cwd: context.cwd }),
        ...(context.model === undefined ? {} : { model: context.model }),
        ...(context.mcpServers === undefined ? {} : { mcpServers: context.mcpServers }),
        send: context.send,
      });
      return state;
    },
  };
}
