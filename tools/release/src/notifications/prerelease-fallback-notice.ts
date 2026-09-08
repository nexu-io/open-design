// Decides whether the prerelease card lane went silent and, if it did, writes
// the fallback notice into $GITHUB_OUTPUT for feishu-notice.ts to post.
//
// This step never talks to Feishu. Delivery stays with feishu-notice.ts — the
// custom-bot webhook poster every other alert in this repository already uses —
// so the last-resort path is the one transport with the most mileage on it, and
// the decision above it stays a pure function that can be tested without a
// network (see prerelease-fallback.ts and tests/prerelease-fallback.test.ts).
//
// It is also the second gate. The calling job's `if:` already refuses to run on
// a healthy release; this script refuses to emit `alert=true` for one as well,
// so loosening the YAML condition cannot on its own turn the fallback into a
// duplicate card.
//
// Inputs (all via env):
//   STAGE                  (required) "dispatch" | "watch" — which caller this is
//   CARD_DISPATCHED        stage=dispatch: "true" when the card workflow was dispatched
//   CARD_JOB_RESULT        stage=watch: needs.card.result
//   CARD_DELIVERED         stage=watch: needs.card.outputs.delivered
//   VERSION / BRANCH / COMMIT             what is being released (may be empty)
//   CHANNEL_LABEL          default "Prerelease"
//   RELEASE_CHANNEL        default "prerelease" — R2 channel prefix
//   RELEASE_PUBLIC_ORIGIN  enables the version-metadata probe
//   VERSION_METADATA_URL   the publish job's own output, when the caller holds it
//   ORIGIN_RUN_URL / CARD_RUN_URL         where to look
//   ORIGIN_RUN_ID          enables the "is the pipeline still running?" probe
//   PIPELINE_PROGRESS      "finished" | "running" — skips that probe when the
//                          caller already knows (a job inside the pipeline
//                          cannot probe its own run: it always reads in_progress)
//   LANE_SUMMARY           raw per-job results, free text
//
// Outputs (via $GITHUB_OUTPUT): alert, reason, title, template, body, run_url.

import { appendFileSync, existsSync } from "node:fs";
import { randomUUID } from "node:crypto";

import {
  cardLaneSilence,
  renderFallbackNotice,
  resolvePackagePublication,
  versionMetadataUrl,
} from "./prerelease-fallback.ts";
import type { CardLaneProbe, MetadataProbe, PipelineProgress } from "./prerelease-fallback.ts";

function optional(name: string, fallback = ""): string {
  const value = process.env[name];
  return value == null || value.length === 0 ? fallback : value;
}

function required(name: string): string {
  const value = optional(name);
  if (value.length === 0) throw new Error(`${name} is required`);
  return value;
}

function isTrue(name: string): boolean {
  return optional(name).toLowerCase() === "true";
}

function setOutput(name: string, value: string): void {
  const file = process.env.GITHUB_OUTPUT;
  if (file == null || file.length === 0 || !existsSync(file)) {
    console.log(`[fallback] ${name}=${value.includes("\n") ? "<multiline>" : value}`);
    return;
  }
  // Multi-line values need the delimiter form, and the delimiter must be
  // something the body cannot contain — a rendered notice carrying a fixed
  // marker would otherwise let arbitrary commit text close the block early.
  const delimiter = `od-fallback-${randomUUID()}`;
  appendFileSync(file, `${name}<<${delimiter}\n${value}\n${delimiter}\n`);
}

/** HEAD the published version metadata. This is the "did a package ship?" authority. */
async function probeMetadata(url: string): Promise<MetadataProbe> {
  if (url.length === 0) return "skipped";
  try {
    const response = await fetch(url, { method: "HEAD", redirect: "follow" });
    if (response.ok) return "found";
    if (response.status === 403 || response.status === 404) return "missing";
    console.warn(`[fallback] metadata probe returned HTTP ${response.status}`);
    return "error";
  } catch (error) {
    console.warn(`[fallback] metadata probe threw: ${error instanceof Error ? error.message : String(error)}`);
    return "error";
  }
}

/**
 * Whether the build pipeline has finished, which is what tells "the package
 * never shipped" apart from "the package has not shipped YET" — the card lane
 * can die minutes into a build that goes on to publish normally.
 */
async function probePipeline(runId: string): Promise<PipelineProgress> {
  const token = optional("GH_TOKEN") || optional("GITHUB_TOKEN");
  const repo = optional("GITHUB_REPOSITORY");
  if (runId.length === 0 || token.length === 0 || repo.length === 0) return "unknown";
  const apiBase = optional("GITHUB_API_URL", "https://api.github.com").replace(/\/+$/u, "");
  try {
    const response = await fetch(`${apiBase}/repos/${repo}/actions/runs/${runId}`, {
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${token}`,
        "x-github-api-version": "2022-11-28",
      },
    });
    if (!response.ok) {
      console.warn(`[fallback] pipeline probe returned HTTP ${response.status}`);
      return "unknown";
    }
    const body = (await response.json()) as { status?: unknown };
    return body.status === "completed" ? "finished" : "running";
  } catch (error) {
    console.warn(`[fallback] pipeline probe threw: ${error instanceof Error ? error.message : String(error)}`);
    return "unknown";
  }
}

async function resolvePipeline(): Promise<PipelineProgress> {
  const declared = optional("PIPELINE_PROGRESS");
  if (declared === "finished" || declared === "running") return declared;
  return await probePipeline(optional("ORIGIN_RUN_ID"));
}

function readProbe(): CardLaneProbe {
  const stage = required("STAGE");
  if (stage === "dispatch") return { stage: "dispatch", dispatched: isTrue("CARD_DISPATCHED") };
  if (stage === "watch") {
    return {
      stage: "watch",
      jobResult: optional("CARD_JOB_RESULT"),
      deliveredFinalCard: isTrue("CARD_DELIVERED"),
    };
  }
  throw new Error(`STAGE must be "dispatch" or "watch", got "${stage}"`);
}

async function main(): Promise<void> {
  const silence = cardLaneSilence(readProbe());
  if (silence == null) {
    // The healthy path, and the one that matters most: the card did its job, so
    // this step must leave the channel alone.
    console.log("[fallback] the prerelease card lane reported in; nothing to post");
    setOutput("reason", "card-lane-healthy");
    setOutput("alert", "false");
    return;
  }

  const version = optional("VERSION");
  const declaredMetadataUrl = optional("VERSION_METADATA_URL");
  const probeUrl =
    declaredMetadataUrl.length > 0
      ? declaredMetadataUrl
      : versionMetadataUrl(optional("RELEASE_PUBLIC_ORIGIN"), optional("RELEASE_CHANNEL", "prerelease"), version);
  const probe = declaredMetadataUrl.length > 0 ? ("skipped" as MetadataProbe) : await probeMetadata(probeUrl);
  const publication = resolvePackagePublication({ declaredMetadataUrl, probe });

  const notice = renderFallbackNotice({
    silence,
    channelLabel: optional("CHANNEL_LABEL", "Prerelease"),
    version,
    branch: optional("BRANCH"),
    commit: optional("COMMIT"),
    publication,
    metadataUrl: probeUrl,
    pipeline: publication === "published" ? "finished" : await resolvePipeline(),
    originRunUrl: optional("ORIGIN_RUN_URL"),
    cardRunUrl: optional("CARD_RUN_URL"),
    laneSummary: optional("LANE_SUMMARY"),
  });

  console.warn(`::warning::prerelease card lane silent (${silence}); posting the webhook fallback notice`);
  // `alert` goes LAST, after every field a poster reads. It is the one output
  // the workflow branches on, so writing it first would let a crash between two
  // appends leave `alert=true` beside an empty body — and feishu-notice.ts would
  // then die on a required env instead of delivering. Written last, `alert=true`
  // means the whole notice is on disk.
  setOutput("reason", silence);
  setOutput("title", notice.title);
  setOutput("template", notice.template);
  setOutput("body", notice.body);
  setOutput("run_url", notice.runUrl);
  setOutput("alert", "true");
}

await main();
