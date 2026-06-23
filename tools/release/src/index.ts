import { cac } from "cac";

const cli = cac("tools-release");

cli
  .command("prepare <channel>", "Prepare release metadata outputs for a lane")
  .action(async (channel: string) => {
    if (channel === "beta") {
      await import("./metadata/prepare-beta.ts");
      return;
    }
    if (channel === "betas") {
      await import("./metadata/prepare-betas.ts");
      return;
    }
    if (channel === "preview") {
      await import("./metadata/prepare-preview.ts");
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

cli
  .command("notify feishu", "Send a Feishu release notification")
  .action(async () => {
    await import("./notifications/feishu.ts");
  });

cli.help();
cli.parse();
