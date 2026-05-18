# Privacy

This page describes what data the Open Design desktop and web app collects,
when it collects it, and how you stay in control. It documents the behavior
shipped in the app — the same controls live under **Settings → Privacy**.

Open Design is **local-first**. Your projects, generated files, and BYOK API
keys stay on your machine. The app works fully offline; nothing in this page
applies unless you explicitly turn telemetry on.

## Telemetry is opt-in

Usage telemetry is **off by default**. On first run the app shows a privacy
consent banner asking you to make a choice — it never starts sending anything
before you do. You can change your decision at any time under
**Settings → Privacy**, where each category below has its own toggle.

## What is collected when you opt in

When telemetry is enabled, the app may send the following to the Open Design
team. Each category is independently controllable in Settings.

- **Anonymous metrics** — run counts, token usage, error rate, and duration.
  No prompts and no project data.
- **Conversation and tool content** — your prompts, assistant responses, tool
  inputs, and tool outputs (truncated before send). API keys, tokens, JWTs,
  emails, IP addresses, and credit-card numbers are stripped automatically
  before anything leaves your machine.
- **Project artifacts manifest** — filenames, types, and sizes of generated
  files. The **contents** of those files are never sent.

## What is never collected

- The contents of your generated artifact files.
- Your BYOK API keys, tokens, or other secrets — these are redacted before
  send and are never part of telemetry.
- Anything at all while telemetry is turned off.

## How telemetry is sent

Redacted telemetry batches are sent to a Cloudflare Worker relay operated by
the Open Design team, which forwards them to [Langfuse](https://langfuse.com)
for analysis. The relay holds the Langfuse write credentials server-side, so
packaged clients only ever ship a public relay URL — no secret keys. If the
relay is unavailable the app retries quietly and keeps working; telemetry
never blocks your workflow.

## Your anonymous ID

When telemetry is enabled the app generates a random, opaque installation ID
so related events can be grouped. It is not tied to your name, email, or
account, and it carries no personal information.

## Deleting your data

**Settings → Privacy → Delete my data** rotates your anonymous ID and stops
sending. Telemetry already received ages out under the team's retention
policy.

## Bring your own key

Open Design is BYOK at every layer. The API keys you configure for coding
agents and model providers are stored locally and used only to talk to those
providers directly. They are never sent to the Open Design team.

## Changes to this page

This document tracks the data handling of the shipped app. When the telemetry
behavior changes, this page is updated alongside it. For questions, open a
[GitHub Discussion](https://github.com/nexu-io/open-design/discussions).
