---
title: "Open Design 0.27.0 — Create Together"
description: "Invite teammates to share projects and workspace credits, turn reference videos into editable motion, and keep feedback and revisions moving together."
---

### 🌟 Codename: *Create Together*

🤝 **Bring the team into the work.** Invite colleagues without paying per seat, share your workspace's credits, and choose which projects the team can see. For your next motion piece, start from a reference video or one of thirteen new templates, then keep the conversation and feedback connected to the next revision.

## 🔥 Highlights

- 🤝 **Invite colleagues, share the workspace.** Send email invitations from onboarding or Home, let teammates join your workspace, and collaborate on shared projects. Invitations show which emails succeeded and which need another attempt, so you can retry failed entries without sending successful invitations again. (#9120)
- 💳 **One workspace, shared credits.** See the workspace's shared Design Plan and metered allowance, with plan and model availability refreshed when the subscription changes. When balance or concurrency prevents a task from starting, your draft stays available; resolving the limit leaves you in control of when to send again. (#9120, #9138)
- 🔐 **Choose what the team can see.** Set a project's visibility to yourself or team members, including in the default Personal workspace. Keep workspace visibility separate from publishing a work link for review. (#9120, #9193)
- 🎞️ **Start your motion piece from a reference video.** Attach a video or paste a supported video link and ask for a recreation. The Agent can inspect its timing, scenes and soundtrack, build editable motion, and export an MP4. Ask to change a specific element for a focused revision; results still need your review. (#9105)
- 🎨 **Thirteen more ways to get moving.** New Motion templates cover product launches, ticket promotions, explainers, kinetic typography and more. Titles, descriptions, starter prompts and input labels follow all 19 supported client languages, with improved preview font loading and sizing. (#9131)
- 🧠 **Planning and making read as one task.** Automatic planning and production share one expandable process and a running total of elapsed time. Steps stay in order, while the final answer and deliverables remain easy to find outside the process. (#8735, #9196)
- 💬 **Keep the feedback you already have.** A failed comment refresh keeps existing comments visible with a retry action. Read status follows the comments actually shown, and saved location markers stay aligned with the selected comment. (#9027) Thanks @alchemistklk.
- 🗂️ **Recent projects follow your work.** Home and the project list sort by your latest accepted message or manual retry. Opening a project, renaming it or receiving an Agent reply no longer pushes it ahead of work you just started. (#8802) Thanks @alchemistklk.

> 📥 **Download:** Find desktop installers on [GitHub Releases](https://github.com/nexu-io/open-design/releases).

## ✨ Added

### 🤝 Team collaboration

- Workspace invitations include registration and join flows, role descriptions, delivery status and retry for failed recipients. (#9120)
- Shared workspace allowance and plan information are available from Home and projects; subscription changes refresh the available model catalog. (#9120)
- Project visibility controls are available in Personal workspaces as well as team workspaces. (#9120, #9193)

### 🎞️ Motion creation

- Reference-video inspection and side-by-side comparison help the Agent work from measured scene timing and review the resulting film. Reference audio is reused by default when present; unavailable links ask for an upload instead. (#9105)
- Thirteen bundled Motion templates add more starting points, including SuperX Audience Growth, TixFox Ticket Promo, Windows Studio Launch and DistilBook Explainer. (#9131)

## 🔁 Changed

- Automatic planning and production use one task presentation with consistent timing and chronological process details. (#8735, #9196)
- Project indicators, turn headers and notifications use consistent running, stopped, failed and reply-needed states. Question forms wait for your answer instead of submitting automatically after ten minutes. (#8860) Thanks @Siri-Ray.
- Recent-project ordering follows accepted human submissions; queued messages retain their original submission time when execution begins. (#8802) Thanks @alchemistklk.
- Sharing publishes the file currently saved on disk. Merely opening editing or annotation tools no longer blocks sharing with a save-state warning; copying a link does not publish changes, and refreshing shared content remains an explicit action. (#9025, #9202) Thanks @alchemistklk.

## 🐛 Fixed

### 💬 Conversations and Agents

- Text already streamed by OD Next survives a failed or stopped run, including after reopening the conversation. (#8903) Thanks @Siri-Ray.
- Large conversation histories can finish loading while data continues to arrive; switching conversations or cancelling releases the old connection. (#8771) Thanks @alchemistklk.
- A queued message leaves its queue card as soon as sending starts. If a balance check blocks it, the intact draft returns to the queue. (#8381) Thanks @Siri-Ray.
- OpenCode-backed runs can read verified task instructions and files they created in the system temporary directory, avoiding runs that end without a useful reply. (#9060, #9077) Thanks @HaiYangBG1, @Siri-Ray.
- Workspace image snapshots, thumbnails, video covers and download links retain the correct project context, including after refresh or reopening. (#9151)

### 🤝 Sharing, comments and workspace access

- Link sharing and workspace-visibility controls load and retry independently, so a problem in one does not clear the other. (#9025) Thanks @alchemistklk.
- Comment-read tracking no longer skips unseen comments in other files or late-arriving comments; delayed responses cannot replace a different project's comment list. (#9027) Thanks @alchemistklk.
- Comment location markers remain consistent across supported preview modes, with a clear fallback when the target has been removed. (#9027) Thanks @alchemistklk.
- Max workspace concurrency notices consistently ask owners, administrators and members to wait for another task to finish. (#9138)
- Home invitations and registration copy follow the selected language, with invitation subtitles wrapping correctly in small windows and right-to-left languages. (#9207, #9208) Thanks @qd1993102.

### 🖥️ Window and dialog behavior

- Campaign dialogs keep content and buttons reachable when resizing or zooming. Background pages retain their scroll position, and keyboard focus stays with the topmost dialog. (#9149, #9179)

## 🙏 Thanks to everyone who shipped 0.27.0

@alchemistklk · @Siri-Ray · @HaiYangBG1 · @qd1993102
