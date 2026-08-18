---
title: Open Design 0.16.0
description: Choose a visual direction, keep your work intact, and move from creation to delivery with confidence.
---

# Open Design 0.16.0 — The Confident Creative Loop

🎨 **92 PRs · 20 contributors · 5 days** — **Choose the direction, keep the work, and ship without second-guessing the path.** Visual guidance now reaches more kinds of work, model setup is easier to trust before a task begins, and long tasks and app updates are less likely to interrupt access to your latest results. 0.16.0 makes the whole journey more dependable—from choosing the look to reopening the app that delivers it.

## 🔥 Highlights

- 🎨 **Visual direction now follows the thing you are actually making.** Style choices are no longer limited to decks and prototypes. Documents, posters and other images, videos, Web Clones, wireframes, mobile work, and Hyperframes each get previews suited to their format—with four quick choices inline and the full library one click away. (#5746)

- 🔔 **Product news now has a home inside Open Design.** A new bell in the Home and project headers opens a message center with unread counts, filters, mark-all-read, and links to relevant content. Read state stays on the device for anonymous use or follows a signed-in account. Dates use your locale, and the close button is always easy to find. (#5920, #5954, #5959, #5968) Thanks @nettee.

- 🔄 **Automatic updates now cover more of the app.** After upgrading, the new version takes effect more reliably and features affected by an incomplete update—including PPTX export—work again. On macOS, “Check for Updates…” now clearly shows whether the app is current, downloading, ready to restart, waiting for active work to finish, or needs a manual download. Update reliability also improves on Windows. (#5789, #5766, #5678, #5915, #5940, #5955, #5967) Thanks @PerishCode.

- 🔑 **BYOK catches setup problems before they interrupt a task.** Incomplete edits stay as recoverable drafts instead of replacing a working configuration. Connection tests now behave more like real tasks, show service errors more clearly, preserve each provider’s model ordering, and handle compatible MiniMax, DeepSeek, and MiMo addresses more consistently. (#5745, #5712, #5713, #5774, #5807) Thanks @Siri-Ray, @mturac.

- 🧠 **Long tasks keep their answer—and the files that came with it.** Work approaching a conversation limit can continue with the newest useful context instead of failing abruptly. Earlier generated files stay attached, recovered helper agents no longer turn successful work into a failure, interrupted tasks show an accurate state after restart, and unrecoverable errors stop with a useful explanation. (#5816, #5850, #5845, #5817, #5882) Thanks @Siri-Ray, @tomsen02.

- 🖼️ **Image generation is more resilient to brief service interruptions.** Nano Banana and custom image generation retry once when a provider is temporarily busy, while GPT Image reference edits work across more compatible services. A short interruption becomes a brief wait instead of a lost creative turn. (#5702, #5760) Thanks @Siri-Ray, @xxiaoxiong.

- 🧩 **Start from what people actually use.** Slides, image, video, and other non-prototype galleries now lead with templates that have earned real usage, while blank entries and cards without previews stop crowding the top. Prototype keeps its editorial showcase, and every category keeps its full catalog. (#5106, #5881) Thanks @ScarletttMoon.

- 🧬 **Design systems import more faithfully from real repositories.** Repository imports now choose the right flow, split token packages keep their layout values, and common YAML list and multiline formats preserve the metadata their authors wrote. (#5779, #5797, #5499) Thanks @mturac, @MuduiClaw, @EthanGuo-coder.

- 🪟 **Previews spend less time making you fight the frame.** Wide desktop pages fit the pane until you choose your own zoom, older decks respond to navigation keys immediately, and the latest main HTML file appears as soon as a task finishes. When an asset is blocked for safety, the preview identifies the relevant project file without exposing a sensitive system path. (#5751, #5755, #5577, #5784) Thanks @lefarcen, @maxmilian, @mturac.

- 🛡️ **Local work now has stronger safety boundaries.** Imported projects keep hidden credentials private, removing a plugin stays within that plugin’s files, marketplace and saved-site content are handled more safely, and each conversation stays attached to the correct project. (#5857, #5855, #5880, #5503, #5813) Thanks @tomsen02, @wiggdevin.

## ✨ Added

### 🚀 Deployment and integrations

- **Preview before you publish.** Cloudflare Pages deployment now exposes Preview and Production as explicit targets in both the interface and `od deploy --target … --json`. Preview returns its own URL without replacing the live production hostname. (#4576) Thanks @cbeaulieu-gt.

- **Kiro joins the MCP setup picker.** Copy the correct shared-server snippet from Settings and move it into Kiro’s configuration without translating another client’s format by hand. (#5275) Thanks @BusanGukbap.

## 🔁 Changed

### 🔑 Models, media, and memory

- **The model list follows the provider, not the alphabet.** The provider’s original ordering is preserved, outdated Moonshot and DeepSeek defaults move to currently available models, and Settings and onboarding now show the same choices. (#5774) Thanks @Siri-Ray.

- **Memory can use the MiniMax key you already saved.** A compatible saved key is no longer reported as missing. If a provider only supports image or audio, Memory now explains that it is unsupported and shows useful next steps. (#5767) Thanks @lefarcen.

- **Provider mode changes are reflected immediately.** Switching to BYOK updates the composer icon at once, and a cleared custom model in Local CLI mode now stays cleared. (#5379, #5749) Thanks @yashrao2607, @jzhishu.

## 🐛 Fixed

### 🧠 Agents and runs

- **MCP follow-ups now receive the latest message.** Reusing a conversation continues with the new request instead of finishing without doing any new work. (#5851) Thanks @mturac.

- **Restarting or canceling work now leaves a more accurate result.** Tasks can still finish when saving their session hits a problem, canceled work stays canceled, and interrupted messages no longer remain stuck as queued or running after the app returns. (#5808, #5904, #5817) Thanks @mturac, @Siri-Ray.

- **ACP histories no longer grow blank rows after refresh.** Empty status entries are removed while real tool activity remains available. (#5145) Thanks @xxiaoxiong.

- **Windows devices with older processors can run OpenCode again.** Compatible builds now arrive through the normal update path instead of repeatedly crashing on launch. (#5733) Thanks @lefarcen.

### 🖼️ Preview and interface

- **Small visual signals tell the truth again.** Browser-extraction failures keep a visible red surface, the model picker stays on screen, and the Open Design Website Clone example loads its real logo with the first screen. (#5454, #5907, #5765) Thanks @xxiaoxiong, @lefarcen.

## 🙏 Thanks to everyone who shipped 0.16.0

@alchemistklk · @BusanGukbap · @cbeaulieu-gt · @EthanGuo-coder · @joeylee12629-star · @jzhishu · @lefarcen · @maxmilian · @mrcfps · @mturac · @MuduiClaw · @nettee · @PerishCode · @ScarletttMoon · @Siri-Ray · @tomsen02 · @VikingOwl91 · @wiggdevin · @xxiaoxiong · @yashrao2607
