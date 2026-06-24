# Privacy

This page describes what data the Open Design desktop and web app collects,
when it collects it, and how you stay in control. It documents the behavior
shipped in the app — the same controls live under **Settings → Privacy**.

Open Design is **local-first**. Your projects, generated files, and BYOK API
keys stay on your machine, and the app works fully offline. Optional usage
telemetry, described below, is **on by default**, and you can turn it off at any
time under **Settings → Privacy**. Safety and crash diagnostics are a separate
reliability path described below.

## Telemetry is opt-out

Optional usage telemetry is **on by default**. On first run the app shows a
privacy disclosure banner so you can see what is collected before doing anything
else. It is an informed-disclosure notice with a single **I get it**
acknowledgement, not an opt-in gate — and because usage telemetry is already
enabled, the app may begin sending events (such as onboarding and
UI-interaction events) from first launch.

You stay in control: the banner footer tells you sharing is on and points you to
**Settings → Privacy**, where you can turn telemetry off and toggle each category
below — and you can change your decision at any time.

## What is collected

Open Design may send the following to the Open Design team. Optional usage
categories are independently controllable in Settings; safety and crash
diagnostics are always-on reliability data.

- **Anonymous metrics** — run counts, token usage, error rate, and duration.
  No prompts and no project data.
- **Conversation and tool content** — your prompts, assistant responses, tool
  inputs, and tool outputs (truncated before send). API keys, tokens, JWTs,
  emails, IP addresses, and credit-card numbers are stripped automatically
  before anything leaves your machine.
- **Project artifacts manifest** — filenames, types, and sizes of generated
  files. The **contents** of those files are never sent.
- **Safety and crash diagnostics** — scrubbed exception, crash, white-screen,
  dropped-chunk, stuck-run, and reliability diagnostics. This path is always on
  so the team can keep the app stable; it may still send after optional usage
  telemetry is turned off. It does not include prompts or generated artifact
  contents.

## What is never collected

- The contents of your generated artifact files.
- Your BYOK API keys, tokens, or other secrets — these are redacted before
  send and are never part of telemetry.
- Optional usage telemetry while telemetry is turned off.

## How telemetry is sent

Optional usage telemetry batches are sent to a Cloudflare Worker relay operated
by the Open Design team, which forwards them to
[Langfuse](https://langfuse.com) for analysis. The relay holds the Langfuse
write credentials server-side, so packaged clients only ever ship a public
relay URL — no secret keys.

Safety and crash diagnostics use a separate reliability transport. Browser
exception and safety events are sent directly to the configured PostHog ingest
host, and daemon safety events are sent through the PostHog node client. These
events use the same redaction rules described above and do not include prompts
or generated artifact contents.

If either transport is unavailable the app retries quietly and keeps working;
telemetry never blocks your workflow.

## Your anonymous ID

When telemetry or safety diagnostics are sent, the app uses a random, opaque
installation ID so related events can be grouped. It is not tied to your name,
email, or account, and it carries no personal information.

## Deleting your data

**Settings → Privacy → Delete my data** rotates your anonymous ID and turns off
optional usage telemetry. Telemetry already received ages out under the team's
retention policy.

## Bring your own key

Open Design is BYOK at every layer. The API keys you configure for coding
agents and model providers are stored locally and used only to talk to those
providers directly. They are never sent to the Open Design team.

## Open Design AMR

“Open Design AMR” is Open Design’s official, first-party model service. Because
the two are part of the same product family operated by the same team, we may
share information between them as needed to provide, connect, and improve the
combined experience — for example, to recognize that you arrived from Open
Design, to help you get set up, and to keep the products working well together.
This sharing is between our own products, not with unrelated third parties, and
any data involved still follows the controls described on this page.

## Changes to this page

This document tracks the data handling of the shipped app. When the telemetry
behavior changes, this page is updated alongside it. For questions, open a
[GitHub Discussion](https://github.com/nexu-io/open-design/discussions).
