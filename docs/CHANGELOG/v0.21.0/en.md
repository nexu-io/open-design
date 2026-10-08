---
title: Open Design 0.21.0 — Reliable, Start to Finish
description: From Agent connections to live HTML previews and app relaunches, Open Design 0.21.0 makes the entire creation experience more reliable—and easier to recover when something goes wrong.
---

### 🌟 Codename: *Reliable, Start to Finish*

🛡️ **42 PRs · 13 contributors · 4 days** — **From Agent connections to live
HTML previews and app relaunches, Open Design 0.21.0 makes the entire creation
experience more reliable—and easier to recover when something goes wrong.** 🚀

## 🔥 Highlights

- 🖼️ **HTML previews stay visible, live and correctly wired.** Multi-file
  artifacts keep their scripts, styles, images, modules and relative requests;
  switching projects, files or Code/Preview no longer sends Electron through the
  navigation races that could leave a complete document painted as a white
  frame. Presentation mode also gains a dependable way out, and clicking the
  preview dismisses its viewport menu like clicking anywhere else. (#7336,
  #7358) Thanks @lefarcen.

- 🧰 **A working agent no longer disappears behind a broken shim.** OpenDesign
  keeps searching when an earlier executable on PATH is stale, leaves a real
  diagnostic and repair action when nothing can launch, and supports the
  DeepSeek Harness release line users actually receive. The one-line installer
  finishes instead of getting trapped in dependency resolution. (#7153, #7339)
  Thanks @lefarcen.

- 🌙 **Kimi works again on 0.37 and newer.** Those releases stopped accepting the
  stdio MCP transport that OpenDesign attached to every session, turning nearly
  every run into an opaque handshake error. OpenDesign now sends only the
  transports each Kimi build accepts, so a message produces a streamed reply
  again instead of failing before the work begins. (#7313) Thanks @lefarcen.

- 🚪 **Relaunching the app recovers from a stale local engine.** A web sidecar
  left behind by a crash could hold the app's socket and make every later launch
  quit at startup. OpenDesign now reclaims that stale owner safely, and its
  daemon and web processes shut down with the desktop app instead of haunting
  the next launch. (#7279) Thanks @mrcfps.

- 🤖 **Coding Plan model access follows the account you are actually signed
  into.** The model picker and unlimited-use badges now read the authenticated
  entitlement list instead of relying on a hard-coded tier snapshot. DeepSeek V4
  Flash Vision Exp also joins the unlimited lineup across paid Personal plans,
  with clearer activation guidance when an older client has not picked up the
  entitlement yet. (#7289, #7250) Thanks @Siri-Ray.

- 🧠 **AI Optimize runs once, even when the click happens twice.** Two entry
  points could start the same hidden design-system refinement within
  milliseconds, charging twice and racing to rewrite the same files. The client
  now stops the duplicate before it leaves, and the daemon enforces the same
  single-run boundary across tabs and external clients. (#7271) Thanks
  @lefarcen.

- 💳 **Pricing actions now tell the truth before checkout does.** Current
  interval, pending changes, cancellation state, unavailable moves and Team
  billing all appear where the decision is made. Go is clearly sold out, its old
  in-app campaign is gone, and the remaining DeepSeek campaign gives paid and
  unpaid users one consistent path instead of competing promotions. (#7228,
  #7239, #7240, #7352, #7361) Thanks @Siri-Ray.

- 🌐 **Website Clone leaves its prompt behind when you leave the tab.** The
  localized “clone this site” scaffold no longer follows you into Slide Deck,
  Image, Document, HyperFrames, Video or Audio. Add your own URL and the draft is
  still yours; leave the guide untouched and the next creation mode starts
  clean. (#7344) Thanks @lefarcen.

- 🔌 **Long-running MCP sessions can stay alive as long as the work requires.**
  The familiar 30-minute idle behavior remains the default, while
  `OD_MCP_STDIO_IDLE_EXIT_MS` can choose a longer boundary — up to 24 hours — or
  disable idle exit for clients that deliberately keep a session quiet between
  calls. (#7288) Thanks @huytdps13400.

## ✨ Added

### 🧠 Agents, runtimes and automation

- `OD_MCP_STDIO_IDLE_EXIT_MS` configures the stdio MCP idle lifetime; `0` keeps
  the process alive until the client disconnects. (#7288) Thanks @huytdps13400.

### 🔑 Models, plans and media

- Coding Plan model availability and unlimited badges now follow the live,
  authenticated entitlement list. (#7289) Thanks @Siri-Ray.
- DeepSeek V4 Flash Vision Exp is unlimited on Go, Plus, Pro and Max, and the
  Pricing page explains how to refresh a delayed entitlement on older clients.
  (#7250)

## 🔁 Changed

- The public Pricing page follows the signed-in subscription's interval and
  state, disables moves checkout would reject, restores the account entry where
  billing context matters, and makes plan/model details easier to expand and
  compare. (#7228, #7239, #7240) Thanks @Siri-Ray.
- Go remains visible to existing subscribers but is marked sold out for new
  purchases; the client no longer shows its old campaign badge or welcome modal.
  (#7352, #7361) Thanks @Siri-Ray.
- Every community entry now leads to Discord, including the Chinese desktop,
  site and documentation surfaces that previously split the community across
  Feishu and Discord. (#7295) Thanks @joeylee12629-star.
- The account avatar's first click now pins its menu open; a second click,
  Escape, an outside press or navigation closes it explicitly. (#7330) Thanks
  @Siri-Ray.
- Empty Skills sources disappear from the filter and return automatically when
  they contain something to browse. (#7298) Thanks @nettee.

## 🐛 Fixed

### 🎨 Studio, previews and export

- Multi-file Electron previews resolve relative scripts, styles, images,
  modules, imports and requests; active previews stay warm across project, file
  and Code/Preview switches instead of navigating into a white frame. (#7336)
  Thanks @lefarcen.
- The viewport menu closes when the preview itself is clicked, presentation mode
  has an exit control that still works after focus enters the slide, and version
  history says clearly when a preview opens in a new window. (#7358) Thanks
  @lefarcen.
- Headless and container deployments no longer offer a PPTX export path that
  their daemon cannot render; desktop keeps the export, and connection failures
  stop masquerading as missing capability. (#7224) Thanks @jiulongche.
- The Website Clone starter text returns the composer to empty when untouched,
  stays when the user adds a URL, and is localized across the supported creation
  surfaces. (#7344) Thanks @lefarcen.

### 🧠 Agents, runtimes and conversations

- DeepSeek Harness detection walks past broken PATH shims, keeps unusable agents
  visible with a diagnostic and repair action, and accepts the current
  `0.1.1-rc.x` line. (#7153, #7339) Thanks @lefarcen.
- Kimi 0.37+ sessions omit the stdio MCP transport those builds reject, restoring
  normal ACP startup and streamed replies. (#7313) Thanks @lefarcen.
- Antigravity receives the real user prompt instead of a literal `-`. (#7205)
  Thanks @mturac.
- Native resume and transcript replay now share one cross-agent safety decision:
  resume only when the stored session still matches the visible conversation;
  otherwise clear the stale handle and reseed once with the full transcript.
  (#5269) Thanks @alucero270.
- ACP usage, session-info and command metadata no longer leak into the visible
  conversation as raw status text. (#7309) Thanks @helsome.
- An ACP stage timeout keeps the real silence duration and names the watchdog
  that ended the run, making a costly stall diagnosable instead of looking like
  the user interrupted it. (#7310) Thanks @lefarcen.
- Design-system AI Optimize admits one active refinement per conversation, so a
  double click, another tab or an external client cannot create a duplicate
  billed run against the same files. (#7271) Thanks @lefarcen.

### 🖥️ Desktop, navigation and interface polish

- Packaged clients reclaim an unresponsive web sidecar during startup and clean
  up their daemon and web children when the desktop owner exits. (#7279) Thanks
  @mrcfps.
- Foreground failures no longer raise a redundant system notification while the
  result is already on screen; background notifications and enabled completion
  sounds keep their existing behavior. (#7329) Thanks @Siri-Ray.
- The account menu remains open after its avatar is clicked, Local CLI choices
  align consistently during onboarding, and empty Skills source filters stay out
  of the way. (#7330, #7338, #7298) Thanks @Siri-Ray, @lefarcen, @nettee.
- DeepSeek campaigns use the official provider mark with an accessible,
  readable fallback when the image cannot load. (#7326) Thanks @Siri-Ray.

### 💳 Plans and campaigns

- Pricing actions follow the real subscription state and interval before sending
  anyone to checkout; pending, canceling, unavailable and downgrade states are
  explicit. (#7239) Thanks @Siri-Ray.
- Model ordering, plan copy, recommendation colors and campaign colors now stay
  consistent between Pricing and the homepage. (#7228) Thanks @Siri-Ray.
- Go no longer offers a checkout after inventory closed, and the local client
  stops surfacing its retired campaign alongside the active DeepSeek offer.
  (#7352, #7361) Thanks @Siri-Ray.

## 🙏 Thanks to everyone who shipped 0.21.0

@alucero270 · @helsome · @huytdps13400 · @jiulongche ·
@joeylee12629-star · @lefarcen · @mrcfps · @mturac · @nettee · @OctoBored ·
@PerishCode · @Siri-Ray · @UnknownObject777
