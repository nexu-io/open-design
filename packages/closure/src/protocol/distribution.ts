import {
  CLOSURE_DISTRIBUTION_SCHEMA_VERSION,
  CLOSURE_DISTRIBUTION_CONTROL_SCHEMA_VERSION,
  CLOSURE_DISTRIBUTION_CONTRIBUTION_SCHEMA_VERSION,
  CLOSURE_PROTOCOL_VERSION,
  CLOSURE_ARCHIVE_ENTRY_PATH,
  CLOSURE_LAUNCHER_ENTRY_PATH,
  CLOSURE_LAUNCHER_HANDOFF_PATH,
  CLOSURE_DISTRIBUTION_MAX_REQUIRED_BYTES,
  ClosureDigest,
  ClosureShellCompatibility,
  ClosureDistributionBlob,
  ClosureDistributionComponent,
  ClosureDistributionEntrypointComponent,
  ClosureDistributionLauncherComponent,
  ClosureDistributionTarget,
  ClosureDistributionResource,
  ClosureDistributionManifestDraft,
  ClosureDistributionManifest,
  ClosureDistributionSharedContribution,
  ClosureDistributionTargetContribution,
  ClosureDistributionDigest,
  ClosureDistributionColdStartBudget,
  ClosureDistributionControl,
  ClosureChannel,
  ResolvedClosureDistributionTarget,
  ClosureProtocolError,
  requireRecord,
  requireKnownKeys,
  normalizeChannel,
  normalizeVersion,
  normalizeDigest,
  normalizePlatform,
  normalizeShellType,
  normalizePositiveInteger,
  compareCanonicalStrings,
  normalizeProtocolToken,
  normalizeDisplayTitle,
  normalizeMediaType,
  normalizeRelativePath,
  normalizeProtocolVersion,
  normalizeHttpUrl,
} from "./index.js";

/**
 * Stable shallow envelope read before a consumer opens the versioned graph.
 * Keep this schema small: future distribution schemas must remain gateable by
 * an older Shell without asking that Shell to parse their payload shape.
 */
export function createClosureDistributionControl(
  manifest: ClosureDistributionManifest,
): ClosureDistributionControl {
  return {
    distribution: {
      digest: manifest.identity.digest,
      protocolVersion: manifest.identity.protocolVersion,
      schemaVersion: manifest.schemaVersion,
    },
    schemaVersion: CLOSURE_DISTRIBUTION_CONTROL_SCHEMA_VERSION,
    shellCompatibility: manifest.compatibility.shell,
  };
}

export function validateClosureDistributionControl(value: unknown): ClosureDistributionControl {
  const control = requireRecord(value, "closure distribution control");
  if (control.schemaVersion !== CLOSURE_DISTRIBUTION_CONTROL_SCHEMA_VERSION) {
    throw new ClosureProtocolError(
      `unsupported closure distribution control schema version: ${String(control.schemaVersion)}`,
    );
  }
  const distribution = requireRecord(control.distribution, "closure distribution control payload");
  const schemaVersion = normalizePositiveInteger(
    distribution.schemaVersion,
    "closure distribution control payload schema version",
  );
  return {
    distribution: {
      digest: normalizeDigest(distribution.digest),
      protocolVersion: normalizeProtocolVersion(distribution.protocolVersion),
      schemaVersion,
    },
    schemaVersion: CLOSURE_DISTRIBUTION_CONTROL_SCHEMA_VERSION,
    shellCompatibility: normalizeDistributionShellCompatibility({
      shell: control.shellCompatibility,
    }),
  };
}

function normalizeDistributionShellCompatibility(value: unknown): ClosureShellCompatibility {
  const compatibility = requireRecord(value, "closure distribution compatibility");
  requireKnownKeys(compatibility, ["shell"], "closure distribution compatibility");
  const shell = requireRecord(compatibility.shell, "closure distribution shell compatibility");
  const entries = Object.entries(shell).sort(([left], [right]) => compareCanonicalStrings(left, right));
  if (entries.length === 0) {
    throw new ClosureProtocolError("closure distribution shell compatibility must declare at least one shell");
  }
  return Object.fromEntries(entries.map(([shellType, rawCompatibility]) => {
    const normalizedType = normalizeShellType(shellType);
    const shellCompatibility = requireRecord(
      rawCompatibility,
      `closure distribution ${normalizedType} shell compatibility`,
    );
    requireKnownKeys(
      shellCompatibility,
      ["version"],
      `closure distribution ${normalizedType} shell compatibility`,
    );
    const version = requireRecord(
      shellCompatibility.version,
      `closure distribution ${normalizedType} shell compatibility version`,
    );
    requireKnownKeys(
      version,
      ["min"],
      `closure distribution ${normalizedType} shell compatibility version`,
    );
    return [normalizedType, {
      version: {
        min: normalizeVersion(
          version.min,
          `closure distribution ${normalizedType} minimum shell version`,
        ),
      },
    }];
  }));
}

function normalizeDistributionBlob(value: unknown, label: string): ClosureDistributionBlob {
  const blob = requireRecord(value, label);
  requireKnownKeys(blob, ["digest", "mediaType", "size", "url"], label);
  return {
    digest: normalizeDigest(blob.digest),
    mediaType: normalizeMediaType(blob.mediaType),
    size: normalizePositiveInteger(blob.size, `${label} size`),
    url: normalizeHttpUrl(blob.url),
  };
}

function normalizeDistributionBlobs(value: unknown): Record<string, ClosureDistributionBlob> {
  const blobs = requireRecord(value, "closure distribution blobs");
  const entries = Object.entries(blobs).sort(([left], [right]) => compareCanonicalStrings(left, right));
  if (entries.length === 0) {
    throw new ClosureProtocolError("closure distribution must declare at least one blob");
  }
  return Object.fromEntries(entries.map(([key, rawBlob]) => {
    const digest = normalizeDigest(key);
    const blob = normalizeDistributionBlob(rawBlob, `closure distribution blob ${digest}`);
    if (blob.digest !== digest) {
      throw new ClosureProtocolError(`closure distribution blob ${digest} must repeat its map digest`);
    }
    return [digest, blob];
  }));
}

function normalizeDistributionComponent(
  value: unknown,
  label: string,
): ClosureDistributionComponent {
  const component = requireRecord(value, label);
  requireKnownKeys(component, ["blob", "treeDigest"], label);
  return {
    blob: normalizeDigest(component.blob),
    treeDigest: normalizeDigest(component.treeDigest),
  };
}

function normalizeResourceStartup(value: unknown): "blocking" | "lazy" {
  if (value !== "blocking" && value !== "lazy") {
    throw new ClosureProtocolError("closure distribution resource startup must be blocking or lazy");
  }
  return value;
}

function normalizeDistributionEntrypointComponent(
  value: unknown,
  label: string,
): ClosureDistributionEntrypointComponent {
  const component = requireRecord(value, label);
  requireKnownKeys(component, ["blob", "entryPath", "treeDigest"], label);
  return {
    blob: normalizeDigest(component.blob),
    entryPath: normalizeRelativePath(component.entryPath, `${label} entry path`),
    treeDigest: normalizeDigest(component.treeDigest),
  };
}

function normalizeDistributionLauncherComponent(
  value: unknown,
  label: string,
): ClosureDistributionLauncherComponent {
  const component = requireRecord(value, label);
  requireKnownKeys(component, ["blob", "entryPath", "handoffPath", "treeDigest"], label);
  const normalized = {
    blob: normalizeDigest(component.blob),
    entryPath: normalizeRelativePath(component.entryPath, `${label} entry path`),
    handoffPath: normalizeRelativePath(component.handoffPath, `${label} handoff path`),
    treeDigest: normalizeDigest(component.treeDigest),
  };
  if (normalized.handoffPath !== CLOSURE_LAUNCHER_HANDOFF_PATH) {
    throw new ClosureProtocolError(
      `closure distribution launcher handoff path must be ${CLOSURE_LAUNCHER_HANDOFF_PATH}`,
    );
  }
  return normalized as ClosureDistributionLauncherComponent;
}

function normalizeDistributionResources(value: unknown): ClosureDistributionResource[] {
  if (!Array.isArray(value)) {
    throw new ClosureProtocolError("closure distribution resources must be an array");
  }
  const resources = value.map((rawResource) => {
    const resource = requireRecord(rawResource, "closure distribution resource");
    requireKnownKeys(resource, ["blob", "id", "startup", "title", "treeDigest"], "closure distribution resource");
    return {
      blob: normalizeDigest(resource.blob),
      id: normalizeProtocolToken(resource.id, "closure distribution resource id"),
      startup: normalizeResourceStartup(resource.startup),
      title: normalizeDisplayTitle(resource.title, "closure distribution resource title"),
      treeDigest: normalizeDigest(resource.treeDigest),
    };
  }).sort((left, right) => compareCanonicalStrings(left.id, right.id));
  for (let index = 1; index < resources.length; index += 1) {
    if (resources[index - 1]?.id === resources[index]?.id) {
      throw new ClosureProtocolError("closure distribution resource ids must be unique");
    }
  }
  return resources;
}

function normalizeDistributionTargets(value: unknown): Record<string, ClosureDistributionTarget> {
  const targets = requireRecord(value, "closure distribution targets");
  const entries = Object.entries(targets).sort(([left], [right]) => compareCanonicalStrings(left, right));
  if (entries.length === 0) {
    throw new ClosureProtocolError("closure distribution must declare at least one target");
  }
  return Object.fromEntries(entries.map(([rawTarget, rawComponents]) => {
    const target = normalizePlatform(rawTarget);
    const components = requireRecord(rawComponents, `closure distribution target ${target}`);
    requireKnownKeys(
      components,
      ["native", "resources"],
      `closure distribution target ${target}`,
    );
    return [target, {
      native: normalizeDistributionComponent(
        components.native,
        `closure distribution target ${target} native component`,
      ),
      resources: normalizeDistributionResources(components.resources ?? []),
    }];
  }));
}

function normalizeClosureDistributionManifestDraft(value: unknown): ClosureDistributionManifestDraft {
  const manifest = requireRecord(value, "closure distribution manifest");
  requireKnownKeys(
    manifest,
    ["blobs", "compatibility", "identity", "required", "resources", "schemaVersion"],
    "closure distribution manifest",
  );
  if (manifest.schemaVersion !== CLOSURE_DISTRIBUTION_SCHEMA_VERSION) {
    throw new ClosureProtocolError(
      `unsupported closure distribution schema version: ${String(manifest.schemaVersion)}`,
    );
  }
  if (Object.hasOwn(manifest, "namespace")) {
    throw new ClosureProtocolError("closure distribution manifest must not contain a local namespace");
  }
  const identity = requireRecord(manifest.identity, "closure distribution identity");
  requireKnownKeys(
    identity,
    ["channel", "digest", "protocolVersion", "version"],
    "closure distribution identity",
  );
  if (Object.hasOwn(identity, "namespace") || Object.hasOwn(identity, "platform")) {
    throw new ClosureProtocolError(
      "closure distribution identity must remain namespace-neutral and target-neutral",
    );
  }
  const required = requireRecord(manifest.required, "closure distribution required components");
  requireKnownKeys(
    required,
    ["body", "launcher", "targets"],
    "closure distribution required components",
  );
  const body = normalizeDistributionEntrypointComponent(
    required.body,
    "closure distribution body component",
  );
  if (body.entryPath !== CLOSURE_ARCHIVE_ENTRY_PATH) {
    throw new ClosureProtocolError(
      `closure distribution body entry path must be ${CLOSURE_ARCHIVE_ENTRY_PATH}`,
    );
  }
  const launcher = normalizeDistributionLauncherComponent(
    required.launcher,
    "closure distribution launcher component",
  );
  if (launcher.entryPath !== CLOSURE_LAUNCHER_ENTRY_PATH) {
    throw new ClosureProtocolError(
      `closure distribution launcher entry path must be ${CLOSURE_LAUNCHER_ENTRY_PATH}`,
    );
  }
  const normalized: ClosureDistributionManifestDraft = {
    blobs: normalizeDistributionBlobs(manifest.blobs),
    compatibility: {
      shell: normalizeDistributionShellCompatibility(manifest.compatibility),
    },
    identity: {
      channel: normalizeChannel(identity.channel),
      protocolVersion: normalizeProtocolVersion(identity.protocolVersion),
      version: normalizeVersion(identity.version, "closure distribution version"),
    },
    required: {
      body,
      launcher,
      targets: normalizeDistributionTargets(required.targets),
    },
    resources: normalizeDistributionResources(manifest.resources),
    schemaVersion: CLOSURE_DISTRIBUTION_SCHEMA_VERSION,
  };

  const referenced = new Set<ClosureDigest>([
    normalized.required.body.blob,
    normalized.required.launcher.blob,
    ...normalized.resources.map((resource) => resource.blob),
    ...Object.values(normalized.required.targets).map((target) => target.native.blob),
    ...Object.values(normalized.required.targets).flatMap((target) => (
      target.resources.map((resource) => resource.blob)
    )),
  ]);
  for (const digest of referenced) {
    if (normalized.blobs[digest] == null) {
      throw new ClosureProtocolError(`closure distribution component references unknown blob ${digest}`);
    }
  }
  for (const digest of Object.keys(normalized.blobs)) {
    if (!referenced.has(digest as ClosureDigest)) {
      throw new ClosureProtocolError(`closure distribution contains unused blob ${digest}`);
    }
  }
  for (const [target, targetComponents] of Object.entries(normalized.required.targets)) {
    const componentEntries = [
      ["body", normalized.required.body.blob],
      ["launcher", normalized.required.launcher.blob],
      ["native", targetComponents.native.blob],
    ] as const;
    const required = new Set(componentEntries.map(([, blob]) => blob));
    const requiredBytes = [...required].reduce((total, blob) => total + normalized.blobs[blob]!.size, 0);
    if (requiredBytes >= CLOSURE_DISTRIBUTION_MAX_REQUIRED_BYTES) {
      const components = componentEntries
        .map(([name, blob]) => `${name}=${normalized.blobs[blob]!.size}`)
        .join(", ");
      throw new ClosureProtocolError(
        `closure distribution ${target} cold-start bytes ${components}, unique=${requiredBytes}, `
        + `budget<${CLOSURE_DISTRIBUTION_MAX_REQUIRED_BYTES}`,
      );
    }
  }
  return normalized;
}

function computeClosureDistributionDigest(
  draft: ClosureDistributionManifestDraft,
  digest: ClosureDistributionDigest,
): ClosureDigest {
  return normalizeDigest(digest(`${JSON.stringify(draft)}\n`));
}

export function serializeClosureDistributionManifestForDigest(value: unknown): string {
  return `${JSON.stringify(normalizeClosureDistributionManifestDraft(value))}\n`;
}

export function createClosureDistributionManifest(
  value: unknown,
  digest: ClosureDistributionDigest,
): ClosureDistributionManifest {
  const draft = normalizeClosureDistributionManifestDraft(value);
  return {
    ...draft,
    identity: {
      ...draft.identity,
      digest: computeClosureDistributionDigest(draft, digest),
    },
  };
}

export function validateClosureDistributionManifest(
  value: unknown,
  digest: ClosureDistributionDigest,
): ClosureDistributionManifest {
  const manifest = requireRecord(value, "closure distribution manifest");
  const rawIdentity = requireRecord(manifest.identity, "closure distribution identity");
  const actualDigest = normalizeDigest(rawIdentity.digest);
  const draft = normalizeClosureDistributionManifestDraft(manifest);
  const expectedDigest = computeClosureDistributionDigest(draft, digest);
  if (actualDigest !== expectedDigest) {
    throw new ClosureProtocolError(
      `closure distribution canonical digest ${actualDigest} does not match ${expectedDigest}`,
    );
  }
  return {
    ...draft,
    identity: {
      ...draft.identity,
      digest: actualDigest,
    },
  };
}

function validateContributionIdentity(value: Record<string, unknown>): {
  channel: ClosureChannel;
  protocolVersion: typeof CLOSURE_PROTOCOL_VERSION;
  version: string;
} {
  if (value.schemaVersion !== CLOSURE_DISTRIBUTION_CONTRIBUTION_SCHEMA_VERSION) {
    throw new ClosureProtocolError(
      `unsupported closure distribution contribution schema version: ${String(value.schemaVersion)}`,
    );
  }
  return {
    channel: normalizeChannel(value.channel),
    protocolVersion: normalizeProtocolVersion(value.protocolVersion),
    version: normalizeVersion(value.version, "closure distribution contribution version"),
  };
}

function normalizeContributionArtifact(value: unknown, label: string): ClosureDistributionBlob {
  return normalizeDistributionBlob(value, `${label} artifact`);
}

/** Parse the once-built launcher/body/resource declaration crossing job boundaries. */
export function validateClosureDistributionSharedContribution(
  value: unknown,
): ClosureDistributionSharedContribution {
  const contribution = requireRecord(value, "closure distribution shared contribution");
  requireKnownKeys(
    contribution,
    [
      "body",
      "channel",
      "launcher",
      "protocolVersion",
      "resources",
      "schemaVersion",
      "shellCompatibility",
      "version",
    ],
    "closure distribution shared contribution",
  );
  const identity = validateContributionIdentity(contribution);
  const body = requireRecord(contribution.body, "closure distribution shared body");
  requireKnownKeys(body, ["artifact", "entryPath", "treeDigest"], "closure distribution shared body");
  if (body.entryPath !== CLOSURE_ARCHIVE_ENTRY_PATH) {
    throw new ClosureProtocolError(
      `closure distribution shared body entry path must be ${CLOSURE_ARCHIVE_ENTRY_PATH}`,
    );
  }
  const launcher = requireRecord(contribution.launcher, "closure distribution shared launcher");
  requireKnownKeys(
    launcher,
    ["artifact", "entryPath", "handoffPath", "treeDigest"],
    "closure distribution shared launcher",
  );
  if (
    launcher.entryPath !== CLOSURE_LAUNCHER_ENTRY_PATH
    || launcher.handoffPath !== CLOSURE_LAUNCHER_HANDOFF_PATH
  ) {
    throw new ClosureProtocolError("closure distribution shared launcher entries are invalid");
  }
  if (!Array.isArray(contribution.resources)) {
    throw new ClosureProtocolError("closure distribution shared resources must be an array");
  }
  const resources = contribution.resources.map((value) => {
    const resource = requireRecord(value, "closure distribution shared resource");
    requireKnownKeys(
      resource,
      ["artifact", "id", "startup", "title", "treeDigest"],
      "closure distribution shared resource",
    );
    return {
      artifact: normalizeContributionArtifact(resource.artifact, "closure distribution shared resource"),
      id: normalizeProtocolToken(resource.id, "closure distribution shared resource id"),
      startup: normalizeResourceStartup(resource.startup),
      title: normalizeDisplayTitle(resource.title, "closure distribution shared resource title"),
      treeDigest: normalizeDigest(resource.treeDigest),
    };
  }).sort((left, right) => compareCanonicalStrings(left.id, right.id));
  for (let index = 1; index < resources.length; index += 1) {
    if (resources[index - 1]?.id === resources[index]?.id) {
      throw new ClosureProtocolError("closure distribution shared resource ids must be unique");
    }
  }
  return {
    body: {
      artifact: normalizeContributionArtifact(body.artifact, "closure distribution shared body"),
      entryPath: CLOSURE_ARCHIVE_ENTRY_PATH,
      treeDigest: normalizeDigest(body.treeDigest),
    },
    ...identity,
    launcher: {
      artifact: normalizeContributionArtifact(launcher.artifact, "closure distribution shared launcher"),
      entryPath: CLOSURE_LAUNCHER_ENTRY_PATH,
      handoffPath: CLOSURE_LAUNCHER_HANDOFF_PATH,
      treeDigest: normalizeDigest(launcher.treeDigest),
    },
    resources,
    schemaVersion: CLOSURE_DISTRIBUTION_CONTRIBUTION_SCHEMA_VERSION,
    shellCompatibility: normalizeDistributionShellCompatibility({
      shell: contribution.shellCompatibility,
    }),
  };
}

/** Parse one platform-owned native declaration crossing job boundaries. */
export function validateClosureDistributionTargetContribution(
  value: unknown,
): ClosureDistributionTargetContribution {
  const contribution = requireRecord(value, "closure distribution target contribution");
  requireKnownKeys(
    contribution,
    ["channel", "native", "protocolVersion", "resources", "schemaVersion", "target", "version"],
    "closure distribution target contribution",
  );
  const identity = validateContributionIdentity(contribution);
  const native = requireRecord(contribution.native, "closure distribution target native");
  requireKnownKeys(native, ["artifact", "treeDigest"], "closure distribution target native");
  if (contribution.resources != null && !Array.isArray(contribution.resources)) {
    throw new ClosureProtocolError("closure distribution target resources must be an array");
  }
  const resources = (contribution.resources ?? []).map((value) => {
    const resource = requireRecord(value, "closure distribution target resource");
    requireKnownKeys(
      resource,
      ["artifact", "id", "startup", "title", "treeDigest"],
      "closure distribution target resource",
    );
    return {
      artifact: normalizeContributionArtifact(resource.artifact, "closure distribution target resource"),
      id: normalizeProtocolToken(resource.id, "closure distribution target resource id"),
      startup: normalizeResourceStartup(resource.startup),
      title: normalizeDisplayTitle(resource.title, "closure distribution target resource title"),
      treeDigest: normalizeDigest(resource.treeDigest),
    };
  }).sort((left, right) => compareCanonicalStrings(left.id, right.id));
  for (let index = 1; index < resources.length; index += 1) {
    if (resources[index - 1]?.id === resources[index]?.id) {
      throw new ClosureProtocolError("closure distribution target resource ids must be unique");
    }
  }
  return {
    ...identity,
    native: {
      artifact: normalizeContributionArtifact(native.artifact, "closure distribution target native"),
      treeDigest: normalizeDigest(native.treeDigest),
    },
    resources,
    schemaVersion: CLOSURE_DISTRIBUTION_CONTRIBUTION_SCHEMA_VERSION,
    target: normalizePlatform(contribution.target),
  };
}

function insertContributionBlob(
  blobs: Record<string, ClosureDistributionBlob>,
  blob: ClosureDistributionBlob,
): void {
  const current = blobs[blob.digest];
  if (current != null && JSON.stringify(current) !== JSON.stringify(blob)) {
    throw new ClosureProtocolError(`closure distribution blob metadata conflicts for ${blob.digest}`);
  }
  blobs[blob.digest] = blob;
}

/** Merge validated cross-job declarations into the sole canonical release graph. */
export function mergeClosureDistributionContributions(
  sharedInput: unknown,
  targetInputs: readonly unknown[],
  digest: ClosureDistributionDigest,
): ClosureDistributionManifest {
  const shared = validateClosureDistributionSharedContribution(sharedInput);
  if (targetInputs.length === 0) {
    throw new ClosureProtocolError("closure distribution requires target contributions");
  }
  const blobs: Record<string, ClosureDistributionBlob> = {};
  const targets: Record<string, ClosureDistributionTarget> = {};
  for (const artifact of [
    shared.launcher.artifact,
    shared.body.artifact,
    ...shared.resources.map((resource) => resource.artifact),
  ]) insertContributionBlob(blobs, artifact);
  for (const input of targetInputs) {
    const contribution = validateClosureDistributionTargetContribution(input);
    if (
      contribution.channel !== shared.channel
      || contribution.protocolVersion !== shared.protocolVersion
      || contribution.version !== shared.version
    ) {
      throw new ClosureProtocolError(
        "closure target contributions must describe one release identity",
      );
    }
    if (targets[contribution.target] != null) {
      throw new ClosureProtocolError(
        `duplicate closure target contribution: ${contribution.target}`,
      );
    }
    insertContributionBlob(blobs, contribution.native.artifact);
    for (const resource of contribution.resources) insertContributionBlob(blobs, resource.artifact);
    const sharedResourceIds = new Set(shared.resources.map((resource) => resource.id));
    const duplicateResource = contribution.resources.find((resource) => sharedResourceIds.has(resource.id));
    if (duplicateResource != null) {
      throw new ClosureProtocolError(
        `closure target resource conflicts with shared resource: ${duplicateResource.id}`,
      );
    }
    targets[contribution.target] = {
      native: {
        blob: contribution.native.artifact.digest,
        treeDigest: contribution.native.treeDigest,
      },
      resources: contribution.resources.map((resource) => ({
        blob: resource.artifact.digest,
        id: resource.id,
        startup: resource.startup,
        title: resource.title,
        treeDigest: resource.treeDigest,
      })),
    };
  }
  return createClosureDistributionManifest({
    blobs,
    compatibility: { shell: shared.shellCompatibility },
    identity: {
      channel: shared.channel,
      protocolVersion: shared.protocolVersion,
      version: shared.version,
    },
    required: {
      body: {
        blob: shared.body.artifact.digest,
        entryPath: shared.body.entryPath,
        treeDigest: shared.body.treeDigest,
      },
      launcher: {
        blob: shared.launcher.artifact.digest,
        entryPath: shared.launcher.entryPath,
        handoffPath: shared.launcher.handoffPath,
        treeDigest: shared.launcher.treeDigest,
      },
      targets,
    },
    resources: shared.resources.map((resource) => ({
      blob: resource.artifact.digest,
      id: resource.id,
      startup: resource.startup,
      title: resource.title,
      treeDigest: resource.treeDigest,
    })),
    schemaVersion: CLOSURE_DISTRIBUTION_SCHEMA_VERSION,
  }, digest);
}

export function resolveClosureDistributionTarget(
  manifest: ClosureDistributionManifest,
  value: string,
): ResolvedClosureDistributionTarget {
  const target = normalizePlatform(value);
  const targetComponents = manifest.required.targets[target];
  if (targetComponents == null) {
    throw new ClosureProtocolError(`closure distribution does not contain target ${target}`);
  }
  const required = {
    body: manifest.required.body,
    launcher: manifest.required.launcher,
    native: targetComponents.native,
  };
  const requiredDigests = new Set<ClosureDigest>([
    required.body.blob,
    required.launcher.blob,
    required.native.blob,
  ]);
  const requiredBlobs = [...requiredDigests]
    .sort()
    .map((blobDigest) => {
      const blob = manifest.blobs[blobDigest];
      if (blob == null) {
        throw new ClosureProtocolError(`closure distribution target references unknown blob ${blobDigest}`);
      }
      return blob;
    });
  return {
    required,
    requiredBlobs,
    resources: [...manifest.resources, ...targetComponents.resources]
      .sort((left, right) => compareCanonicalStrings(left.id, right.id))
      .map((resource) => {
      const artifact = manifest.blobs[resource.blob];
      if (artifact == null) {
        throw new ClosureProtocolError(
          `closure distribution resource references unknown blob ${resource.blob}`,
        );
      }
      return { ...resource, artifact };
      }),
    target,
  };
}

export function resolveClosureDistributionColdStartBudget(
  manifest: ClosureDistributionManifest,
  value: string,
): ClosureDistributionColdStartBudget {
  const resolved = resolveClosureDistributionTarget(manifest, value);
  const component = (digest: ClosureDigest): ClosureDistributionBlob => {
    const artifact = manifest.blobs[digest];
    if (artifact == null) {
      throw new ClosureProtocolError(`closure distribution target references unknown blob ${digest}`);
    }
    return artifact;
  };
  return {
    budgetBytes: CLOSURE_DISTRIBUTION_MAX_REQUIRED_BYTES,
    components: {
      body: component(resolved.required.body.blob),
      launcher: component(resolved.required.launcher.blob),
      native: component(resolved.required.native.blob),
    },
    requiredBytes: resolved.requiredBlobs.reduce((total, artifact) => total + artifact.size, 0),
    target: resolved.target,
  };
}
