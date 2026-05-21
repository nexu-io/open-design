# `od` CLI Cookbook

**Parent:** [`spec.md`](spec.md) · **Siblings:** [`architecture.md`](architecture.md) · [`plugins-spec.md`](plugins-spec.md) · [`agent-adapters.md`](agent-adapters.md)

The `od` CLI ships in `@open-design/daemon` (bin: `od → apps/daemon/dist/cli.js`). It is **agent-first**: every command maps to a `/api/*` route the web UI already uses, so a code agent can drive the full product without the browser. This file is a recipe book — for the complete surface run `od --help` or any subcommand `--help`.

> **Naming note.** macOS ships `/usr/bin/od` (octal dump). If you `pnpm link` the bin globally, give it a different alias (e.g. `odd`) or always invoke via `node apps/daemon/dist/cli.js`.

---

## 1. Conventions used in every recipe

- `OD_DAEMON_URL` — daemon HTTP base. Default `http://127.0.0.1:7456`. The CLI also discovers a running daemon via `OD_SIDECAR_IPC_PATH` when invoked by the daemon itself (skill/plugin runtime).
- `OD_PROJECT_ID` — auto-injected when the daemon spawns the CLI inside a skill/plugin. From a human shell, pass `--project <id>` explicitly.
- `OD_NODE_BIN` / `OD_BIN` — set by the daemon for agent runtimes. The recommended agent form is `"$OD_NODE_BIN" "$OD_BIN" <subcommand> ...`; this avoids the user's PATH ambiguity around `od`.
- `--json` — every read command supports it; pipe to `jq` for scripts.
- Exit codes: `0` success, `2` CLI usage error, non-zero otherwise.

---

## 2. Discovery: what's running, what's installed

```bash
# Is the daemon up? Print version + status.
od status

# Self-test: required binaries, ports, write paths.
od doctor

# List installed code-agent CLIs the daemon detected on PATH.
od status --json | jq '.agents'

# List installed plugins (filter by task kind: deck/landing/poster/...).
od plugin list --task-kind deck

# Search installed plugins by id/title/description/tag.
od plugin search resume

# Inventory + snapshot health roll-up — useful before a release cut.
od plugin stats --json
```

---

## 3. Generate media from an agent

The daemon dispatches image / video / audio through one endpoint; the CLI is the front door for skills.

```bash
# Image — single-line JSON result with the saved filename.
od media generate \
  --surface image \
  --model gpt-image-2 \
  --prompt "A wireframe of a settings page, top-down, ink line, no color" \
  --aspect 16:9 \
  --output settings-wireframe.png

# Video from a reference image (Seedance i2v).
od media generate \
  --surface video --model seedance-2 \
  --image hero.png --length 4

# Speech with a specific voice.
od media generate \
  --surface audio --model elevenlabs-tts \
  --prompt "Welcome to Open Design." \
  --voice <voice-id> --audio-kind speech

# Long-running tasks (>10s) — poll until done.
TASK_ID=$(od media generate --surface video --model seedance-2 --prompt "..." --json | jq -r .taskId)
od media wait "$TASK_ID" --since 0
```

**What you get back:** `{"file": { "name": "...", "size": ..., "kind": "...", "mime": "..." }}`. Reference the filename in the skill's artifact / message body — the daemon already wrote the bytes into the project's files folder.

---

## 4. Plugin lifecycle (the bulk of the CLI)

```bash
# Install from a local folder, GitHub ref, or .tgz URL.
od plugin install --source ./plugins/_official/examples/kami-deck
od plugin install --source github:nexu-io/awesome-plugin
od plugin install --source https://example.com/plugin.tgz

# Lint a plugin folder before publishing (manifest + atoms + refs).
od plugin validate ./plugins/_official/examples/kami-deck --json

# Lint an installed plugin (manifest + atoms + resolved refs).
od plugin doctor kami-deck

# Preview the ApplyResult without running it through an LLM.
od plugin apply kami-deck --inputs '{"topic":"Quarterly review"}'

# CI meta-command: doctor + simulate + canon --check from .od-verify.json.
od plugin verify kami-deck

# Tail the in-memory plugin event ring buffer.
od plugin events tail -f

# Compare two installed plugins.
od plugin diff kami-deck kami-landing --json

# Build a distributable tarball.
od plugin pack ./plugins/_official/examples/kami-deck --out dist/

# Re-emit the immutable snapshot a run launched against (audit / replay).
od plugin replay <runId> --snapshot-id <snapId>
```

**Capability staging.** `od plugin trust <id> --capabilities net,fs` records the grant in the registry; full mutation lands in plugin Phase 3.

---

## 5. Project, files, conversations

```bash
# Create a new project pre-wired to a design system + skill + plugin.
od project create \
  --name "Q4 Review Deck" \
  --design-system kami \
  --skill deck-builder \
  --plugin kami-deck

# Inspect / list / delete.
od project list
od project info <projectId>
od project delete <projectId>

# Drop a normal artifact (not a live one) into a project.
od artifacts create --name docs/notes.md --input ./notes.md --project <projectId>

# Manage live artifacts (the ones the chat panel renders in real time).
od tools live-artifacts list --project <projectId>
od tools live-artifacts refresh --id <artifactId>
```

---

## 6. Headless automations (Routines)

```bash
# Schedule a weekly run that creates a fresh project each time.
od automation create \
  --name "Weekly insights deck" \
  --prompt-file ./prompts/weekly-deck.md \
  --schedule "weekly:mon:09:00:Asia/Shanghai" \
  --target new-project \
  --plugin kami-deck \
  --skill deck-builder

# Or reuse one project (incrementing artifact each run).
od automation create \
  --name "Daily standup notes" \
  --prompt "Summarize yesterday's commits." \
  --schedule "weekdays:09:00:Asia/Shanghai" \
  --target reuse=<projectId>

# Trigger a manual run on demand.
od automation run <routineId>

# Inspect last 10 runs.
od automation runs <routineId> --limit 10 --json

# Turn a succeeded run into skill / memory proposals (compound-eng harvest).
od automation crystallize-run <routineId> <runId>

od automation pause <routineId>
od automation resume <routineId>
```

Schedule grammar: `hourly:<minute>` · `daily:HH:MM[:TZ]` · `weekdays:HH:MM[:TZ]` · `weekly:DAY:HH:MM[:TZ]` (`DAY` = `0-6` or `sun`–`sat`).

---

## 7. Inspect & answer GenUI surfaces headlessly

When a plugin asks for input (form, choice, confirmation, OAuth prompt), it surfaces in the UI as a card. Headless agents read and respond:

```bash
# List open prompts in a project / run.
od ui list --project <projectId>
od ui list --run <runId> --json

# Show one prompt's full schema.
od ui show <promptId>

# Respond — payload shape depends on prompt kind (form values, choice id, ...).
od ui respond <promptId> --payload '{"choice":"option-a"}'

# Pre-seed values before the prompt becomes interactive.
od ui prefill <promptId> --payload '{"team":"design"}'
```

---

## 8. Edit the memory tree

The memory tree is the structured context injected into agent prompts (project knowledge, prior decisions). The CLI exposes the same edits the UI's Memory panel does.

```bash
od memory tree list --project <projectId>
od memory tree view <nodeId>
od memory tree edit <nodeId> --body-file ./updated-note.md
od memory tree move <nodeId> --parent <newParentId>
```

---

## 9. Wire `od` into another repo's coding agent (MCP)

`od mcp` is a stdio MCP server. Drop it into any MCP-aware editor (Claude Code, Cursor, VS Code, Zed, Windsurf) and that agent can read files from a local Open Design project + create project-scoped artifacts without exporting a zip.

```json
// Cursor / Claude Code MCP config (example)
{
  "mcpServers": {
    "open-design": {
      "command": "od",
      "args": ["mcp", "--daemon-url", "http://127.0.0.1:7456"]
    }
  }
}
```

```bash
# Specialized variant — only the live-artifact + connector tools.
od mcp live-artifacts
```

---

## 10. Connectors (GitHub, Figma, Notion, …)

```bash
# List configured connectors + their auth state.
od tools connectors list --json

# Execute a connector verb (shape depends on connector).
od tools connectors execute --connector github --input '{"action":"list-repos"}'

# Pull a GitHub design-context bundle for a repo.
od tools connectors github-design-context --repo owner/name
```

---

## 11. Read design-system pull-layer files

Useful inside a skill: fetch the active design-system's `DESIGN.md`, tokens, components.

```bash
od tools design-systems read --path tokens.css
od tools design-systems read --path components.html
od tools design-systems read --path DESIGN.md
```

---

## 12. Quick research (Tavily-backed)

```bash
od research search --query "macOS menu-bar tray patterns 2025" --max-sources 5
```

Returns a normalized list of `{title, url, content}`. Designed to be called from a skill, not as a general web search.

---

## 13. Export diagnostics for a support ticket

```bash
# Same output as Settings → About → Export diagnostics.
od diagnostics export ./bug-report.zip

# JSON metadata if you only need pointers.
od diagnostics export --json
```

---

## 14. Recipe: full agent loop in a fresh shell

A complete "create project → apply plugin → fetch artifact" loop, no UI:

```bash
PROJECT=$(od project create --name "demo" --plugin kami-deck --json | jq -r .id)

od plugin apply kami-deck \
  --inputs '{"topic":"Q4 demo","audience":"engineers"}' \
  --project "$PROJECT"

# Wait for the live artifact to settle.
until od tools live-artifacts list --project "$PROJECT" --json | jq -e '.[0].status == "ready"' >/dev/null; do
  sleep 2
done

# Pull the artifact name.
od tools live-artifacts list --project "$PROJECT" --json | jq -r '.[0].name'
```

---

## 15. Notes for agent runtimes

When a skill or plugin shells out to `od`, prefer the explicit form so PATH lookups don't cost a turn:

```bash
"$OD_NODE_BIN" "$OD_BIN" media generate --surface image --model gpt-image-2 --prompt "..."
"$OD_NODE_BIN" "$OD_BIN" tools live-artifacts refresh --id "$ARTIFACT_ID"
```

The daemon injects both env vars on spawn. `OD_DAEMON_URL` and `OD_PROJECT_ID` come along for free, so `--daemon-url` and `--project` are usually omitted in skill code.

---

## 16. What's not in the CLI yet

Verified gaps as of this writing — if you reach for one of these, the answer today is "go through the API or UI":

- **Tail a single run's events** — no `od runs tail <id> --follow` yet. Closest workaround: `od plugin events tail -f` for plugin runs, or hit `/api/runs/:id/events` directly.
- **Batch plugin apply** — no `--inputs-from <jsonl>`. Loop in shell for now.
- **Remote daemon auth model** — the CLI assumes loopback or a trusted bind. There is no `od config remote add` for shared daemons.
- **Cookbook for `od marketplace`** — surface exists but is fast-moving; rely on `od marketplace --help`.
