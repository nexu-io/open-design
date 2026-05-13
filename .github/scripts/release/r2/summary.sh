#!/usr/bin/env bash
set -euo pipefail

for name in BASE_VERSION ENABLE_LINUX ENABLE_MAC ENABLE_MAC_INTEL ENABLE_WIN GITHUB_STEP_SUMMARY RELEASE_CHANNEL RELEASE_SIGNED RELEASE_VERSION STATE_SOURCE; do
  if [ -z "${!name:-}" ]; then
    echo "$name is required" >&2
    exit 1
  fi
done

node --input-type=module <<'NODE' >> "$GITHUB_STEP_SUMMARY"
import { readFileSync } from "node:fs";

const env = process.env;
const enabled = (name) => env[name] === "true";
const macArtifactMode = env.MAC_ARTIFACT_MODE ?? "dmg-and-zip";
const optional = (name) => {
  const value = env[name];
  return value == null || value.length === 0 ? null : value;
};
const joinUrl = (base, path) => {
  if (base == null) {
    return null;
  }
  return `${base.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
};

const reportUrl = optional("R2_REPORT_URL");
const reportZipUrl = optional("R2_REPORT_ZIP_URL");
const platformReport = (platform) => reportUrl == null ? null : {
  manifest: joinUrl(reportUrl, `${platform}/manifest.json`),
  screenshot: joinUrl(reportUrl, `${platform}/screenshots/open-design-${platform}-smoke.png`),
  vitestLog: joinUrl(reportUrl, `${platform}/vitest.log`),
};

const platforms = {
  mac: {
    enabled: enabled("ENABLE_MAC"),
    signed: env.RELEASE_SIGNED === "true",
  },
  win: {
    enabled: enabled("ENABLE_WIN"),
    signed: false,
  },
  linux: {
    enabled: enabled("ENABLE_LINUX"),
    signed: false,
  },
  macIntel: {
    enabled: enabled("ENABLE_MAC_INTEL"),
    signed: env.MAC_INTEL_SIGNED === "true",
  },
};

if (platforms.mac.enabled) {
  platforms.mac.artifacts = {
    dmg: optional("R2_MAC_DMG_URL"),
  };
  if (macArtifactMode !== "dmg-only") {
    platforms.mac.artifacts.zip = optional("R2_MAC_ZIP_URL");
  }
  platforms.mac.feed = macArtifactMode === "dmg-only" ? null : optional("R2_MAC_FEED_URL");
  platforms.mac.e2e = platformReport("mac");
}
if (platforms.win.enabled) {
  platforms.win.artifacts = {
    installer: optional("R2_WIN_INSTALLER_URL"),
  };
  platforms.win.feed = optional("R2_WIN_FEED_URL");
  platforms.win.e2e = platformReport("win");
}
if (platforms.linux.enabled) {
  platforms.linux.artifacts = {
    appImage: optional("R2_LINUX_APPIMAGE_URL"),
  };
  platforms.linux.feed = null;
}
if (platforms.macIntel.enabled) {
  platforms.macIntel.artifacts = {
    dmg: optional("R2_MAC_INTEL_DMG_URL"),
    zip: optional("R2_MAC_INTEL_ZIP_URL"),
  };
  platforms.macIntel.feed = null;
}

const githubReleaseEnabled = env.GITHUB_RELEASE_ENABLED === "true";
const versionTag = optional("VERSION_TAG");
const titleCase = (value) => `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
const md = (value) => String(value).replaceAll("|", "\\|").replaceAll("\n", " ");
const code = (value) => value == null || value === "" ? "-" : `\`${md(value)}\``;
const link = (label, url) => url == null || url === "" ? "-" : `[${md(label)}](${url})`;
const linkList = (items) => {
  const links = items
    .filter((item) => item.url != null && item.url !== "")
    .map((item) => link(item.label, item.url));

  return links.length === 0 ? "-" : links.join("<br>");
};
const boolLabel = (value) => value ? "Yes" : "No";
const platformStatus = (platform, label) => {
  if (!platform.enabled) {
    return "Skipped";
  }
  return platform.signed ? `${label} signed` : label;
};

const overviewRows = [
  ["Channel", code(env.RELEASE_CHANNEL)],
  ["Version", code(env.RELEASE_VERSION)],
  ["Base version", code(env.BASE_VERSION)],
  ["State source", code(env.STATE_SOURCE)],
  ["Mac signed", boolLabel(env.RELEASE_SIGNED === "true")],
  ["Linux enabled", boolLabel(platforms.linux.enabled)],
];
if (env.RELEASE_CHANNEL === "nightly") {
  overviewRows.push(["Nightly number", code(env.NIGHTLY_NUMBER)]);
}

const overviewTable = [
  "| Field | Value |",
  "| --- | --- |",
  ...overviewRows.map(([field, value]) => `| ${md(field)} | ${value} |`),
].join("\n");

const releaseLinks = [
  ["Latest metadata", optional("R2_METADATA_URL")],
  ["Version metadata", optional("R2_VERSION_METADATA_URL")],
]
  .filter(([, url]) => url != null)
  .map(([label, url]) => `- ${link(label, url)}`);

const platformRows = [
  [
    "macOS arm64",
    platformStatus(platforms.mac, "Published"),
    linkList([
      { label: "DMG", url: platforms.mac.artifacts?.dmg },
      { label: "ZIP", url: platforms.mac.artifacts?.zip },
    ]),
    link("latest-mac.yml", platforms.mac.feed),
  ],
  [
    "Windows x64",
    platformStatus(platforms.win, "Published"),
    linkList([{ label: "Installer", url: platforms.win.artifacts?.installer }]),
    link("latest.yml", platforms.win.feed),
  ],
  [
    "Linux x64",
    platformStatus(platforms.linux, "Published"),
    linkList([{ label: "AppImage", url: platforms.linux.artifacts?.appImage }]),
    "-",
  ],
  [
    "macOS x64 (Intel)",
    platformStatus(platforms.macIntel, "Published"),
    linkList([
      { label: "DMG", url: platforms.macIntel.artifacts?.dmg },
      { label: "ZIP", url: platforms.macIntel.artifacts?.zip },
    ]),
    "-",
  ],
];

const platformTable = [
  "| Platform | Status | Assets | Feed |",
  "| --- | --- | --- | --- |",
  ...platformRows.map((row) => `| ${row.map(md).join(" | ")} |`),
].join("\n");

const reportRows = reportZipUrl == null
  ? [
      [
        "macOS arm64",
        platforms.mac.enabled ? "Published" : "Skipped",
        linkList([
          { label: "manifest", url: platforms.mac.e2e?.manifest },
          { label: "screenshot", url: platforms.mac.e2e?.screenshot },
          { label: "vitest.log", url: platforms.mac.e2e?.vitestLog },
        ]),
      ],
      [
        "Windows x64",
        platforms.win.enabled ? "Published" : "Skipped",
        linkList([
          { label: "manifest", url: platforms.win.e2e?.manifest },
          { label: "screenshot", url: platforms.win.e2e?.screenshot },
          { label: "vitest.log", url: platforms.win.e2e?.vitestLog },
        ]),
      ],
      ["Linux x64", platforms.linux.enabled ? "Not collected" : "Skipped", "-"],
      [
        "macOS x64 (Intel)",
        platforms.macIntel.enabled ? "Published" : "Skipped",
        "-",
      ],
    ]
  : [["report.zip", "Published", link("download", reportZipUrl)]];

const reportTable = [
  reportZipUrl == null ? "| Platform | Status | Links |" : "| Bundle | Status | Link |",
  "| --- | --- | --- |",
  ...reportRows.map((row) => `| ${row.map(md).join(" | ")} |`),
].join("\n");

const repository = optional("GITHUB_REPOSITORY");
const githubReleaseSection = githubReleaseEnabled && versionTag != null
  ? [
      "### GitHub release",
      "",
      `- Tag: ${code(versionTag)}`,
      repository == null ? null : `- Release: ${link(versionTag, `https://github.com/${repository}/releases/tag/${versionTag}`)}`,
    ].filter((line) => line != null).join("\n")
  : "";

const templatePath = optional("SUMMARY_TEMPLATE_PATH") ?? ".github/scripts/release/r2/summary.md";
const template = readFileSync(templatePath, "utf8");
const output = template
  .replaceAll("{{TITLE}}", `${titleCase(env.RELEASE_CHANNEL)} release ${env.RELEASE_VERSION}`)
  .replaceAll("{{OVERVIEW_TABLE}}", overviewTable)
  .replaceAll("{{RELEASE_LINKS}}", releaseLinks.length === 0 ? "- None" : releaseLinks.join("\n"))
  .replaceAll("{{PLATFORM_TABLE}}", platformTable)
  .replaceAll("{{REPORT_TABLE}}", reportTable)
  .replaceAll("{{GITHUB_RELEASE_SECTION}}", githubReleaseSection);

console.log(output.trimEnd());
NODE
