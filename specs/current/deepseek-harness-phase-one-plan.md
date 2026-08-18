# DeepSeek Harness integration plan

Status: phase-one implementation handoff

Date: 2026-08-14

Related contract: `specs/current/deepseek-harness-profile-adapter.md`

The implementation uses a user-installed official `dsh` plus an OD profile
bundle and a versioned JSONL protocol; Open Design does not package a Harness
carrier.

## 1. Phase-one goal

Deliver the smallest useful vertical slice:

> A user who has installed official DSH can explicitly connect it from the
> normal Open Design CLI picker, select a discovered model and reasoning level,
> generate a previewable file artifact, cold-resume the conversation in a new
> process, and modify that artifact.

Phase one is successful because it produces and iterates real design output,
not because every Harness capability is exposed.

## 2. User journey in phase one

1. The user installs official `@deepseek-ai/dsh` using Harness documentation.
2. OD shows DeepSeek Harness in **Your CLIs** with a connection-component
   required state. Selecting it opens a confirmation dialog; confirmation asks
   the user's `dsh` to install OD's embedded, pinned profile bundle.
3. The user configures a DeepSeek credential through Harness or the process
   environment.
4. OD detects `dsh`, verifies `--version`, and runs
   `dsh --profile open-design --probe`.
5. OD rescans, selects, and connection-tests DeepSeek Harness. A compatible
   pre-existing profile skips the dialog and selects immediately.
6. A first request creates an HTML artifact in the OD project and OD previews
   it through the existing artifact path.
7. A second request starts another `dsh` process, resumes the same Harness
   session, modifies the HTML, and refreshes the preview.
8. Cancelling a run stops its runtime and tool children without affecting any
   other conversation.

There is no phase-one key input. The first release includes the explicit
profile installer and per-model reasoning choices, but leaves credential
storage, MCP injection, and automatic background maintenance deferred.

## 3. Included scope

### Official executable and profile

- detect the user's official `dsh`, including `DSH_BIN`;
- probe a usable version;
- treat untested parseable versions as available with a warning;
- require a compatible `open-design --probe` response;
- build an OD profile bundle compatible with the tested official DSH family;
- keep the bundle source, daemon protocol types, and fixtures in the same
  repository and embed its exact packed artifact in each OD build;
- never package `dsh`, Node, or the Harness dependency closure in OD.

### Explicit setup

- keep DSH in **Your CLIs** when the official executable exists but the profile
  is missing or incompatible;
- open a confirmation dialog on selection and perform no mutation on cancel;
- install the hash-verified embedded tarball through the user's `dsh` only
  after confirmation;
- rescan, select, and connection-test on success;
- expose the same operation as `od agent setup deepseek-harness --json`;
- do not reinstall or prompt when the compatible profile already exists.

### Models and reasoning

- discover the user's live model catalog through the profile;
- expose reasoning choices per model, not as one agent-global guess;
- validate the requested effort against the selected model before launch;
- retain a safe fallback model when live discovery is unavailable.

### Runtime protocol

- `dsh --profile open-design --stdio`;
- generation-1 JSONL `ready`, `execute`, `cancel`, `session`, `thinking`,
  `text`, `tool_call`, `tool_result`, `usage`, `result`, and
  `protocol_error` frames;
- deterministic malformed-frame failure;
- strict `request_id` isolation;
- explicit terminal result requirement.

### Multi-turn lifecycle

- one short-lived process per OD run;
- one stable compatible Harness session per OD conversation;
- first-turn create and follow-up cold resume;
- current-turn-only input after healthy resume;
- exact resumed-session-id assertion;
- explicit missing/corrupt resume failure without silent reseed;
- Harness persists native session history under the user's `DSH_HOME`; OD does
  not edit those files or replace that home;
- OD stores only the opaque Harness session id and its compatibility metadata
  in the daemon database derived from `RUNTIME_DATA_DIR`; clients cannot choose
  either storage path.

### Events and artifacts

- assistant text and thinking;
- durable tool calls and results;
- token usage;
- terminal completion/failure/cancellation;
- existing OD file watching, artifact reconciliation, HTML preview, and
  delivery path;
- no new DSH-specific artifact storage.

### Cancellation

- protocol cancel;
- bounded wait for cancelled result;
- preserve a validated Harness session handle so a later run can cold-resume
  after cancellation;
- stdin EOF;
- graceful process-tree termination;
- force-kill fallback;
- Windows-native process-tree evidence from the Windows lane.

### Credentialed smoke

- use a temporary inherited credential for local E2E;
- never commit the key, environment dump, provider transcript, or Harness
  session records;
- rotate the shared test credential after validation.

## 4. Explicitly deferred

Phase one does not include:

- **Connect DeepSeek** key input;
- `credentials.describe/set/unset` through OD;
- background profile upgrade, rollback, or uninstall;
- external MCP injection;
- TodoWrite snapshots or pinned Todo UI;
- subagent lifecycle presentation;
- automatic transcript reseed after corrupt/missing session state;
- concurrent turns on one Harness session;
- compatibility with multiple profile protocol generations;
- packaging any Harness runtime artifact.

These are deferred without changing the chosen architecture.

## 5. Shared frozen contract

| Field | Phase-one value |
| --- | --- |
| runtime id | `deepseek-harness` |
| display name | `DeepSeek Harness` |
| executable | user-installed `dsh` |
| override | `DSH_BIN` |
| profile | `open-design` |
| stream format | `dsh-profile-jsonl` |
| protocol generation | `1` |
| process model | one child per OD run |
| session model | one compatible Harness session per OD conversation |
| completion | exactly one matching terminal `result` |
| resume failure | fail; never silently create |
| profile setup | explicit selection dialog or `od agent setup` |
| bundle delivery | pinned tarball embedded in OD; official `dsh` stays external |
| credential source | preconfigured Harness or inherited environment |
| MCP | not forwarded in phase one |

The adapter is not `resumesSessionViaCli` and is not ACP. It receives an
explicit profile-stdio resume capability.

## 6. Worktree and collaboration

The shared implementation remains in the isolated worktree and branch:

```text
feat/deepseek-harness-profile
```

The dirty primary checkout is not modified.

The Windows lane branches from a committed and pushed Checkpoint A:

```text
feat/deepseek-harness-profile-windows
```

Common owns protocol behavior and fixtures. Windows owns executable launch
normalization and process-tree validation only; it does not build a carrier or
change frame semantics.

## 7. Reuse from `deepseek-harness-support`

Review baseline: remote head `6ef729c0ac`.

Retain:

- `deepseek-harness` runtime identity and product metadata;
- official `dsh`/`DSH_BIN` discovery;
- version probing, with corrected warning semantics;
- missing `DEEPSEEK_API_KEY` error classification;
- focused executable and diagnostic tests.

Replace:

- `--profile headless -- -- <prompt>` with `--profile open-design --stdio`;
- positional prompt and 30 KB argv budget with stdin JSONL;
- `plain` output with structured frames;
- fresh full-transcript turns with stable cold resume;
- the `default`-only model assumption with one tested phase-one route and a
  future catalog operation.

## 8. Implementation checkpoints

### Checkpoint A — protocol and fake runtime

Common lane delivers:

1. `dsh-profile-jsonl` runtime type and profile-specific resume capability.
2. Typed generation-1 commands and frames.
3. A strict incremental JSONL parser covering fragmented and coalesced chunks.
4. A keyless fake `dsh` that implements `--version`, `--probe`, and `--stdio`.
5. Fixtures for compatible/incompatible probes, create, resume, cancellation,
   wrong request ids, wrong resumed ids, malformed JSON, and missing terminal
   result.
6. Focused tests and daemon/contracts typecheck.

After this checkpoint is committed and pushed, Windows can branch and run the
same fixtures through `.cmd`/`.exe` launch paths.

### Checkpoint B — OD profile bundle

Common lane delivers:

1. A publishable bundle manifest with `dsh.bundle` and a Cordis patch.
2. A thin stdio plugin using the official Harness services already present in
   the user's `dsh` installation.
3. `--probe` and `--stdio` app-owned command surfaces.
4. First-turn `ctx.agents.create()` and follow-up
   `ctx.agents.resume({resumeSessionId})`.
5. Structured projection of text, thinking, durable tool calls/results, usage,
   and terminal result.
6. Protocol cancel plus clean disposal.
7. A package/profile install smoke against the public tested DSH version.

The bundle must resolve Harness peer packages from the official profile
composition and must not embed a second Cordis/scope runtime. A clean install,
config dump, probe, and keyless boot test are the go/no-go evidence.

### Checkpoint C — OD daemon lifecycle

Common lane delivers:

1. Runtime registration only after the SDK/profile path is complete.
2. Spawn with piped stdin/stdout/stderr and `shell: false`.
3. Conversation compatibility lookup and stable session persistence.
4. Bootstrap prompt on create and new-turn-only prompt on resume.
5. Event normalization through the existing run event choke point.
6. Exact terminal result and session-id validation.
7. Current-process cancellation and process-tree fallback.
8. Existing artifact reconciliation from Harness file writes.

### Checkpoint D — usable phase-one acceptance

Deliver:

1. Setup guidance for official DSH and Harness credential configuration, plus
   explicit in-product installation of the OD profile component.
2. Agent-picker diagnostics for missing executable, unreadable version,
   untested version, missing profile, incompatible protocol, and missing auth.
3. macOS/Linux real profile smoke.
4. Windows launch and process-tree smoke from the Windows lane.
5. A credentialed two-turn artifact E2E through a locally started OD daemon and
   web app.

## 9. Keyless acceptance tests

The fake/profile fixture suite must prove:

- profile missing means unavailable even when `dsh` exists;
- compatible probe enables the adapter;
- an untested but parseable DSH version produces a warning, not a block;
- fragmented and coalesced JSONL frames parse correctly;
- malformed JSON fails immediately and does not leak the raw line;
- first process creates a session;
- second process resumes exactly that session;
- the second execute frame contains only the latest turn;
- wrong request ids cannot produce chat events or terminal completion;
- a changed resume session id fails;
- missing/corrupt resume state fails without creating another session;
- thinking, text, tool call/result, and usage map once;
- EOF or process exit without a terminal result fails;
- cancel affects only the current child;
- stderr/diagnostics contain no prompt, credential, or raw tool output.

## 10. Real phase-one E2E

The release-defining scenario is:

1. Start OD with an isolated daemon data root through the normal `tools-dev`
   lifecycle and a temporary inherited DeepSeek credential.
2. Select DeepSeek Harness for a project.
3. Ask it to create a polished single-page product landing page as HTML.
4. Verify the Harness tool wrote the file inside the project.
5. Verify OD discovers and previews the HTML through its existing artifact
   surface.
6. Send a second instruction to switch to a dark theme and add a pricing card.
7. Verify a different OS process resumes the same Harness session.
8. Verify the original HTML is modified and the OD preview updates.
9. Start another modification and cancel it.
10. Verify the runtime and tool process tree is gone.
11. Send a later turn and verify cold resume remains usable when Harness reports
    the session healthy.

Provider transcripts and session files are inspection-only local evidence and
are deleted after the run. No secret appears in source control or command
arguments.

## 11. Phase-one UI and CLI boundary

The agent picker and Settings both place an installed-but-unconfigured DSH in
the ordinary **Your CLIs** group. Clicking it opens the same confirmation
dialog; Settings' **Test** remains a pure connection test. The setup operation
has a shared contract DTO and daemon endpoint, a Web surface, and the explicit
`od agent setup deepseek-harness --json` CLI peer.

The existing normal chat/run APIs expose DeepSeek Harness by runtime id like
other coding agents. Future credential management must likewise land as one
HTTP/UI/CLI closure, with CLI secrets accepted through stdin or a key file.

## 12. Later phases

### Phase two — connection maintenance

- pinned bundle update with staging, verification, rollback, and single-flight;
- Harness credential status/set/unset via write-only Web and CLI surfaces;
- environment credential shown as read-only;
- setup telemetry and actionable repair states.

### Phase three — capability parity

- validated MCP injection;
- TodoWrite snapshots;
- bounded subagent status;
- broader version matrix and protocol-generation migration;
- explicit session reseed UX.

## 13. Validation commands

Before Checkpoint A handoff:

```text
pnpm --filter @open-design/daemon typecheck
pnpm --filter @open-design/contracts typecheck
focused daemon protocol and detection tests
git diff --check
```

Before phase-one completion:

```text
pnpm guard
pnpm typecheck
pnpm --filter @open-design/daemon test
profile package/install/probe smoke
macOS/Linux real two-process smoke
Windows process-tree smoke
credentialed OD artifact E2E
```

No upstream DeepSeek PR and no Open Design-packaged Harness carrier are on the
phase-one critical path.
