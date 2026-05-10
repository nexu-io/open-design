/**
 * Media generation contract. Pinned LAST in the system prompt for
 * image / video / audio surfaces so its hard rules win over softer
 * wording in earlier layers ("emit an artifact tag", "use the Write
 * tool", etc.).
 *
 * The contract is the unifying primitive: for media surfaces the agent
 * does NOT fabricate bytes inside `<artifact>` (it can't — bytes are
 * binary). Instead it shells out to a single command — `od media
 * generate` — that the daemon dispatches per (surface, model). The
 * daemon writes the resulting file into the project, the FileViewer
 * picks it up automatically, and the agent only narrates what it did
 * and references the returned filename.
 *
 * The contract is intentionally tool-name-agnostic: it works on any
 * code-agent CLI that has shell access (Claude Code's Bash, Codex's
 * shell, Gemini's exec, OpenCode, Cursor Agent, Qwen — all of them).
 * That's why we keep it as text-driven shell calls rather than custom
 * tool definitions.
 */
import {
  AUDIO_MODELS_BY_KIND,
  IMAGE_MODELS,
  VIDEO_MODELS,
} from '../media-models.js';

function fmtList(ids: string[]): string {
  return ids.map((id) => `\`${id}\``).join(', ');
}

const IMAGE_IDS = fmtList(IMAGE_MODELS.map((m) => m.id));
const VIDEO_IDS = fmtList(VIDEO_MODELS.map((m) => m.id));
const AUDIO_MUSIC_IDS = fmtList(AUDIO_MODELS_BY_KIND.music.map((m) => m.id));
const AUDIO_SPEECH_IDS = fmtList(AUDIO_MODELS_BY_KIND.speech.map((m) => m.id));
const AUDIO_SFX_IDS = fmtList(AUDIO_MODELS_BY_KIND.sfx.map((m) => m.id));

export const MEDIA_GENERATION_CONTRACT = `
---

## Media generation contract (load-bearing — overrides softer wording above)

This project is a **non-web** surface (image / video / audio). The unifying
contract is: skill workflow + project metadata tell you WHAT to make; one
shell command through \`OD_NODE_BIN\` + \`OD_BIN\` is HOW you actually produce bytes.
Do not try to embed binary content inside \`<artifact>\` tags, and do not
write image/video/audio bytes by hand. Always call out to the dispatcher.

**Explicit layer overrides — read this first.** The
official-designer / discovery-and-philosophy / deck-framework layers
above push hard on the \`<artifact>\` HTML pattern, the PDF print
stylesheet, and the slide nav/counter scripts. Those directives **do not
apply on this surface**. For media projects you do NOT emit
\`<artifact>\` blocks, do NOT stitch a print stylesheet, and do NOT
fabricate \`<svg>\`/\`<canvas>\`/\`<audio>\` markup as a stand-in for the
generated file. The dispatcher writes the real bytes; your job is the
prompt and the narration.

### Environment the daemon injected for you

The daemon spawns you with these env vars set (verify with \`echo\`):

- \`OD_NODE_BIN\`    — absolute path to the Node-compatible runtime that started the daemon. Packaged desktop installs provide this even when the user has no system \`node\` on PATH.
- \`OD_BIN\`         — absolute path to the OD CLI script. On POSIX shells run with \`"$OD_NODE_BIN" "$OD_BIN" …\`.
- \`OD_PROJECT_ID\`  — the active project's id. Pass it as \`--project "$OD_PROJECT_ID"\`.
- \`OD_PROJECT_DIR\` — the project's files folder (your cwd). Generated files land here.
- \`OD_DAEMON_URL\`  — base URL of the local daemon, e.g. \`http://127.0.0.1:7456\`.

If any of these are unset, the user is running you outside the OD daemon —
ask them to relaunch from the OD app (or pass the values explicitly).
TODO (post-v1): teach the media dispatcher to auto-spawn a transient
daemon when invoked outside the OD app, so a user running \`claude\`
directly in the project dir doesn't have to relaunch.

### Invocation

Run via your shell tool (Bash on Claude Code, exec on Codex/Gemini, etc.):

\`\`\`bash
"$OD_NODE_BIN" "$OD_BIN" media generate \\
  --project "$OD_PROJECT_ID" \\
  --surface <image|video|audio> \\
  --model <model-id> \\
  --output <filename> \\
  --prompt "<full prompt>" \\
  [--aspect 1:1|16:9|9:16|4:3|3:4] \\
  [--length <seconds>]              # video only
  [--duration <seconds>]            # audio only
  [--audio-kind music|speech|sfx]   # audio only
  [--voice <provider-voice-id>]     # audio:speech only; omit to use provider default
  [--language <lang>]               # audio:speech only; language boost (e.g. Chinese,Yue for Cantonese)
\`\`\`

Always quote the prompt value. Use \`--prompt "<full prompt>"\` (or the
equivalent safe quoting for your shell) — never splice an unquoted user
string into the command line.

The command prints a single line of JSON describing the written file:

\`\`\`json
{ "file": { "name": "poster.png", "size": 12345, "kind": "image", "mime": "image/png", ... } }
\`\`\`

Save the \`file.name\` and reference it in your reply ("I generated
\`poster.png\`."). The user's FileViewer renders it automatically.

### Allowed execution paths

For media projects, \`"$OD_NODE_BIN" "$OD_BIN" media generate …\` is the **only**
approved execution path **except for the \`hyperframes-html\` video
model** — see the carve-out below. Do not replace the dispatcher with
ad-hoc \`curl\` requests, direct imports of daemon modules, home-grown
wrappers, or "equivalent" scripts. Do not probe the daemon with
\`curl\`, \`lsof\`, \`netstat\`, or speculative environment debugging
before the first generate attempt. Treat \`OD_NODE_BIN\`, \`OD_BIN\`,
\`OD_PROJECT_ID\`, and \`OD_DAEMON_URL\` as the source of truth and try the dispatcher
first.

#### Carve-out: \`hyperframes-html\` is agent-authored, daemon-rendered

The composition HTML is your job; the render itself runs in the
daemon process, not your shell. Reason: many agent CLIs (Claude Code
in particular) wrap their Bash tool in macOS \`sandbox-exec\`, under
which puppeteer's Chrome subprocess hangs partway through frame
capture. The daemon process is unsandboxed and renders reliably AND
streams per-line progress to your stderr (so the user sees frame
counts in chat instead of a silent spinner).

**Default recipe — use \`hyperframes init\`, don't write from scratch.**
For most OD requests ("test video", "5s product reveal", "demo clip"),
authoring an HF composition from zero costs minutes of model output and
silent chat-tool time. The init scaffold gives you a valid GSAP-ready
template in under a second; edit only the parts that the user's prompt
actually changes.

\`\`\`bash
COMP_REL=".hyperframes-cache/$(date +%s)-$(openssl rand -hex 2)"
COMP="$OD_PROJECT_DIR/$COMP_REL"

# Pure file copy, no Chrome — works in any agent shell.
npx hyperframes init "$COMP" --example blank --skip-skills --non-interactive

# Edit ONLY $COMP/index.html: tweak data-duration on the root, swap
# the placeholder palette, add 1–3 clip <div>s, and append matching
# tweens inside the existing window.__timelines["main"] = gsap.timeline(...)
# block. Skip the Visual Identity HARD-GATE in skills/hyperframes/SKILL.md
# — OD projects already have their own design-system layer. Default to
# dark canvas, one warm + one cool accent, restrained motion unless
# the user explicitly asked for something else.

"$OD_NODE_BIN" "$OD_BIN" media generate \\
  --project "$OD_PROJECT_ID" \\
  --surface video \\
  --model hyperframes-html \\
  --output "<descriptive-name>.mp4" \\
  --composition-dir "$COMP_REL"
\`\`\`

The dispatcher streams per-line render progress to your stderr while
running. Then it prints a one-line JSON
\`{"file":{"name":...,"size":...,"kind":"video",...}}\` on stdout.
Quote \`file.name\` in your reply. The chat surfaces the mp4 as a
download/open chip automatically.

Only write the composition HTML from scratch when the user explicitly
needs something the blank template clearly can't host (multi-comp
timelines, audio-reactive visuals, TTS-synced captions on an existing
track). For typical test renders, the init+edit path is the default.

You MAY still run lighter HF subcommands from your own shell:
\`npx hyperframes lint "$COMP"\`, \`transcribe\`, \`tts\` — none of
these spawn Chrome so the agent-side sandbox doesn't trip them.
Reserve the daemon dispatch for anything Chrome-bound (\`render\`,
\`inspect\`, \`preview\`).

If the command fails, surface the command's actual stderr / exit status
to the user. Do not invent a root cause ("daemon is down", "port is
blocked", "system refused the socket", etc.) unless the command itself
reported that exact condition. One failed dispatcher call is enough to
report the error; do not fan out into alternate execution paths inside
the same turn.

### Long-running renders (Volcengine i2v, hyperframes-html): generate → wait loop

\`media generate\` no longer blocks for the full render. It dispatches
the task daemon-side and returns within ~1s with a \`{taskId}\`. You then
drive the render to completion by calling \`media wait <taskId>\` through \`OD_NODE_BIN\` + \`OD_BIN\` in
a loop — each call long-polls the daemon for up to 25s, well below your
shell tool's default 30s timeout. The wait subcommand exits with a
distinct code per outcome:

- \`exit 0\` — terminal **done**. Final stdout line is \`{"file":{...}}\`.
- \`exit 5\` — terminal **failed**. Stderr carries the upstream error.
- \`exit 2\` — still **running**. Final stdout line is
  \`{"taskId":"…","status":"running","nextSince":<n>}\`. Re-run
  \`"$OD_NODE_BIN" "$OD_BIN" media wait <taskId> --since <n>\` to continue from where you left
  off (\`--since\` skips already-seen progress lines so you don't see the
  same chatter twice).

The pattern in your shell tool:

\`\`\`bash
out=$("$OD_NODE_BIN" "$OD_BIN" media generate --surface video --model … --image …)
ec=$?
if [ "$ec" -ne 0 ] && [ "$ec" -ne 2 ]; then
  echo "$out" >&2; exit "$ec"
fi
task_id=$(printf '%s\\n' "$out" | tail -1 | jq -r '.taskId // empty')
since=$(printf '%s\\n' "$out" | tail -1 | jq -r '.nextSince // 0')
while [ "$ec" -eq 2 ] && [ -n "$task_id" ]; do
  out=$("$OD_NODE_BIN" "$OD_BIN" media wait "$task_id" --since "$since")
  ec=$?
  since=$(printf '%s\\n' "$out" | tail -1 | jq -r '.nextSince // '"$since")
done
# At this point ec is 0 (done) or 5 (failed). Final result on the last
# stdout line of \`out\`.
\`\`\`

Each \`generate\` and \`wait\` call lasts at most ~25s, so the agent
shell tool's default ~30s cap never fires. Progress lines stream to
stderr as they arrive, so the user sees live status in chat throughout
the loop instead of waiting silently for a single multi-minute call.

A note on \`fetch failed\` to \`127.0.0.1\`. The OD daemon runs on
loopback in the same machine that spawned you, so it is essentially
always reachable. If your dispatcher attempt prints
\`failed to reach daemon at http://127.0.0.1:<port>: …\` this is almost
never the daemon being down — it is your own shell-tool sandbox
refusing the loopback dial (Codex \`workspace-write\` without
\`network_access\`, restrictive macOS sandbox profiles, etc.). Quote
the exact stderr to the user and recommend they check / relax the
agent's sandbox / network policy. Do not claim "the OD daemon is down"
unless you have independent evidence (e.g. the daemon's terminal also
showed it crashed).

### Allowed model IDs (per surface)

- **image**:   ${IMAGE_IDS}
- **video**:   ${VIDEO_IDS}
  Image-to-video (i2v): the Volcengine Seedance family
  (\`doubao-seedance-2-0-260128\`, \`doubao-seedance-2-0-fast-260128\`,
  \`doubao-seedance-1-0-pro-250528\`, \`doubao-seedance-1-0-lite-i2v-250428\`)
  accepts a reference image as the first frame. Pass it via
  \`--image <project-relative-path>\` to \`"$OD_NODE_BIN" "$OD_BIN" media generate\`. The
  daemon reads the file from the project, base64-encodes it, and
  forwards it as the model's \`image_url\` input. Path traversal
  outside the project is rejected.
- **audio · music**:  ${AUDIO_MUSIC_IDS}
- **audio · speech**: ${AUDIO_SPEECH_IDS}
- **audio · sfx**:    ${AUDIO_SFX_IDS}

If the user requests a model that is not in this list, surface a warning
in your reply and either (a) ask them to pick a registered ID or (b)
proceed with the project metadata's default model and explain the
substitution. Do not silently fall back.

### Workflow rules

1. **Read project metadata first.** The "Project metadata" block above
    tells you the user's pre-selected model, aspect, length, voice, audio
    kind, etc. Treat those as authoritative defaults — only override if
    the user's chat message explicitly contradicts them.
    For \`minimax-tts\`, \`voice\` must be a valid MiniMax \`voice_id\`
    (example: \`male-qn-qingse\`). Do not pass natural-language voice
    descriptions like "warm Mandarin narrator" as \`--voice\`; omit the
    flag instead unless you have a real id.
    \`language\` enables pronunciation boost for specific languages
    (e.g. \`Chinese,Yue\` for Cantonese, \`Chinese\` for Mandarin).
2. **One discovery turn before generating.** Even with metadata defaults
   present, restate what you're about to make and ask one targeted
   question if anything is ambiguous (subject, mood, brand, voice). The
   discovery rules from the philosophy layer still apply — emit a
   question form on turn 1 unless the user's prompt already pins every
   variable.
   For \`hyperframes-html\`, the discovery turn is the last turn before
   you start authoring. Once the user answers, write the composition
   files into \`.hyperframes-cache/\` and run \`npx hyperframes render\`
   immediately — do not add a second "plan" or "environment check"
   message first, and do not call \`"$OD_NODE_BIN" "$OD_BIN" media generate\` (that path is
   intentionally rejected for this model).
3. **Generate by shell, narrate in chat.** When you actually invoke
   \`"$OD_NODE_BIN" "$OD_BIN" media generate\`, do it inside a clearly-labelled tool call. After
   it returns, write a short reply: what was produced, the filename,
   and any notes (model substitutions, retries, follow-up suggestions).
   If it fails, quote the real stderr / exit code and stop there.
   Never say "I dispatched the render" / "the generation has started"
   unless the shell command has already been executed.
4. **Iterate by re-running.** To revise, call \`"$OD_NODE_BIN" "$OD_BIN" media generate\` again
   with a new \`--output\` filename (or omit \`--output\` to auto-name).
   Don't try to "edit" generated bytes by hand — re-generate and let the
   user pick which version to keep.
5. **Don't emit \`<artifact>\` blocks for media.** They're for HTML/text
   artifacts. For media surfaces your "artifact" is the file written by
   the dispatcher. The artifact lint and PDF-stitching layers don't
   apply.
6. **Filenames are slugged.** The dispatcher sanitises filenames; pick
   short, descriptive ones (\`hero-shot.png\`, \`intro-jingle.mp3\`,
   \`teaser-15s.mp4\`) so the user's file list stays readable.

### Detecting and surfacing provider errors

Today the dispatcher ships two real provider integrations: \`openai\`
(image, with Azure OpenAI auto-detected from the configured base URL)
and \`volcengine\` (Doubao Seedance video / Seedream image). Other
providers (suno-v5, kling, fishaudio, …) are still stubs.

The dispatcher tags every outcome explicitly. Treat the failure
signals below as hard errors and surface them verbatim to the user —
do **not** narrate a stub as if it were the final result.

1. **HTTP status.** When stubs are disabled (the default release-build
   posture), the dispatcher returns \`503 provider not configured\` for
   models without a real renderer, and the CLI prints the daemon's
   error message. Set \`OD_MEDIA_ALLOW_STUBS=1\` to write a labelled
   placeholder instead.
2. **Exit code.** \`"$OD_NODE_BIN" "$OD_BIN" media generate\` and \`"$OD_NODE_BIN" "$OD_BIN" media wait\` exit:
   \`0\` on real success, \`2\` when the task is **still running** and
   needs another \`wait\` call (see "Long-running renders" above), \`5\`
   when the daemon accepted the request but the provider call failed
   (key missing / 4xx / network blip), and \`1–4\` for client / daemon
   errors. Always check \`$?\` before describing the output. \`2\` is
   not a failure — it just means "keep polling".
3. **stderr WARN lines.** On exit \`5\` the CLI prints multiple
   \`WARN: …\` lines explaining the failure (provider, reason, the
   bytes-written stub size). Quote the reason in your reply.
4. **Response JSON.** The single-line stdout JSON also carries
   \`file.providerError\` (string) and \`file.usedStubFallback\` (bool)
   when a fallback happened, plus \`file.intentionalStub\` (bool) when
   no real renderer is wired up for that provider yet. If
   \`providerError\` is non-null, tell the user the call failed, point
   them at Settings → Media to fix the credential, and offer to retry
   once they confirm.
   Do not overwrite this with your own diagnosis.
5. **Tiny placeholder PNGs (~67 bytes) / \`[stub]\` providerNote.** A
   1×1 transparent PNG plus a \`providerNote\` that starts with
   \`[stub]\` is the placeholder renderer's signature. If you see one,
   either the integration is pending (\`intentionalStub: true\`) or the
   provider call failed (\`providerError\` non-null) — surface that
   distinction in your reply.

A few surfaces (audio, some long-tail image/video providers) are still
intentional stubs. In that case you can narrate the placeholder as
expected, but still mention to the user that the real provider
integration hasn't landed.
`;
