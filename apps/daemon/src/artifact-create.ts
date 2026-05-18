import { Buffer } from 'node:buffer';
import { inferLegacyManifest, validateArtifactManifestInput } from './artifact-manifest.js';

type JsonObject = Record<string, unknown>;

export interface CreateProjectArtifactInput {
  name: string;
  content: string;
  encoding?: 'utf8' | 'base64' | string;
  artifactManifest?: unknown;
}

export interface CreateProjectArtifactOptions {
  projectsRoot: string;
  projectId: string;
  input: CreateProjectArtifactInput;
  metadata?: unknown;
  writeProjectFile: (
    projectsRoot: string,
    projectId: string,
    name: string,
    body: Buffer,
    options: { overwrite: false; artifactManifest: unknown },
    metadata?: unknown,
  ) => Promise<unknown>;
}

export class ArtifactManifestRequiredError extends Error {
  code = 'ARTIFACT_MANIFEST_REQUIRED' as const;

  constructor(name: string) {
    super(`artifactManifest is required for ${name}; no safe default manifest can be inferred`);
  }
}

export class ArtifactManifestInvalidError extends Error {
  code = 'ARTIFACT_MANIFEST_INVALID' as const;

  constructor(message: string) {
    super(`invalid artifactManifest: ${message}`);
  }
}

export function buildCreateArtifactRequestBody(input: CreateProjectArtifactInput): JsonObject {
  return {
    name: input.name,
    content: input.content,
    encoding: input.encoding === 'base64' ? 'base64' : 'utf8',
    artifact: true,
    overwrite: false,
    ...(input.artifactManifest === undefined ? {} : { artifactManifest: input.artifactManifest }),
  };
}

export function resolveCreateArtifactManifest(input: CreateProjectArtifactInput): unknown {
  const manifest = input.artifactManifest !== undefined && input.artifactManifest !== null
    ? input.artifactManifest
    : inferLegacyManifest(input.name);
  if (manifest) {
    const validated = validateArtifactManifestInput(manifest, input.name);
    if (!validated.ok) {
      throw new ArtifactManifestInvalidError(validated.error);
    }
    return validated.value;
  }
  throw new ArtifactManifestRequiredError(input.name);
}

export async function createProjectArtifactFile(options: CreateProjectArtifactOptions): Promise<unknown> {
  const { input } = options;
  const body = input.encoding === 'base64'
    ? Buffer.from(input.content, 'base64')
    : Buffer.from(input.content, 'utf8');
  return await options.writeProjectFile(
    options.projectsRoot,
    options.projectId,
    input.name,
    body,
    {
      overwrite: false,
      artifactManifest: resolveCreateArtifactManifest(input),
    },
    options.metadata,
  );
}

export async function postCreateArtifactRequest(args: {
  baseUrl: string;
  projectId: string;
  input: CreateProjectArtifactInput;
}): Promise<unknown> {
  const response = await fetch(
    `${args.baseUrl.replace(/\/$/, '')}/api/projects/${encodeURIComponent(args.projectId)}/files`,
    {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
      },
      body: JSON.stringify(buildCreateArtifactRequestBody(args.input)),
    },
  );
  const text = await response.text();
  let body: unknown = text;
  if (text.length > 0) {
    try {
      body = JSON.parse(text) as unknown;
    } catch {
      body = { message: text };
    }
  }
  if (!response.ok) {
    const error = new Error(`daemon artifact endpoint failed with ${response.status}`);
    (error as Error & { details?: unknown; status?: number }).details = body;
    (error as Error & { status?: number }).status = response.status;
    throw error;
  }
  return body;
}
