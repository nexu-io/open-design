import { requestJson } from './http.ts';

export type ExtractedArtifact = {
  artifactType: string;
  html: string;
  identifier: string;
  rawText: string;
  title: string;
};

export type ProjectFile = {
  artifactManifest?: ArtifactManifest;
  kind: string;
  name: string;
  size: number;
};

export type ArtifactManifest = {
  createdAt?: string;
  designSystemId?: string | null;
  entry: string;
  exports: string[];
  kind: string;
  metadata?: Record<string, unknown>;
  renderer: string;
  sourceSkillId?: string;
  status: string;
  title: string;
  updatedAt?: string;
  version: number;
};

export function extractArtifactFromRunEvents(events: string): ExtractedArtifact {
  const rawText = collectRunText(events);
  const artifact = parseArtifactTag(rawText);
  if (artifact == null) {
    throw new Error(`run events did not include a complete artifact block`);
  }
  return { ...artifact, rawText };
}

export async function persistExtractedArtifact(
  baseUrl: string,
  projectId: string,
  artifact: ExtractedArtifact,
  options: { designSystemId?: string | null; sourceSkillId?: string | null } = {},
): Promise<ProjectFile> {
  const fileName = artifactFileNameFor(artifact);
  const response = await requestJson<{ file: ProjectFile }>(
    baseUrl,
    `/api/projects/${encodeURIComponent(projectId)}/files`,
    {
      body: {
        artifactManifest: createHtmlArtifactManifest({
          entry: fileName,
          metadata: {
            artifactType: artifact.artifactType,
            identifier: artifact.identifier,
            inferred: false,
          },
          title: artifact.title || artifact.identifier || fileName,
          ...(options.designSystemId !== undefined ? { designSystemId: options.designSystemId } : {}),
          ...(options.sourceSkillId != null ? { sourceSkillId: options.sourceSkillId } : {}),
        }),
        content: artifact.html,
        name: fileName,
      },
    },
  );
  return response.file;
}

function collectRunText(events: string): string {
  let text = '';
  for (const frame of events.split(/\n\n+/)) {
    const parsed = parseSseFrame(frame);
    if (parsed == null) continue;
    if (parsed.event === 'stdout' && typeof parsed.data?.chunk === 'string') {
      text += parsed.data.chunk;
      continue;
    }
    if (
      parsed.event === 'agent' &&
      parsed.data?.type === 'text_delta' &&
      typeof parsed.data.delta === 'string'
    ) {
      text += parsed.data.delta;
    }
  }
  return text;
}

function parseSseFrame(frame: string): { event: string; data: Record<string, unknown> } | null {
  const lines = frame.split(/\r?\n/);
  const event = lines
    .find((line) => line.startsWith('event:'))
    ?.slice('event:'.length)
    .trim();
  const dataLines = lines
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice('data:'.length).trimStart());
  if (!event || dataLines.length === 0) return null;
  try {
    const data = JSON.parse(dataLines.join('\n')) as unknown;
    if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
    return { event, data: data as Record<string, unknown> };
  } catch {
    return null;
  }
}

function parseArtifactTag(rawText: string): Omit<ExtractedArtifact, 'rawText'> | null {
  const match = rawText.match(/<artifact\s+([^>]*)>([\s\S]*?)<\/artifact>/);
  if (!match) return null;
  const attrs = parseAttrs(match[1] ?? '');
  return {
    artifactType: attrs.type ?? '',
    html: match[2] ?? '',
    identifier: attrs.identifier ?? '',
    title: attrs.title ?? '',
  };
}

function parseAttrs(raw: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const pattern = /(\w+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let match: RegExpExecArray | null = pattern.exec(raw);
  while (match !== null) {
    const key = match[1];
    if (key) attrs[key] = match[2] ?? match[3] ?? '';
    match = pattern.exec(raw);
  }
  return attrs;
}

function artifactFileNameFor(artifact: ExtractedArtifact): string {
  const baseName = (artifact.identifier || artifact.title || 'artifact')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'artifact';
  return `${baseName}${artifactExtensionFor(artifact)}`;
}

function artifactExtensionFor(artifact: ExtractedArtifact): '.html' | '.jsx' | '.tsx' {
  const type = artifact.artifactType.toLowerCase();
  const identifier = artifact.identifier.toLowerCase();
  if (type.includes('tsx') || identifier.endsWith('.tsx')) return '.tsx';
  if (type.includes('jsx') || type.includes('react') || identifier.endsWith('.jsx')) return '.jsx';
  return '.html';
}

function createHtmlArtifactManifest(input: {
  designSystemId?: string | null;
  entry: string;
  metadata?: Record<string, unknown>;
  sourceSkillId?: string;
  title: string;
}): ArtifactManifest {
  const now = new Date().toISOString();
  const manifest: ArtifactManifest = {
    entry: input.entry,
    exports: ['html', 'pdf', 'zip'],
    kind: 'html',
    renderer: 'html',
    status: 'complete',
    title: input.title,
    createdAt: now,
    updatedAt: now,
    version: 1,
  };
  if (input.metadata !== undefined) manifest.metadata = input.metadata;
  if (input.designSystemId !== undefined) manifest.designSystemId = input.designSystemId;
  if (input.sourceSkillId !== undefined) manifest.sourceSkillId = input.sourceSkillId;
  return manifest;
}
