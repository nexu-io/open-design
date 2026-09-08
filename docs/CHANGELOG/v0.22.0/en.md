---
title: Open Design 0.22.0 — Sota Design now on open models
description: Creation should never make you guess what just happened. Runs used to lose their thread exactly when a tool, model, project, or desktop edge case got interesting—now the work carries its artifacts, explanation, and next step with it.
---

### 🌟 Codename: *Sota Design now on open models*

🔎 **`66 PRs` · `10 contributors` · `7 days`** — **Creation should never make you guess what just happened.** Runs used to lose their thread exactly when a tool, model, project, or desktop edge case got interesting → now the work carries its artifacts, explanation, and next step with it. 🚀

## 🔥 Highlights

- 🧭 **Runs that keep their evidence.** Files, covers, references, produced output, steering, and recovery now travel with a conversation instead of disappearing into a vague finished state. (#7518) Thanks @lefarcen.
- 🛟 **Failures that explain what to do next.** ACP, model, permission, quota, and runtime problems preserve the useful cause, so a failed run is a decision point—not a dead end. (#6267, #7316, #7429, #7458, #7534, #7647) Thanks @helsome, @Siri-Ray.
- 🎬 **Media work that survives the real world.** Image and video tasks recover more reliably in packaged Open Design, and Team projects keep their own billing context while they do. (#7504, #7723, #7746) Thanks @alchemistklk, @lbjzz-hash.
- 🪟 **The desktop app feels installed, not fragile.** First-launch controls, macOS Home readiness, update placement, and app-link handoff now hold up where people actually use the product: the shipped app. (#7479, #7482, #7535, #7688, #7700) Thanks @lefarcen, @Siri-Ray, @alchemistklk.
- 🧩 **Previews keep their place.** HTML-rich designs, Deck covers, old thumbnail navigation, and edit handoffs retain the structure and state you were working with. (#7421, #7422, #7556, #7558, #7568, #7592, #7651) Thanks @lefarcen, @Siri-Ray.

> 📥 **Download:** Tag [`open-design-v0.22.0`](https://github.com/nexu-io/open-design/releases/tag/open-design-v0.22.0).

## ✨ Added

### 🧠 Agents, runtimes & sandbox

- 🧰 **Codex sessions have a steadier home.** Open Design can carry a Codex app-server conversation through streaming replies and tool work without making the result feel like a black box. (#7518) Thanks @lefarcen.
- 🧪 **Labs keeps experimentation understandable.** Design Harness has a clear settings home, persists its choice, and explains when a policy owns the decision. (#7445, #7514) Thanks @lefarcen.
- 🖼️ **Real subjects get real imagery.** Ask for a named person, product, artwork, event, or place and Open Design reaches for the real thing instead of a convincing impostor. (#7436)
- 🧑‍💻 **Standalone Terminal work has a real lifecycle.** Start, finish, cancel, and return without leaving a ghost session behind. (#7716, #7742) Thanks @PerishCode.

### 🔑 Models & media

- 🤖 **More honest model choices.** New model IDs are discoverable, retired models explain themselves, and AMR no longer promises unlimited access where limits apply. (#7401, #7544, #7627, #7686) Thanks @koeseo, @Siri-Ray, @lefarcen.
- 🔗 **Team projects remain visible after a bad sync.** A transient sync failure no longer hides work your team has already published. (#7781, #7785)

## 🐛 Fixed

### 🎨 Studio, editing & canvas

- 🗂️ **Open the project you meant to open.** Project entry no longer invents facts it cannot know, and artifact-upgrade prompts stay with the active project. (#7428, #7689, #7696) Thanks @lefarcen, @Siri-Ray.
- 💬 **A visible question can be answered.** Clarification forms keep the run alive long enough to receive the answer—and receive it once. (#7509, #7512)

### 🖥️ Desktop & setup

- ✅ **Onboarding checks the engine before asking you to continue.** Invalid runtime setup is caught early, with a path forward instead of a later mystery failure. (#7440, #7743)
- 🌐 **The app link returns to the app.** Packaged Open Design keeps its normal sign-in and invite handoff while development builds stop claiming the system link. (#7479) Thanks @lefarcen.

### 🌍 Interface & language

- 📣 **The right sunset notice speaks the right language.** Go Plan messaging now reaches its intended audience with the selected locale intact. (#7453, #7477) Thanks @nettee.

## 🙏 Thanks to everyone who shipped 0.22.0

@AmyShang-alt · @PerishCode · @Siri-Ray · @alchemistklk · @helsome · @koeseo · @lbjzz-hash · @lefarcen · @nettee · @simpleqt
