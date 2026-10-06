/**
 * 「这份产物导得出几种格式」—— 产物卡上那枚〔导出〕唯一需要知道的事。
 *
 * ## 事实源在哪
 *
 * 格式菜单**只有一个出处**:`FileViewer` 里的 `HtmlViewer`。
 * `artifactRendererRegistry`(`src/artifacts/renderer-registry.ts`)决定一份文件
 * 交给哪个 viewer 渲染,而 `FileViewer` 只把 `shareRequest` / `downloadRequest`
 * 转给 `HtmlViewer` 这一支 —— markdown / svg / react-component / 图片 / 视频
 * 那几支**根本收不到**这两个信号。也就是说:
 *
 *   · html / deck-html  → 预览区右上角有〔导出〕下拉,里面 PDF / 图片 / ZIP /
 *                          独立 HTML(是幻灯片再多一条 PPTX)
 *   · 其余一切          → 预览区右上角**没有**格式下拉
 *
 * 产品口径(2026-08-27):**只有一种格式可选的产物,点〔导出〕就直接下载**,
 * 不弹任何东西 —— 为一个只有一条的菜单花掉一次点击是白花的(和设计稿撤掉
 * 卡上「⋯」是同一条理由:「一枚点开只有一条的菜单更不该留:那是把一次点击
 * 换成两次」)。多格式的那一档才配一枚浮层。
 *
 * ## 为什么单独成一个纯模块
 *
 * 这条判据原来只以 `isShareableArtifact` / `showMarkdownExport` 这类局部变量
 * 的形态活在 16k 行的 `FileViewer.tsx` 里,产物卡够不着。抽出来之后两边读同
 * 一条规则,`artifact-export.test.ts` 把它和 `artifactRendererRegistry` 钉在
 * 一起 —— viewer 的路由一改,这里当场红。
 *
 * PPTX 不在这张表里:它要 `deckExportSignal`,而那要读文件正文,产物卡手上
 * 只有一个文件名。幻灯片仍然可以在预览区导 PPTX,卡上这枚给的是与文件名可判
 * 定的那几种。
 */

/** 卡上那枚浮层能给出的格式。值同时是 `downloadRequest.format` 的取值。 */
export type ArtifactExportFormat = 'pdf' | 'image' | 'zip' | 'html';

/** 多格式产物的格式表,顺序即浮层里的顺序(与预览区导出菜单一致)。 */
const HTML_EXPORT_FORMATS: readonly ArtifactExportFormat[] = ['pdf', 'image', 'zip', 'html'];

/** `.html` / `.htm` 是唯一走 `HtmlViewer` 的后缀,也就是唯一有格式菜单的一档。 */
function routesToHtmlViewer(name: string): boolean {
  return /\.html?$/i.test(String(name ?? ''));
}

/**
 * 这份产物有几种导出格式可选。
 *
 * 空数组 = **只有一种**(原件本身),调用方应该直接下载,不要弹选择。
 * 非空 = 需要让人先选一种。
 */
export function artifactExportFormats(name: string): readonly ArtifactExportFormat[] {
  return routesToHtmlViewer(name) ? HTML_EXPORT_FORMATS : [];
}

/** 点〔导出〕该不该弹格式浮层。 */
export function artifactExportNeedsFormatChoice(name: string): boolean {
  return artifactExportFormats(name).length > 1;
}
