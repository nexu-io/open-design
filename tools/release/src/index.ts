import { writeFileSync } from "node:fs";

import { cac } from "cac";

const cli = cac("tools-release");

cli
  .command("prepare <channel>", "Prepare release metadata outputs for a lane")
  .action(async (channel: string) => {
    const { releaseChannelProfile } = await import("./channel/profiles.ts");
    const profile = releaseChannelProfile(channel);
    if (profile.channel === "beta") {
      await import("./metadata/prepare-beta.ts");
      return;
    }
    if (profile.channel === "preview") {
      await import("./metadata/prepare-preview.ts");
      return;
    }
    if (profile.channel === "prerelease" || profile.channel === "stable") {
      process.env.OPEN_DESIGN_RELEASE_CHANNEL = profile.channel;
      await import("./metadata/prepare-stable.ts");
      return;
    }
    throw new Error(`unsupported prepare channel: ${profile.channel}`);
  });

cli
  .command("profile <channel>", "Print the registered release policy for a channel")
  .action(async (channel: string) => {
    const { releaseChannelProfile } = await import("./channel/profiles.ts");
    process.stdout.write(`${JSON.stringify(releaseChannelProfile(channel), null, 2)}\n`);
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
  .command("publish-closure-contribution", "Publish one verified Closure CAS contribution")
  .action(async () => {
    const { publishClosureContribution } = await import("./storage/publish-closure-contribution.ts");
    await publishClosureContribution();
  });

cli
  .command("resolve-shell-build", "Resolve and materialize an immutable Shell build")
  .action(async () => {
    const { resolveShellBuild } = await import("./storage/shell-build.ts");
    await resolveShellBuild();
  });

cli
  .command("register-shell-build", "Register a verified immutable Shell build")
  .action(async () => {
    const { registerShellBuild } = await import("./storage/shell-build.ts");
    await registerShellBuild();
  });

cli
  .command("register-shell-smoke", "Register an immutable full-smoke proof for one Shell build")
  .action(async () => {
    const { registerShellSmokeProof } = await import("./storage/shell-build.ts");
    await registerShellSmokeProof();
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
  .command("merge-closure-distribution <shared> <...targets>", "Merge validated Closure job contributions")
  .option("--output <path>", "write the canonical version-wide Closure manifest")
  .action(async (shared: string, targets: string | string[], options: { output?: string }) => {
    if (options.output == null || options.output.length === 0) {
      throw new Error("merge-closure-distribution requires --output");
    }
    const { mergeClosureDistributionFiles } = await import("./storage/merge-closure-distribution.ts");
    const manifest = mergeClosureDistributionFiles({
      sharedPath: shared,
      targetPaths: Array.isArray(targets) ? targets : [targets],
    });
    writeFileSync(options.output, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  });

cli
  .command("prepare-closure-seed", "Prepare a validated local-first Standalone seed repository")
  .option("--channel <channel>", "release channel")
  .option("--manifest <path>", "canonical Closure distribution manifest")
  .option("--mode <mode>", "metadata|required (default: metadata)")
  .option("--output <path>", "output seed repository root")
  .option("--release-version <version>", "release version bound by the baseline index")
  .option("--source-blob-dir <path>", "content-addressed source blobs for required mode")
  .option("--target <target>", "Standalone target")
  .action(async (options: {
    channel?: string;
    manifest?: string;
    mode?: string;
    output?: string;
    releaseVersion?: string;
    sourceBlobDir?: string;
    target?: string;
  }) => {
    if (options.channel !== "beta" && options.channel !== "preview" && options.channel !== "prerelease" && options.channel !== "stable") {
      throw new Error("prepare-closure-seed requires a supported --channel");
    }
    if (options.manifest == null || options.output == null || options.releaseVersion == null || options.target == null) {
      throw new Error("prepare-closure-seed requires --manifest, --output, --release-version, and --target");
    }
    if (options.mode != null && options.mode !== "metadata" && options.mode !== "required") {
      throw new Error("prepare-closure-seed --mode must be metadata or required");
    }
    const { prepareClosureSeed } = await import("./storage/prepare-closure-seed.ts");
    const result = await prepareClosureSeed({
      channel: options.channel,
      manifestPath: options.manifest,
      mode: options.mode ?? "metadata",
      outputRoot: options.output,
      releaseVersion: options.releaseVersion,
      ...(options.sourceBlobDir == null ? {} : { sourceBlobRoot: options.sourceBlobDir }),
      target: options.target,
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
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
  .command("observe-public-feed", "Observe a published release feed without changing publication state")
  .action(async () => {
    await import("./storage/observe-public-feed.ts");
  });

cli
  .command("prepare-public-acceptance", "Download and bind public Windows release artifacts for smoke")
  .action(async () => {
    await import("./storage/prepare-public-acceptance.ts");
  });

cli
  .command("issue-public-acceptance", "Issue a digest-bound credential for a successful public Windows smoke")
  .action(async () => {
    await import("./storage/issue-public-acceptance.ts");
  });

cli
  .command("activate-public-release", "Activate an accepted public release with a latest metadata CAS")
  .action(async () => {
    await import("./storage/activate-public-release.ts");
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
