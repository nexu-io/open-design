# 0002. Accept wrapped Chat Completions envelopes at one normalization boundary

## Status

Accepted

## Context

ClinePass (`https://api.cline.bot/api/v1`) returns non-streaming Chat Completions inside an envelope:

```json
{ "data": { "object": "chat.completion", "choices": [ ... ], "usage": { ... } }, "success": true }
```

Streaming on the same endpoint returns standard OpenAI SSE. The envelope is legacy upstream behaviour that has been reported and acknowledged, with no shipped opt-out (cline/cline#12647).

OpenDesign's connection test reads top-level `choices`, so a 200 response that did contain a usable completion was reported as `kind: 'unknown'` with the raw body as `detail`. Three further non-streaming consumers read top-level `choices` the same way: `apps/daemon/src/design/finalize-design.ts`, and two call sites in `apps/daemon/src/memory-llm.ts`. The chat path itself streams (`/api/proxy/openai/stream` always sends `stream: true`), so only non-streaming paths were affected.

## Decision

1. **One normalization boundary, no adapter layer.** A small function `normalizeOpenAICompletion(payload)` lives in `apps/daemon/src/integrations/openaiCompletionShape.ts` and is called by the four non-streaming OpenAI consumer sites: `inspectProviderCompletion` and `extractOpenAIMessageText` in `apps/daemon/src/connectionTest.ts`, the finalize provider call in `apps/daemon/src/design/finalize-design.ts`, and the OpenAI/OpenAI-compatible calls in `apps/daemon/src/memory-llm.ts`. The four `fetch` call sites stay as they are. `apps/daemon/src/media/index.ts` is excluded: it reads `message.images`, a different response shape. In `finalize-design.ts` the payload is normalized once at the call site and the same object feeds both `extractDesignMd` and `extractTokenUsage`, because a wrapped response carries `usage` inside the envelope too.

2. **Unwrapping requires all five conditions.** `data` is a plain object; `Array.isArray(data.choices)`; top-level `error` is absent; top-level `success !== false`; `data.object`, when present, equals `chat.completion`. Anything else is returned unchanged.

3. **Unwrapping never substitutes for validation.** The existing checks — non-empty `choices`, `finish_reason` handling, sample extraction, model echo — run on the unwrapped object unchanged. Accepting a known envelope is not the same as loosening the acceptance gate.

4. **Unwrapping is logged.** Each time the shim fires, emit a fixed line that carries no response data. It is a global removal signal: when the line stops appearing, the shim can go. It does **not** identify the provider — the trustworthy identifiers are the protocol and host, which live at the call sites, and threading them through `extractText: (data) => string` would change a shared dispatch contract for a logging nicety. On the connection-test path the adjacent `[test:provider]` line already names both.

5. **Shape-mismatch diagnostics stay in `detail`, and the body is not persisted.** No new `ConnectionTestKind`. The dialog shows one structural summary, emitted unconditionally: allowlisted top-level key names, a count of any other keys, the top-level `choices` count or `absent`, the `data.choices` count or `absent`, `data.object` classified against an enum, `success: false` when set, and `data: absent` when there is no `data` object. The raw body is deliberately **not** written to the daemon log: `redactSecrets` strips bearer/header forms and the submitted key, but a JSON field such as `"api_key"` passes through it untouched, and daemon logs are collected into diagnostics.

## Diagnostic trust model

`detail` is rendered in the dialog *and* written by the provider-test warning, and daemon logs are collected into diagnostics. So everything in it has to satisfy one rule: **no provider-controlled string is echoed, in any position — including property names.**

Allowed fragments:

- our own literals (sentence frames, `absent`, `other`);
- names from a fixed allowlist — `data`, `choices`, `success`, `error`, `message`, `object`, `model`, `usage`, `id`, `created`, `output`, `output_text`, `candidates`, `content`, `finish_reason`, `system_fingerprint`, `index`;
- values from a fixed enum — `chat.completion`, `chat.completion.chunk`, `text_completion`, `embedding`;
- counts and booleans.

Not allowed: raw bodies, property names outside the allowlist, `data.object` outside the enum, model ids read from the response, model output text. `redactSecrets` is not a substitute for any of this — it is a blacklist over header-shaped secrets and does not cover a JSON field such as `api_key`.

This rule was arrived at the hard way. Three review rounds each closed one instance of the same class, because the working assumption was "structure is safe, values are dangerous". A property name is a value. The invariant test `diagnostics never echo provider-supplied strings` in `apps/daemon/tests/connection-test.test.ts` pins the rule rather than the instances.

Pre-existing sites that still echo provider strings and are deliberately **not** changed here (tracked as a follow-up): the non-2xx body slice in `classifyProviderHttpFailure`, `extractProviderErrorDetail`'s `error.message`, the `not_found_model` model echo, and `smokeFailureDetail`'s reply sample.

## Alternatives considered

- **Strict only (status quo):** rejects a response that contains a usable completion, and leaves the same failure latent in `finalize-design` and `memory-llm`, where it surfaces with no visible error at all.
- **Loose acceptance (any `data.choices`):** turns `{ "success": false, "data": { "choices": [...] } }` into a false success. For a user-initiated connection test, a false negative costs more than a false positive.
- **Per-provider opt-in switch:** the envelope is unconditional and does not vary with configuration, so the switch would ask users to declare a format detail they cannot observe. Capability switches declare request-shape capabilities; they are not a way to accept broken responses.
- **Unify the four call sites into one `callOpenAICompatible()`:** this is the end state, but it is a refactor sized for a bug fix. Revisit when a fifth non-streaming consumer appears.
- **New `ConnectionTestKind` for response-shape mismatches:** the granularity test is whether the client takes a different action. It does not — the user checks the provider either way — so this does not qualify as a distinct error code.

## Consequences

Non-streaming OpenAI consumers now accept one additional, explicitly enumerated response shape. Every other shape still fails, and failure diagnostics get more actionable rather than less.

Diagnostics moved *away* from raw-body echoing, not toward it. An earlier draft of this decision persisted up to 2 KB of the untrusted body in the daemon log on the theory that it was the only surviving evidence; review pointed out that `redactSecrets` is a blacklist over header-shaped secrets, so a provider that echoes `{"api_key": "..."}` would have been written to disk. The summary carries the same shape information and none of the values.

That makes the summary the only diagnostic. If a future failure genuinely needs body values, the answer is a deliberate capture mechanism the user opts into — not a log line quietly reinstated because "support might need it".

The shim is a compatibility layer with no upstream fix shipped. It should be removed once Cline offers a standard response — they have discussed an `X-Response-Format: openai` request header — and the unwrap log line is the signal that it is still in use.

Known and deliberately unfixed here: `apps/web/src/components/EntryShell.tsx` returns without feedback when the onboarding connection test fails. That is tracked as a separate follow-up issue; it is orthogonal to response shape, as a `402 Insufficient balance` failure is blocked the same way.
