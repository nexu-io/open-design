// The file-workspace slice's dependency on transport, expressed as an
// interface it owns. The slice depends on this port, never on `providers/`
// directly; a provider is bound to it in `dependencies.ts`. Tests supply a
// hand-written fake — no global `fetch` mocking, no module-path mocks.
import type { ExtractBrandFromHtmlOutcome } from '../../runtime/brands';

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

/** Transport + DOM the design-system project kit-action cluster needs:
 *  reading/writing DESIGN.md and brand.json, refreshing/downloading the kit
 *  archive, and the mutating brand-color/logo/image/status/default calls the
 *  kit view fires. `confirmDelete` is a `window.confirm` DOM bridge — the
 *  slice never touches `window` directly. */
export interface DesignSystemKitActionsPort {
  writeProjectTextFile(projectId: string, name: string, content: string): Promise<{ name: string } | null>;
  updateDesignSystemDraft(
    id: string,
    patch: { body?: string; status?: 'draft' | 'published' },
  ): Promise<{ status?: string } | null>;
  fetchProjectFileText(
    projectId: string,
    name: string,
    options?: { cache?: 'no-store' },
  ): Promise<string | null>;
  readDesignMd(projectId: string): Promise<string>;
  finalizeBrandProject(brandId: string, projectId: string): Promise<ExtractBrandFromHtmlOutcome>;
  startDesignSystemTokenContractRebuildJob(id: string, options: { force: boolean }): Promise<object | null>;
  downloadProjectArchive(options: { projectId: string; fallbackTitle: string }): Promise<boolean>;
  downloadDesignSystemArchive(options: { designSystemId: string; fallbackTitle: string }): Promise<boolean>;
  deleteDesignSystemDraft(id: string): Promise<boolean>;
  updateBrandColor(projectId: string, index: number, hex: string): Promise<boolean>;
  deleteBrandLogo(projectId: string, index: number): Promise<boolean>;
  deleteBrandImage(projectId: string, index: number): Promise<boolean>;
  confirmDelete(message: string): boolean;
}
