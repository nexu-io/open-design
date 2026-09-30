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
| Availability probe runs `bin` + the profile's `versionArgs` | The CLI itself is `node zcode.cjs`, several versions deep in the desktop install | The profile points `versionArgs` at the bridge (§2), so detection runs the bridge's `--version` — which exits non-zero when the pinned CLI path is missing. Availability therefore validates the bridge and the CLI install, not merely that `node` is on PATH |

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
      "versionArgs": ["C:/Users/<you>/.open-design/zcode-cc.mjs", "--version"],
      "models": ["GLM-5.3"],
      "defaultModel": "GLM-5.3",
      "env": {
        "OD_ZCODE_CJS": "C:/Users/<you>/AppData/Local/Programs/ZCode/resources/glm/zcode.cjs"
      }
    }
  ]
}
```

- `bin` must be a bare PATH-resolvable name (`node`); the daemon's probe does not resolve absolute-path `bin` values on Windows.
- `versionArgs` must point at the bridge. Profile `args` is only prepended inside `buildArgs` (turns); the availability probe runs `bin` + `versionArgs` alone. Without this key the profile inherits Claude's `--version`, so detection executes plain `node --version` — a missing bridge or a stale, version-pinned CLI path still shows the agent as available and then fails at connection test or first run.
- `OD_ZCODE_CJS` (env, **required**) carries the version-specific `zcode.cjs` location inside the desktop install; the bridge exits when it is unset or the file is gone, and the same check backs the `--version` probe above. The path is release-directory-pinned, so re-run `install.mjs` after a ZCode desktop update.
- The profile advertises a single model: ZCode's headless mode runs the Coding Plan's configured default model, so a multi-entry model list would be misleading.
- This snippet shows the minimal shape, not copy-complete configuration — the installer also sets the provider-config env pair and keeps paths current. Prefer `install.mjs` over hand-copying.
- Restart the desktop app after editing the file — profiles are read at daemon startup.

## 3. Install

Requires the OpenDesign desktop app, a ZCode desktop install already logged in to a Coding Plan, and Node.js ≥ 18 on PATH. Windows is the tested path; the bridge is plain Node and should port to macOS/Linux.

```bash
git clone https://github.com/paceyw/zcode-opendesign-bridge
cd zcode-opendesign-bridge
node install.mjs        # installs the bridge to ~/.open-design/, writes/updates agents.local.json,
                        # auto-detects the newest installed ZCode CLI release, sets provider env
node deploy-icon.mjs    # optional: official ZCode icon for the agent card (see §6)
```

`install.mjs` is idempotent and writes the complete profile — probe `versionArgs`, required `env`, provider config — so prefer it over assembling the profile by hand. Re-run it after a ZCode desktop update (its internal CLI path is version-pinned).

## 4. Provider / Coding Plan setup (required — read before first run)

The bridge runs `zcode -p` as a **headless child process**, and two ZCode behaviors shape provider setup:

1. **OAuth login is not portable.** Desktop-written OAuth credentials are encrypted with a desktop-process-only secret — CLI children cannot read them. A Coding Plan that is only logged in via OAuth is invisible to the bridge.
2. **Headless turns create their model from the personal provider config** (`~/.zcode/v2/provider_config.json`). Without a personal provider rule carrying a `defaultModelSelection`, every turn dies at model creation.

Preferred path: **ZCode desktop → Settings → Models & Providers → add the "BigModel Coding Plan" catalog template + your Coding Plan API key.** The desktop app is the only writer the CLI fully trusts; hand-written rules are silently ignored unless they match the desktop's exact shape:

- `personalModelIds` (and `manualProviderModelRules`) must be **arrays**, not objects;
- the rule must **not** carry an `api` override — the catalog template supplies the base URL.

### ⚠️ Known regression on ZCode ≥ 22.20.0 (observed 2026-09-30)

Reported upstream as [zai-org/feedback#886](https://github.com/zai-org/feedback/issues/886).

- **Upgrading ZCode resets `provider_config.json` to an empty skeleton**, dropping the personal provider rule. Symptom: every OpenDesign run fails in under ~6 s with `AGENT_EXECUTION_FAILED` / `zcode exited with code 1` / `Error: Model creation failed (traceId: …)` — while the agent still shows as *available* (the availability probe only checks the bridge chain).
- **Re-adding the provider from the desktop UI may itself fail** with 「创建供应商失败：个人供应商配置格式无效」. Until that is fixed upstream, restore the file by hand — the following shape is CLI-verified against 0.16.9:

  ```json
  {
    "schemaVersion": 1,
    "config": {
      "providerOrder": ["bigmodel-coding-plan"],
      "providerConfigRules": {
        "providerRules": [
          {
            "providerId": "bigmodel-coding-plan",
            "templateId": "bigmodel-api",
            "providerName": "BigModel Coding Plan",
            "config": {
              "group": "standard-personal",
              "access": { "type": "zhipu-coding-plan-api-key", "apiKey": "<YOUR_CODING_PLAN_API_KEY>" },
              "personalModelIds": ["GLM-5.3", "GLM-5.3-Flash"],
              "modelOrder": ["GLM-5.3", "GLM-5.3-Flash"]
            }
          }
        ]
      },
      "modelConfigRules": { "providerModelRules": [], "manualProviderModelRules": [] },
      "defaultModelSelection": { "providerId": "bigmodel-coding-plan", "modelId": "GLM-5.3" }
    }
  }
  ```

  The file stores the API key in clear text — keep it out of dotfiles repos and screenshots. After restoring, run `node reset-provider-backoff.mjs` from the bridge repo: repeated failed attempts push the CLI's provider backoff into the future and mask the real error (§6).

### Verify

Quickest: send a one-line task from OpenDesign ("output an index.html containing only `<h1>hello</h1>`") and watch it succeed. Manually: reuse the `env` block the installer wrote into `agents.local.json` and run the CLI once —

```bash
node "<OD_ZCODE_CJS>" -p "reply with just: ok" --json
```

Exit `0` with a JSON `response` field → provider config is good. `Error: Model creation failed (traceId: …)` → re-check the rule shape above.

**After every ZCode upgrade**: re-run `install.mjs` (pinned paths move) **and** re-check `provider_config.json` (it may have been reset, §6).

## 5. What works, and the known gaps

Works: text turns and multi-turn conversations (context preserved via `--resume`), image attachments (`--attach`), long composed prompts, structured error frames (provider outages surface as `result{is_error:true}` instead of silent hangs), usage accounting.

Gaps (v1 of the bridge):

- **No live token streaming.** Frames are emitted when each turn completes, because `zcode -p --json` returns one final object. The chat UI shows the turn result at once rather than typing deltas.
- **Fresh conversation = fresh ZCode session.** A new OpenDesign conversation spawns a new bridge process; ZCode context does not carry across conversations (only within one).
- **OpenDesign's media MCP is not injected** into the ZCode child process.
- **Per-turn latency.** Each turn boots a fresh CLI process (~25k-token composed system prompt, plugin MCP connect skipped via a temporary config swap that is restored byte-for-byte after launch). Measured on Windows: ~28–37 s per headless turn, inside the Settings connection-test budget with headroom; design runs are minutes-long, so the fixed overhead is not the dominant cost.

## 6. Gotchas

- **Icons.** Local profiles carry no icon payload, and the agent card resolves icons from `public/agent-icons/<id>.<ext>` gated by a compiled extension map — an unknown profile id renders a letter avatar. `deploy-icon.mjs` deploys the official icon and patches that map across the installed web bundles; it must be re-run after an OpenDesign update (the map lives in compiled chunks).
- **Provider selection.** ZCode resolves its model provider from its own config files; if the desktop app was used to switch providers, headless children inherit that choice. The installer pins the environment to the detected Coding Plan provider so a stray personal-provider entry cannot hijack design runs. See §4 for the required personal-provider rule and the upgrade-reset regression.
- **Failure backoff.** ZCode's built-in provider applies an exponential lease/backoff after failed calls; repeated failed connection tests can make later attempts fail fast. `reset-provider-backoff.mjs` in the bridge repo clears the stale lease — reach for it before concluding anything is broken.

## 7. Path to a native adapter

Per [§1 of `agent-adapters.md`](agent-adapters.md), a native ZCode def would be one file in `runtimes/defs/` plus a registry entry — **if** the CLI grows a streaming headless output mode (a `claude-stream-json`-shaped `--output-format`, or a documented JSONL event stream that would justify a new `streamFormat` parser). First-party work is already tracked upstream: #4692 tracks the native ZCode runtime (implementation in #4819), and #5074 tracks Windows-native ZCode discovery. Until those land, the single-final-JSON shape is why this recipe ships a bridge instead of a def, and why the bridge cannot stream tokens; the bridge is the community stopgap in the meantime.
