# Privacy

This page describes what data the Open Design desktop and web app collects,
when it collects it, and how you stay in control. It documents the behavior
shipped in the app — the same controls live under **Settings → Privacy**.

Open Design is **local-first**. Your projects, generated files, and BYOK API
keys stay on your machine. Local project/file workflows remain available when
telemetry services are unreachable; model-backed features still depend on the
runtime or provider you choose.

Open Design has two telemetry classes:

- **Product analytics and quality traces** are on by default and can be
  disabled or narrowed under **Settings → Privacy**.
- **Safety and reliability telemetry** is always enabled in builds configured
  with a telemetry destination. It is limited, scrubbed, and used to diagnose
  crashes, startup failures, broken streams, and similar product-health
  failures. The general analytics toggle does not disable this channel.

Forks and development builds without telemetry destination credentials send
neither class.

## Product analytics are opt-out

Usage telemetry is **on by default**. On first run the app shows a privacy
disclosure banner so you can see what is collected before doing anything else.
The banner asks you to choose **Share** or **Don’t share**.
Choosing **Share** keeps product analytics and quality traces enabled; choosing
**Don’t share** disables those optional channels.

You stay in control of the optional channels: the banner points you to
**Settings → Privacy**, where you can toggle the categories below and change
your decision at any time. The safety/reliability exception above is not an
optional product-analytics category.

## What is collected

When optional sharing is enabled, the app may send the following to the Open
Design team. The two Settings controls are **Anonymous metrics** and
**Conversation and tool content**.

- **Anonymous metrics** — run counts, token usage, error rate, and duration.
  This channel also covers product interaction events, page transitions, web
  performance, and privacy-masked session replay. Replay masks every text node
  and input value and blocks embedded iframes, so prompts, keys, project text,
  and generated previews are not recorded as readable screen content.
- **Conversation and tool content** — your prompts, assistant responses, tool
  inputs, tool outputs, prompt-stack context, and attachment/artifact manifest
  metadata needed for quality review. Content is truncated and scrubbed; tool
  payloads known to carry artifact contents are replaced with redaction
  markers. This channel requires both the metrics and content controls to be
  enabled.

Independently of those controls, **safety and reliability telemetry** may send
bounded, scrubbed diagnostics for browser/daemon exceptions, white screens,
long tasks, resource or SSE failures, stuck runs, lifecycle failures, and a
packaged app that crashes before its daemon starts. Typical fields are product
version/channel, OS/runtime facts, failure stage, error type/message/stack, and
timing. Home-directory paths, URL query strings, input text, and other known
sensitive fields are scrubbed before dispatch. Safety reporting is best-effort
and never blocks the core workflow or a failing process's exit.

## What is never collected

- The contents of your generated artifact files.
- Your BYOK API keys, authentication tokens, or other stored credentials.
- Readable prompt, project, or artifact text in privacy-masked session replay.
- Conversation/tool content when the content control is disabled.

Telemetry event payloads do not intentionally include a source IP field, and
free-form content redaction removes IP-address patterns. As with any HTTPS
request, however, the receiving network service sees the connection's source
IP. The configured PostHog service may use it for geographic enrichment such
as country; do not interpret “anonymous” as “the transport cannot observe an
IP address.”

## How telemetry is sent

Product events, masked replay, and safety/reliability events use the configured
[PostHog](https://posthog.com) ingestion endpoint. Browser safety events may go
directly to PostHog's public ingestion API so errors that happen before the
normal analytics client loads are not lost; daemon and packaged-startup events
have equivalent direct safety paths.

When metrics and content sharing are both enabled, detailed run-quality traces
are sent through the Open Design telemetry relay to
[Langfuse](https://langfuse.com). Maintainer smoke-test configurations may use
direct Langfuse credentials instead. Public client/relay configuration does
not expose the team's private write credentials.

All transports are best-effort. An unavailable analytics service does not turn
a telemetry failure into a product failure.

## Your anonymous ID

For optional analytics, the app generates a random, opaque installation ID so
related events can be grouped. It is not derived from your name or email.
Safety/reliability paths use an anonymous installation/device identifier when
available and may use a synthetic process/namespace identifier during an
early startup failure.

## Deleting your data

**Settings → Privacy → Delete my data** rotates the local anonymous ID and
disables the optional metrics/content channels. It does not disable the
safety/reliability exception, recall events already received, or synchronously
erase a processor's historical records. Previously received telemetry ages out
under the applicable retention policy.

## Bring your own key

The API keys you configure for coding agents and model providers are stored
locally and used by the local app/daemon to call the provider you selected.
They are not telemetry fields and are never sent to the Open Design team.

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
