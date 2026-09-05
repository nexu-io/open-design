import { cac } from "cac";

const cli = cac("tools-release");

cli
  .command("exact-release-plan", "Resolve accepted baseline, exact identities, and release actions")
  .option("--root <path>", "Repository root", { default: "." })
  .option("--registry <path>", "Content identity registry", { default: "tools/release/resources/exact-plan-identities.json" })
  .option("--channel <channel>", "Isolated exact channel")
  .option("--target <target>", "Exact target: darwin-arm64, darwin-x64, or win32-x64")
  .option("--accepted-receipt <path>", "Previously accepted baseline receipt")
  .option("--accepted-receipt-sha256 <digest>", "Expected digest of the accepted receipt")
  .option("--accepted-pointer-url <url>", "Trusted latest accepted-baseline pointer")
  .option("--available <path>", "JSON array of reusable identities")
  .option("--output <path>", "Release plan receipt", { default: ".tmp/release-exact/release-plan.json" })
  .action(async (options: {
    acceptedPointerUrl?: string; acceptedReceipt?: string; acceptedReceiptSha256?: string; available?: string; channel?: string;
    output: string; registry: string; root: string; target?: string;
  }) => {
    if (options.channel == null || options.target == null) throw new Error("--channel and --target are required");
    if (options.target !== "darwin-arm64" && options.target !== "darwin-x64" && options.target !== "win32-x64") {
      throw new Error("--target must be darwin-arm64, darwin-x64, or win32-x64");
    }
    if (options.acceptedReceiptSha256 != null && !/^sha256:[a-f0-9]{64}$/u.test(options.acceptedReceiptSha256)) {
      throw new Error("--accepted-receipt-sha256 must be a sha256 digest");
    }
    const { writeExactReleasePlan } = await import("./exact/write-release-plan.ts");
    await writeExactReleasePlan({
      ...options,
      acceptedReceiptSha256: options.acceptedReceiptSha256 as `sha256:${string}` | undefined,
      channel: options.channel,
      target: options.target,
    });
  });

cli
  .command("exact-baseline", "Resolve an accepted Electron Shell baseline or a cold-channel bootstrap")
  .option("--channel <channel>", "Isolated exact channel")
  .option("--target <target>", "Exact target: darwin-arm64, darwin-x64, or win32-x64")
  .option("--current-closure-identity <digest>", "Current Closure content identity")
  .option("--accepted-receipt <path>", "Previously accepted baseline receipt")
  .option("--accepted-receipt-sha256 <digest>", "Expected digest of the accepted receipt")
  .option("--output <path>", "Baseline resolution receipt", { default: ".tmp/release-exact/accepted-baseline.json" })
  .action(async (options: {
    acceptedReceipt?: string; acceptedReceiptSha256?: string; channel?: string; currentClosureIdentity?: string;
    output: string; target?: string;
  }) => {
    if (options.channel == null || options.target == null || options.currentClosureIdentity == null) {
      throw new Error("--channel, --target, and --current-closure-identity are required");
    }
    if (options.target !== "darwin-arm64" && options.target !== "darwin-x64" && options.target !== "win32-x64") {
      throw new Error("--target must be darwin-arm64, darwin-x64, or win32-x64");
    }
    if (!/^sha256:[a-f0-9]{64}$/u.test(options.currentClosureIdentity)) throw new Error("--current-closure-identity must be a sha256 digest");
    if (options.acceptedReceiptSha256 != null && !/^sha256:[a-f0-9]{64}$/u.test(options.acceptedReceiptSha256)) {
      throw new Error("--accepted-receipt-sha256 must be a sha256 digest");
    }
    const { writeAcceptedShellBaselineResolution } = await import("./exact/write-accepted-baseline.ts");
    await writeAcceptedShellBaselineResolution({
      ...options,
      channel: options.channel,
      currentClosureIdentity: options.currentClosureIdentity as `sha256:${string}`,
      acceptedReceiptSha256: options.acceptedReceiptSha256 as `sha256:${string}` | undefined,
      target: options.target,
    });
  });

cli
  .command("exact-plan", "Resolve exact release identities and actions")
  .option("--root <path>", "Repository root (auto-detected by default)")
  .option("--registry <path>", "Content identity registry", { default: "tools/release/resources/exact-plan-identities.json" })
  .option("--target <target>", "Exact target: darwin-arm64, darwin-x64, or win32-x64")
  .option("--accepted-shell-baseline <digest>", "Accepted baseline identity carried by the Shell")
  .option("--available <path>", "JSON array of reusable identities")
  .option("--output <path>", "Plan receipt path", { default: ".tmp/release-exact/plan.json" })
  .action(async (options: { acceptedShellBaseline?: string; available?: string; output: string; registry: string; root?: string; target?: string }) => {
    if (options.target !== "darwin-arm64" && options.target !== "darwin-x64" && options.target !== "win32-x64") {
      throw new Error("--target must be darwin-arm64, darwin-x64, or win32-x64");
    }
    if (options.acceptedShellBaseline == null || !/^sha256:[a-f0-9]{64}$/u.test(options.acceptedShellBaseline)) {
      throw new Error("--accepted-shell-baseline must be a sha256 digest");
    }
    const { writeExactPlan } = await import("./exact/write-plan.ts");
    await writeExactPlan({ ...options, acceptedShellBaseline: options.acceptedShellBaseline as `sha256:${string}`, target: options.target });
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
  .command("publish-dogfood", "Upload unpublished build artifacts to the dogfood prefix for manual distribution")
  .action(async () => {
    await import("./storage/publish-dogfood.ts");
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

cli
  .command("notify feishu", "Send a Feishu release notification")
  .action(async () => {
    await import("./notifications/feishu.ts");
  });

cli.help();
cli.parse();
