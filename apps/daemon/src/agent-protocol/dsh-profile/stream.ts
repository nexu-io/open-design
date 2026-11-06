/** @module agent-protocol/dsh-profile/stream
 * Strict incremental newline-delimited JSON parser for the OD Harness profile.
 * Unlike the tolerant ACP stream, stdout is a protocol-only channel: malformed
 * or multiline data is fatal and raw content is never repeated in errors.
 */
import { StringDecoder } from 'node:string_decoder';
import { parseDshProfileRuntimeFrame } from './frames.js';
import type {
  DshProfileRuntimeFrame,
  DshProfileStreamError,
  DshProfileStreamErrorCode,
} from './types.js';

export const DEFAULT_DSH_PROFILE_MAX_FRAME_BYTES = 1024 * 1024;

export type DshProfileStreamOptions = {
  onFrame: (frame: DshProfileRuntimeFrame) => void;
  onError: (error: DshProfileStreamError) => void;
  maxFrameBytes?: number;
};

function byteLength(value: string): number {
  return Buffer.byteLength(value, 'utf8');
}

export function createDshProfileJsonlStream({
  onFrame,
  onError,
  maxFrameBytes = DEFAULT_DSH_PROFILE_MAX_FRAME_BYTES,
}: DshProfileStreamOptions) {
  const decoder = new StringDecoder('utf8');
  let buffer = '';
  let line = 0;
  let failed = false;

  const fail = (code: DshProfileStreamErrorCode, message: string, errorLine: number) => {
    if (failed) return;
    failed = true;
    buffer = '';
    onError({ code, message, line: errorLine });
  };

  const handleLine = (rawLine: string) => {
    line += 1;
    const candidate = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
    if (candidate.trim().length === 0) return;
    if (byteLength(candidate) > maxFrameBytes) {
      fail('DSH_PROFILE_FRAME_TOO_LARGE', 'DeepSeek Harness profile emitted an oversized frame.', line);
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(candidate) as unknown;
    } catch {
      fail('DSH_PROFILE_MALFORMED_FRAME', 'DeepSeek Harness profile emitted malformed JSON.', line);
      return;
    }
    try {
      onFrame(parseDshProfileRuntimeFrame(parsed));
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'frame validation failed';
      fail('DSH_PROFILE_INVALID_FRAME', `DeepSeek Harness profile emitted an invalid frame: ${detail}.`, line);
    }
  };

  const drain = () => {
    let newline = buffer.indexOf('\n');
    while (!failed && newline >= 0) {
      const current = buffer.slice(0, newline);
      buffer = buffer.slice(newline + 1);
      handleLine(current);
      newline = buffer.indexOf('\n');
    }
    if (!failed && byteLength(buffer) > maxFrameBytes) {
      fail('DSH_PROFILE_FRAME_TOO_LARGE', 'DeepSeek Harness profile emitted an oversized frame.', line + 1);
    }
  };

  return {
    feed(chunk: string | Uint8Array) {
      if (failed) return;
      buffer += typeof chunk === 'string' ? chunk : decoder.write(Buffer.from(chunk));
      drain();
    },
    flush() {
      if (failed) return;
      buffer += decoder.end();
      if (buffer.length === 0) return;
      if (buffer.trim().length === 0) {
        buffer = '';
        return;
      }
      // A final complete JSON value without a newline is accepted because EOF
      // is an unambiguous frame boundary. Incomplete/multiline content fails.
      const residual = buffer;
      buffer = '';
      handleLine(residual);
    },
    failIfIncomplete() {
      if (failed || buffer.length === 0 || buffer.trim().length === 0) return;
      fail('DSH_PROFILE_TRUNCATED_FRAME', 'DeepSeek Harness profile ended with a truncated frame.', line + 1);
    },
    hasFailed() {
      return failed;
    },
  };
}
