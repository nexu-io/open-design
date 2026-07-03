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
} from '../media/models.js';
import type { ByokMediaDefaults, MediaExecutionPolicy, MediaSurface } from '@open-design/contracts';

function fmtList(ids: string[]): string {
  return ids.map((id) => `\`${id}\``).join(', ');
}

const IMAGE_IDS = fmtList(IMAGE_MODELS.map((m) => m.id));
const VIDEO_IDS = fmtList(VIDEO_MODELS.map((m) => m.id));
const AUDIO_MUSIC_IDS = fmtList(AUDIO_MODELS_BY_KIND.music.map((m) => m.id));
const AUDIO_SPEECH_IDS = fmtList(AUDIO_MODELS_BY_KIND.speech.map((m) => m.id));
const AUDIO_SFX_IDS = fmtList(AUDIO_MODELS_BY_KIND.sfx.map((m) => m.id));

export function renderMediaGenerationContract(
  mediaExecution?: MediaExecutionPolicy | undefined,
  byokMediaDefaults?: ByokMediaDefaults | undefined,
): string {
  const mode = mediaExecution?.mode ?? 'enabled';
  if (mode === 'enabled') {
    return renderEnabledMediaGenerationContract(mediaExecution, byokMediaDefaults);
  }
  const scope = renderMediaPolicyScope(mediaExecution);
  if (mode === 'disabled') {
    return `
---

## Media generation policy (load-bearing — overrides softer wording above)

Open Design-owned media execution is **disabled for this run**. Do not call
\`"$OD_NODE_BIN" "$OD_BIN" media generate\`, Codex built-in imagegen, OD media
provider APIs, local renderers, or ad-hoc scripts that create media bytes on
OD's behalf.

External MCP media tools, when explicitly configured for this run, are outside
this OD-owned media policy. If no such external tool is available and the user
asks for media, describe the intended creative brief, prompt, surface, model
preference, references, and output filename in chat, then stop. Do not claim a
file was generated and do not emit an \`<artifact>\` block for media.
${scope}`;
  }
  return renderEnabledMediaGenerationContract(mediaExecution, byokMediaDefaults);
}

function renderEnabledMediaGenerationContract(
  mediaExecution?: MediaExecutionPolicy | undefined,
  byokMediaDefaults?: ByokMediaDefaults | undefined,
): string {
  const scope = renderMediaPolicyScope(mediaExecution);
  const defaults = renderByokMediaDefaults(byokMediaDefaults);
  if (!scope && !defaults) return MEDIA_GENERATION_CONTRACT;
  return MEDIA_GENERATION_CONTRACT.replace(
    '\n### Allowed model IDs (per surface)',
    `
${defaults}
${scope ? `### Active media policy scope

The dispatcher will reject surfaces or models outside this run's active
allowlist. Treat this allowlist as narrower than the full catalogue below;
select only from it.
${scope}

` : ''}### Allowed model IDs (per surface)`,
  );
}

function renderByokMediaDefaults(
  defaults?: ByokMediaDefaults | undefined,
): string {
  const lines: string[] = [];
  const imageModel = defaults?.imageModel?.trim();
  const videoModel = defaults?.videoModel?.trim();
  const speechModel = defaults?.speechModel?.trim();
  const speechVoice = defaults?.speechVoice?.trim();
  if (imageModel) lines.push(`- Image model: \`${imageModel}\``);
  if (videoModel) lines.push(`- Video model: \`${videoModel}\``);
  if (speechModel) lines.push(`- Speech model: \`${speechModel}\``);
  if (speechVoice) lines.push(`- Speech voice: \`${speechVoice}\``);
  if (lines.length === 0) return '';
  return `### Run-scoped BYOK media defaults

The user selected these BYOK media defaults in the chat UI for this run. Use
them when dispatching media unless the current user message explicitly asks for
a different model or voice.
${lines.join('\n')}

`;
}

function renderMediaPolicyScope(
  mediaExecution?: MediaExecutionPolicy | undefined,
): string {
  const lines: string[] = [];
  if (Array.isArray(mediaExecution?.allowedSurfaces) && mediaExecution.allowedSurfaces.length > 0) {
    lines.push(`Allowed surfaces for this run: ${fmtList(mediaExecution.allowedSurfaces as MediaSurface[])}.`);
  }
  if (Array.isArray(mediaExecution?.allowedModels) && mediaExecution.allowedModels.length > 0) {
    lines.push(`Allowed models for this run: ${fmtList(mediaExecution.allowedModels)}.`);
  }
  return lines.length > 0 ? `\n\n${lines.join('\n')}` : '';
}

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
  [--prompt-influence <0-1>]        # audio:sfx only; higher follows the prompt more closely
  [--loop]                          # audio:sfx only; request a seamless loop
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

### All slow renders: generate → wait loop

Any model whose generation takes longer than ~25s — including **fal flux-pro-ultra,
fal Veo, fal Sora, Volcengine i2v, hyperframes-html, and anything else with a
multi-minute pipeline** — will not complete within the initial \`media generate\` call.

\`media generate\` dispatches the task daemon-side and polls for up to ~25s. It
always exits 0 — either with \`{"file":{...}}\` if the render finished within that
window, or with \`{"taskId":"..."}\` as a handoff signal. You then drive the render
to completion by calling \`media wait <taskId>\` through \`OD_NODE_BIN\` + \`OD_BIN\`
in a loop — each call long-polls the daemon for up to 120s. The wait subcommand
exits with a distinct code per outcome:

- \`exit 0\` — terminal **done**. Final stdout line is \`{"file":{...}}\`.
- \`exit 5\` — terminal **failed**. Stderr carries the upstream error.
- \`exit 2\` — still **running**. Final stdout line is
  \`{"taskId":"…","status":"running","nextSince":<n>}\`. Re-run
  \`"$OD_NODE_BIN" "$OD_BIN" media wait <taskId> --since <n>\` to continue from where you left
  off (\`--since\` skips already-seen progress lines so you don't see the
  same chatter twice).

The pattern in your shell tool (uses python3 to parse JSON — do NOT use jq, it
may not be installed):

\`\`\`bash
out=\$("$OD_NODE_BIN" "$OD_BIN" media generate --surface image --model flux-pro-ultra --prompt "…")
ec=\$?
if [ "\$ec" -ne 0 ]; then
  echo "\$out" >&2; exit "\$ec"
fi
last=\$(printf '%s\\n' "\$out" | tail -1)
task_id=\$(printf '%s\\n' "\$last" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('taskId',''))" 2>/dev/null)
since=\$(printf '%s\\n' "\$last" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('nextSince',0))" 2>/dev/null)
since="\${since:-0}"
while [ -n "\$task_id" ]; do
  out=\$("$OD_NODE_BIN" "$OD_BIN" media wait "\$task_id" --since "\$since")
  ec=\$?
  last=\$(printf '%s\\n' "\$out" | tail -1)
  since=\$(printf '%s\\n' "\$last" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('nextSince',\$since))" 2>/dev/null)
  since="\${since:-0}"
  if [ "\$ec" -eq 0 ]; then
    task_id=""
  elif [ "\$ec" -ne 2 ]; then
    echo "\$out" >&2; exit "\$ec"
  fi
done
# At this point ec is 0 (done) or 5 (failed). Final result on the last stdout line of \$out.
printf '%s\\n' "\$last"
\`\`\`

Each \`generate\` call lasts at most ~25s and each \`wait\` call at most ~120s,
both well within your shell tool's timeout. Progress lines stream to stderr as
they arrive, so the user sees live status in chat throughout the loop instead of
waiting silently for a single multi-minute call.

**Always write your shell invocation as the full generate+wait loop above**, even
for image models. \`flux-pro-ultra\` routinely takes 60–180s; \`sora-2\` and
\`veo-3-fal\` take longer. In the wait loop, exit 2 means "keep polling, not an error."

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

If the user requests a model that is not in this list **and** the ID does
not start with \`fal-ai/\`, surface a warning in your reply and either
(a) ask them to pick a registered ID or (b) proceed with the project
metadata's default model and explain the substitution. Do not silently
fall back.

Exception — **fal-ai/\* custom paths**: any model ID that begins with
\`fal-ai/\` (e.g. \`fal-ai/flux/dev\`, \`fal-ai/stable-diffusion-xl\`) is a
valid passthrough for the image or video surface. Pass it to
\`"$OD_NODE_BIN" "$OD_BIN" media generate\` as-is via \`--model <id>\`;
the daemon routes it directly to the fal queue without a catalog entry.
Do **not** warn the user or substitute the default when a \`fal-ai/\`
path is given.

### Workflow rules

1. **Read project metadata first.** The "Project metadata" block above
    tells you the user's pre-selected model, aspect, length, voice, audio
    kind, etc. Treat those as authoritative defaults — only override if
    the user's chat message explicitly contradicts them.
    For \`minimax-tts\`, \`voice\` must be a valid MiniMax \`voice_id\`
    (example: \`male-qn-qingse\`). Do not pass natural-language voice
    descriptions like "warm Mandarin narrator" as \`--voice\`; omit the
    flag instead unless you have a real id.
    For \`elevenlabs-v3\`, \`--voice\` expects a provider-specific ElevenLabs \`voice_id\`; do not pass a natural-language voice description there.
    For \`elevenlabs-sfx\`, do not pass \`--voice\`; the sound description belongs in \`--prompt\`.
    Keep ElevenLabs SFX \`--prompt\` under 450 characters; target 180-320 characters so the dispatcher does not waste a generation attempt on provider validation.
    Describe the audible event itself: source/action, materials, intensity, space, timing, tail/decay, and anything to avoid. Good SFX prompts are literal sound briefs such as "short glass UI confirmation chime, clean attack, soft shimmer tail, no melody, no voice" or "seamless rainy alley ambience loop, distant traffic, wet pavement drips, no voices".
    For music-like requests on \`elevenlabs-sfx\`, produce a short sound-effects loop or texture, not a full song arrangement. Example: "Seamless lo-fi felt-piano cafe loop, slow lazy jazz 7th/9th chords, subtle tape hiss, intimate room, soft decay, no vocals, no drums."
    Avoid vague intent-only prompts such as "a nice transition" or "make this section feel premium" unless you translate them into concrete sound sources.
    Use \`--prompt-influence 0.7\` for user-specified SFX so ElevenLabs follows the prompt more closely; lower it only when the user explicitly wants exploratory/noisier variation.
    Add \`--loop\` only when the requested SFX must be seamless ambience / background / game loop audio. Mention loop intent in the prompt as well.
    SFX duration is capped at 30 seconds by the provider.
    \`language\` enables pronunciation boost for specific languages
    (e.g. \`Chinese,Yue\` for Cantonese, \`Chinese\` for Mandarin).
2. **Dispatch immediately when the brief is complete.** For image and video
   projects, if the user's prompt specifies the subject, style/mood, and setting,
   **dispatch without a discovery question turn**. Do not ask about model or aspect
   ratio when reasonable defaults exist — use them and start generating.

   Default model selection (use these when \`imageModel\`/\`videoModel\` is unknown
   or the user asks for "best"):
   - **Image, best quality (user says "best", "highest quality", "most realistic")**:
     use \`flux-pro-ultra\` — but tell the user it takes 60–180s
   - **Image, default / no preference stated**: use the project metadata's
     \`imageModel\` if set; otherwise use \`gpt-image-2\`
   - **Video, best quality**: use project metadata \`videoModel\` if set; otherwise
     \`doubao-seedance-2-0-260128\`

   Default aspect ratio (use when \`aspectRatio\` is unknown):
   - Landscape/outdoor scenes, cinematic, widescreen → \`16:9\`
   - Portrait, vertical social → \`9:16\`
   - Product, abstract, square social → \`1:1\`
   - General default when no cue → \`1:1\`

   **Skip the discovery question when all of these are true:**
   - The subject is described (what to generate)
   - The style or mood is implied or stated (realistic, cinematic, illustrated, etc.)
   - Any model/aspect gaps can be filled with the defaults above

   **Do ask** if the output intent is genuinely ambiguous (e.g. "make something cool"
   with no subject), or the user explicitly requests a model/voice the project
   metadata doesn't carry.

   For \`hyperframes-html\`, the discovery turn is the last turn before
   you start authoring. Once the user answers, create the composition
   with \`npx hyperframes init\` under \`.hyperframes-cache/\`, edit the
   generated \`index.html\`, and dispatch through
   \`"$OD_NODE_BIN" "$OD_BIN" media generate --surface video --model hyperframes-html --composition-dir <rel>\`.
   Do not run \`npx hyperframes render\` yourself; Chrome-bound rendering
   must happen in the daemon process. Do not add a second "plan" or
   "environment check" message first.
3. **Generate by shell, reply in one short message.** When you invoke
   \`"$OD_NODE_BIN" "$OD_BIN" media generate\`, do it inside a clearly-labelled tool call.
   After the command completes, reply with **one brief message** (2–3 sentences max):
   the filename, the model used, and a single follow-up offer ("Want a different
   aspect ratio?" / "Try again with more fog?"). Do not write long descriptions,
   artistic analyses, or multi-paragraph commentary. Speed matters.
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

Today the dispatcher ships real provider integrations for OpenAI
(image and speech, with Azure OpenAI auto-detected from the configured
base URL), Volcengine (Doubao Seedance video / Seedream image), Grok
image/video, Nano Banana image, HyperFrames video, and the MiniMax, FishAudio, and ElevenLabs audio renderers are production integrations.
Models whose provider path has no renderer still return a configured
stub/error signal as described below.

The dispatcher tags every outcome explicitly. Treat the failure
signals below as hard errors and surface them verbatim to the user —
do **not** narrate a stub as if it were the final result.

1. **HTTP status.** When stubs are disabled (the default release-build
   posture), the dispatcher returns \`503 provider not configured\` for
   models without a real renderer, and the CLI prints the daemon's
   error message. Set \`OD_MEDIA_ALLOW_STUBS=1\` to write a labelled
   placeholder instead.
2. **Exit code.** \`"$OD_NODE_BIN" "$OD_BIN" media generate\` exits \`0\` for
   both immediate completion and successful queued/running handoff; inspect
   the final stdout JSON for either \`file\` or \`taskId\`. \`"$OD_NODE_BIN"
   "$OD_BIN" media wait\` exits \`0\` on terminal **done**, \`2\` when the
   task is still **running** and needs another \`wait\` call (see
   "Long-running renders" above), \`5\` when the daemon accepted the request
   but the provider call failed (key missing / 4xx / network blip), and
   \`1–4\` for client / daemon errors. Always check \`$?\` before describing
   the output. \`2\` from \`media wait\` is not a failure — it just means
   "keep polling".
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

Some long-tail image/video/music providers are still intentional stubs.
In that case you can narrate the placeholder as expected, but still
mention to the user that the real provider integration hasn't landed.
`;
