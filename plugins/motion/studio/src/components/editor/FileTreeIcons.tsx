import {
  FileHtml,
  FileCss,
  FileJs,
  FileJsx,
  FileTs,
  FileTsx,
  FileTxt,
  FileMd,
  FileSvg,
  FilePng,
  FileJpg,
  FileVideo,
  FileCode,
  File,
  Waveform,
  TextAa,
  Image as PhImage,
} from "@phosphor-icons/react";

const SZ = 14;
const W = "duotone" as const;

type Icon = typeof File;
// Brand hues; each light half is darkened to hold 3:1 on a hovered or selected row.
const RED = "text-[light-dark(oklch(0.59_0.194_35),oklch(0.71_0.194_35))]";
const BLUE = "text-[light-dark(oklch(0.56_0.14_253),oklch(0.69_0.14_253))]";
const GREEN = "text-[light-dark(oklch(0.53_0.192_150),#22C55E)]";
const GRAY = "text-[light-dark(oklch(0.56_0.019_261),#9CA3AF)]";
export const DIM = "text-[light-dark(oklch(0.55_0.023_264),oklch(0.69_0.023_264))]";
const ICONS = new Map<string, [Icon, string]>([
  ["html", [FileHtml, RED]],
  ["css", [FileCss, "text-[light-dark(oklch(0.5_0.2_266),oklch(0.71_0.2_266))]"]],
  ["js", [FileJs, "text-[light-dark(oklch(0.56_0.156_101),#F0DB4F)]"]],
  ["jsx", [FileJsx, "text-[light-dark(oklch(0.55_0.117_219),#61DAFB)]"]],
  ["ts", [FileTs, BLUE]],
  ["tsx", [FileTsx, BLUE]],
  ["json", [FileCode, "text-[light-dark(oklch(0.54_0.182_152),#4ADE80)]"]],
  ["svg", [FileSvg, "text-[light-dark(oklch(0.58_0.187_48),#F97316)]"]],
  ["md", [FileMd, GRAY]],
  ["txt", [FileTxt, GRAY]],
  ["png", [FilePng, GREEN]],
  ["jpg", [FileJpg, GREEN]],
  ["webp", [PhImage, GREEN]],
  ["mp4", [FileVideo, "text-[light-dark(oklch(0.59_0.2_304),oklch(0.71_0.2_304))]"]],
  ["mp3", [Waveform, "text-[light-dark(oklch(0.53_0.159_165),#3CE6AC)]"]],
  ["woff", [TextAa, DIM]],
]);
const ALIAS = new Map(
  Object.entries({
    mjs: "js",
    cjs: "js",
    mts: "ts",
    mdx: "md",
    jpeg: "jpg",
    gif: "webp",
    ico: "webp",
    webm: "mp4",
    mov: "mp4",
    wav: "mp3",
    ogg: "mp3",
    m4a: "mp3",
    woff2: "woff",
    ttf: "woff",
    otf: "woff",
  }),
);

export function FileIcon({ path }: { path: string }) {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const [Glyph, color] = ICONS.get(ALIAS.get(ext) ?? ext) ?? [File, DIM];
  return <Glyph size={SZ} weight={W} className={`shrink-0 ${color}`} />;
}

// ── Tree Types ──

export interface TreeNode {
  name: string;
  fullPath: string;
  children: Map<string, TreeNode>;
  isFile: boolean;
}

export interface ContextMenuState {
  x: number;
  y: number;
  targetPath: string;
  targetIsFolder: boolean;
}

export interface InlineInputState {
  /** Parent folder path (empty string for root) */
  parentPath: string;
  /** "file" or "folder" creation, or "rename" */
  mode: "new-file" | "new-folder" | "rename";
  /** For rename mode, the original full path */
  originalPath?: string;
  /** For rename mode, the original name */
  originalName?: string;
  onCommit?: (name: string) => void;
  onCancel?: () => void;
}

// ── Tree Helpers ──

export function buildTree(files: string[]): TreeNode {
  const root: TreeNode = { name: "", fullPath: "", children: new Map(), isFile: false };
  for (const file of files) {
    const parts = file.split("/");
    let current = root;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLast = i === parts.length - 1;
      const fullPath = parts.slice(0, i + 1).join("/");
      if (!current.children.has(part)) {
        current.children.set(part, {
          name: part,
          fullPath,
          children: new Map(),
          isFile: isLast,
        });
      }
      current = current.children.get(part)!;
      if (isLast) current.isFile = true;
    }
  }
  return root;
}

export function sortChildren(children: Map<string, TreeNode>): TreeNode[] {
  return Array.from(children.values()).sort((a, b) => {
    // index.html always first
    if (a.name === "index.html") return -1;
    if (b.name === "index.html") return 1;
    // Directories before files
    if (!a.isFile && b.isFile) return -1;
    if (a.isFile && !b.isFile) return 1;
    return a.name.localeCompare(b.name);
  });
}

export function isActiveInSubtree(node: TreeNode, activeFile: string | null): boolean {
  if (!activeFile) return false;
  if (node.fullPath === activeFile) return true;
  for (const child of node.children.values()) {
    if (isActiveInSubtree(child, activeFile)) return true;
  }
  return false;
}
