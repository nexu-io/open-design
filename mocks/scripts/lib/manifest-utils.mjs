// Manifest math — shared between the local `add-recording.sh` preview
// step and the GitHub Action that actually does R2 uploads.
//
// Concentrated here so a maintainer who eyeballs add-recording's
// preview output sees the SAME entry shape the workflow will commit
// post-merge. No drift.

import { readFileSync as readSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { basename } from 'node:path';

/**
 * Parse a recording's first JSONL line (the `meta` event) and return
 * the shape we store in the manifest.
 */
export function inspectRecording(jsonlPath) {
  const buf = readSync(jsonlPath);
  const sha256 = createHash('sha256').update(buf).digest('hex');
  const firstLine = buf.toString('utf-8').split('\n', 1)[0];
  let meta;
  try {
    meta = JSON.parse(firstLine);
  } catch (err) {
    throw new Error(`first line of ${jsonlPath} is not valid JSON: ${err.message}`);
  }
  if (meta.type !== 'meta') {
    throw new Error(`first line of ${jsonlPath} has type="${meta.type}" — expected "meta"`);
  }
  const traceId = basename(jsonlPath, '.jsonl');
  const skills = (meta.tags ?? [])
    .filter(t => typeof t === 'string' && t.startsWith('skill:'))
    .map(t => t.slice('skill:'.length));
  return {
    trace_id: traceId,
    sha256,
    bytes: buf.byteLength,
    agent: meta.agent ?? 'unknown',
    model: meta.model ?? null,
    outcome: meta.outcome ?? 'unknown',
    tool_count: meta.tool_call_count ?? 0,
    duration_ms: meta.duration_ms ?? 0,
    skills: skills.length > 0 ? skills : ['default'],
    session_id: meta.session_id ?? null,
    user_input_preview: meta.user_input
      ? String(meta.user_input).slice(0, 200).replace(/\s+/g, ' ').trim()
      : null,
    multi_turn: false,                    // filled in after histograms
    // ──── Provenance (fixture-trust signals; mrcfps review #3241) ────
    // Capture-time fields the harvester writes into the meta event.
    // Older recordings may not have them all — null is the explicit "we
    // don't know" so consumers can decide whether the fixture is still
    // trustworthy as the real CLIs evolve.
    captured_at: meta.timestamp ?? null,            // ISO 8601 of the original session
    cli_version: meta.cli_version ?? null,          // e.g. "claude-code 1.0.65" / "codex 0.40"
    protocol_version: meta.protocol_version ?? null,
    anonymization_version: meta.anonymization_version ?? null,
  };
}

/**
 * Insert / replace a manifest entry and rebuild all derived fields
 * (histograms, multi_turn flags, total_bytes, total). Returns the
 * mutated manifest object — caller writes it back if it wants to.
 */
export function upsertEntry(manifest, newEntry) {
  const idx = manifest.entries.findIndex(e => e.trace_id === newEntry.trace_id);
  if (idx >= 0) {
    manifest.entries[idx] = newEntry;
  } else {
    manifest.entries.push(newEntry);
  }
  // Rebuild derived fields from scratch.
  const byAgent = {};
  const byOutcome = {};
  const bySkill = {};
  const sessions = {};
  let totalBytes = 0;
  for (const e of manifest.entries) {
    byAgent[e.agent] = (byAgent[e.agent] ?? 0) + 1;
    byOutcome[e.outcome] = (byOutcome[e.outcome] ?? 0) + 1;
    for (const s of e.skills) bySkill[s] = (bySkill[s] ?? 0) + 1;
    if (e.session_id) (sessions[e.session_id] ??= []).push(e.trace_id);
    totalBytes += e.bytes;
  }
  for (const e of manifest.entries) {
    e.multi_turn = !!(e.session_id && (sessions[e.session_id]?.length ?? 0) >= 2);
  }
  manifest.entries.sort((a, b) => a.trace_id.localeCompare(b.trace_id));
  manifest.generated_at = new Date().toISOString();
  manifest.total = manifest.entries.length;
  manifest.total_bytes = totalBytes;
  manifest.histograms = { by_agent: byAgent, by_outcome: byOutcome, by_skill: bySkill };
  manifest.sessions_with_multi_turn = Object.values(sessions).filter(s => s.length >= 2).length;
  return manifest;
}

export function readManifest(path) {
  return JSON.parse(readSync(path, 'utf-8'));
}

export function writeManifest(path, manifest) {
  writeFileSync(path, JSON.stringify(manifest, null, 2));
}
