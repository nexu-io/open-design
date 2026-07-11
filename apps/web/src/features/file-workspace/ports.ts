// The file-workspace slice's dependency on transport, expressed as an
// interface it owns. The slice depends on this port, never on `providers/`
// directly; a provider is bound to it in `dependencies.ts`. Tests supply a
// hand-written fake — no global `fetch` mocking, no module-path mocks.

/** Transport the design-system inline-preview cluster needs: reading a
 *  project file's text (HTML/CSS/JS) and building stable raw/file URLs for
 *  the iframe/img fallback and any asset it inlines. */
export interface DesignSystemPreviewPort {
  fetchProjectFileText(
    projectId: string,
    name: string,
    options?: { cache?: 'no-store'; cacheBustKey?: string | number },
  ): Promise<string | null>;
  projectFileUrl(projectId: string, name: string): string;
  projectRawUrl(projectId: string, filePath: string): string;
}
