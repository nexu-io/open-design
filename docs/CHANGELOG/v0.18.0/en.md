---
title: Open Design 0.18.0
description: Open Design 0.18.0 introduces Team Workspace—a shared home where design teams can share projects, review updates, comment in context, and reuse the same design systems, plugins, and skills. With the new Open Design plugin for Codex, that collaborative workspace now extends directly into Codex.
---

### 🌟 Codename: *Design Team Workspace. Now in Codex.*

🤝 **`115 PRs` · `22 contributors` · `2 days`** — Open Design 0.18.0 introduces Team Workspace—a shared home where design teams can share projects, review updates, comment in context, and reuse the same design systems, plugins, and skills. With the new Open Design plugin for Codex, that collaborative workspace now extends directly into Codex. 🚀

## 🔥 Highlights

- 🤝 **Team workspaces — your team gets a home.** *Collaboration used to mean leaving Open Design: export the file, paste the screenshot, chase the latest copy.* Now a **Team workspace** lives right next to your personal one. Create it, switch into it, and invite colleagues with a role through a seat-aware invite flow — everyone lands in the same place, signed in through one Open Design Cloud account. (#6142, #6459)

- 🚀 **Open Design for Codex — in case you missed 0.17.0.** *The last release lived for exactly two days, so its headline rides again:* Codex Desktop and CLI can call Open Design as a complete creative engine. Confirm a visual brief, choose Open Design Cloud or a supported local runtime, and receive a real Preview or Studio result. The signed Open Design runtime starts headlessly when needed, so there is no second app to keep open and no stack to wire together by hand. Upgrading from 0.16.x? This one is new to you too. (#6055, #6273, #6362 — shipped in [0.17.0](https://github.com/nexu-io/open-design/releases/tag/open-design-v0.17.0))

- 🔌 **And Codex doesn't lose Open Design anymore.** External MCP hosts — Codex and friends — used to go dark if Open Design's local service came back on a different port after a restart. The connection now finds its way home on its own, so `@open-design` keeps working across restarts without re-setup. (#6391)

- 📁 **Shared projects that stay current on their own.** Move a project into the team space and every member gets a live read-only mirror: content auto-pulls as the owner works, presence avatars show who's looking, transfer progress is visible, and comments flow both ways — including from viewers in read-only mode. Nobody re-sends anything, and "is this the latest?" stops being a question. (#5281, #5283, #5395, #6294)

- 🧰 **Share the toolkit, not just the files.** Design systems, plugins, and skills can now be shared to the team, so the house style and the house tricks travel together — a teammate picks up the same brand kit and the same workflows without a setup call. (#5242, #5250, #5551) Thanks @PerishCode.

- 💳 **Billing that follows the workspace.** Balances, top-ups, and run charges are attributed to the active workspace instead of your personal account — team work bills the team, personal work stays personal, and the plan nameplate always tells you which pocket you're spending from. (#6067, #6182, #6219)

- 🎨 **A home worth coming home to.** The workspace redesign lands across the home hero, rail, tabs, and template/plugin detail surfaces — joined by a message center, a What's-new panel fed by real release data, and a quieter, restyled update reminder. (#6156, #6162, #6281) Thanks @wangchenglong0001.

- 🏁 **Agents finish what they start.** Sessions that stalled right after a tool call now pick themselves back up, Kiro runs complete their turns cleanly instead of hanging at the finish line, and when an AMR run genuinely stalls, the app can finally tell you why instead of shrugging. (#6237, #6268, #6040) Thanks @Siri-Ray.

- 🙋 **A required question is no longer a locked door.** When the agent asks something you can't or don't want to answer, skip it and keep moving — the agent works with what it has instead of holding your run hostage. (#6177)

- 🕵️ **Clone Audit — know a clone is safe before you ship it.** The new community plugin inspects a cloned site the way a reviewer would: visual fidelity, leftover tracking scripts, source-brand and language residue, placeholders, and risky external dependencies — then hands you an evidence-based report with file-and-line receipts and a clear deployment verdict. (#5687) Thanks @bestthanapon.

> 📥 **Download:** Tag `open-design-v0.18.0`.
>
> | Platform | Architecture | Asset |
> |---|---|---|
> | macOS | Apple Silicon (arm64) | [open-design-0.18.0-mac-arm64.dmg](https://github.com/nexu-io/open-design/releases/download/open-design-v0.18.0/open-design-0.18.0-mac-arm64.dmg) |
> | macOS | Intel (x64) | [open-design-0.18.0-mac-x64.dmg](https://github.com/nexu-io/open-design/releases/download/open-design-v0.18.0/open-design-0.18.0-mac-x64.dmg) |
> | Windows | x64 | [open-design-0.18.0-win-x64-setup.exe](https://github.com/nexu-io/open-design/releases/download/open-design-v0.18.0/open-design-0.18.0-win-x64-setup.exe) |

## ✨ Added

### 🏠 Home, projects & landing

- **The plugin catalog has a front door.** A dedicated landing page introduces Open Design plugins to newcomers before they ever install the app. (#6241) Thanks @joeylee12629-star.

- **The Codex agent page now answers the question people actually ask.** Sharper positioning and content for anyone searching for a Codex UI. (#6200) Thanks @joeylee12629-star.

## 🔁 Changed

- **Open Design ships light-first.** The new workspace surfaces are tuned for the light appearance, so the theme setting is retired for now and every install returns to light. (#6168)

## 🐛 Fixed

### 🎨 Studio & interface

- **The in-app browser preview remembers your viewport.** Pick a device size once and it stays picked, instead of resetting between sessions. (#4899) Thanks @HD-L.

- **Deleted projects no longer haunt your tabs.** Removing a project also clears its saved tab layout, so stale workspace state stops resurfacing. (#5761) Thanks @EthanGuo-coder.

- **Azure deployment names are editable again.** BYOK users on Azure can correct a deployment name without fighting the form. (#6034) Thanks @mturac.

### ☁️ Cloud & reliability

- **Billing checks back off instead of hammering.** When the Cloud billing endpoint is unreachable, the app now retries politely on a backoff curve rather than flooding a failing connection. (#6446)

## 🙏 Thanks to everyone who shipped 0.18.0

@AmyShang-alt · Bassi · @bestthanapon · @bone3deep1962-collab · @crumgary · @elifive555555 · @EthanGuo-coder · @hanyuanxi · @HD-L · @itscheems · @joeylee12629-star · @lefarcen · @mrcfps · @mturac · @nettee · @PerishCode · @shangxinyu1 · @Siri-Ray · @wangchenglong0001 · @xiaoche-hub · @xne998808-ai · @xxiaoxiong
