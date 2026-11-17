import path from "node:path";
import { tmpdir } from "node:os";
import { API, type Snapshot } from "@typescript/native/unstable/sync";
import type { SourceFile } from "@typescript/native/unstable/ast";

class SourceParser {
  private readonly root = path.join(tmpdir(), "od-native-parser");
  private config = "";
  private sequence = 0;
  private last: { extension: string; source: string; tree: SourceFile } | undefined;
  private file = "";
  private source = "";
  private readonly batchFiles = new Map<string, string>();
  private readonly batchSources = new Map<string, { file: string }>();
  private batchSnapshot: Snapshot | undefined;
  private readonly batchConfig = path.join(this.root, "batch.json");

  constructor(sources: ReadonlyMap<string, string>) {
    for (const [name, source] of sources) {
      const extension = path.extname(name) || ".ts";
      const key = extension + "\0" + source;
      if (this.batchSources.has(key)) continue;
      const file = path.join(this.root, `batch-${this.batchSources.size}${extension}`);
      this.batchSources.set(key, { file });
      this.batchFiles.set(file, source);
    }
  }

  private readonly api = new API({ fs: {
    readFile: (name) => {
      const resolved = path.resolve(name);
      if (this.batchFiles.has(resolved)) return this.batchFiles.get(resolved);
      if (resolved === this.batchConfig) return JSON.stringify({
        compilerOptions: { noLib: true, noResolve: true, allowJs: true, types: [] },
        files: [...this.batchFiles.keys()],
      });
      if (resolved === this.file) return this.source;
      if (resolved === this.config) return JSON.stringify({
        compilerOptions: { noLib: true, noResolve: true, allowJs: true, types: [] },
        files: [this.file],
      });
      return undefined;
    },
    fileExists: (name) => path.resolve(name) === this.file || path.resolve(name) === this.config || path.resolve(name) === this.batchConfig || this.batchFiles.has(path.resolve(name)) ? true : undefined,
  } });

  parse(fileName: string, source: string): SourceFile {
    const extension = path.extname(fileName) || ".ts";
    if (this.last?.extension === extension && this.last.source === source) return this.last.tree;
    const batch = this.batchSources.get(extension + "\0" + source);
    if (batch) {
      this.batchSnapshot ??= this.api.updateSnapshot({ openProjects: [this.batchConfig] });
      const tree = this.batchSnapshot.getProject(this.batchConfig)?.program.getSourceFile(batch.file);
      if (!tree) throw new Error(`Native TypeScript could not parse ${fileName}`);
      // Guards walk a file immediately. Retain only the last tree for adjacent
      // consumers rather than keeping every materialized JS AST in the batch.
      this.api.clearSourceFileCache();
      this.last = { extension, source, tree };
      return tree;
    }
    const previousConfig = this.config;
    const id = ++this.sequence;
    // Each virtual project is immutable. Reusing a virtual file name can reuse
    // stale native snapshots even when a change notification is supplied.
    this.file = path.join(this.root, `source-${id}${extension}`);
    this.config = path.join(this.root, `tsconfig-${id}.json`);
    this.source = source;
    using snapshot = this.api.updateSnapshot({
      openProjects: [this.config],
      closeProjects: previousConfig ? [previousConfig] : [],
    });
    const parsed = snapshot.getProject(this.config)?.program.getSourceFile(this.file);
    if (!parsed) throw new Error(`Native TypeScript could not parse ${fileName}`);
    this.last = { extension, source, tree: parsed };
    return parsed;
  }

  close(): void {
    this.batchSnapshot?.dispose();
    this.api.close();
  }
}

let activeParser: SourceParser | undefined;

/**
 * Share one native process and, for supplied sources, one immutable parse-only
 * project. Batch inputs avoid rebuilding a project for every file. ASTs are
 * fetched lazily and released with the scope; changed/unlisted sources use an
 * isolated project so they cannot reuse a stale batch tree.
 */
export async function withNativeSourceParser<T>(
  run: () => Promise<T>,
  sources: ReadonlyMap<string, string> = new Map(),
): Promise<T> {
  const previous = activeParser;
  const parser = new SourceParser(sources);
  activeParser = parser;
  try {
    return await run();
  } finally {
    activeParser = previous;
    parser.close();
  }
}

/** Parse only: no dependency resolution, libraries, or files written to disk. */
export function parseSource(fileName: string, source: string): SourceFile {
  if (activeParser) return activeParser.parse(fileName, source);
  const parser = new SourceParser(new Map());
  try {
    return parser.parse(fileName, source);
  } finally {
    parser.close();
  }
}

/** Bound retained native/client AST memory while amortizing project setup. */
export async function forEachNativeSource(
  sources: ReadonlyMap<string, string>,
  visit: (fileName: string, source: string) => void,
): Promise<void> {
  const entries = [...sources];
  for (let offset = 0; offset < entries.length; offset += 256) {
    const batch = new Map(entries.slice(offset, offset + 256));
    await withNativeSourceParser(async () => {
      for (const [fileName, source] of batch) visit(fileName, source);
    }, batch);
  }
}
