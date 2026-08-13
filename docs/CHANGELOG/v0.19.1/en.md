---
title: Open Design 0.19.1 — Start Faster, Stay in Flow
description: Move from Home into a project immediately, recover expired Open Design Cloud sessions cleanly, and keep large team workspaces responsive under load.
---

### 🌟 Codename: *Start Faster, Stay in Flow*

🚀 **54 PRs · 24 contributors · 3 days** — **Open Design 0.19.1 gets you
from an idea on Home into a working project with less waiting.** It also turns
expired Cloud sessions into a recoverable sign-in flow and keeps large team
projects responsive by putting firm bounds around background work.

## 🔥 Highlights

- 🏠 **Home stops making you wait at the door.** The refreshed Home adds a
  clearer creation-type row and more direct workspace controls. Local projects
  no longer wait for a Cloud workspace identity before they can start, while
  Cloud projects keep their balance checks. After you submit, Open Design moves
  straight into the new project's Preparing state and rolls back cleanly if
  creation fails. (#6692, #6741, #6756)

- 🔐 **An expired Cloud session leads back to sign-in, not a dead end.** Invalid
  credentials are cleared, the existing sign-in flow takes over, and transient
  workspace-authority failures retry without duplicating the request. Headless
  operators also gain `od amr status` and `od amr logout` for checking and
  resetting Cloud authentication from the CLI. (#6786)

- ⚡ **Large team projects keep background work within bounds.** Shared-resource
  pulls are batched, sync fan-out is capped, workspace-authority reads are
  cached safely, and large project scans, archives, and push queues no longer
  expand without limit. The result is steadier sync and lower memory pressure
  as a workspace grows. (#6711, #6752, #6782, #6788)

- 🖼️ **Generated work lands where you expect it.** New image and video outputs
  open in the preview automatically. When an agent explicitly names an existing
  artifact, the write now updates that file in place instead of quietly
  creating a numbered duplicate. (#6688, #6719)

## ✨ Added

- The design-system catalog now includes **Cloudflare Kumo UI**, ready to use
  as a visual foundation for generated interfaces. (#6769)
- `od mcp install claude-desktop` can configure Open Design for Claude Desktop
  on macOS and Windows. (#6489)
- Launch Week is easier to discover from the landing page, and community links
  are labeled before they take you away from Open Design. (#6395, #6680, #6684)

## 🔁 Changed

- Message Center rows expand and collapse in place, so details stay in context
  instead of replacing the list. (#6851)
- Home search includes personal projects, and projects created from Community
  templates retain the template's original project type. (#6838, #6847)
- MCP slash commands explain what they do, and newly created custom skills load
  their files without requiring a refresh. (#6597, #6735)
- Campaign and upgrade prompts are limited to the AMR paths where they apply,
  instead of appearing in unrelated local workflows. (#6760, #6841)

## 🐛 Fixed

### 🏠 Workspaces and projects

- Inviting someone who already belongs to the workspace now says exactly why
  the invite failed, and recovery links open the Settings section that actually
  contains the requested control. (#6830, #6831)
- `od project list` and MCP resource reads honor the signed-in workspace instead
  of falling back to a personal or empty scope. (#6736, #6773)
- Re-finalizing a personal design system keeps it bound to the project and
  reachable afterwards. (#6776)

### 🧠 Runs and agents

- Repeated Enter presses and clicks no longer enqueue duplicate chat requests,
  and old daemon-restart recovery cards disappear after a later successful run.
  (#6748, #6749)
- A recovered tool error can no longer turn an already successful run back into
  a failed one. Form answers are not duplicated on resume, and stale message
  writes cannot overwrite the daemon's canonical run events. (#6305, #6418,
  #6764)
- Missing Vela installations report as unavailable, Azure alias authentication
  retries the compatible token parameter, and CodeBuddy model discovery handles
  the CLI's current help output. (#6617, #6718, #6738)
- Shared pipeline atom bodies are inserted once per active stage instead of
  being duplicated across the prompt. (#6245)

### 🖥️ Desktop and delivery

- Social share icons render in the packaged app, portable Windows installs
  write NSIS logs to the runtime path, and slower macOS cold starts get enough
  time for the sidecar to report healthy. (#6559, #6750, #6762)
- Docker browser peers authenticate correctly, and the packaged runtime picks up
  patched dependency floors for known container vulnerabilities. (#6715, #6733)
- Korean browser-assist UI and French fallback copy are complete again.
  (#6212, #6612)

## 🙏 Thanks to everyone who shipped 0.19.1

@alchemistklk · @AmyShang-alt · @BusanGukbap · @Coiggahou2002 ·
@dapsychyoo · @davezfr · @Diyoncrz18 · @elifive555555 · @ivy-ting ·
@lefarcen · @lhenriquesouza · @lorenzozanee · @mvanhorn · @PerishCode ·
@roian6 · @ScarletttMoon · @Siri-Ray · @VaiYav · @wangchenglong0001 ·
@xne998808-ai · @xxiaoxiong · @YOMXXX · @YUHAO-corn · @zzjjzz-zz
