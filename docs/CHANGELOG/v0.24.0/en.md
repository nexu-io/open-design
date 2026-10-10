---
title: Open Design 0.24.0 — Every Run, Kept Intact
description: Conversations keep their thread across reloads and follow-ups, the preview you chose stays put, rich answers arrive as content instead of markup, a fresh Windows install reaches the app on the first try, and Novita AI joins the BYOK picker.
---

### 🌟 Codename: *Every Run, Kept Intact*

🧭 **`26 PRs` · `13 contributors` · 1 day** — **A run should survive the real  
world, not just the happy path.** Reloads, follow-up questions, preview changes  
and first launches used to be the moments work could lose its place; now the  
project keeps hold of it. 🚀

## 🔥 Highlights

- 🧵 **Conversations keep their thread when the work keeps moving.** Planning  
answers, live task continuations, blocked-task decisions and recovered output  
stay with the task that produced them—even after a reload or a follow-up.  
Forked chats start clean instead of inheriting another conversation’s work.  
A planning-only reply now ends as the answer you received, not as a red failed  
run. (#8322, #8195, #8008, #8007, #8172, #8029, #8158) Thanks @itscheems,  
@lefarcen.
- 🖼️ **Your current preview stays the preview you chose.** Real pages no longer  
turn into blank snapshots, and a stale file read cannot steal the chat preview  
while you are inspecting something else. (#7125, #8067) Thanks @huynextlevel.
- 🃏 **Rich answers arrive as answers, not markup.** Open Design decodes cards  
in the thinking stream and safely drops a malformed card instead of spilling  
its raw data into the conversation. (#8258, #8264) Thanks @lefarcen.
- 🪟 **A fresh Windows install gets to the app, first time.** The packaged app  
no longer mistakes its initial payload state for a failed handoff, so the web  
interface can connect to its local engine on first launch. (#7520) Thanks  
@lorenzozanee.
- 🔑 **Novita AI is ready in the BYOK picker.** Choose Novita AI, bring your  
key, and pick from its current DeepSeek, MiniMax, Qwen, GLM, Kimi and GPT-OSS  
models without hand-building the provider setup. (#6327) Thanks @jax-novita.

> 📥 **Download:**[Open Design 0.24.0](https://github.com/nexu-io/open-design/releases/tag/open-design-v0.24.0).

## ✨ Added

### 🔑 BYOK, models and media

- Novita AI joins the BYOK provider presets with its model catalog and API-key  
management link. (#6327) Thanks @jax-novita.

## 🔁 Changed

### 🧠 Agents, runtimes and sandbox

- Workspace subscriptions reset cleanly when you change profiles, keeping the  
projects and account state in front of you in sync with the workspace you  
actually selected. (#8020) Thanks @AmyShang-alt.
- When both are installed, local Agent detection prefers the direct Copilot CLI  
over VS Code’s bootstrap copy. (#7974) Thanks @tony-box.
- `od automation create` and `od automation update` can again accept  
comma-separated skill context without failing before the command runs.  
(#7612) Thanks @johnkattenhorn.
- `od media generate --help` now shows help without trying to start a generation.  
(#8066)

### 🎨 Studio, editing and canvas

- Manifest-backed Markdown artifacts now count as real run output, and late  
cover rendering reaches a clear final state instead of leaving a misleading  
result behind. (#7586, #8061) Thanks @arccat-114.

## 🐛 Fixed

### 🧠 Agents, runtimes and conversations

- Recovered conversations keep the right task verdicts, outputs and planning  
intent across reloads and continuations. (#8195, #8008, #8007, #8172)
- Forking a conversation no longer carries its source run artifacts into the  
new chat. (#8029) Thanks @lefarcen.
- A continued conversation collapses an unanswered question without pretending  
it was answered. (#8158)
- A planning-stage refusal that still gave you a useful reply keeps the normal  
Done state instead of showing a failed-run card; genuine production failures  
still surface as failures. (#8322) Thanks @itscheems.

### 🎨 Studio, previews and export

- Preview snapshots retain real page content, and delayed file reads cannot  
replace the preview you are actively using. (#7125, #8067) Thanks  
@huynextlevel.
- Valid thinking-stream cards render as cards; invalid ones remain safely out  
of the conversation. (#8258, #8264) Thanks @lefarcen.

### 🌍 Localization

- French copy is complete across the Design System flow, Library and Memory.  
(#7906, #7756) Thanks @davezfr.

### 🖥️ Desktop

- Fresh Windows installations complete the local desktop handoff and can load  
the app normally. (#7520) Thanks @lorenzozanee.

## 🙏 Thanks to everyone who shipped 0.24.0

@AmyShang-alt · @arccat-114 · @davezfr · @huynextlevel · @itscheems · @jax-novita · @johnkattenhorn · @lefarcen · @lorenzozanee · @maoxin1234 · @nettee · @Siri-Ray · @tony-box
