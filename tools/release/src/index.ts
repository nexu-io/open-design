import { writeFileSync } from "node:fs";

import { cac } from "cac";

const cli = cac("tools-release");

cli
  .command("identity <action> <id>", "Resolve or print one declared release identity")
  .option("--output <path>", "write the resolved identity JSON")
  .option("--parameters <path>", "JSON object containing the identity's declared parameters")
  .option("--parameter <key=value>", "declared identity parameter (repeatable)", { default: [] })
  .option("--root <path>", "workspace root (default: cwd)")
  .action(async (action: string, id: string, options: {
    output?: string;
    parameter?: string | string[];
    parameters?: string;
    root?: string;
  }) => {
    const { printReleaseIdentityDigest, resolveReleaseIdentityCli } = await import("./identity/resolution/resolve.ts");
    if (action === "digest") {
      await printReleaseIdentityDigest({ id, parameter: options.parameter, root: options.root });
      return;
    }
    if (action === "resolve") {
      await resolveReleaseIdentityCli({
        id,
        output: options.output,
        parameter: options.parameter,
        parameters: options.parameters,
        root: options.root,
      });
      return;
    }
    throw new Error(`identity action must be resolve or digest; got ${action}`);
  });

cli
  .command("prepare <channel>", "Prepare release metadata outputs for a lane")
  .action(async (channel: string) => {
    const { releaseChannelProfile } = await import("./channel/profiles.ts");
    const profile = releaseChannelProfile(channel);
    if (profile.channel === "prerelease" || profile.channel === "stable") {
      process.env.OPEN_DESIGN_RELEASE_CHANNEL = profile.channel;
      await import("./metadata/prepare-stable.ts");
      return;
    }
    process.env.RELEASE_CHANNEL = profile.channel;
    await import("./metadata/prepare-exact.ts");
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
    await import("./storage/reserve-version.ts");
  });

cli
  .command("prepare-candidate", "Validate a release candidate spec and derive its immutable id")
  .action(async () => {
    await import("./candidate/prepare.ts");
  });

cli
  .command("publish-candidate-target", "Upload one unpublished candidate target without changing a release channel")
  .action(async () => {
    await import("./candidate/publish-target.ts");
  });

cli
  .command("finalize-candidate", "Seal one complete multi-target candidate manifest")
  .action(async () => {
    await import("./candidate/finalize.ts");
  });

cli
  .command("materialize-stable-promotion", "Materialize a sealed stable candidate for projection activation")
  .action(async () => {
    await import("./candidate/materialize-stable-promotion.ts");
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
  .command("resolve-closure-build", "Resolve and materialize one immutable Closure component build")
  .action(async () => {
    const { resolveClosureBuild } = await import("./storage/closure/build-record.ts");
    await resolveClosureBuild();
  });

cli
  .command("register-closure-build", "Register one verified immutable Closure component build")
  .action(async () => {
    const { registerClosureBuild } = await import("./storage/closure/build-record.ts");
    await registerClosureBuild();
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
  .command("issue-stable-qualification", "Issue an immutable stable-promotion qualification for a prerelease")
  .action(async () => {
    await import("./storage/issue-stable-qualification.ts");
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
    const { releaseChannelDescriptor } = await import("@open-design/release");
    const channel = releaseChannelDescriptor(options.channel ?? "").channel;
    if (options.manifest == null || options.output == null || options.releaseVersion == null || options.target == null) {
      throw new Error("prepare-closure-seed requires --manifest, --output, --release-version, and --target");
    }
    if (options.mode != null && options.mode !== "metadata" && options.mode !== "required") {
      throw new Error("prepare-closure-seed --mode must be metadata or required");
    }
    const { prepareClosureSeed } = await import("./storage/prepare-closure-seed.ts");
    const result = await prepareClosureSeed({
      channel,
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
  .command("verify-closure-preflight", "Accept the merged Closure graph against the N-1 Shell boundary")
  .option("--channel <channel>", "release channel")
  .option("--manifest <path>", "merged Closure distribution manifest")
  .option("--release-version <version>", "current release version")
  .action(async (options: { channel?: string; manifest?: string; releaseVersion?: string }) => {
    if (options.channel == null || options.manifest == null || options.releaseVersion == null) {
      throw new Error("verify-closure-preflight requires --channel, --manifest, and --release-version");
    }
    const { releaseChannelDescriptor } = await import("@open-design/release");
    const { verifyClosureNMinusOnePreflightFile } = await import("./storage/verify-closure-preflight.ts");
    const result = verifyClosureNMinusOnePreflightFile({
      channel: releaseChannelDescriptor(options.channel).channel,
      manifestPath: options.manifest,
      releaseVersion: options.releaseVersion,
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
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
  .command("stage-acceptance-feed", "Stage one run-scoped mutable-shaped feed for cold-start acceptance")
  .action(async () => {
    await import("./storage/stage-acceptance-feed.ts");
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
  .command("activate-stable-release", "Atomically activate stable latest and synchronize its GitHub projection")
  .action(async () => {
    await import("./storage/activate-stable-release.ts");
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
  .command("write-reuse-plan", "Write the resolved release cache and verification plan")
  .action(async () => {
    await import("./report/write-reuse-plan.ts");
  });

cli
  .command("notify feishu", "Send a Feishu release notification")
  .action(async () => {
    await import("./notifications/feishu.ts");
  });

cli.help();
cli.parse(process.argv, { run: false });
await cli.runMatchedCommand();
