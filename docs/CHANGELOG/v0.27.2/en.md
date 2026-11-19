---
title: "Open Design 0.27.2 — Clearer Quotas"
description: "A focused reliability patch that keeps quota reset times precise, makes project-menu failures easier to read, restores crisp macOS rendering after display changes, and strengthens installed-app update recovery."
---

### 🌟 Codename: *Clearer Quotas, Sharper Displays*

0.27.2 is a focused reliability patch for the 0.27 line. No new surface—just clearer signals when a limit resets, a project action fails, a display changes, or a Mac app updates itself.

## 🐛 Fixed

### 🖥️ Desktop and presentation

- **Mac windows recover their sharpness after a display change.** A wake or monitor move no longer has to leave the app stretched at the wrong scale; refocusing gives the renderer another chance to match the display it is on. (#9409)
- **Installed macOS updates have a steadier handoff.** Payload updates now run through the installed app’s lifecycle, so a failed generation can recover without trapping the next launch on a broken handoff. (#8936) Thanks @PerishCode.

### 💳 Workspace and billing

- **Quota reset times keep the minutes that matter.** When a reset is days away, the quota panel now still tells you the remaining minutes instead of making the deadline feel less precise than it is. (#9328)
- **A failed move to team space now looks like a failure.** Project-card menu errors use the same clear error treatment as the rest of the workspace, so the next action is easier to judge. (#9409)

> 📥 **Download:**[Open Design 0.27.2](https://github.com/nexu-io/open-design/releases/tag/open-design-v0.27.2).

## 🙏 Thanks to everyone who shipped 0.27.2

@PerishCode · @lefarcen · @alchemistklk
