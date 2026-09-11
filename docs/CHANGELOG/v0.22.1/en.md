---
title: Open Design 0.22.1 — Smoother design runs and recovery
description: OD Next becomes the default for supported design tasks, while clearer failures, reliable retries, steadier chat scrolling, and final syntax checks help you keep creating.
---

Open Design 0.22.1 builds on 0.22.0 with a simpler start for supported design tasks and clearer ways to recover when a run goes wrong.

## 🔁 Changed

- 🧭 **Start supported design tasks with OD Next.** Prototypes, slide decks, marketing designs, and Hyperframes videos use OD Next by default on supported agents. Settings → Labs → Design Harness still lets you turn it off, and an existing choice to disable it stays respected. (#7876)
- 🧰 **Keep design work focused.** OD Next uses more concise tool guidance, clearer completion instructions, and the active run's workspace when loading media skills. (#7804)

> 📥 **Download:** [Open Design downloads](https://open-design.ai/download/).

## 🐛 Fixed

### 💬 Conversations & recovery

- 🛟 **A failed run keeps a useful next step.** Failure cards survive returning to a conversation, retain timeout and retry information, and keep Retry available when the current chat cannot switch the run to Cloud. (#7871, #7884, #7897) Thanks @lefarcen.
- 🔑 **An invalid API key points you to the right fix.** Bring-your-own-key authentication errors have their own explanation and a shortcut to model settings. (#7893) Thanks @lefarcen.
- 🗺️ **Get clearer explanations for run and preview problems.** Messages for unavailable models, unsupported capabilities, timeouts, missing preview files, and regional restrictions give more specific guidance. (#7887) Thanks @lefarcen.
- 📝 **Keep your answers when sending fails.** If a clarification answer cannot start a run, it remains in the conversation with a Retry action that resends the same answer. Internal routing text stays hidden. (#7900) Thanks @lefarcen.
- 📜 **Keep following a reply as it grows.** A browser scroll adjustment no longer silently switches off automatic following. Scrolling up yourself still lets you read earlier messages. (#7898) Thanks @lefarcen.

### 🎨 Design & delivery

- 💬 **A greeting gets a reply.** OD Next no longer invents a website for a greeting or a request that does not call for a design, and an explained blocked result avoids a duplicate failure card. (#7725)
- ✅ **Catch syntax problems before a web deliverable succeeds.** Eligible web deliverables receive a final syntax check of their HTML and related scripts. Unambiguous repairs can happen without another agent turn; unresolved errors or incomplete checks prevent the run from reporting a successful delivery. (#7801) Thanks @lbjzz-hash.
- 🧩 **Continue the brief you just collected.** The official Codex plugin accepts the workflow identifier returned by brief collection when confirming that brief, while still rejecting mismatched identifiers. (#7779) Thanks @taljeon.

### 🗂️ Workspace & settings

- 🔗 **Reference projects from the workspace you are using.** Project references list the active workspace's projects and refresh when you switch workspaces. (#7701)
- 🤖 **See which model a local CLI actually used.** Connection tests show the resolved model behind a rolling alias, making the result easier to check. (#6386) Thanks @MumuTW.
- 🇫🇷 **More consistent French guidance.** Settings and recovery messages, along with core documentation, use updated French wording. (#7753, #7754) Thanks @davezfr.
- 🌍 **Social-link hints follow your language.** Navigation tooltips are localized and support right-to-left layouts. (#7665)

### 🖥️ Installation & Docker

- 🖼️ **Browse bundled plugins with previews in Docker.** Plugin posters and hover clips are available again in Docker installations. (#7028) Thanks @jiulongche.
- 📁 **Respect existing contents when choosing a download location.** Directories and symbolic links with names resembling system clutter are no longer mistaken for ignorable system files when deciding whether a download folder can be adopted. (#7718) Thanks @mikemikimike.

## 🙏 Thanks to everyone who shipped 0.22.1

@MumuTW · @davezfr · @jiulongche · @lbjzz-hash · @lefarcen · @mikemikimike · @taljeon
