---
title: OpenDesign 0.19.0 — Image Generation, Unlocked
description: Bring ideas to life with your OpenDesign subscription—generate images directly with Seedream 5.0 Pro, GPT Image 2.0, and Nano Banana 2.0.
---

### 🌟 Codename: *Image Generation, Unlocked*

🖼️ **Bring ideas to life with your OpenDesign subscription—generate images
directly with Seedream 5.0 Pro, GPT Image 2.0, and Nano Banana 2.0.**

## 🔥 Highlights

- 🎨 **Three flagship image models, included with your subscription.** Generate
  and edit images directly with Seedream 5.0 Pro, GPT Image 2.0, and Nano
  Banana 2.0 through OpenDesign Cloud. The agent can pass multiple reference
  images and explicit aspect ratio, resolution, and quality settings when the
  selected model publishes them. Requests are checked before generation starts,
  progress remains visible, output paths come from the daemon, and one transient
  post-tool interruption can recover without dropping the result. Video
  generation also runs through the same Vela integration. (#6500)

- 📤 **Export, Share, and Handoff are direct actions again.** The artifact
  viewer no longer hides these flows behind one tabbed popover. Export leads as
  the file-delivery action; Share focuses on links and publishing; Handoff
  returns to its split button. HTML and React component viewers use the same
  structure, and an off-contract editor response no longer crashes the viewer.
  (#6654)

- 🤝 **Shared projects do less wasteful work and recover better.** Team project
  sync now excludes generated trees consistently, bounds background pulls by
  manifest size, and retries failed publishes on a finite backoff. Transient
  workspace-context failures can recover without reusing state from a previous
  account, conversation forks preserve the right boundary, and MCP project
  operations attach to the signed-in workspace. (#6558, #6564, #6595, #6604,
  #6605, #6673)

## ✨ Added

- MCP clients can supply several skills when starting a run; the daemon now
  forwards every selected skill ID. (#6429)
- The Launch Week Vol.01 site publishes five daily drops across localized
  campaign pages. Request-time reveal controls keep unopened content out of the
  page source. (#6647)
- Preview iframe failures now produce bounded diagnostic events, giving support
  a concrete signal when an artifact cannot render. (#6671)

## 🔁 Changed

- Qwen Code model choices now come from the user's own Qwen configuration, with
  the built-in models retained as fallbacks. Keys stored beside those settings
  are not read. (#6546)
- Long speaker notes scroll inside Presenter View instead of being clipped, and
  deck previews recover after returning to a project or loading in a hidden
  browser tab. (#6271, #6519)
- "Files from this turn" counts unique files rather than counting repeated
  writes and edits to the same file. (#6420)

## 🐛 Fixed

### 🧠 Runs and project state

- An older retry generation can no longer close a newer generation, and stale
  successful Design runs stop reattaching on every reload. (#6578, #6600)
- Workspace-dependent writes retry transient authority failures with bounded
  backoff, while account changes still invalidate old workspace context.
  Workspace errors also retain more useful diagnostic codes. (#6604, #6666)
- Deleting a project clears its Design Browser history and viewport cache.
  New comment pins no longer reuse a retired pin number, and invite dialogs no
  longer close from an expired timer. (#6354, #6517, #6580)
- Design systems created outside a workspace can be deleted again. (#6591)

### 🔌 Agents and integrations

- Claude Enterprise authentication is recognized during runtime detection.
  (#6652)
- MCP project tools use the signed-in workspace instead of returning an empty
  project catalog after a workspace-scoped upgrade. (#6595)
- The daemon serves the web app fallback from the configured static root, so
  direct navigation to application routes no longer fails. (#6614)

### 🖥️ Desktop and updates

- Packaged launches refresh the persisted launcher path after an update. MCP
  clients no longer relaunch an old executable and trigger a desktop restart
  loop. (#6621)
- The local `od://` proxy stops retrying immediately when the machine runs out
  of sockets or file descriptors, instead of multiplying the failed requests.
  (#6530)
- Windows uninstall removes only the protocol registration owned by that
  installation, and NSIS preserves the quoted protocol command across install
  and update paths. (#6694, #6699)
- Diagnostic exports retain the previous daemon session log and keep JSONL
  event tails aligned to complete records. (#6531)

## ⚠️ Breaking changes

None.

## 🩺 Known issues

None reported.

## ⬆️ Upgrade note

Install OpenDesign 0.19.0 through the normal in-app update flow or the current
installer after the stable release is available. No additional manual steps
are documented for this release.
