import { inferLegacyManifest } from './manifest';
import type { ArtifactManifest, ArtifactRendererId } from './types';
import type { ProjectFile } from '../types';

export interface ArtifactRendererContext {
  file: ProjectFile;
  isDeckHint: boolean;
}

export interface ArtifactRenderer {
  id: ArtifactRendererId;
  canRender: (ctx: ArtifactRendererContext) => boolean;
}

export interface ArtifactRenderMatch {
  renderer: ArtifactRenderer;
  manifest: ArtifactManifest;
}

function resolveManifest(file: ProjectFile): ArtifactManifest | null {
  return file.artifactManifest ?? inferLegacyManifest({ entry: file.name });
}

export const HtmlRenderer: ArtifactRenderer = {
  id: 'html',
  canRender: ({ file, isDeckHint }) => {
    const manifest = resolveManifest(file);
    if (!manifest) return false;
    if (manifest.kind === 'deck' || manifest.renderer === 'deck-html') return false;
    if (manifest.renderer === 'html' || manifest.kind === 'html') return true;
    return file.kind === 'html' && !isDeckHint;
  },
};

export const DeckHtmlRenderer: ArtifactRenderer = {
  id: 'deck-html',
  canRender: ({ file, isDeckHint }) => {
    const manifest = resolveManifest(file);
    if (!manifest) return false;
    if (manifest.kind === 'deck' || manifest.renderer === 'deck-html') return true;
    return file.kind === 'html' && isDeckHint;
  },
};

export class RendererRegistry {
  constructor(private readonly renderers: ArtifactRenderer[]) {}

  resolve(ctx: ArtifactRendererContext): ArtifactRenderMatch | null {
    const manifest = resolveManifest(ctx.file);
    if (!manifest) return null;
    const renderer = this.renderers.find((item) => item.canRender(ctx));
    if (!renderer) return null;
    return { renderer, manifest };
  }
}

export const artifactRendererRegistry = new RendererRegistry([
  DeckHtmlRenderer,
  HtmlRenderer,
]);
