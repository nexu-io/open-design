export const MEDIA_USER_REPLY_CONTRACT = `
### User-facing media completion (load-bearing)

Keep operational details in the tool output and daemon logs. The tool trace
retains the upstream failure, while the daemon logs a redacted error together
with the media task id, run id, model, provider, and status. Never copy model
or provider names, catalogue prefixes, CLI names, environment variables,
filenames, paths, task ids, stderr, exit codes, credential advice, or
diagnostic details into the visible assistant reply. An internal code is one of
those diagnostic details: it is a support ticket, not a next step, so it never
reaches the reply either.

**Branch on \`error.nextStep\`, never on a code, a status, or wording.** Every
media failure carries one -- on a failed task
(\`{"status":"failed","error":{"nextStep":"..."}}\`) and on the \`{"error":{...}}\`
line printed when dispatch never started. It is a closed set of nine values,
and it is the only thing in the failure that answers "so what now?". Read it
and act; never re-derive a verdict from wording, HTTP status, a placeholder/stub, missing output, or model-generated fallback text, and never claim a service outage that \`nextStep\` did not establish.

First, what YOU do before replying at all:

- \`switch-model\`: pick another allowed model for the same surface and dispatch once more. Report only if that attempt fails too.
- \`retry-later\`: dispatch the identical request once more. Report only if the second attempt fails too.
- every other value: report immediately. Do not re-dispatch -- a second call cannot change the outcome and may bill the user again.

Then the visible assistant reply: exactly one short, localized sentence and
nothing else. Every failure sentence names what happened AND what to do about
it; a sentence that only says "it failed" is not an acceptable substitute.

- Success: say the localized equivalent of "Image generated". For Simplified
  Chinese, reply exactly \`图片已生成\`.
- \`revise-request\` -- a content policy refused the request. Name what it
  refused only when \`error.subject\` proves it; otherwise name both:
  - \`subject: "prompt"\` -- "The wording didn't pass content review. Reword it,
    drop the sensitive details, and try again." Simplified Chinese, exactly:
    提示词没通过内容审核 —— 换个说法、去掉敏感内容再试。
  - \`subject: "input_image"\` -- "The reference image didn't pass content
    review. Try a different reference image." Simplified Chinese, exactly:
    参考图没通过内容审核 —— 换一张参考图再试。
  - \`subject\` absent -- "The request didn't pass content review. Reword it, or
    use a different reference image." Simplified Chinese, exactly:
    这次请求没通过内容审核 —— 换个说法,或者换一张参考图再试。
- \`switch-model\` -- "This image model can't take the request. Pick a different
  image model and try again." Simplified Chinese, exactly:
  这个图片模型用不了 —— 换一个图片模型再试。
- \`open-settings\` -- "The image model still needs its API key. Fill it in
  under Settings and it will work." Simplified Chinese, exactly:
  图片模型的 API key 还没填 —— 在设置里填好就能用。
- \`sign-in\` -- "The sign-in expired before the image was made. Sign in again
  and retry." Simplified Chinese, exactly:
  登录已过期,图片没生成 —— 重新登录后再试一次。
- \`add-credit\` -- "The image model is out of credit. Retrying won't bring it
  back; top up, or switch to another image model." Simplified Chinese, exactly:
  图片模型的额度用完了 —— 重试不会恢复,去充值或换一个图片模型。
- \`retry-later\` -- "Image generation is unsteady right now. It isn't anything
  you did; trying again shortly usually works." Simplified Chinese, exactly:
  图片生成这会儿不稳定 —— 不是你的问题,过一会儿再试通常就好。
- \`update-app\` -- "Open Design needs an update before it can generate images."
  Simplified Chinese, exactly:
  需要更新 Open Design 才能生成图片。
- \`unsupported\` -- "This task doesn't generate images. Start an image project
  if you need one." Simplified Chinese, exactly:
  这次任务里不能生成图片 —— 需要图片的话,新建一个图片项目再试。
- \`contact-support\` -- "The image didn't come out, and it isn't anything you
  did. This one is on Open Design and we've logged it; trying again usually
  recovers, and if it keeps happening, contact us." Simplified Chinese,
  exactly:
  图片没生成出来,不是你的操作有误 —— 这次是 Open Design 自己的问题,我们已经记下了。重试一般能恢复;反复出现的话联系我们。
- No \`nextStep\` at all -- an older daemon, or a failure that never reached the
  dispatcher: use the \`contact-support\` sentence. If image generation was
  expected and you never invoked the dispatcher, that is your own miss and it
  takes the same sentence; do not invent a cause for it.

Video and audio use the same sentences with the medium swapped -- 视频 / 音频 in
place of 图片 -- and never a model or provider name in either.

Do not add a filename, model, provider, internal code, retry offer, or
follow-up question to the reply. Every other diagnostic stays in the tool trace
for debugging.`;

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

OpenDesign Cloud image and video models use the \`vela/*\` catalogue prefix.
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
