---
title: OpenDesign 0.18.1
description: DeepSeek V4 Flash is unlimited for every paid plan from August 6 to August 13, and 0.18.1 brings the offer into the app — alongside fixes for the first week of Team Workspace on production.
---

🎁 **`24 PRs` · `9 contributors` · `2 days`** — **DeepSeek V4 Flash is unlimited for one week, and 0.18.1 puts it where you actually work.** August 6 20:00 → August 13 20:00 (Asia/Shanghai): every paid plan gets unlimited DeepSeek V4 Flash on OpenDesign Cloud — it doesn't eat your plan's quota, doesn't carry over, and there's nothing to claim. 0.18.1 also cleans up the first week of Team Workspace on production: the 502 storm, the file grid that crawled, the BYOK picker that forgot your models. 🚀

## 🔥 Highlights

- 🎁 **DeepSeek V4 Flash — unlimited, August 6–13.** *A fast model you have to spend quota on carefully is the one you reach for least.* For one week, every paid plan gets DeepSeek V4 Flash unlimited on OpenDesign Cloud — and 0.18.1 brings the offer into the app instead of leaving it on the pricing page: the home screen tells you it's live, the model picker carries an **Unlimited** badge, and one click switches you over. It runs on top of your plan, not out of it — your normal quota is untouched, and on August 13 at 20:00 everything returns to standard rules. (#6507)

- ☁️ **A cloud blip stops taking the workspace down with it.** *The packaged app could get stuck in a 502 loop — a failing presence call retried on a tight heartbeat until the whole workspace felt broken.* 0.18.1 backs the heartbeat off, relays what the server actually said instead of a generic failure, and replays proxied requests that deserve a second chance. A cloud outage now looks like a bad minute, not a broken install. (#6521)

- ⚡ **Design files that open at speed.** *Projects with a lot of files made the grid render everything at once and fetch every thumbnail up front.* Now the grid renders what you can see and fetches thumbnails as you scroll — big projects open in a fraction of the time. (#6513)

- 🔑 **Your own models, back in the picker.** *BYOK models had gone missing from the home and composer pickers — you'd configured a provider and still couldn't switch to it.* Fixed: your provider's model catalogue is selectable again from both places — and providers that don't offer one, like Azure's free-form deployment names, still show the current model as a readout instead of an empty panel. (#6515)

- 🚀 **A shorter first run.** Choosing where your models come from used to be a detour before your first prompt. The onboarding model-source step is now a single, streamlined choice. (#6475) Thanks @Siri-Ray.

> 📥 **Download:** Tag `open-design-v0.18.1`.
>
> | Platform | Architecture | Asset |
> |---|---|---|
> | macOS | Apple Silicon (arm64) | [open-design-0.18.1-mac-arm64.dmg](https://github.com/nexu-io/open-design/releases/download/open-design-v0.18.1/open-design-0.18.1-mac-arm64.dmg) |
> | macOS | Intel (x64) | [open-design-0.18.1-mac-x64.dmg](https://github.com/nexu-io/open-design/releases/download/open-design-v0.18.1/open-design-0.18.1-mac-x64.dmg) |
> | Windows | x64 | [open-design-0.18.1-win-x64-setup.exe](https://github.com/nexu-io/open-design/releases/download/open-design-v0.18.1/open-design-0.18.1-win-x64-setup.exe) |

## ✨ Added

- **Signing in hands you back to the app.** Approve a sign-in in your browser and the desktop app comes back to the front on its own — including when it was minimized, which previously left it sitting in the Dock looking like nothing happened. (#6410) Thanks @elifive555555.

- **Export what a run actually did.** When a run goes sideways, you can now export its execution diagnostics instead of describing the symptom from memory. (#6433) Thanks @bone3deep1962-collab.

## 🐛 Fixed

### 🏠 Workspace & projects

- **Projects no longer open into the wrong scope.** When workspace bootstrap arrived late, a project could settle against the wrong workspace and stay stuck loading — leaving the whole workspace read-only until you refreshed. It now waits for the answer. (#6504)

- **The campaign badge sits above the workspace tabs**, not behind them, and free personal accounts see the prompt written for them instead of the paid-user wording. (#6507)

### 🔌 Integrations & plugins

- **Briefs stop bleeding between publications.** Confirmed brief context is cleared after publication, so the next brief starts clean. (#6442) Thanks @itscheems.

- **The Codex plugin page installs what it says it installs.** Corrected the plugin page and simplified the install entry point. (#6393, #6474) Thanks @xne998808-ai, @joeylee12629-star.

### 🌍 Localization

- **"New project folder" speaks your language.** (#5977) Thanks @mturac.

## 🙏 Thanks to everyone who shipped 0.18.1

@AmyShang-alt · @bone3deep1962-collab · @elifive555555 · @itscheems · @joeylee12629-star · @lefarcen · @mturac · @Siri-Ray · @xne998808-ai
