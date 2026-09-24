---
title: Open Design 0.23.0 — A New Home, Conversations That Hold Together
description: "A redesigned home and project entry, plus a round of conversation reliability work: clarifications survive a restart, delivered results stay delivered, and the conversation keeps its place when work gets complicated."
---

### 🌟 Codename: *A New Home, Conversations That Hold Together*

🧵 **74 PRs · 8 contributors** — **Open Design 0.23.0 ships a new home screen and makes an agent conversation feel like one continuous piece of work.** A restart, a clarification, a retry or a crowded result used to be enough to lose the thread. Now the work, its evidence and the next useful action stay together. 🚀

## 🔥 Highlights

- 🏠 **A redesigned home and project entry.** The home screen, the top entry bar, the all-projects list and the project chat page were rebuilt: starting a project and returning to one are shorter paths, and a narrow window no longer crowds them together. (#8209) Thanks @Siri-Ray.

- 🧠 **A clarification can survive the real world.** Ask Open Design to continue a task, restart while it needs an answer, then come back and answer it: OD Next keeps the thread resumable instead of quietly abandoning the work. Failed runs now tell the truth before finalization, while delivered prototype pages stay delivered—not mysteriously marked as failures. (#7575, #7980, #7942, #7931, #7949, #8225) Thanks @lorenzozanee, @Siri-Ray, @app/open-design-crew.

- 🖱️ **The transcript scrolls when you scroll it.** A rounded clip above the chat log kept the compositor from hit-testing it, so in some situations the wheel would not move the transcript and menus disappeared mid-stream. Fixed. (#8228, #8223) Thanks @lefarcen, @Siri-Ray.

- 💬 **Failures say something useful.** Run-failure cards now follow the approved product copy for their text, their buttons and their disabled states: retry is offered when retry is possible, and when it is not, the card names the gate you are actually facing. (#8242) Thanks @app/open-design-crew.

- 🔁 **Retries finally pick up where you left them.** Cloud retries wait for the authority and history they need; transient reads recover; folded tasks retain their blocked state and retry the actual failed run. A pending clarification also stays in charge until you answer it. (#7953, #7954, #7955, #7967, #7981, #7989, #8250) Thanks @app/open-design-crew, @lefarcen.

- 🛠️ **You can watch the tools work.** Codex and OpenCode tool calls appear in the conversation while their arguments are still streaming, instead of surfacing only once the call is over. Buffered ACP words, failed tool results and real cancellations all make it back into the conversation too. (#8117, #7959, #8015, #8046, #8063) Thanks @app/open-design-crew, @Siri-Ray.

- 🖼️ **Artifact-heavy chats stay in the order you chose.** Cover-image failures have a useful fallback; live updates refresh the card you are already reading; image strips scroll; requested file ranges and selected artifact order remain visible. (#8045, #8060, #8062, #8013) Thanks @app/open-design-crew.

- 🧰 **Bring your own model without opening a privacy detour.** Image input works when a BYOK provider cannot advertise every capability, while proxy Basic credentials stay out of export and media tool-token lanes. (#8035, #7999, #8006) Thanks @Siri-Ray, @readwrightexecute.

- 📦 **The installed app holds onto its engine.** Packaged MCP and sidecar delivery remain intact, updater cleanup no longer removes the launcher payload that is still doing the work, and the packaged build has more headroom so it stops running out of memory. (#8027, #7963, #8212) Thanks @PerishCode, @Siri-Ray.

> 📥 **Download:** Release assets will be available from [Open Design 0.23.0](https://github.com/nexu-io/open-design/releases/tag/open-design-v0.23.0).

## 🔁 Changed

- Run clocks now begin when the run really begins; folded runs keep their own clocks, the composer stays visibly preparing during send admission, and retry cards describe the send gate they actually face. (#7921, #7927, #8059, #8069) Thanks @lefarcen.
- Cloud and AMR account, balance and upgrade links now lead to the current dashboard routes instead of sending you on a dead-end detour. (#8126) Thanks @nettee.
- Agent-owned Codex threads are archived after a terminal completion, keeping finished local work from lingering as if it were still alive. (#8051)
- Client activity slots share one integration path, so they display and acknowledge consistently; a replaced Test context recovers on its own, and a hover slot waits until it is really visible before counting. (#7986, #8210, #8263) Thanks @alchemistklk.
- The bundled Vela CLI moves to 0.0.38. (#8224, #8273) Thanks @Siri-Ray.

## 🐛 Fixed

### 💬 Conversations and interface

- Continue stays on the conversation turn that owns it; question controls follow the UI language; long question titles remain readable; and native tooltips no longer interrupt the choice flow. (#8014, #8010, #8031, #8033) Thanks @lefarcen.
- Narrow chat panes keep footer actions and time visible; terminal artifact recovery respects the preview you chose; and uploaded attachments retain their true size. (#8001, #8050, #8030) Thanks @lefarcen.
- Earlier question forms, repeated-file read ranges, artifact updates and successful image next steps stay attached to the right turn. Workspace writes stop posing as deliverables, and undesigned auxiliary cards step out of the way. (#7996, #7997, #8019, #8047, #8057, #7920, #7956) Thanks @lefarcen.

### 🔑 Models, media and diagnostics

- AMR media-model chat now respects the model guard, and workspace diagnostics retain bounded environmental evidence when a failure needs explaining. (#7695, #7951) Thanks @Siri-Ray, @lefarcen.
- Client safety telemetry carries platform context and uses canonical monitoring kinds, making real-world errors easier to find and compare. (#7944, #7945)
- OD Next task evidence is preserved in full, so a cancellation, a failure and missing evidence stay distinguishable from one another. (#8220) Thanks @lbjzz-hash.
- Committed AMR compaction work continues instead of replaying from the start. (#7958) Thanks @Siri-Ray.

## 🙏 Thanks to everyone who shipped 0.23.0

@alchemistklk · @lbjzz-hash · @lefarcen · @lorenzozanee · @nettee · @PerishCode · @readwrightexecute · @Siri-Ray
