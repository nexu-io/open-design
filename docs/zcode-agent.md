# ZCode CLI as a community agent (local profile)

**Parent:** [`agent-adapters.md`](agent-adapters.md) · **Siblings:** [`new-agent-runtime-acp.md`](new-agent-runtime-acp.md) · [`skills-protocol.md`](skills-protocol.md)

[ZCode](https://zcode.z.ai) is Z.ai's GLM coding-agent CLI (shipped with the ZCode desktop install and authenticated against a BigModel GLM Coding Plan). It is not among the shipped adapter ids, but it can run as a **user-defined local profile** (see [§1 of `agent-adapters.md`](agent-adapters.md)): the profile inherits the `claude` def's invocation and `claude-stream-json` wire, and a small community bridge converts that wire into ZCode's native headless mode. No fork of OpenDesign and no bundled runtime def are required.

The bridge lives in the community repo [`paceyw/zcode-opendesign-bridge`](https://github.com/paceyw/zcode-opendesign-bridge) (MIT). It is not maintained by OpenDesign; if it breaks against a new ZCode release, file issues there.

---

## 1. Why a bridge is needed

| OpenDesign side (inherited from `baseAgent: "claude"`) | ZCode CLI side | What the bridge does |
|---|---|---|
| Spawns one long-lived process speaking `claude-stream-json` over stdio, forwards user turns mid-session | `zcode -p "<prompt>" --json` is one-shot: prints a **single final JSON object** (`sessionId`, `response`, `usage`) and exits | Stays alive, reads user turns from stdin, spawns one headless ZCode child per turn, replays the final JSON as `system/init` / `assistant` / `result` frames |
| Follow-up turns continue the native session | Sessions resume via `--resume <sessionId>` | Captures `sessionId` from each turn's result and appends `--resume` on the next |
| Composed prompts can reach tens of KB (skill bodies, design briefs) | Windows `CreateProcess` command-line cap (~32 KB) turns oversized argv into `ENAMETOOLONG` | Writes long prompts to a temp file and passes `--attach <file>`, keeping argv small |
| Availability probe runs the profile `bin` with `--version` | The CLI itself is `node zcode.cjs`, several versions deep in the desktop install | Answers `--version` itself so the profile appears in **Your CLIs** without the real CLI on PATH |

## 2. The local profile

`~/.open-design/agents.local.json` (or a top-level array), following the local-profile schema:

```json
{
  "agents": [
    {
      "id": "zcode",
      "name": "ZCode CLI",
      "baseAgent": "claude",
      "bin": "node",
      "args": ["C:/Users/<you>/.open-design/zcode-cc.mjs"],
      "models": ["GLM-5.3"],
      "defaultModel": "GLM-5.3",
      "env": { }
    }
  ]
}
```

- `bin` must be a bare PATH-resolvable name (`node`) on Windows; the bridge path carries the version-specific ZCode CLI location inside `env` so the profile survives CLI updates after re-running the installer.
- The profile advertises a single model: ZCode's headless mode runs the Coding Plan's configured default model, so a multi-entry model list would be misleading.
- Restart the desktop app after editing the file — profiles are read at daemon startup.

## 3. Install

Requires the OpenDesign desktop app, a ZCode desktop install already logged in to a Coding Plan, and Node.js ≥ 18 on PATH. Windows is the tested path; the bridge is plain Node and should port to macOS/Linux.

```bash
git clone https://github.com/paceyw/zcode-opendesign-bridge
cd zcode-opendesign-bridge
node install.mjs        # installs the bridge to ~/.open-design/, writes/updates agents.local.json,
                        # auto-detects the newest installed ZCode CLI release, sets provider env
node deploy-icon.mjs    # optional: official ZCode icon for the agent card (see §5)
```

`install.mjs` is idempotent — re-run it after a ZCode desktop update (its internal CLI path is version-pinned).

## 4. What works, and the known gaps

Works: text turns and multi-turn conversations (context preserved via `--resume`), image attachments (`--attach`), long composed prompts, structured error frames (provider outages surface as `result{is_error:true}` instead of silent hangs), usage accounting.

Gaps (v1 of the bridge):

- **No live token streaming.** Frames are emitted when each turn completes, because `zcode -p --json` returns one final object. The chat UI shows the turn result at once rather than typing deltas.
- **Fresh conversation = fresh ZCode session.** A new OpenDesign conversation spawns a new bridge process; ZCode context does not carry across conversations (only within one).
- **OpenDesign's media MCP is not injected** into the ZCode child process.
- **Per-turn latency.** Each turn boots a fresh CLI process (~25k-token composed system prompt, plugin MCP connect skipped via a temporary config swap that is restored byte-for-byte after launch). Measured on Windows: ~28–37 s per headless turn, inside the Settings connection-test budget with headroom; design runs are minutes-long, so the fixed overhead is not the dominant cost.

## 5. Gotchas

- **Icons.** Local profiles carry no icon payload, and the agent card resolves icons from `public/agent-icons/<id>.<ext>` gated by a compiled extension map — an unknown profile id renders a letter avatar. `deploy-icon.mjs` deploys the official icon and patches that map across the installed web bundles; it must be re-run after an OpenDesign update (the map lives in compiled chunks).
- **Provider selection.** ZCode resolves its model provider from its own config files; if the desktop app was used to switch providers, headless children inherit that choice. The installer pins the environment to the detected Coding Plan provider so a stray personal-provider entry cannot hijack design runs.
- **Failure backoff.** ZCode's built-in provider applies an exponential lease/backoff after failed calls; repeated failed connection tests can make later attempts fail fast. `reset-provider-backoff.mjs` in the bridge repo clears the stale lease — reach for it before concluding anything is broken.

## 6. Path to a native adapter

Per [§1 of `agent-adapters.md`](agent-adapters.md), a native ZCode def would be one file in `runtimes/defs/` plus a registry entry — **if** the CLI grows a streaming headless output mode (a `claude-stream-json`-shaped `--output-format`, or a documented JSONL event stream that would justify a new `streamFormat` parser). Until ZCode exposes one, the single-final-JSON shape is why this recipe ships a bridge instead of a def, and why the bridge cannot stream tokens. Discussion of a first-party def belongs in an issue on this repository; the bridge is the community stopgap.
