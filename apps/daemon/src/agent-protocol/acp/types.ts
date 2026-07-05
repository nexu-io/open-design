import type { Writable } from 'node:stream';
import type { ChildProcess } from 'node:child_process';

export type JsonRpcId = string | number;
export type JsonObject = Record<string, unknown>;
export type RpcWritable = Pick<Writable, 'write' | 'end'>;
export type AcpChildProcess = ChildProcess;
export type TimerHandle = ReturnType<typeof setTimeout>;
