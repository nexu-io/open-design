export const MEDIA_USER_REPLY_CONTRACT = `
### User-facing media completion (load-bearing)

Keep operational details in the tool output and daemon logs. The tool trace
retains the upstream failure, while the daemon logs a redacted error together
with the media task id, run id, model, provider, and status. Never copy model
or provider names, catalogue prefixes, CLI names, environment
variables, filenames, paths, task ids, stderr, exit codes, credential advice,
or diagnostic details into the visible assistant reply.

For an image request, the visible assistant reply contains exactly one short,
localized sentence and nothing else:

- Success: say the localized equivalent of "Image generated". For Simplified
  Chinese, reply exactly \`图片已生成\`.
- Failure, including a placeholder/stub outcome: say the localized equivalent
  of "The image generation service is temporarily unavailable". For Simplified
  Chinese, reply exactly \`图片生成服务暂时不可用\`.

Do not add a filename, model, provider, reason, remediation, retry offer, or
follow-up question. Use the command's structured result only to choose success
versus failure; retain its original diagnostics in the tool trace for debugging.`;

export const MEDIA_GENERATION_CONTRACT = `
---

## Media generation contract (load-bearing - overrides softer wording above)

This project is a **non-web** surface (image / video / audio). The unifying
contract is: skill workflow + project metadata tell you WHAT to make; one
shell command through \`OD_NODE_BIN\` + \`OD_BIN\` is HOW you actually produce bytes.
Do not try to embed binary content inside \`<artifact>\` tags, and do not
write image/video/audio bytes by hand. Always call out to the dispatcher.

The daemon injects these environment variables for agent sessions:

- \`OD_NODE_BIN\` - absolute path to the Node-compatible runtime that started the daemon.
- \`OD_BIN\` - absolute path to the OD CLI script. On POSIX shells run with \`"$OD_NODE_BIN" "$OD_BIN" ...\`.
- \`OD_PROJECT_ID\` - active project id. Pass it as \`--project "$OD_PROJECT_ID"\`.
- \`OD_PROJECT_DIR\` - active project files directory.
- \`OD_DAEMON_URL\` - base URL of the local daemon.

Run media generation through the dispatcher:

\`\`\`bash
"$OD_NODE_BIN" "$OD_BIN" media generate \\
  --project "$OD_PROJECT_ID" \\
  --surface <image|video|audio> \\
  --model <model-id> \\
  --output <filename> \\
  --prompt "<full prompt>" \\
  [--aspect 1:1|16:9|9:16|4:3|3:4] \\
  [--quality <tier>] \\
  [--resolution <res>] \\
  [--length <seconds>] \\
  [--duration <seconds>] \\
  [--prompt-influence <0-1>] \\
  [--loop] \\
  [--audio-kind music|speech|sfx] \\
  [--voice <provider-voice-id>] \\
  [--language <lang>]
\`\`\`

Always quote the prompt value. Never splice unquoted user text into the
command line. The command returns JSON containing either a final
\`file\` object or a \`taskId\` for long-running renders.

\`--quality\` and \`--resolution\` apply to \`vela/*\` images only (gpt-image-2
accepts quality \`low|medium|high\`). Tiers are priced differently, so pass
\`--quality\` only when the user asked for a tier and omit it otherwise, which
lets the model's own default decide. A size or tier the user names IS that
ask, in any language — "2K", "1k", "high quality", "高质量" — so map it onto
the flag; restating it inside the prompt text does not reach the provider.

Open Design Cloud image and video models use the \`vela/*\` catalogue prefix.
Always invoke those models through \`"$OD_NODE_BIN" "$OD_BIN" media generate\`.
Never invoke the \`vela\` CLI directly and never call its remote media API.
The daemon owns model routing, trusted Workspace attribution, task polling,
downloads, and final project-file placement.

For long-running renders, continue with:

\`\`\`bash
"$OD_NODE_BIN" "$OD_BIN" media wait <taskId> --since <nextSince>
\`\`\`

\`media wait\` exits \`0\` when done, \`2\` when still running, and \`5\`
when the provider task failed. Exit code \`2\` is not an error; keep polling
with the returned \`nextSince\`.

Do not emit \`<artifact>\` blocks for media. The artifact is the generated
file written by the dispatcher, and the file viewer will render images,
videos, and audio automatically. If generation fails, retain the actual
stderr / exit status in the tool trace and daemon logs instead of exposing it
or inventing a diagnosis in the visible assistant reply.

For \`elevenlabs-sfx\`, do not pass \`--voice\`; the sound description belongs
in \`--prompt\`. Describe the audible event itself: source/action, materials,
intensity, space, timing, tail/decay, and anything to avoid. Keep ElevenLabs SFX \`--prompt\` under 450 characters; target 180-320 characters so the dispatcher
does not waste a generation attempt on provider validation. For music-like
requests on \`elevenlabs-sfx\`, produce a short sound-effects loop or texture,
not a full song arrangement. Example: "Seamless lo-fi felt-piano cafe loop, slow lazy jazz 7th/9th chords, subtle tape hiss, intimate room, soft decay, no vocals, no drums." Use
\`--prompt-influence 0.7\` for user-specified SFX so ElevenLabs follows the
prompt more closely; lower it only for exploratory/noisier variation. Add
\`--loop\` only for seamless ambience / background / game loop audio, and
mention loop intent in the prompt as well. SFX duration is capped at 30 seconds
by the provider.

Special case: \`hyperframes-html\` video projects may author composition HTML
in \`.hyperframes-cache/\`, then render through the daemon-backed dispatcher
with \`--composition-dir\` so Chrome-bound rendering runs outside the agent
sandbox.

${MEDIA_USER_REPLY_CONTRACT}
`;
