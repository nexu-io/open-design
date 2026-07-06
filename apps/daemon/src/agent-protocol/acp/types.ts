/** @module agent-protocol/acp/types
 * Shared primitive type aliases for the ACP JSON-RPC transport layer.
 * Consumed by every other file in acp/; depends only on Node built-ins and
 * carries no runtime code.
 */
import type { Writable } from 'node:stream';
import type { ChildProcess } from 'node:child_process';

/** A JSON-RPC 2.0 request or response identifier. May be a numeric integer or a string. */
export type JsonRpcId = string | number;
/** An arbitrary JSON object with string keys and unknown values. Used as a loose type for parsed RPC frames. */
export type JsonObject = Record<string, unknown>;
/** Minimal writable interface required to send JSON-RPC newline-delimited frames to an ACP agent's stdin. */
export type RpcWritable = Pick<Writable, 'write' | 'end'>;
/** The Node `ChildProcess` handle for a spawned ACP agent subprocess. */
export type AcpChildProcess = ChildProcess;
/** Opaque handle returned by `setTimeout`, used for stage watchdog timers in acp/session.ts and acp/models.ts. */
export type TimerHandle = ReturnType<typeof setTimeout>;
