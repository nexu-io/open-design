/**
 * Sentinel values for runtime adapters that don't follow the
 * default child-spawn pipeline. Today only one runtime uses a
 * sentinel — the Anthropic-compatible HTTP adapter — but the
 * dispatch logic in `apps/daemon/src/server.ts` is keyed on these
 * strings, so they live in one place rather than being scattered
 * as bare literals across `defs/*` and `server.ts`.
 *
 * The HTTP sentinel flow:
 *   1. `defs/anthropic.ts` exports `anthropicAgentDef` with
 *      `bin: HTTP_RUNTIME_BIN` and `streamFormat: ANTHROPIC_SSE_FORMAT`.
 *   2. The binary-resolution guard in server.ts lets `HTTP_RUNTIME_BIN`
 *      through (it would otherwise be treated as "no binary").
 *   3. The streaming-consumer block at server.ts ~12859 detects
 *      `ANTHROPIC_SSE_FORMAT` and dispatches to `invokeHttpAgent`
 *      instead of attaching stdout listeners to a spawn() child.
 *
 * Adding a second HTTP runtime means:
 *   - export a new sentinel from this file
 *   - add a new case to the streamFormat dispatch in server.ts
 *   - (optional) relax the `def.bin === ''` guard if the new runtime
 *     also uses `bin: HTTP_RUNTIME_BIN` — otherwise it can pick its
 *     own sentinel so the existing guards don't need to change
 */

export const HTTP_RUNTIME_BIN = '__http__';
export const ANTHROPIC_SSE_FORMAT = 'anthropic-sse';
export const OPENAI_SSE_FORMAT = 'openai-sse';
