---
title: "Open Design 0.26.0 — Share the Work, Bring Feedback Back"
description: "Share interactive work and motion video with a team or client, collect comments in context, and carry the feedback back into the next Agent-assisted revision."
---

### 🌟 Codename: *Share, Review, Refine*

🔗 **The work can leave the project—and the feedback can find its way home.** Share an interactive design or motion video with the people who need to review it; let them watch, try it, and comment in context. Then choose the feedback that matters, send it to an Agent, and keep the review connected to the next round of making.

## 🔥 Highlights

- 🎞️ **Motion Design—make the idea move.** Motion Design now appears on Home and in Community, with curated helpers and examples. Start from an editable source, create motion for a video brief, and export an MP4 when the work needs to travel. (#8619)
- 🔗 **One link for the team and the client.** Copy a work link and send it out: signed-in reviewers can view and try the work in a browser, without installing the desktop app. Motion videos can travel the same way. The shared page shows the work preview and its comments—not the project's AI conversations or code view. (#8408) Thanks @alchemistklk.
- 💬 **Comment on the part that needs changing.** Select the place in the work that needs attention and leave a comment such as “make this title stand out” or “change this button color.” Everyone sees the same feedback on the same page, with less screenshot markup and fewer clarification loops. (#8408) Thanks @alchemistklk.
- 🤖 **Bring feedback back to the project—and hand the revision to an Agent.** Comments sync into Open Design. Select the feedback to act on, send it to an Agent, then review the result before the next pass. (#8408) Thanks @alchemistklk.
- 🔄 **Update the work, not the link.** After a revision, manually refresh the shared content and reviewers can keep using the same URL. They see that a newer version is available and can refresh to view it; end the share whenever the review is done. (#8408) Thanks @alchemistklk.
- 🧩 **Plugins stay attached to the work you send.** Applying a plugin in an existing project now preserves its selected snapshot and respects the capabilities you already granted. (#7597) Thanks @lorenzozanee.
- 🧠 **Bring the model you actually use.** During BYOK onboarding, enter a custom model instead of being limited to the suggested list—useful for local Ollama, self-hosted endpoints, and newer models. (#6076) Thanks @dpeterson01.
- 🌀 **A stuck chat can find its way back.** When a chat log stops following its layout, Open Design recovers scrolling and keeps wheel and keyboard navigation available. (#8251) Thanks @lefarcen.
- 🖼️ **Finished work shows up where you expect it.** After a run creates an image or file, Open Design refreshes its snapshot and opens the result by the existing rules—without taking over a preview you selected yourself. (#8744)

> 📥 **Download:** [Open Design 0.26.0](https://github.com/nexu-io/open-design/releases/tag/open-design-v0.26.0).

## ✨ Added

### 🎨 Studio, editing and canvas

- Motion Design adds curated skills, bundled examples, editable sources, and MP4 production for video-oriented work. (#8619)

### 🔑 Models and plugins

- BYOK onboarding accepts custom model names alongside the built-in suggestions. (#6076) Thanks @dpeterson01.
- Existing projects retain the plugin snapshot and granted capabilities chosen for an apply. (#7597) Thanks @lorenzozanee.

## 🐛 Fixed

### 🤝 Sharing and collaboration

- Signed-in reviewers can view and interact with shared work or motion video in the browser; shared pages intentionally keep project AI conversations and code views private. (#8408) Thanks @alchemistklk.
- Contextual comments sync back to the project, where selected feedback can be sent to an Agent for the next revision. (#8408) Thanks @alchemistklk.
- A shared work link stays stable across manually refreshed revisions and can be stopped when the review is complete. (#8408) Thanks @alchemistklk.
- Existing cloud file identities and aliases are recovered before publishing, so resumed or updated shares keep their original links when local mappings are missing. (#8859, #8867) Thanks @alchemistklk.
- Uploading duplicate filenames in one batch keeps names and contents in submission order. (#8742)

### 🧠 Agents, runs and Home

- Home keeps a draft blocked when funding confirmation is insufficient or unknown; billing changes refresh the hint without sending that draft for you. (#8688, #8775, #8786)
- The default AMR model is resolved from the caller's available catalog, avoiding an avoidable first-run failure. (#8519) Thanks @Siri-Ray.
- Cached offline content now respects revocation and expiry across restarts. (#8676)

### 🖥️ Desktop and workspace

- Workspace users can complete the desktop update safety check without an unscoped active-run request blocking restart. (#8462) Thanks @Siri-Ray.
- A saved empty local file selection survives restore instead of being replaced by a default artifact. (#8745) Thanks @open-design-crew.

## 🙏 Thanks to everyone who shipped 0.26.0

@alchemistklk · @hihicheems · @Siri-Ray · @dpeterson01 · @lefarcen · @lorenzozane
