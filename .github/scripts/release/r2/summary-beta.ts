function required(name) {
  const value = process.env[name];
  if (value == null || value.length === 0) {
    throw new Error(`${name} is required`);
  }
  return value;
}

async function fetchJson(url) {
  const response = await fetch(`${url}${url.includes("?") ? "&" : "?"}run=${process.env.GITHUB_RUN_ID ?? "local"}`, {
    headers: { "Cache-Control": "no-cache" },
  });
  if (!response.ok) {
    throw new Error(`GET ${url} failed with HTTP ${response.status}`);
  }
  return await response.json();
}

function md(value) {
  return String(value ?? "-").replaceAll("|", "\\|").replaceAll("\n", " ");
}

function code(value) {
  return value == null || value === "" ? "-" : `\`${md(value)}\``;
}

function link(label, url) {
  return url == null || url === "" ? "-" : `[${md(label)}](${url})`;
}

function linkList(items) {
  const links = items
    .filter((item) => item.url != null && item.url !== "")
    .map((item) => link(item.label, item.url));
  return links.length === 0 ? "-" : links.join("<br>");
}

const metadata = await fetchJson(required("R2_METADATA_URL"));
const overviewRows = [
  ["Channel", code(metadata.channel)],
  ["Version", code(metadata.betaVersion)],
  ["Release state", code(metadata.releaseState)],
  ["Ready platforms", code((metadata.readyPlatforms ?? []).join(", "))],
  ["Expected platforms", code((metadata.expectedPlatforms ?? []).join(", "))],
  ["State source", code(metadata.stateSource)],
];

const overviewTable = [
  "| Field | Value |",
  "| --- | --- |",
  ...overviewRows.map(([field, value]) => `| ${md(field)} | ${value} |`),
].join("\n");

const releaseLinks = [
  ["Latest metadata", metadata.r2?.latestMetadataUrl],
  ["Version metadata", metadata.r2?.versionMetadataUrl],
  ["Report root", metadata.r2?.reportUrl],
]
  .filter(([, url]) => url != null)
  .map(([label, url]) => `- ${link(label, url)}`)
  .join("\n");

const platformLabels = {
  linux: "Linux x64",
  mac: "macOS arm64",
  macIntel: "macOS x64 (Intel)",
  win: "Windows x64",
};
const platformRows = Object.entries(platformLabels).map(([key, labelText]) => {
  const platform = metadata.platforms?.[key];
  if (platform == null) {
    return [labelText, "Skipped", "-", "-", "-"];
  }
  const artifacts = platform.artifacts ?? {};
  return [
    labelText,
    platform.status ?? "-",
    linkList(Object.entries(artifacts).map(([name, artifact]) => ({ label: name, url: artifact.url }))),
    link(platform.feed?.name ?? "feed", platform.feed?.latestUrl),
    link("report", platform.report?.url),
  ];
});
const platformTable = [
  "| Platform | Status | Assets | Feed | Report |",
  "| --- | --- | --- | --- | --- |",
  ...platformRows.map((row) => `| ${row.map(md).join(" | ")} |`),
].join("\n");

console.log(`## Beta release summary

${overviewTable}

### Release links

${releaseLinks || "-"}

### Platform assets

${platformTable}
`);
