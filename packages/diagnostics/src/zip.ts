import JSZip from "jszip";

import { redactJsonValue, type RedactionOptions } from "./redaction.js";
import { buildManifest, buildMachineInfo, type DiagnosticsContext, type DiagnosticsManifest, type MachineInfo } from "./manifest.js";
import { collectLogSources, findCrashDumps, findMacOSCrashReports, type CollectedFile, type CrashDumpLookup, type CrashReportLookup, type LogSource } from "./sources.js";

const PLACEHOLDER_PREFIX = "; file unavailable: ";

export interface DiagnosticsExportInput {
  context: DiagnosticsContext;
  sources: LogSource[];
  redaction?: RedactionOptions;
  /** When provided, scan macOS crash reports matching these substrings. */
  crashReports?: CrashReportLookup;
  /** When provided, collect Chromium/Electron crash minidumps from this dir. */
  crashDumps?: CrashDumpLookup;
}

export interface DiagnosticsExportResult {
  zip: Buffer;
  manifest: DiagnosticsManifest;
  machineInfo: MachineInfo;
}

function placeholderForMissing(file: CollectedFile): string {
  return `${PLACEHOLDER_PREFIX}${file.error ?? "unknown error"}\n`;
}

export async function buildDiagnosticsZip(input: DiagnosticsExportInput): Promise<DiagnosticsExportResult> {
  const redaction = input.redaction ?? {};
  const sources = [...input.sources];

  if (input.crashReports != null) {
    const crashes = await findMacOSCrashReports(input.crashReports);
    sources.push(...crashes);
  }

  if (input.crashDumps != null) {
    const dumps = await findCrashDumps(input.crashDumps);
    sources.push(...dumps);
  }

  const collected = await collectLogSources(sources, redaction);
  const manifest = buildManifest(input.context, collected);
  const machineInfo = buildMachineInfo(redaction.username);

  const zip = new JSZip();
  for (const file of collected) {
    zip.file(file.name, file.content ?? placeholderForMissing(file));
  }
  zip.file("summary/manifest.json", JSON.stringify(redactJsonValue(manifest, redaction), null, 2));
  zip.file("summary/machine-info.json", JSON.stringify(redactJsonValue(machineInfo, redaction), null, 2));

  const buffer = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });

  return { zip: buffer, manifest, machineInfo };
}
