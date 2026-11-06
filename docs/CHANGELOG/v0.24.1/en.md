---
title: "Open Design 0.24.1 — A Steadier Handoff"
description: "A focused reliability patch that preserves diagnostic evidence, makes desktop update restarts safer, keeps successful blocked runs honest, restores the fullscreen exit control in every theme, and improves OD Next and MCP failure handling."
---

0.24.1 is a focused stability and reliability patch for the 0.24 line. No new surface—just fewer dead ends when an app restarts, a run settles, or support needs to see what happened.

## 🐛 Fixed

### 🧠 Agents, runtimes and diagnostics

- **A cleanly finished run stays visibly finished.** A task-level block no longer turns a clean agent exit into a misleading failed-run card; real crashes and failed exits still remain failures. (#8350) Thanks @itscheems.
- **Support bundles retain the clues that matter.** Diagnostics now carry daemon health evidence for memory pressure, SQLite growth and unclean exits, whether you export from the app or with `od diagnostics export`. (#8354) Thanks @PerishCode.
- **OD Next sandboxed runs clean up after themselves.** The run input access root remains writable for sandbox teardown instead of leaving a run stranded on cleanup. (#8024) Thanks @arqueon.
- **Fatal MCP failures say what happened.** An MCP stdio process now writes its fatal error before it exits, so the client has a usable diagnostic instead of a silent disappearance. (#7340) Thanks @lorenzozanee.

### 🖥️ Desktop and presentation

- **Updating the desktop app no longer races its own shutdown.** Renderer traffic is stopped before the packaged runtime retires, making the restart handoff safer. (#8348) Thanks @PerishCode.
- **The fullscreen exit button belongs to the theme you chose.** Its colors, hover state and keyboard focus now remain readable in both light and dark presentations. (#7272) Thanks @dennytosp.

> 📥 **Download:** [Open Design 0.24.1](https://github.com/nexu-io/open-design/releases/tag/open-design-v0.24.1).

## 🙏 Thanks to everyone who shipped 0.24.1

@PerishCode · @itscheems · @lefarcen · @simpleqt · @arqueon · @dennytosp · @lorenzozanee
