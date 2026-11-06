# DeepSeek Harness profile adapter design

Status: active product and protocol contract

Date: 2026-08-14

The selected architecture is not an OpenDesign-packaged SDK carrier. It uses
the user's official `dsh` installation plus an OpenDesign profile bundle.

## 1. Product outcome

OpenDesign integrates DeepSeek Harness like Claude Code or Codex: the user
installs and owns the official coding-agent CLI, while OpenDesign detects and
launches it.

The desired user experience is:

1. The user installs the official `@deepseek-ai/dsh` package.
2. OpenDesign installs or detects an OD-specific profile named `open-design`.
3. The user selects **DeepSeek Harness** from the normal coding-agent picker.
4. Harness creates files in the selected OD project; OD detects, previews, and
   delivers those files through its existing artifact path.
5. A later OD turn starts a new process, resumes the same Harness session, and
   modifies the existing artifact without replaying the whole transcript.

The stable OpenDesign runtime identity is:

- runtime id: `deepseek-harness`
- display name: `DeepSeek Harness`
- executable: user-installed `dsh`, overridable through `DSH_BIN`
- profile: `open-design`
- stream format: `dsh-profile-jsonl`
- protocol generation: `1`

This adapter remains distinct from the existing `deepseek` TUI adapter.

## 2. Ownership boundary

### The user and official Harness own

- the `dsh` executable and its Node runtime;
- installation and upgrade of the official Harness package;
- the agent loop, model provider, tools, sandbox, and session persistence;
- the Harness home and managed credential document;
- native session record formats and interrupted-tail recovery.

### OpenDesign owns

- daemon discovery and launch of the user's `dsh`;
- the `open-design` profile bundle and its versioned stdio contract;
- mapping OD conversations to stable Harness session ids;
- mapping Harness events into OD chat/tool/artifact events;
- run cancellation and platform process-tree cleanup;
- product guidance, profile compatibility checks, and explicit one-click
  profile installation or repair.

### OpenDesign explicitly does not own

- a copy of `dsh`, Node, or the Harness dependency closure;
- a fork of the Harness agent loop or session format;
- API key storage;
- a resident runtime pool;
- platform-specific variants of the wire protocol.

This boundary avoids the approximately 174 MB experimental single-executable
carrier and avoids turning Windows runtime construction, signing, and updates
into an OpenDesign responsibility.

## 3. Why an OpenDesign profile bundle is needed

Official Harness profiles are supported composition points under the Harness
home. A bundle is an installable npm package that contributes a Cordis patch
and runtime plugin; a profile composes the official Harness base with that
bundle.

Conceptually:

```text
user-installed official dsh
  └── profile: open-design
       ├── official Harness base, agent loop, tools, provider, persistence
       └── @open-design/dsh-runtime
            ├── versioned stdio entry point
            ├── cold-resume bridge
            ├── structured event projection
            ├── protocol cancellation
            ├── model discovery
            └── later: MCP and credential control operations
```

The bundle is a thin host adapter, not another coding agent. It calls Harness
services such as `ctx.agents.create()` and `ctx.agents.resume()` and projects
their results into a stable host protocol. It never reconstructs Harness JSONL
session files.

The official headless surface is insufficient for the intended product because
it only provides one-shot plain output and does not expose the complete cold
resume, structured events, cancellation, model discovery, MCP, and credential
control contract OD needs.

## 4. Delivery and installation model

The profile bundle is installed into the user's official Harness installation:

```text
dsh plugin --profile open-design add <pinned OD bundle package>
```

The source lives in the OpenDesign repository so the host types, fake runtime,
profile implementation, and protocol fixtures change atomically. Its package
identity is `@open-design/dsh-runtime`, but end-user setup does not require a
public registry release: each packaged OD build carries an exact packed
tarball plus a SHA-256 manifest. This couples the host and profile protocol
versions and avoids an unbounded `latest` install.

### First release

When the official `dsh` is present but the profile is missing or incompatible,
DeepSeek Harness remains in the normal installed-CLI group with a
setup-required label. Selecting it opens a confirmation dialog. Only after the
user confirms does OD invoke:

```text
dsh plugin --profile open-design add <embedded pinned tarball>
```

OD verifies the tarball hash before invocation, rescans the profile, selects
DeepSeek Harness, and performs the normal connection test. Cancelling leaves
both OD selection and the Harness profile unchanged, and selecting the card
again shows the prompt again. If a compatible profile already exists, selection
is immediate and no prompt or reinstall occurs. If `dsh` itself is absent,
DeepSeek Harness remains in the installable-agent group and points users to the
official installer.

The Web UI and `od agent setup deepseek-harness --json` call the same local-only
daemon endpoint. The CLI setup command is explicit rather than being triggered
by agent selection. Credential setup remains outside this first release.

## 5. Profile discovery and compatibility

A bare `dsh` binary is not enough. OD advertises DeepSeek Harness as runnable
only when both checks succeed:

1. `dsh --version` produces a usable identity.
2. `dsh --profile open-design --probe` emits a compatible probe frame and exits
   successfully.

The probe frame is one JSON line:

```json
{
  "v": 1,
  "type": "probe",
  "runtime": "open-design",
  "protocol_version": 1,
  "plugin_version": "<version>",
  "capabilities": {
    "session_resume": true,
    "session_cancel": true,
    "structured_events": true
  }
}
```

OD requires the runtime identity, protocol version, and phase-required
capabilities. A missing profile, incompatible protocol, or absent resume
capability makes the adapter unavailable with an actionable diagnostic.

Version policy separates two concerns:

- a failed, empty, or unparseable `dsh --version` probe is an error;
- a parseable version outside OD's tested set remains available with an
  `untested-version` warning;
- the profile probe is the hard behavioral compatibility gate.

## 6. Versioned stdio protocol

The product protocol is a small newline-delimited JSON contract inspired by the
proven Multica profile integration. It is not the stock preview SDK JSON-RPC
server and does not pretend that the stock server supports resume.

OD launches:

```text
dsh --profile open-design --stdio
```

Every non-empty stdout line is exactly one protocol frame. Diagnostics go to
bounded stderr. Prompts, credentials, and raw tool output must not be logged.

### Host commands

Execute:

```json
{
  "v": 1,
  "type": "execute",
  "request_id": "<OD run id>",
  "cwd": "<absolute project cwd>",
  "prompt": "<current input>",
  "resume_session_id": "<optional stable Harness session id>",
  "model": { "provider": "deepseek-official", "id": "<model>" },
  "reasoning_effort": "<optional>",
  "mcp_servers": []
}
```

Cancel:

```json
{"v":1,"type":"cancel","request_id":"<OD run id>"}
```

### Runtime frames

The minimum vocabulary is:

- `ready`: runtime identity, protocol version, plugin version, capabilities;
- `session`: session id and whether it was resumed;
- `thinking`: reasoning delta;
- `text`: assistant text delta;
- `tool_call`: durable tool call id, name, and JSON arguments;
- `tool_result`: matching call id, output, and error flag;
- `usage`: provider/model token accounting;
- `result`: terminal status, session id, stop reason, and structured error;
- `protocol_error`: fatal contract error.

Later protocol generations may add Todo snapshots, subagent lifecycle,
credentials, and richer MCP/model operations without changing phase-one frame
semantics.

### Strictness rules

- Every frame must be valid JSON and match generation 1; malformed frames fail
  the run deterministically instead of being ignored.
- After `ready`, every run-scoped frame must carry the active `request_id`.
- Frames for another request are ignored and counted; they cannot affect the
  current run.
- `session` must arrive before content/tool frames.
- On resume, the returned session id must exactly equal the requested id and
  `resumed` must be true.
- A missing or corrupt resume target returns a terminal structured failure. It
  must not silently create a new session.
- Only one terminal `result` is accepted. Process exit, EOF, idle state, or
  text output alone never means success.
- The runtime exits after the terminal result; OD still reaps and verifies the
  process tree.

## 7. Session and process lifecycle

One compatible OD conversation maps to one stable Harness session id. Each OD
run starts one short-lived `dsh` process.

```text
first run
  spawn dsh --profile open-design --stdio
  validate ready
  execute with bootstrap context + current user turn
  receive new session id
  stream events
  receive completed result
  EOF and reap process tree

follow-up run
  spawn a new OS process
  validate ready
  execute with resume_session_id + current turn only
  assert the same session id and resumed=true
  stream events
  receive completed result
  EOF and reap process tree
```

The adapter does not register as `resumesSessionViaCli` because resume is not a
CLI argument contract. It uses a profile-stdio-specific resume capability and
reuses OD's native session compatibility guard.

The compatibility key includes:

- OD conversation and project identity;
- canonical project cwd;
- runtime id;
- provider/model route;
- DSH executable identity and tested compatibility family;
- profile protocol generation and plugin compatibility generation;
- behavior-affecting composition generation.

A mismatch starts a new Harness session with bootstrap context. It never
resumes old history under a different cwd, model route, or profile composition.

OD's conversation transcript remains the product source of truth. Harness
session persistence is the native execution history and is never edited by OD.
Once the profile has emitted a validated `session` frame, canceling the active
OD run preserves that opaque session handle. The canceled child is still fully
reaped, but a later run may cold-resume the same Harness session when the
normal conversation/cwd/model compatibility guard passes.

## 8. Prompt and artifact contract

The first turn contains the OD-composed system/bootstrap context and the current
user request. A healthy resumed turn contains only the new turn and new
attachments. This prevents duplicate history and keeps Harness prompt caching
effective across cold process restoration.

The process cwd is the OD project workspace. Harness writes normal project
files using its official tools and sandbox. OD does not need a DSH-specific
artifact protocol: existing file watching, reconciliation, preview, download,
and delivery paths remain authoritative.

OD must not replace `DSH_HOME` to isolate a run. That home is the user's
official Harness installation boundary and contains the installed
`open-design` profile, Harness-managed credentials, and native session history.
OD treats that history as external-tool state and never parses or edits it. OD
persists only the opaque session id plus compatibility metadata in its own
database under the daemon's resolved `RUNTIME_DATA_DIR`; clients cannot choose
either location.

The initial product proof is intentionally artifact-oriented:

1. generate a usable HTML design file;
2. display it through the normal OD preview;
3. cold-resume in a new process;
4. modify that same file and refresh the preview.

## 9. Event normalization

| Profile frame | OpenDesign event |
| --- | --- |
| `thinking` | `thinking_start`, then `thinking_delta` |
| `text` | `text_delta` |
| `tool_call` | `tool_use` |
| `tool_result` | `tool_result` |
| `usage` | `usage` |
| `result: completed` | clean turn completion |
| `result: cancelled` | cancelled run |
| `result: failed` | structured run failure |

Tool cards use durable tool call/result frames only. Partial tool-call deltas do
not create duplicate cards. All normalized events pass through OD's existing
run event choke point for role-marker protection, timeouts, loop guards, usage,
and artifact reconciliation.

Todo snapshots and subagent presentation are final-design capabilities, not
phase-one requirements.

## 10. Cancellation and cleanup

Cancellation affects only the current run process:

1. send the protocol `cancel` command for the active request;
2. wait a short bounded grace period for `result: cancelled`;
3. close stdin;
4. terminate the owned process tree gracefully;
5. force-kill remaining owned processes after a second bound.

No operation may kill another conversation's runtime. Windows must use its
platform process-tree primitive rather than assuming POSIX process groups.

After interruption, a later process may cold-resume the session only if
Harness reports a healthy resume. Harness owns repair of its interrupted
persistence tail.

## 11. Credentials

### Phase one

OD does not manage an API key. The runtime uses credentials already available
to the user's Harness installation, including an inherited
`DEEPSEEK_API_KEY`. The setup guide explains how to configure Harness. No key is
stored in OD app config or committed test fixtures.

### Final design

The **Connect DeepSeek** card accepts a write-only key, but storage is delegated
through the profile to Harness's own `credentials.describe`,
`credentials.set`, and `credentials.unset` services.

OD receives only:

```json
{"configured":true,"source":"managed","writable":true}
```

An environment credential is reported as configured and read-only. The secret
is never returned, masked, logged, placed in argv, or stored in OD app config.
The Web UI and `od` CLI will call the same local daemon endpoint; CLI key input
comes from stdin or an explicit key file.

## 12. Models and MCP

The final profile supports model and reasoning discovery and accepts validated
stdio or streamable-HTTP MCP entries in the execute command.

Phase one may use one tested default DeepSeek model and no externally injected
MCP servers. Harness's built-in filesystem/shell/editor tools are sufficient
to prove artifact generation. OD must not claim generic MCP support until the
mapping and secret-handling tests are complete.

## 13. Platform ownership

The common lane owns the profile bundle source, protocol types, daemon parser,
session behavior, event mapping, and keyless fixtures.

Platform lanes own discovery of the user-installed official executable,
`.cmd`/`.exe` launch normalization, cwd/environment propagation, process-tree
cleanup, and real profile smoke evidence. Windows does not build a Harness
carrier and does not fork the profile protocol.

## 14. Security requirements

- The profile uses the official Harness workspace confinement and unattended
  permission policy selected for OD; it must not mount an unconfined example
  composition by accident.
- OD-owned session mapping metadata derives from the daemon's resolved
  data-root contract. Harness-owned session history remains under the user's
  `DSH_HOME`; OD neither repurposes that home nor invents another Harness
  persistence location.
- Stdout contains protocol frames only.
- Bounded stderr excludes prompts, credentials, and full raw tool output.
- A client cannot supply arbitrary credential destinations, plugin packages,
  profile names, or bootstrap configuration through the credential API.
- Bundle installation is explicit user authority, pinned, verified by probe,
  and never triggered silently during daemon startup.

## 15. Evidence and reference implementation

DeepSeek Harness source revision
`47f943859bef60e4160492346772ded9b24f765a` confirms profile bundles,
`ctx.agents.resume()`, JSONL persistence, and managed credentials.

Multica PR [#6923](https://github.com/multica-ai/multica/pull/6923) validates a
closely related architecture against public `@deepseek-ai/dsh@0.1.0-rc.6`:

- user-installed official `dsh`;
- an external `multica` profile bundle;
- `--probe`, `--stdio`, and `--list-models` surfaces;
- structured text/thinking/tool/usage events;
- protocol cancellation and process-tree fallback;
- two new processes resuming the same Harness session in a real model smoke.

The external `dsh-multica-runtime` implementation is not publicly accessible,
so OD cannot copy or depend on it. The PR is architectural and behavioral
evidence. OD implements and publishes its own bundle and keeps stricter
malformed-frame, request ownership, resume-id, and terminal-result rules.

## 16. Final acceptance

The complete design is ready when:

- profile installation/repair is available through both Web and `od` CLI;
- a compatible user-installed `dsh` and OD profile are discovered accurately;
- cold resume, structured events, model discovery, MCP, Todo/subagent status,
  credential delegation, and cancellation pass shared fixtures;
- macOS, Linux, and Windows pass process-tree and two-process resume smoke;
- a credentialed two-turn artifact flow succeeds without committing secrets;
- no Harness runtime is bundled into OpenDesign.
