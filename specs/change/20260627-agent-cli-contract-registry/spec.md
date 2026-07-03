# Agent CLI Contract Registry Spec

## Title

Public Agent CLI Contract Registry for Open Design runtime compatibility.

## Why

Open Design depends on many external coding-agent CLIs. Their observable
protocols can change across CLI versions, platforms, account state, provider
backends, and server-side rollout flags. The current mock CLI corpus is useful,
but it is not enough as a compatibility source of truth because many recordings
do not carry CLI version or protocol provenance, and normal development or QA
usually validates only the CLI versions installed on one machine.

The desired outcome is a public, auditable contract registry that says exactly
which agent CLI versions, observed protocol shapes, platforms, and error forms
Open Design has validated. The registry must support automated drift detection,
safe public publishing, and offline consumption by the Open Design repository.

## Sources

- Runtime registry: `apps/daemon/src/runtimes/registry.ts` registers the base
  agent definitions consumed by the daemon.
- Runtime definition contract: `apps/daemon/src/runtimes/types.ts` defines
  `RuntimeAgentDef`, including `streamFormat`, prompt input behavior, model
  discovery, auth probes, and MCP injection.
- Spawn path: `apps/daemon/src/server.ts` starts agent CLIs with `spawn(...)`
  and routes stdout, stderr, and stdin according to `streamFormat`.
- ACP transport: `apps/daemon/src/acp.ts` runs JSON-RPC over child stdio after
  spawning an ACP CLI.
- Pi transport: `apps/daemon/src/pi-rpc.ts` also runs a bidirectional RPC over
  child stdio.
- Stream parsers: `apps/daemon/src/runtimes/claude-stream.ts`,
  `apps/daemon/src/runtimes/json-event-stream.ts`,
  `apps/daemon/src/runtimes/qoder-stream.ts`, `apps/daemon/src/copilot-stream.ts`.
- Error classification: `apps/daemon/src/run-failure-classification.ts` and
  `apps/daemon/src/runtimes/auth.ts` classify auth, quota, upstream, protocol,
  timeout, spawn, and process-exit failures.
- Existing mock corpus: `mocks/README.md`, `mocks/manifest.json`,
  `mocks/mock-agent.mjs`, and `apps/daemon/tests/mocks-golden.test.ts`.
- Process model inspiration: `powerformer/skills#23` (`spec-battle`) requires
  fact sources, grounding status, and lightweight Feishu summaries backed by
  full source material.

## Goals

- Create a public contract registry, likely `open-design-agent-contracts`.
- Publish a pnpm-consumable package, likely `@open-design/agent-cli-contracts`.
- Track real CLI observations by agent, CLI version, platform, protocol family,
  probe, and observed shape signature.
- Support multiple active shapes for the same CLI version, including
  server-side rollout variants.
- Cover success streams, model/version probes, tool/file/artifact flows,
  bidirectional RPC transports, and error classification shapes.
- Let Open Design CI replay supported contracts through the daemon parsers.
- Let Open Design runtime classify installed CLIs as verified, newer than
  verified, too old, known breaking, or unknown.
- Keep raw transcripts, credentials, runner homes, and account-specific state out
  of public artifacts.

## Non-Goals

- Do not prove that every historical CLI build or every provider backend state
  works forever.
- Do not evaluate model output quality.
- Do not automatically generate Open Design parser logic from contract data.
- Do not run real CLI capture on untrusted PR code or fork PRs.
- Do not publish raw stdout/stderr/stdin transcripts that may contain secrets,
  local paths, account identifiers, or model-generated user content.

## Repository Shape

```text
open-design-agent-contracts/
  registry/
    agents.json
    support-matrix.json

  probes/
    chat-text-success/
      prompt.md
      fixture-files/
      expected-min-events.json
    chat-tool-success/
      prompt.md
      fixture-files/
      expected-min-events.json
    auth-failure/
      prompt.md
      env-policy.json

  shapes/
    json-event-stream/
      sha256-<shape>.shape.json
    acp-json-rpc/
      sha256-<shape>.shape.json

  observations/
    codex/
      0.133.0/
        darwin-arm64/
          2026-06-27T100000Z.chat-tool-success.observation.json

  fixtures/
    json-event-stream/
      sha256-<shape>.sanitized.jsonl
    acp-json-rpc/
      sha256-<shape>.transcript.jsonl

  goldens/
    open-design-parser/
      json-event-stream/
        sha256-<shape>.events.json

  reports/
    diffs/
      codex/
        0.134.0-sha256-new-vs-sha256-old.md

  schemas/
    observation.schema.json
    source-evidence.schema.json
    shape.schema.json
    support-matrix.schema.json
    transcript.schema.json

  tools/
    discover
    source-scan
    capture
    normalize
    compare
    replay
    matrix
    redact
    publish

  docs/
    SUPPORT_POLICY.md
    REDACTION.md
    HOW_TO_CAPTURE.md
    SECURITY.md
```

## Registry Schema Contract

The registry package must ship JSON Schemas and TypeScript types generated from
the same source definitions. The schema files are normative, not illustrative:
`pnpm validate` in the registry must fail on any record that violates the
required fields, enum values, defaults, hash references, or version rules below.

All records share these rules:

- `schema_version` is required and starts at `1`.
- Unknown top-level fields are rejected unless the schema explicitly names an
  `extensions` object.
- Hash fields use `sha256:<64 lowercase hex chars>`.
- Timestamps use UTC ISO 8601 strings with `Z`.
- `agent` must be present in `registry/agents.json`.
- `protocol_family` must be one of `plain/v1`, `claude-stream-json/v1`,
  `json-event-stream/v1`, `qoder-stream-json/v1`, `copilot-stream-json/v1`,
  `acp-json-rpc/v1`, or `pi-rpc/v1`.
- When a record contains `validity_level`, it must be one of
  `runtime_observed`, `confirmed`, `community_confirmed`, `server_variant`,
  `source_derived`, `vendor_documented`, or `synthetic_mock`.
- `platform` must be one of `darwin-arm64`, `darwin-x64`, `linux-x64`,
  `linux-arm64`, `win32-x64`, or `unknown`.
- Major schema upgrades require a migration script and a changelog entry.
  Consumers must reject a higher `schema_version` unless the package exports a
  migration for it.

### `observation.schema.json`

Observation records are runtime captures only. Source scans, vendor docs, and
synthetic parser fixtures must not be represented as observations because they
do not have child-process transcripts or redaction artifacts.

| Field | Required | Default | Values / validation |
|---|---:|---|---|
| `schema_version` | yes | none | integer, currently `1` |
| `agent` | yes | none | registered agent id |
| `cli_version` | yes | none | exact version string returned by the runtime version probe; `unknown` is not allowed |
| `platform` | yes | none | platform enum above |
| `probe` | yes | none | probe id from `probes/*` |
| `protocol_family` | yes | none | protocol enum above |
| `validity_level` | yes | none | `runtime_observed`, `confirmed`, `community_confirmed`, or `server_variant` |
| `install.source` | yes | none | package, binary, source checkout, or manual install descriptor |
| `install.binary_sha256` | no | `null` | sha256 hash when a stable binary can be hashed |
| `command.argv_template` | yes | none | argv after binary, with secrets and paths templated |
| `command.stdin_mode` | yes | none | `none`, `text-prompt`, `jsonl-open`, `prompt-file`, or `rpc` |
| `capture.captured_at` | yes | none | UTC timestamp |
| `capture.runner` | yes | none | runner image/name |
| `capture.workflow_run_url` | no | `null` | HTTPS URL for automated captures |
| `capture.raw_stdout_sha256` | no | `null` | required for stream transports when stdout exists |
| `capture.raw_stderr_sha256` | no | `null` | required when stderr exists |
| `capture.raw_client_transcript_sha256` | yes | none | hash of stdin/stdout/stderr/process transcript bundle |
| `capture.raw_artifact_visibility` | yes | none | `private`, `public`, or `discarded_after_redaction` |
| `redaction.tool_version` | yes | none | semver of redaction tool |
| `redaction.status` | yes | none | `passed`, `failed`, or `manual_review_required` |
| `shape.signature` | yes | none | shape hash |
| `shape.path` | yes | none | relative path under `shapes/` |
| `parser_replay.open_design_commit` | no | `null` | commit used for parser replay |
| `parser_replay.status` | no | `not_run` | `compatible`, `incompatible`, or `not_run` |

Invalid examples that must fail validation:

- `schema_version: 2` without a registered migration.
- `redaction.status: "passed"` with missing
  `capture.raw_client_transcript_sha256`.
- `shape.signature` that does not match the hash of the referenced shape file.
- `agent: "codex"` with a `protocol_family` never declared by that agent.
- `cli_version: "unknown"` or `validity_level: "source_derived"` in an
  observation record.

### `source-evidence.schema.json`

Source evidence records capture non-runtime evidence from open-source code,
vendor documentation, or hand-built parser fixtures. They can drive risk reports
and capture priority, but they do not prove runtime support.

| Field | Required | Default | Values / validation |
|---|---:|---|---|
| `schema_version` | yes | none | integer, currently `1` |
| `agent` | yes | none | registered agent id |
| `protocol_family` | yes | none | protocol enum above |
| `validity_level` | yes | none | `source_derived`, `vendor_documented`, or `synthetic_mock` |
| `source_refs[]` | yes | none | repository tag, commit, file path, doc URL, or local fixture path |
| `derived_shape.signature` | yes | none | derived or synthetic shape hash |
| `derived_shape.path` | yes | none | relative path under `shapes/` |
| `discovered_at` | yes | none | UTC timestamp |
| `cli_version` | no | `unknown` | exact version/tag when known |

Invalid examples that must fail validation:

- `validity_level: "runtime_observed"` in a source evidence record.
- `source_refs: []`.
- any `capture.raw_client_transcript_sha256` field; source evidence has no raw
  runtime transcript.

### `transcript.schema.json`

The transcript schema validates sanitized line-oriented records. Each line is
one of these record kinds:

| Kind | Required fields | Optional fields | Validation |
|---|---|---|---|
| stream chunk | `dir`, `stream`, `at_ms` | `data`, `data_ref` | `dir` is `server->cli` or `cli->server`; `stream` is `stdin`, `stdout`, or `stderr`; exactly one of `data` or `data_ref` is present |
| RPC frame | `dir`, `stream`, `at_ms`, `frame` | none | `frame` is JSON object; for JSON-RPC it must include `jsonrpc`, `method` or `id`, and valid `params`/`result`/`error` shape |
| process event | `dir`, `event`, `at_ms` | `exit_code`, `signal` | `dir` is `process`; `event` is `spawn`, `exit`, `timeout`, or `kill`; exit has either `exit_code` or `signal` |

Defaults:

- `at_ms` defaults are not allowed. Captures must provide monotonic offsets.
- `data` is never allowed to contain unredacted absolute home paths, tokens,
  emails, API keys, signed URLs, or raw model-generated user content.

Invalid examples that must fail validation:

```json
{"dir":"cli->server","stream":"stdout","at_ms":10,"data":"token=sk-live"}
{"dir":"process","event":"exit","at_ms":20}
{"dir":"server->cli","stream":"stdin","at_ms":0,"data":"x","data_ref":"prompt"}
```

### `shape.schema.json`

| Field | Required | Default | Values / validation |
|---|---:|---|---|
| `schema_version` | yes | none | integer, currently `1` |
| `signature` | yes | none | hash of canonical shape JSON excluding `signature` |
| `protocol_family` | yes | none | protocol enum |
| `validity_level` | yes | none | validity enum; copied from the strongest accepted observation or source evidence for this shape |
| `transport` | yes | none | `plain`, `jsonl`, `json`, `json-rpc`, or `pi-rpc` |
| `frame_count` | yes | none | positive integer |
| `event_types` | yes | none | sorted unique stable event/type names |
| `frame_shapes` | yes | none | ordered array of normalized frame shapes |
| `stderr_class` | no | `none` | `none`, `diagnostic`, `auth`, `quota`, `upstream`, `protocol`, `debug`, or `unknown` |
| `exit` | yes | none | normalized exit class: `success`, `nonzero`, `signal`, `timeout`, or `unknown` |

Each `frame_shapes[]` item requires `direction`, `stream`, `event_type`,
`paths`, and `enums`. `paths[]` entries require `path`, `type`, and `required`.
Valid `type` values are `string`, `number`, `boolean`, `null`, `object`,
`array`, or `unknown`.

Invalid examples that must fail validation:

- `event_types` that omit an `event_type` used by `frame_shapes`.
- `paths[].required: true` for a field absent in the sanitized fixture.
- `signature` that does not match canonical JSON.
- `validity_level: "synthetic_mock"` on a shape referenced by a normal support
  claim.

### `support-matrix.schema.json`

| Field | Required | Default | Values / validation |
|---|---:|---|---|
| `schema_version` | yes | none | integer, currently `1` |
| `generated_at` | yes | none | UTC timestamp |
| `open_design_min_commit` | no | `null` | lowest Open Design commit that consumed this matrix |
| `agents[]` | yes | none | one entry per agent with any public claim |

Each `agents[]` entry requires:

- `agent`.
- `version_ranges[]`, with semver or exact-version range syntax.
- `platforms[]`.
- `protocol_families[]`.
- `support_status`: `local_shape_verified`, `version_range_verified`,
  `server_variant_possible`, `newer_than_verified`, `too_old`,
  `known_breaking`, `known_breaking_shape`, `active_shape_unknown`, or
  `unknown`.
- `observed_shapes[]`: objects with `shape`, `validity_level`, and
  `observed_at`.
- `last_observed_at`.

Defaults:

- `server_variants` defaults to an empty array.
- `known_breaking_shapes` defaults to an empty array.
- `latest_verified` and `latest_seen` default to `null`.
- `notes` defaults to an empty array.
- `policy.allow_run` defaults to `warn` unless `support_status` is `too_old`,
  `known_breaking`, or `known_breaking_shape`, where it defaults to `block`.

Allowed optional fields for each `agents[]` entry:

- `latest_verified`: latest CLI version with a promoted support claim.
- `latest_seen`: latest CLI version observed by discovery or capture.
- `server_variants[]`: objects with `shape` and `status`; `status` is
  `compatible`, `compatible_pending_fixture`, or `breaking`.
- `known_breaking_shapes[]`: objects with `shape`, `reason`, and `evidence`.
- `policy.allow_run`: `allow`, `warn`, or `block`.
- `notes[]`: human-readable operational notes.

Invalid examples that must fail validation:

- `support_status: "verified"`; this ambiguous status is intentionally not
  allowed.
- `version_ranges: [">=0.1.0"]` without any `observed_shapes`.
- `known_breaking` without a `reason` and at least one evidence link.
- `support_status: "version_range_verified"` backed only by
  `observed_shapes[].validity_level: "synthetic_mock"` or `source_derived`.

Support-matrix generation must exclude `source_derived`, `vendor_documented`,
and `synthetic_mock` shapes from normal supported-version claims. Those shapes
may appear only in risk, discovery, or parser-test reports until a real runtime
observation promotes them.

### Error Case Records

Error cases are validated separately because they are consumed by the daemon
failure classifier.

| Field | Required | Default | Values / validation |
|---|---:|---|---|
| `schema_version` | yes | none | integer, currently `1` |
| `agent` | yes | none | registered agent id |
| `probe` | yes | none | error probe id |
| `raw_shape` | yes | none | raw transcript hash |
| `classifier_input.result` | yes | none | `success`, `failed`, or `cancelled` |
| `classifier_input.status` | yes | none | daemon run status shape used by `classifyRunFailure` |
| `classifier_input.errorCode` | no | `null` | daemon error code |
| `classifier_input.events` | no | `[]` | daemon events used by classification |
| `expected_failure_classification` | yes | none | exact `RunFailureClassification` object |

Invalid examples that must fail validation:

- `classifier_input.result: "failed"` with missing
  `expected_failure_classification`.
- `user_action: "reauthenticate"`; current allowed auth action is `login`.
- `failure_stage` outside the analytics `TrackingRunFailureStage` enum.

## Core Data Model

The registry separates versions, shapes, and evidence:

- Version: a CLI release identifier, such as `codex 0.133.0`.
- Shape: a canonical protocol structure identified by a stable hash.
- Observation: one real capture run that observed a shape under concrete
  conditions.

This avoids duplicating full fixtures for every patch version. If several CLI
versions produce the same shape, they share a single `shape.json` and fixture.
If the same CLI version produces multiple server-side variants, multiple
observations point at multiple shapes.

Example observation:

```json
{
  "schema_version": 1,
  "agent": "codex",
  "cli_version": "0.133.0",
  "platform": "darwin-arm64",
  "probe": "chat-tool-success",
  "protocol_family": "json-event-stream/v1",
  "validity_level": "runtime_observed",
  "install": {
    "source": "npm:@openai/codex@0.133.0",
    "binary_sha256": "sha256:..."
  },
  "command": {
    "argv_template": [
      "exec",
      "--json",
      "--skip-git-repo-check",
      "--sandbox",
      "workspace-write",
      "-C",
      "{cwd}"
    ],
    "stdin_mode": "text-prompt"
  },
  "capture": {
    "captured_at": "2026-06-27T10:00:00Z",
    "runner": "github-actions/macos-15-arm64",
    "workflow_run_url": "https://github.com/.../actions/runs/...",
    "raw_stdout_sha256": "sha256:...",
    "raw_stderr_sha256": "sha256:...",
    "raw_client_transcript_sha256": "sha256:...",
    "raw_artifact_visibility": "private"
  },
  "redaction": {
    "tool_version": "0.1.0",
    "status": "passed"
  },
  "shape": {
    "signature": "sha256:...",
    "path": "shapes/json-event-stream/sha256-....shape.json"
  },
  "parser_replay": {
    "open_design_commit": "...",
    "status": "compatible",
    "golden": "goldens/open-design-parser/json-event-stream/sha256-....events.json"
  }
}
```

## Transport Granularity

Capturing stdout and stderr is necessary but not sufficient.

Open Design starts agent CLIs as child processes, but the protocol over the
pipes differs by runtime:

- `plain`: stdout is assistant text; stderr carries diagnostics.
- `claude-stream-json`: stdout is structured JSONL; stdin may remain open for
  stream-json input bookkeeping.
- `json-event-stream`: stdout is JSON/JSONL event stream for Codex, Gemini,
  OpenCode, Cursor Agent, Kimi, MiMo, and similar adapters.
- `qoder-stream-json`: stdout is Qoder-specific stream JSON.
- `copilot-stream-json`: stdout is GitHub Copilot CLI JSON stream.
- `acp-json-rpc`: bidirectional JSON-RPC over stdio after spawning the child.
- `pi-rpc`: bidirectional RPC over stdio after spawning the child.

The contract registry must capture per-transport transcripts.

### Unidirectional Stream Transcript

For plain and JSONL-like streams:

```json
{"dir":"server->cli","stream":"stdin","at_ms":0,"data_ref":"prompt"}
{"dir":"cli->server","stream":"stdout","at_ms":220,"data":"{\"type\":\"thread.started\"}\n"}
{"dir":"cli->server","stream":"stderr","at_ms":230,"data":"..."}
{"dir":"process","event":"exit","at_ms":920,"exit_code":0,"signal":null}
```

### Bidirectional RPC Transcript

For ACP and Pi, the transcript must include client frames written by the Open
Design harness as well as frames emitted by the CLI:

```json
{"dir":"server->cli","stream":"stdin","at_ms":0,"frame":{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":1}}}
{"dir":"cli->server","stream":"stdout","at_ms":80,"frame":{"jsonrpc":"2.0","id":1,"result":{"protocolVersion":1}}}
{"dir":"server->cli","stream":"stdin","at_ms":90,"frame":{"jsonrpc":"2.0","id":2,"method":"session/new","params":{"cwd":"<cwd>"}}}
{"dir":"cli->server","stream":"stdout","at_ms":260,"frame":{"jsonrpc":"2.0","method":"session/update","params":{"sessionUpdate":"agent_message_chunk","content":"<text>"}}}
{"dir":"process","event":"exit","at_ms":920,"exit_code":0,"signal":null}
```

Without the client-side frames, the shape cannot prove that the observed CLI was
responding to the same handshake Open Design uses.

## Capture Protocol

Capture is the evidence entry point. A contract shape is valid only if it can be
traced to a concrete capture run or is explicitly marked as source-derived or
synthetic.

### Capture Input

```json
{
  "agent": "codex",
  "target_version": "0.133.0",
  "platform": "darwin-arm64",
  "probe": "chat-tool-success",
  "protocol_family": "json-event-stream/v1"
}
```

### Probe Definition

Each probe is a static, reproducible fixture in the contract repo:

```text
probes/chat-tool-success/
  prompt.md
  fixture-files/
    package.json
    sample.json
    notes.txt
  expected-min-events.json
```

Example prompt:

```md
List the files in the current directory, then reply with the number of `.json`
files. Use the CLI's normal file/list tool if available. Reply with one
sentence.
```

Example minimum event expectation:

```json
{
  "must_see": ["init_or_status", "assistant_text", "done"],
  "optional": ["tool_use", "tool_result", "usage"],
  "forbidden": ["raw_secret", "local_home_path"]
}
```

### Capture Runner

For Open Design-owned protocol semantics, the runner must not hand-roll a
"similar enough" client:

- `plain`, `claude-stream-json`, `json-event-stream`,
  `qoder-stream-json`, and `copilot-stream-json` captures should use the same
  spawn argv, environment, prompt transport, stdin-close behavior, stderr
  filtering, and process-close rules as `server.ts`.
- `acp-json-rpc` captures must reuse or vendor the Open Design ACP attach
  harness, including initialize, session creation, model selection, prompt
  send, permission handling, content filtering, and termination semantics.
- `pi-rpc` captures must reuse or vendor the Open Design Pi RPC attach harness,
  including new/resumed session handling, prompt send, image encoding, session
  file capture, and termination semantics.

This can be implemented either by running a daemon in capture mode and recording
its child-process boundary, or by extracting the production harnesses into a
small shared package used by both the daemon and contract runner. The contract
is not valid if the capture runner speaks a protocol dialect that production
Open Design never sends.

```ts
async function captureContract(input: CaptureInput) {
  const workspace = await createEphemeralWorkspace(input);
  await materializeProbeFixture(workspace, input.probe);

  const install = await installOrResolveCli(input.agent, input.target_version);
  const version = await runVersionProbe(install.bin, input.agent);
  assertVersionMatches(version, input.target_version);

  const command = buildCaptureCommand(input.agent, input.probe, {
    bin: install.bin,
    cwd: workspace.cwd,
    promptFile: workspace.promptFile,
  });

  const raw = await spawnCapture(command, {
    cwd: workspace.cwd,
    env: buildMinimalCaptureEnv(input.agent),
    timeoutMs: probeTimeout(input.probe),
  });

  const redactionReport = assertRawCanBeRedacted(raw);
  const sanitized = sanitizeTranscript(raw);
  assertPublishable(sanitized);

  const shape = normalizeToShape(sanitized, input.protocol_family);
  const shapeId = shape.signature;

  const daemonEvents = replayThroughOpenDesignParser({
    agent: input.agent,
    protocolFamily: input.protocol_family,
    sanitized,
  });

  const observation = buildObservation({
    input,
    install,
    version,
    command,
    raw,
    sanitized,
    shape,
    shapeId,
    daemonEvents,
    redactionReport,
  });

  await writePrivateRawArtifact(raw, observation.capture.raw_client_transcript_sha256);
  await writePublicContractArtifacts({
    observation,
    sanitizedFixture: sanitized,
    shape,
    daemonEvents,
  });

  return observation;
}
```

### Spawn Capture

The capture process must not print raw transcript data to CI logs.

```ts
async function spawnCapture(command: CaptureCommand, opts: CaptureOptions) {
  const child = spawn(command.bin, command.argv, {
    cwd: opts.cwd,
    env: opts.env,
    stdio: ["pipe", "pipe", "pipe"],
  });

  const transcript = createTranscriptRecorder();

  child.stdout.on("data", chunk => {
    transcript.record("cli->server", "stdout", chunk);
  });
  child.stderr.on("data", chunk => {
    transcript.record("cli->server", "stderr", chunk);
  });

  for (const write of command.stdinWrites) {
    transcript.record("server->cli", "stdin", write.data);
    child.stdin.write(write.data);
    if (write.closeAfter) child.stdin.end();
  }

  const result = await waitForExitOrTimeout(child, opts.timeoutMs);
  transcript.record("process", "exit", result);

  return transcript.toRawBundle();
}
```

For ACP and Pi, the harness must record structured JSON-RPC frames before
serialization and after parsing. This keeps line splitting, buffering, and
protocol shape visible.

## Error Contract Coverage

Error parsing is a first-class contract surface. The registry must not only
prove successful streams parse correctly; it must also prove that Open Design's
failure classification remains accurate.

Every Tier 0 runtime should have error probes for:

- CLI not installed or bad resolved executable.
- Version command shape and version mismatch.
- Auth missing, expired, or invalid.
- Quota exhausted or rate limited.
- Provider upstream unavailable, 5xx, network drop, stream disconnect.
- Model not found, disabled, unsupported, provider routing error.
- Prompt too large or context exceeded.
- Invalid config file or unsupported CLI flag.
- Permission request failure.
- Tool or MCP execution failure.
- Malformed JSON, partial line, unknown event type.
- Non-zero exit without useful stdout.
- Signal termination, crash, timeout, inactivity.
- Empty-output success-looking failure.

Error contract fixtures must include:

```json
{
  "schema_version": 1,
  "agent": "claude",
  "probe": "auth-failure",
  "raw_shape": "sha256:...",
  "classifier_input": {
    "result": "failed",
    "status": {
      "status": "failed",
      "error": "Claude Code is not authenticated"
    },
    "errorCode": "AGENT_AUTH_REQUIRED",
    "events": [
      {
        "event": "stderr",
        "data": {
          "chunk": "Claude Code is not authenticated"
        }
      }
    ]
  },
  "expected_failure_classification": {
    "failure_category": "auth",
    "failure_detail": "auth_required",
    "failure_stage": "session_init",
    "retryable": false,
    "user_action": "login"
  }
}
```

Open Design CI should replay error fixtures through the same classifier used by
production:

```ts
for (const errorCase of contracts.errorCases()) {
  const actual = classifyRunFailure({
    result: errorCase.classifier_input.result,
    status: errorCase.classifier_input.status,
    errorCode: errorCase.classifier_input.errorCode,
    agentId: errorCase.agent,
    events: errorCase.classifier_input.events ?? [],
  });

  expect(actual).toEqual(errorCase.expected_failure_classification);
}
```

This guards the regex and structured-error logic in
`run-failure-classification.ts` and `runtimes/auth.ts`, not just stream parsers.

## Shape Normalization

The normalizer must preserve protocol structure while removing sensitive or
high-entropy content.

Allowed transformations:

- Replace arbitrary text with typed placeholders.
- Replace absolute paths with `<path>`.
- Replace tokens, keys, webhooks, emails, account identifiers, and signed URLs.
- Preserve field names, event names, enum-like values, nested object structure,
  list/object kinds, event order class, exit class, and stderr classification.

The shape hash is computed from canonical JSON after normalization:

```ts
function normalizeToShape(transcript: SanitizedTranscript, protocolFamily: string) {
  const frames = parseTranscriptFrames(transcript, protocolFamily);
  const unsigned_shape = {
    schema_version: 1,
    protocol_family: protocolFamily,
    validity_level: transcript.validity_level,
    transport: transcript.transport,
    frame_count: frames.length,
    event_types: sort(unique(frames.map(frameType))),
    frame_shapes: frames.map(frame => ({
      direction: frame.direction,
      stream: frame.stream,
      event_type: frameType(frame),
      paths: collectPaths(frame.payload).map(path => ({
        path: path.name,
        type: path.type,
        required: path.required,
      })),
      enums: collectStableEnums(frame.payload, [
        "type",
        "role",
        "status",
        "subtype",
        "method",
        "sessionUpdate",
        "stop_reason"
      ]),
    })),
    stderr_class: classifyStderr(transcript.stderr),
    exit: transcript.exit,
  };
  return {
    signature: sha256(canonicalJson(unsigned_shape)),
    ...unsigned_shape,
  };
}
```

## Validity Levels

Each shape receives a public validity level:

- `runtime_observed`: observed from a real CLI capture.
- `confirmed`: observed at least twice, ideally across independent time windows
  or runners.
- `community_confirmed`: independently reproduced by a non-Open Design
  contributor using the public capture command.
- `server_variant`: same CLI version has multiple active observed shapes.
- `source_derived`: derived from open-source CLI code, not yet observed at
  runtime.
- `vendor_documented`: based on official schema or docs, not yet observed.
- `synthetic_mock`: hand-built fixture, valid for parser unit tests only and not
  valid as a support claim.

Only `runtime_observed`, `confirmed`, and `community_confirmed` may be used for
normal supported-version claims. `source_derived` can open a risk issue and
guide capture priority.

Every public observation should also carry an evidence record:

- public sanitized transcript hash.
- private raw artifact hash and retention period.
- capture workflow URL, runner image, binary hash, and capture tool version.
- maintainer attestation that raw artifacts were redaction-checked before
  publication.
- optional independent reproduction link that can promote
  `runtime_observed` to `community_confirmed`.

Raw artifacts should stay private by default, but a maintainer must be able to
audit that the sanitized shape really came from the retained raw capture. Public
contributors can still reproduce the probe locally and submit their sanitized
observation plus hashes; maintainers promote it only after redaction and shape
verification pass.

## Source Scan

For open-source CLIs, the registry should use source history as an early warning
system:

- Watch GitHub releases and tags.
- Extract event type definitions, TypeScript types, Rust enums, Go structs,
  JSON schema files, and output-format command changes.
- Diff protocol-relevant source files across tags.
- Open a `source_protocol_risk` issue when source changes suggest a new event
  type, field rename, usage shape change, handshake change, or command-line
  flag change.

Source scan does not replace runtime capture because service-side rollout,
account feature flags, provider errors, and closed-source wrappers can change
the actual observed shape.

## Open Design Consumption

Open Design should consume the contract package in three ways.

### Parser Replay Gate

Add a daemon parser test that replays all supported parser-level shapes:

```ts
import contracts from "@open-design/agent-cli-contracts";

test("supported agent CLI contracts replay through Open Design parsers", () => {
  for (const contract of contracts.supportedShapes()) {
    const parser = getParserHarness(contract.agent, contract.protocolFamily);
    const actualEvents = parser.replay(contract.sanitizedFixture);

    assertNoUnexpectedRawEvents(actualEvents, contract.allowedRawEvents);
    assertRequiredEventsExist(actualEvents, contract.requiredDaemonEvents);
    expect(normalizeDaemonEvents(actualEvents)).toEqual(contract.expectedDaemonEvents);
  }
});
```

Add a separate error-classification replay test:

```ts
test("agent CLI error contracts classify into expected daemon failures", () => {
  for (const errorCase of contracts.errorCases()) {
    const actual = replayAndClassify(errorCase);
    expect(actual).toEqual(errorCase.expected_failure_classification);
  }
});
```

### Daemon Run Harness Gate

Parser replay is necessary but not enough. The support claim must also prove
that a contract transcript still behaves like a real child process when consumed
through the daemon run path.

The test harness should create an instrumented child process from a sanitized
contract transcript and pass it through the same run lifecycle that production
uses:

```ts
import contracts from "@open-design/agent-cli-contracts";

test("supported agent CLI contracts replay through daemon run semantics", async () => {
  for (const contract of contracts.daemonRunShapes()) {
    const child = createInstrumentedChildFromTranscript(contract.transcript, {
      stdout: contract.stdoutFrames,
      stderr: contract.stderrFrames,
      exit: contract.exit,
      stdinAssertions: contract.expectedStdin,
    });

    const run = await runDaemonChatWithContractChild({
      agent: contract.agent,
      runtimeDef: contract.runtimeDef,
      child,
      prompt: contract.prompt,
      cwd: contract.cwd,
    });

    expect(run.stdinClosedAt).toEqual(contract.expectedRun.stdinClosedAt);
    expect(run.turnCompletedCleanly).toEqual(contract.expectedRun.turnCompletedCleanly);
    expect(run.events).toEqual(contract.expectedRun.events);
    expect(run.status).toMatchObject(contract.expectedRun.status);
  }
});
```

This gate must cover daemon behavior that a parser-only fixture cannot see:

- runtime-specific argv/env/prompt transport and prompt-file handling.
- stdin close timing, especially Claude stream-json turn bookkeeping.
- child close, exit code, signal, empty-output, and cancellation diagnostics.
- stderr filtering and diagnostic source selection.
- `agentStreamError` and structured stream-error propagation.
- ACP and Pi bidirectional RPC lifecycle behavior.

### Runtime Compatibility Status

The daemon should distinguish version evidence from active-shape evidence. A
local CLI version can still emit a different shape because of server-side
rollout, account feature flags, regional routing, or provider-side incidents.

The strongest status comes from a local bounded probe that compares the active
shape against the contract package:

```ts
async function classifyInstalledCli(agent: string, version: string, platform: string) {
  const matrix = contracts.findSupportEntry({ agent, version, platform });

  if (contracts.isOlderThanMinSupported(agent, version)) return "too_old";
  if (contracts.isKnownBreaking(agent, version, platform)) return "known_breaking";

  const probe = await maybeRunLocalShapeProbe(agent);
  if (probe?.matchedSupportedShape) return "local_shape_verified";
  if (probe?.matchedKnownBreakingShape) return "known_breaking_shape";
  if (probe?.shapeUnknown) return "active_shape_unknown";

  if (matrix?.hasObservedServerVariants) return "server_variant_possible";
  if (matrix?.versionRangeVerified) return "version_range_verified";
  if (contracts.isNewerThanLatestVerified(agent, version)) return "newer_than_verified";
  return "unknown";
}
```

The web UI can show:

- `local_shape_verified`: strongest normal status.
- `version_range_verified`: installed version is in a verified range, but the
  active local shape has not been probed.
- `server_variant_possible`: installed version is supported, but multiple
  observed server-side variants exist; run a local probe for confidence.
- `newer_than_verified`: warning, allow run unless policy says otherwise.
- `too_old`: upgrade guidance.
- `known_breaking` or `known_breaking_shape`: block or require explicit
  confirmation.
- `active_shape_unknown` or `unknown`: experimental warning.

### Open Design Surface Closure

Runtime compatibility is user-facing, so the implementation must close the
shared API, web UI, and `od` CLI in the same PR. The daemon HTTP route remains
the single source of truth; web and CLI must not compute different status
shapes locally.

| Surface | Required shape |
|---|---|
| Contract DTO | `packages/contracts/src/api/agentCliCompatibility.ts` exports `AgentCliCompatibilityRequest`, `AgentCliCompatibilityResponse`, `AgentCliCompatibilityStatus`, `AgentCliCompatibilityEvidence`, and example payloads. |
| Daemon API | `GET /api/agents/:agent/cli-compatibility?probe=0|1` returns the DTO for one agent; `GET /api/agents/cli-compatibility?probe=0|1` returns all configured agents. Probe execution must be bounded and opt-in when it may call a real provider. |
| Web UI | The agent/provider settings surface shows the status, evidence timestamp, verified version range, and guidance. Warning/blocking policy comes from the DTO, not duplicated UI rules. |
| `od` CLI | `od agent compatibility [agent] --json --probe` calls the same API. Without `--json`, it prints a concise table with agent, installed version, status, policy, and next action. With `--json`, it emits the DTO unchanged. |
| Tests | Contract examples typecheck; daemon route tests assert policy/status mapping; CLI tests assert text and `--json` output; web tests assert rendering for normal, warning, and blocking statuses. |

The DTO status enum must match the support-matrix enum exactly:

```ts
export type AgentCliCompatibilityStatus =
  | "local_shape_verified"
  | "version_range_verified"
  | "server_variant_possible"
  | "newer_than_verified"
  | "too_old"
  | "known_breaking"
  | "known_breaking_shape"
  | "active_shape_unknown"
  | "unknown";

export interface AgentCliCompatibilityResponse {
  schema_version: 1;
  generated_at: string;
  agent: string;
  installed_version: string | null;
  platform: string;
  status: AgentCliCompatibilityStatus;
  policy: {
    allow_run: "allow" | "warn" | "block";
    user_action:
      | "none"
      | "run_local_probe"
      | "upgrade_cli"
      | "pin_supported_version"
      | "report_unknown_shape";
  };
  evidence: {
    version_range: string | null;
    shape_signature: string | null;
    observed_at: string | null;
    source: "local_probe" | "support_matrix" | "known_breaking" | "none";
    server_variant_possible: boolean;
  };
}
```

Example CLI output:

```text
$ od agent compatibility codex
agent  version  status                  policy  next action
codex  0.133.0  local_shape_verified    allow   none
```

Example machine-readable output:

```json
{
  "schema_version": 1,
  "generated_at": "2026-06-27T10:00:00Z",
  "agent": "codex",
  "installed_version": "0.133.0",
  "platform": "darwin-arm64",
  "status": "server_variant_possible",
  "policy": {
    "allow_run": "warn",
    "user_action": "run_local_probe"
  },
  "evidence": {
    "version_range": ">=0.133.0 <0.134.0",
    "shape_signature": "sha256:...",
    "observed_at": "2026-06-27T10:00:00Z",
    "source": "support_matrix",
    "server_variant_possible": true
  }
}
```

### Mock and Fixture Data Source

The existing `mocks/` replay system can gradually consume contract fixtures:

- `OD_CONTRACT_SHAPE=codex@0.133.0#sha256-...`
- `OD_CONTRACT_PROBE=chat-tool-success`
- `OD_CONTRACT_ERROR=auth-failure`

This lets mock tests use versioned, provenance-backed fixtures rather than
fixtures that only satisfy the current parser.

## Support Matrix Semantics

The public support matrix should not only say `>= version`. It should express
observed shapes:

```json
{
  "schema_version": 1,
  "generated_at": "2026-06-27T10:00:00Z",
  "open_design_min_commit": "b784c8650",
  "agents": [
    {
      "agent": "codex",
      "version_ranges": [">=0.133.0 <0.140.0"],
      "platforms": ["darwin-arm64", "linux-x64"],
      "protocol_families": ["json-event-stream/v1"],
      "support_status": "version_range_verified",
      "observed_shapes": [
        {
          "shape": "sha256:aaa",
          "validity_level": "confirmed",
          "observed_at": "2026-06-27T10:00:00Z"
        }
      ],
      "last_observed_at": "2026-06-27T10:00:00Z",
      "latest_verified": "0.133.0",
      "latest_seen": "0.134.1",
      "server_variants": [],
      "known_breaking_shapes": [
        {
          "shape": "sha256:ccc",
          "reason": "missing required assistant text event",
          "evidence": "observations/codex/0.134.1/darwin-arm64/..."
        }
      ],
      "policy": {
        "allow_run": "warn"
      },
      "notes": ["0.134.x has been seen but not promoted beyond the observed shape set."]
    }
  ]
}
```

If the same CLI version has multiple active server-side shapes, show it
explicitly:

```json
{
  "schema_version": 1,
  "generated_at": "2026-06-27T10:00:00Z",
  "agents": [
    {
      "agent": "codex",
      "version_ranges": ["0.133.0"],
      "platforms": ["darwin-arm64"],
      "protocol_families": ["json-event-stream/v1"],
      "support_status": "server_variant_possible",
      "observed_shapes": [
        {
          "shape": "sha256:aaa",
          "validity_level": "runtime_observed",
          "observed_at": "2026-06-27T09:30:00Z"
        },
        {
          "shape": "sha256:bbb",
          "validity_level": "runtime_observed",
          "observed_at": "2026-06-27T10:00:00Z"
        }
      ],
      "last_observed_at": "2026-06-27T10:00:00Z",
      "server_variants": [
        {
          "shape": "sha256:aaa",
          "status": "compatible"
        },
        {
          "shape": "sha256:bbb",
          "status": "compatible_pending_fixture"
        }
      ],
      "policy": {
        "allow_run": "warn"
      },
      "notes": ["Run a local probe to determine the active server-side shape."]
    }
  ]
}
```

## Contract Breadth

The first milestone should be deliberately small and end-to-end:

- version probe for every supported runtime.
- one successful text chat probe for every transport family.
- one tool-use or file-write success probe for the major coding CLIs.
- one auth-required or missing-key error probe per credential model.
- one daemon-run replay case per transport family.
- one published support matrix that clearly separates
  `local_shape_verified`, `version_range_verified`, `server_variant_possible`,
  `newer_than_verified`, and `unknown`.

After that baseline is stable, broaden the probe catalog by risk.

The registry should cover Open Design's integration surface, not every CLI
feature.

Minimum viable contract per runtime:

- `version_probe`
- `model_probe`
- `chat_text_success`
- `chat_tool_success`
- `chat_tool_failure`
- `file_write_artifact`
- `auth_failure`
- `provider_failure`
- `interrupted_or_malformed_stream`

Additional probes for high-risk adapters:

- `resume_session`
- `mcp_injection`
- `permission_request`
- `image_attachment`
- `large_prompt`
- `empty_output`
- `stderr_only_failure`
- `acp_handshake_failure`
- `rpc_cancel`

Tier 0 runtimes should cover the full set. Long-tail or experimental runtimes
may start with version/model/text/error probes and explicitly mark missing
coverage.

## Automation

### Discover

- Query npm, GitHub Releases, Homebrew, vendor endpoints, and local `--version`.
- Compare `latest_seen` with `latest_verified`.
- Open risk issues or Feishu cards for stale coverage.

### Capture

- Runs only on protected branches, schedule, workflow dispatch, or a controlled
  maintainer-triggered path.
- Uses dedicated low-privilege accounts and bounded quotas.
- Does not checkout or execute untrusted PR code.
- Uses fixed probe workspaces.
- Keeps raw transcript private and publishes only sanitized artifacts.

### Compare

Classify new observations:

- `same_shape`: add observation and update `last_seen_at`.
- `compatible_new_shape`: open PR with new shape, fixture, and golden.
- `server_variant`: mark multiple active shapes for the same version.
- `parser_incompatible`: publish failing contract if redaction passes, alert.
- `redaction_failed`: publish nothing; alert maintainers privately.

### Publish

The npm package should include:

- support matrix
- shape files
- sanitized fixtures
- parser goldens
- schemas
- lightweight replay and compare tools

It should not include:

- raw transcripts
- auth tokens
- account labels
- runner home paths
- model-generated user content that has not passed redaction

Use npm provenance or equivalent CI attestation. Include a manifest of file
hashes in the package.

## Feishu and Public Reporting

Public reporting should emphasize risk summaries, not raw logs.

Feishu card fields:

- agent
- CLI version
- platform
- shape status
- new event types or changed fields
- parser compatibility
- contract PR or issue
- capture workflow run link
- redaction status

Grounding status should be explicit:

- runtime observed
- source derived only
- confirmed by multiple observations
- synthetic only

## Security

- Public PR CI must not have access to capture secrets.
- Capture secrets live behind a protected GitHub Environment or a separate
  controlled producer.
- Raw output must never be printed with `echo`, `tee`, or unfiltered test
  failure output.
- Redaction must fail closed.
- Public publishing must require sanitized fixture validation and secret scans.
- Runner workspaces should be ephemeral and contain only static probe files.
- Accounts used for capture should be dedicated, low-privilege, and quota
  limited.

## Validation Plan

Contract repository:

- Validate all JSON files against schemas.
- Re-normalize every sanitized fixture and verify it matches the published
  shape hash.
- Verify observation metadata references existing shape, fixture, and golden.
- Run replay harness against embedded Open Design parser package or a checked
  Open Design parser adapter.
- Run secret/path scans over all publishable artifacts.
- Generate support matrix from observations and check it is committed.

Open Design repository:

- Add `agent-contract-replay.test.ts`.
- Add `agent-contract-errors.test.ts`.
- Add a matrix consistency test asserting non-experimental `AGENT_DEFS` have
  contract entries or explicit exemptions.
- Release gate checks Tier 0 contracts are fresh enough.

## Open Questions

- Which organization owns the public registry, `nexu-io`, `powerformer`, or a
  new neutral org?
- Should raw private artifacts live in GitHub artifacts, R2, or another
  append-only store?
- What is the freshness SLA for Tier 0 runtimes?
- Which exact agents are Tier 0 for the first milestone?
- Should known breaking versions block local runs or only warn?
- Should Open Design consume the full contract package at runtime, or only a
  generated compact support matrix?
- How should community-submitted observations be verified before moving from
  `single_observed` to `community_confirmed`?
