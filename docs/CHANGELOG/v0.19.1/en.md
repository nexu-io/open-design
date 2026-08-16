---
title: Open Design 0.19.1 — Design with DeepSeek Harness
description: Connect your official DeepSeek Harness installation to Open Design for model discovery, structured runs, and session resume. Paid plans also get DeepSeek V4 Pro and Flash unlimited for two weeks.
---

### 🌟 Codename: *Design with DeepSeek Harness*

🧰 **59 PRs · 24 contributors · 4 days** — **DeepSeek Harness now runs as an
agent inside Open Design.** Open Design finds your official `dsh`, guides setup
of the Open Design connection profile, lists Harness models and
reasoning options, and resumes the same Harness session on later turns. 0.19.1
also starts two weeks of unlimited DeepSeek V4 Pro and Flash for paid plans and
keeps Home and team projects responsive under load.

## 🔥 Highlights

- 🧰 **Bring your official DeepSeek Harness installation into Open Design.**
  Open Design discovers `dsh`, reads its model and reasoning choices, and gives
  specific guidance for missing credentials, profile setup, or an untested
  Harness version. Settings and `od agent setup deepseek-harness` can install or
  repair only the Open Design connection profile; Open Design does not replace
  or upgrade Harness itself. Runs stream thinking, text, tool calls, results,
  and usage as structured events, then resume the same Harness session on later
  turns. Cancellation and process cleanup also cover Windows `.cmd` installs.
  (#6874)

- 🎁 **Paid plans get two weeks of unlimited DeepSeek V4 Pro and Flash.**
  From August 13 at 20:00 to August 27 at 20:00 (Asia/Shanghai), both models
  carry the Unlimited badge across the workbench, and the campaign action picks
  V4 Pro. Users who dismissed the previous Flash campaign still see this one
  once. When a rolling model window fills up, Open Design shows the retry time
  and confirms that the request was not charged. (#6861)

- 🏠 **Home gets you into a project sooner.** The refreshed Home adds a
  clearer creation-type row and more direct workspace controls. Local projects
  no longer wait for a Cloud workspace identity before they can start, while
  Cloud projects keep their balance checks. After you submit, Open Design moves
  straight into the new project's Preparing state and rolls back cleanly if
  creation fails. (#6692, #6741, #6756)

- 🔐 **An expired Cloud session returns you to sign-in.** Invalid
  credentials are cleared, the existing sign-in flow takes over, and transient
  workspace-authority failures retry without duplicating the request. Headless
  operators also gain `od amr status` and `od amr logout` for checking and
  resetting Cloud authentication from the CLI. (#6786)

- ⚡ **Team workspaces keep background work within bounds.** Shared-resource
  pulls are batched, sync fan-out is capped, workspace-authority reads are
  cached safely, and large project scans, archives, and push queues have firm
  limits. Workspace and billing refreshes now coalesce under event bursts and
  back off during an outage instead of multiplying upstream requests.
  (#6711, #6752, #6782, #6788, #6871)

## ✨ Added

- The design-system catalog now includes **Cloudflare Kumo UI**, ready to use
  as a visual foundation for generated interfaces. (#6769)
- `od mcp install claude-desktop` can configure Open Design for Claude Desktop
  on macOS and Windows. (#6489)
- The public Pricing page now describes hosted image generation alongside text
  models. (#6395)
- Launch Week is easier to discover from the landing page, and community links
  are labeled before they take you away from Open Design. (#6680, #6684)

## 🔁 Changed

- New image and video outputs open in the preview when generation finishes.
  When an agent names an existing artifact, the write updates that file in
  place instead of creating a numbered duplicate. (#6688, #6719)
- Message Center rows expand and collapse in place. Saving an annotation also
  leaves the comments panel in the state you chose instead of forcing it open.
  (#6851, #6862)
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
- Deleted projects leave the workspace project dropdown as soon as deletion
  succeeds and stay gone after reload. (#6886)

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
- Docker browser peers can authenticate, and the packaged runtime picks up
  patched dependency floors for known container vulnerabilities. (#6715, #6733)
- Korean browser-assist UI and French fallback copy are complete again.
  (#6212, #6612)

## 🙏 Thanks to everyone who shipped 0.19.1

@alchemistklk · @AmyShang-alt · @BusanGukbap · @Coiggahou2002 ·
@dapsychyoo · @davezfr · @Diyoncrz18 · @elifive555555 · @ivy-ting ·
@lefarcen · @lhenriquesouza · @lorenzozanee · @mvanhorn · @PerishCode ·
@roian6 · @ScarletttMoon · @Siri-Ray · @VaiYav · @wangchenglong0001 ·
@xne998808-ai · @xxiaoxiong · @YOMXXX · @YUHAO-corn · @zzjjzz-zz
