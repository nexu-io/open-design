import { cac } from "cac";
import { registerExactCommands } from "./exact/commands.ts";

const cli = cac("tools-release");
registerExactCommands(cli);



cli
  .command("prepare-metadata <channel>", "Prepare legacy release metadata outputs for a lane")
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

cli.help();
cli.parse();
