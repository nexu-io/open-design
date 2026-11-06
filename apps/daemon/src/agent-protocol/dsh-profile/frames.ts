/** @module agent-protocol/dsh-profile/frames
 * Runtime validation for the versioned profile protocol. Validation messages
 * deliberately name fields but never include field values or raw frames.
 */
import {
  DSH_PROFILE_PROTOCOL_VERSION,
  DSH_PROFILE_RUNTIME,
  type DshProfileCapabilities,
  type DshProfileHostCommand,
  type DshProfileRuntimeFrame,
} from './types.js';

type JsonObject = Record<string, unknown>;

function objectValue(value: unknown, label: string): JsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as JsonObject;
}

function stringField(value: JsonObject, field: string, optional = false): string | undefined {
  const found = value[field];
  if (found === undefined && optional) return undefined;
  if (typeof found !== 'string' || found.length === 0) {
    throw new Error(`${field} must be a non-empty string`);
  }
  return found;
}

function booleanField(value: JsonObject, field: string): boolean {
  const found = value[field];
  if (typeof found !== 'boolean') throw new Error(`${field} must be a boolean`);
  return found;
}

function finiteNonNegativeNumber(value: JsonObject, field: string, optional = false): number | undefined {
  const found = value[field];
  if (found === undefined && optional) return undefined;
  if (typeof found !== 'number' || !Number.isFinite(found) || found < 0) {
    throw new Error(`${field} must be a finite non-negative number`);
  }
  return found;
}

function assertVersion(value: JsonObject): void {
  if (value.v !== DSH_PROFILE_PROTOCOL_VERSION) {
    throw new Error(`v must equal ${DSH_PROFILE_PROTOCOL_VERSION}`);
  }
}

function capabilitiesField(value: JsonObject): DshProfileCapabilities {
  const capabilities = objectValue(value.capabilities, 'capabilities');
  if (
    capabilities.session_resume !== true ||
    capabilities.session_cancel !== true ||
    capabilities.structured_events !== true
  ) {
    throw new Error('capabilities must include required generation-1 features');
  }
  return capabilities as DshProfileCapabilities;
}

function assertIdentityFrame(value: JsonObject): void {
  if (value.runtime !== DSH_PROFILE_RUNTIME) {
    throw new Error(`runtime must equal ${DSH_PROFILE_RUNTIME}`);
  }
  if (value.protocol_version !== DSH_PROFILE_PROTOCOL_VERSION) {
    throw new Error(`protocol_version must equal ${DSH_PROFILE_PROTOCOL_VERSION}`);
  }
  stringField(value, 'plugin_version');
  capabilitiesField(value);
}

function assertRequestFrame(value: JsonObject): void {
  stringField(value, 'request_id');
}

function assertWireError(value: unknown): void {
  const error = objectValue(value, 'error');
  stringField(error, 'code');
  stringField(error, 'message');
}

export function parseDshProfileRuntimeFrame(value: unknown): DshProfileRuntimeFrame {
  const frame = objectValue(value, 'frame');
  assertVersion(frame);
  const type = stringField(frame, 'type');
  switch (type) {
    case 'probe':
    case 'ready':
      assertIdentityFrame(frame);
      break;
    case 'session':
      assertRequestFrame(frame);
      stringField(frame, 'session_id');
      booleanField(frame, 'resumed');
      break;
    case 'thinking':
    case 'text':
      assertRequestFrame(frame);
      if (typeof frame.content !== 'string') throw new Error('content must be a string');
      break;
    case 'tool_call':
      assertRequestFrame(frame);
      stringField(frame, 'call_id');
      stringField(frame, 'name');
      if (typeof frame.arguments !== 'string') throw new Error('arguments must be a string');
      break;
    case 'tool_result':
      assertRequestFrame(frame);
      stringField(frame, 'call_id');
      stringField(frame, 'name');
      if (typeof frame.output !== 'string') throw new Error('output must be a string');
      booleanField(frame, 'is_error');
      break;
    case 'usage':
      assertRequestFrame(frame);
      stringField(frame, 'provider');
      stringField(frame, 'model');
      finiteNonNegativeNumber(frame, 'input_tokens');
      finiteNonNegativeNumber(frame, 'output_tokens');
      finiteNonNegativeNumber(frame, 'cache_read_tokens', true);
      finiteNonNegativeNumber(frame, 'cache_write_tokens', true);
      break;
    case 'result': {
      assertRequestFrame(frame);
      if (!['completed', 'cancelled', 'failed'].includes(String(frame.status))) {
        throw new Error('status must be completed, cancelled, or failed');
      }
      stringField(frame, 'session_id');
      stringField(frame, 'output', true);
      stringField(frame, 'stop_reason', true);
      booleanField(frame, 'resume_rejected');
      if (frame.error !== undefined) assertWireError(frame.error);
      if (frame.status === 'failed' && frame.error === undefined) {
        throw new Error('failed result must include error');
      }
      break;
    }
    case 'protocol_error':
      stringField(frame, 'request_id', true);
      stringField(frame, 'code');
      stringField(frame, 'message');
      break;
    default:
      throw new Error('type is not supported by protocol generation 1');
  }
  return frame as DshProfileRuntimeFrame;
}

export function parseDshProfileHostCommand(value: unknown): DshProfileHostCommand {
  const command = objectValue(value, 'command');
  assertVersion(command);
  const type = stringField(command, 'type');
  assertRequestFrame(command);
  if (type === 'cancel') return command as DshProfileHostCommand;
  if (type !== 'execute') {
    throw new Error('type is not a supported host command');
  }
  stringField(command, 'cwd');
  if (typeof command.prompt !== 'string') throw new Error('prompt must be a string');
  stringField(command, 'resume_session_id', true);
  stringField(command, 'reasoning_effort', true);
  if (!Array.isArray(command.mcp_servers)) throw new Error('mcp_servers must be an array');
  if (command.model !== undefined) {
    const model = objectValue(command.model, 'model');
    stringField(model, 'provider');
    stringField(model, 'id');
  }
  return command as DshProfileHostCommand;
}
