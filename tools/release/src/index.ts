import { cac } from "cac";

const cli = cac("tools-release");

cli.command("patch-cut <action>", "Resolve a patch cut or check its predecessor publication")
  .action(async (action: string) => {
    const { patchCutCommand } = await import("./metadata/patch-cut.ts");
    patchCutCommand(action);
  });

cli.command("recover-beta", "Resolve recovery from a foreign branch's ahead beta publication")
  .action(async () => { await import("./metadata/recover-beta.ts"); });

cli.command("artifact <action>", "Plan published targets or resolve a checksum-verified installer reference")
  .option("--output <path>", "Installer reference JSON destination")
  .action(async (action: string, options: { output?: string }) => {
    const { artifactCommand } = await import("./metadata/artifact.ts");
    await artifactCommand(action, options);
  });

cli
  .command("prepare <channel>", "Prepare release metadata outputs for a lane")
  .action(async (channel: string) => {
    if (channel === "beta") {
      await import("./metadata/prepare-beta.ts");
      return;
    }
    if (channel === "prerelease" || channel === "stable") {
      process.env.OPEN_DESIGN_RELEASE_CHANNEL = channel;
      await import("./metadata/prepare-stable.ts");
      return;
    }
    throw new Error(`unsupported prepare channel: ${channel}`);
  });

cli
  .command("reserve-version <channel>", "Reserve a counted release version")
  .action(async (channel: string) => {
    process.env.RELEASE_CHANNEL = channel;
    await import("./storage/reserve-beta-version.ts");
  });

cli
  .command("check-storage", "Validate release storage write access")
  .action(async () => {
    await import("./storage/check-storage.ts");
  });

cli
  .command("publish-platform", "Publish one platform's release artifacts and manifest")
  .action(async () => {
    await import("./storage/publish-platform.ts");
  });

cli
  .command("prepare-platform-assets", "Stage versioned platform assets and updater metadata")
  .action(async () => {
    const { preparePlatformAssets } = await import("./storage/prepare-platform-assets.ts");
    await preparePlatformAssets();
  });

cli
  .command("publish-dsh-bootstrap", "Publish immutable DeepSeek Harness bootstrap installers")
  .action(async () => {
    await import("./storage/publish-dsh-bootstrap.ts");
  });

cli
  .command("export-catalog", "Export product content into a catalog.json snapshot staging dir")
  .action(async () => {
    const { exportCatalogFromEnv } = await import("./catalog/export-catalog.ts");
    await exportCatalogFromEnv();
  });

cli
  .command("render-catalog-previews", "Render catalog preview webp images into the staging dir")
  .action(async () => {
    const { renderCatalogPreviewsFromEnv } = await import("./catalog/render-catalog-previews.ts");
    await renderCatalogPreviewsFromEnv();
  });

cli
  .command("pack-catalog", "Write checksums, provenance, and bundle.tar.zst for a catalog snapshot")
  .action(async () => {
    const { packCatalogFromEnv } = await import("./catalog/pack-catalog.ts");
    await packCatalogFromEnv();
  });

cli
  .command("publish-catalog", "Publish an immutable catalog snapshot and update latest.json")
  .action(async () => {
    const { publishCatalogFromEnv } = await import("./storage/publish-catalog.ts");
    await publishCatalogFromEnv();
  });

cli
  .command("prepare-release-note", "Discover and validate release note sources")
  .action(async () => {
    await import("./release-note/prepare.ts");
  });

cli
  .command("publish-release-note", "Publish immutable release note content")
  .action(async () => {
    await import("./release-note/publish.ts");
  });

cli
  .command("verify-release-note", "Verify a release note publication")
  .action(async () => {
    await import("./release-note/verify.ts");
  });

cli
  .command("publish-metadata", "Publish combined release metadata")
  .action(async () => {
    await import("./storage/publish-metadata.ts");
  });

cli
  .command("prepare-github-assets", "Prepare the public GitHub Release asset set")
  .action(async () => {
    await import("./storage/prepare-github-assets.ts");
  });

cli
  .command("download-platform-manifest", "Download one platform manifest from release storage")
  .action(async () => {
    await import("./storage/download-platform-manifest.ts");
  });

cli
  .command("verify-metadata", "Verify published release metadata")
  .action(async () => {
    await import("./storage/verify-metadata.ts");
  });

cli
  .command("summary-metadata", "Write a release metadata summary")
  .action(async () => {
    await import("./storage/summary-metadata.ts");
  });

cli
  .command("write-report", "Write a release report JSON and Markdown summary")
  .action(async () => {
    await import("./report/write-report.ts");
  });

cli.help();
cli.parse();
