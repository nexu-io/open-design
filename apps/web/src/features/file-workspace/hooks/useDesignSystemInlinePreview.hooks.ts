// Feature-local hook for the design-system section preview cluster: fetches
// an HTML preview file's text, inlines its relative stylesheet/script assets
// so the iframe renders self-contained, and rewrites remaining relative asset
// refs to the project's raw-file URLs. Non-HTML files (images) skip srcDoc
// entirely — the view falls back to the direct file URL.
//
// Same paradigm as useMemoryConfig: transport is INJECTED as the slice port,
// business logic is the pure `rules` rewrite/resolve helpers imported
// directly and given the port's `projectRawUrl` as their `rawUrl` param.
import { useEffect, useState } from 'react';
import { buildSrcdoc } from '../../../runtime/srcdoc';
import type { ProjectFile } from '../../../types';
import { designSystemPreviewPort } from '../dependencies';
import type { DesignSystemPreviewPort } from '../ports';
import {
  baseDirForDesignSystemPreviewFile,
  escapeDesignSystemPreviewAttr,
  readDesignSystemPreviewHtmlAttr,
  resolveDesignSystemPreviewRelativePath,
  rewriteDesignSystemPreviewCssUrls,
  rewriteDesignSystemPreviewHtmlAssetUrls,
  rewriteDesignSystemPreviewInlineCssAssetUrls,
} from '../rules';

export interface DesignSystemInlinePreviewController {
  /** Direct file URL — the iframe/img fallback while srcDoc isn't ready. */
  url: string;
  /** Self-contained srcDoc for an HTML preview once its assets are inlined. */
  srcDoc: string | null;
  /** True once the srcDoc fetch/inline pass has settled (success or empty). */
  srcDocReady: boolean;
}

async function fetchDesignSystemPreviewRelativeText(
  port: DesignSystemPreviewPort,
  projectId: string,
  ownerFileName: string,
  assetRef: string,
): Promise<string | null> {
  const filePath = resolveDesignSystemPreviewRelativePath(ownerFileName, assetRef);
  if (!filePath) return null;
  return port.fetchProjectFileText(projectId, filePath, { cache: 'no-store' });
}

async function inlineDesignSystemPreviewRelativeAssets(
  port: DesignSystemPreviewPort,
  html: string,
  projectId: string,
  ownerFileName: string,
): Promise<string> {
  const replacements: Array<Promise<{ from: string; to: string } | null>> = [];
  const links = html.match(/<link\b[^>]*>/gi) ?? [];
  for (const tag of links) {
    const rel = readDesignSystemPreviewHtmlAttr(tag, 'rel');
    const href = readDesignSystemPreviewHtmlAttr(tag, 'href');
    if (!rel || !/\bstylesheet\b/i.test(rel) || !href) continue;
    const stylesheetPath = resolveDesignSystemPreviewRelativePath(ownerFileName, href);
    if (!stylesheetPath) continue;
    replacements.push(port.fetchProjectFileText(projectId, stylesheetPath, { cache: 'no-store' }).then((css) => {
      if (css == null) return null;
      const safeCss = rewriteDesignSystemPreviewCssUrls(css, projectId, stylesheetPath, port.projectRawUrl)
        .replace(/<\/style/gi, '<\\/style');
      return {
        from: tag,
        to: [
          `<style data-od-inline-asset="${escapeDesignSystemPreviewAttr(href)}">`,
          safeCss,
          '</style>',
        ].join('\n'),
      };
    }));
  }

  const scripts = html.match(/<script\b[^>]*\bsrc\s*=\s*["'][^"']+["'][^>]*>\s*<\/script>/gi) ?? [];
  for (const tag of scripts) {
    const src = readDesignSystemPreviewHtmlAttr(tag, 'src');
    if (!src) continue;
    replacements.push(fetchDesignSystemPreviewRelativeText(port, projectId, ownerFileName, src).then((js) => {
      if (js == null) return null;
      const open = tag.match(/^<script\b[^>]*>/i)?.[0] ?? '<script>';
      const attrs = open
        .replace(/^<script/i, '')
        .replace(/>$/i, '')
        .replace(/\ssrc\s*=\s*(['"])[\s\S]*?\1/i, '');
      return {
        from: tag,
        to: [
          `<script${attrs} data-od-inline-asset="${escapeDesignSystemPreviewAttr(src)}">`,
          js.replace(/<\/script/gi, '<\\/script'),
          '</script>',
        ].join('\n'),
      };
    }));
  }

  const resolved = (await Promise.all(replacements)).filter(
    (replacement): replacement is { from: string; to: string } => replacement !== null,
  );
  const withInlineAssets = resolved.reduce(
    (next, replacement) => next.replace(replacement.from, () => replacement.to),
    html,
  );
  const withInlineCssAssets = rewriteDesignSystemPreviewInlineCssAssetUrls(withInlineAssets, projectId, ownerFileName, port.projectRawUrl);
  return rewriteDesignSystemPreviewHtmlAssetUrls(withInlineCssAssets, projectId, ownerFileName, port.projectRawUrl);
}

export function useDesignSystemInlinePreview(
  port: DesignSystemPreviewPort,
  projectId: string,
  file: ProjectFile,
): DesignSystemInlinePreviewController {
  const url = port.projectFileUrl(projectId, file.name);
  const [srcDoc, setSrcDoc] = useState<string | null>(null);
  const [srcDocReady, setSrcDocReady] = useState(false);

  useEffect(() => {
    setSrcDoc(null);
    setSrcDocReady(false);
    if (file.kind !== 'html') return undefined;
    let cancelled = false;
    void port.fetchProjectFileText(projectId, file.name, {
      cache: 'no-store',
      cacheBustKey: Math.round(file.mtime),
    }).then(async (html) => {
      if (cancelled) return;
      if (!html) {
        setSrcDocReady(true);
        return;
      }
      const inlinedHtml = await inlineDesignSystemPreviewRelativeAssets(port, html, projectId, file.name);
      if (cancelled) return;
      setSrcDoc(buildSrcdoc(inlinedHtml, {
        baseHref: port.projectRawUrl(projectId, baseDirForDesignSystemPreviewFile(file.name)),
      }));
      setSrcDocReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [port, file.kind, file.mtime, file.name, projectId]);

  return { url, srcDoc, srcDocReady };
}

/**
 * Wirer: binds the real provider port and returns a ready-to-call hook. This
 * is the default the orchestrator injects; swap it via the component prop in
 * tests.
 */
export function useWiredDesignSystemInlinePreview(
  projectId: string,
  file: ProjectFile,
): DesignSystemInlinePreviewController {
  return useDesignSystemInlinePreview(designSystemPreviewPort, projectId, file);
}
