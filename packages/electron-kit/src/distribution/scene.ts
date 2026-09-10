import { createHash } from "node:crypto";
import { copyFile, cp, lstat, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";

import { build as bundle } from "esbuild";

import { validateElectronShellManifest, type ElectronShellManifest } from "../contracts/index.js";
import { validateElectronCapsuleContent, type ElectronCapsuleContent } from "../contracts/capsule.js";
import { validateElectronCarrierConfig, type ElectronCarrierConfig } from "../runtime/startup/config.js";
import type { ElectronSceneReceipt } from "./contracts.js";
import { readElectronRuntimeVersion } from "./runtime-version.js";

export type AssembleElectronSceneInput = Readonly<{
  authorityResources: readonly Readonly<{ name: string; path: string }>[];
  capsule?: Readonly<{ content: ElectronCapsuleContent; resourceName: string }>;
  entryPath: string;
  manifest: ElectronShellManifest;
  outputRoot: string;
  rendererPreloadEntryPath: string;
  carrierConfigPath: string;
  standaloneBinding?: Readonly<{
    target: string;
    closureResourceName: string;
    launcherResourceName: string;
  }>;
}>;

const sceneResourceName = /^[a-z][a-z0-9.-]{0,127}$/u;
const reservedSceneProducts = new Set([
  "main.cjs",
  "package.json",
  "renderer-mount-preload.cjs",
  "carrier.json",
  "scene.json",
  "shell.json",
]);

async function describeSceneProduct(root: string, name: string): Promise<Readonly<{
  name: string;
  sha256: string;
  size: number;
  tree?: readonly Readonly<{ path: string; sha256: string; size: number; mode: number }>[];
}>> {
  const path = join(root, name);
  const metadata = await lstat(path);
  if (metadata.isDirectory()) {
    const tree: Array<{ path: string; sha256: string; size: number; mode: number }> = [];
    const walk = async (directory: string, prefix: string) => {
      for (const entry of (await readdir(directory)).sort()) {
        if (entry.includes("\\") || entry.includes("\0")) throw new Error("Electron scene tree has an invalid path");
        const child = join(directory, entry), details = await lstat(child);
        const childName = prefix ? `${prefix}/${entry}` : entry;
        if (details.isDirectory()) await walk(child, childName);
        else if (details.isFile()) {
          const bytes = await readFile(child);
          tree.push({ path: childName, sha256: createHash("sha256").update(bytes).digest("hex"), size: bytes.byteLength, mode: details.mode & 0o777 });
        } else throw new Error(`Electron scene tree contains a link or special file: ${childName}`);
      }
    };
    await walk(path, "");
    if (tree.length === 0) throw new Error("Electron scene resource tree must not be empty");
    return { name, tree, sha256: createHash("sha256").update(JSON.stringify(tree)).digest("hex"), size: tree.reduce((total, file) => total + file.size, 0) };
  }
  if (!metadata.isFile()) throw new Error(`Electron scene product must be a regular file or directory: ${name}`);
  const bytes = await readFile(path);
  return {
    name,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    size: bytes.byteLength,
  };
}

export async function assembleElectronScene(input: AssembleElectronSceneInput): Promise<ElectronSceneReceipt> {
  const authorityResourceNames = new Set<string>();
  for (const resource of input.authorityResources) {
    if (!sceneResourceName.test(resource.name) || reservedSceneProducts.has(resource.name) || authorityResourceNames.has(resource.name)) {
      throw new Error(`invalid or duplicate Electron authority resource name: ${resource.name}`);
    }
    authorityResourceNames.add(resource.name);
  }
  // Capture source bytes before replacing output, and refuse self-contained input
  // trees that output cleanup would destroy. No links are part of a scene tree.
  const sourceResources = await Promise.all(input.authorityResources.map(async resource => {
    const contains = (parent: string, child: string) => {
      const path = relative(resolve(parent), resolve(child));
      return path === "" || (!isAbsolute(path) && path !== ".." && !path.startsWith("../") && !path.startsWith("..\\"));
    };
    if (contains(input.outputRoot, resource.path) || contains(resource.path, input.outputRoot)) throw new Error("Electron scene input and output cannot overlap");
    return describeSceneProduct(dirname(resource.path), basename(resource.path));
  }));
  const declaration = validateElectronShellManifest(input.manifest);
  const carrierConfig = validateElectronCarrierConfig(
    JSON.parse(await readFile(input.carrierConfigPath, "utf8")) as ElectronCarrierConfig,
  );

  await rm(input.outputRoot, { force: true, recursive: true });
  await mkdir(input.outputRoot, { recursive: true });
  const mainPath = join(input.outputRoot, "main.cjs");
  const rendererPreloadPath = join(input.outputRoot, "renderer-mount-preload.cjs");
  const carrierConfigPath = join(input.outputRoot, "carrier.json");
  await bundle({
    absWorkingDir: dirname(resolve(input.entryPath)),
    bundle: true,
    entryPoints: [input.entryPath],
    external: ["electron"],
    format: "cjs",
    outfile: mainPath,
    platform: "node",
    target: "node24",
  });
  await Promise.all(input.authorityResources.map(async (resource, index) => {
    const destination = join(input.outputRoot, resource.name);
    if (sourceResources[index]!.tree == null) await copyFile(resource.path, destination);
    else await cp(resource.path, destination, { recursive: true, dereference: false, errorOnExist: true, force: false });
    const copied = await describeSceneProduct(input.outputRoot, resource.name);
    if (copied.sha256 !== sourceResources[index]!.sha256 || copied.size !== sourceResources[index]!.size) throw new Error(`Electron scene source changed while copying: ${resource.name}`);
  }));
  await bundle({
    absWorkingDir: dirname(resolve(input.rendererPreloadEntryPath)),
    bundle: true,
    entryPoints: [input.rendererPreloadEntryPath],
    external: ["electron"],
    format: "cjs",
    outfile: rendererPreloadPath,
    platform: "node",
    target: "node24",
  });
  await writeFile(carrierConfigPath, `${JSON.stringify(carrierConfig, null, 2)}\n`, "utf8");

  // Product identity binds the neutral carrier, not a workflow/cache key. The
  // manifest itself, release labels, Capsule and Closure are deliberately outside
  // this projection; their own authenticated descriptors bind those bytes.
  const electronVersion = await readElectronRuntimeVersion();
  const carrier = await Promise.all(["main.cjs", "renderer-mount-preload.cjs", "carrier.json"]
    .map(name => describeSceneProduct(input.outputRoot, name)));
  const buildHash = createHash("sha256").update(JSON.stringify({
    schemaVersion: 1, electronVersion,
    target: input.standaloneBinding?.target ?? `${process.platform}-${process.arch}`,
    carrier,
  })).digest("hex");
  const shell = { buildHash, type: "electron" as const, version: declaration.shell.version };
  const manifest = validateElectronShellManifest({ ...declaration, shell: {
    ...shell, digest: createHash("sha256").update(JSON.stringify(shell)).digest("hex"),
  } });

  const packagedManifestPath = join(input.outputRoot, "shell.json");
  await writeFile(packagedManifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  await writeFile(join(input.outputRoot, "package.json"), `${JSON.stringify({
    name: manifest.executableName,
    version: manifest.version,
    private: true,
    description: `${manifest.productName} Electron Shell`,
    author: manifest.publisher,
    main: "main.cjs",
  }, null, 2)}\n`, "utf8");

  const sceneManifestPath = join(input.outputRoot, "scene.json");
  const productNames = [
    "main.cjs",
    "renderer-mount-preload.cjs",
    "carrier.json",
    "shell.json",
    "package.json",
    ...authorityResourceNames,
  ].sort();
  const products = await Promise.all(productNames.map((name) => describeSceneProduct(input.outputRoot, name)));
  const capsule = input.capsule == null ? null : (() => {
    const content = validateElectronCapsuleContent(input.capsule.content);
    const archive = products.find(product => product.name === input.capsule!.resourceName);
    if (archive == null || archive.tree != null || !authorityResourceNames.has(archive.name)
      || archive.sha256 !== content.archive.sha256 || archive.size !== content.archive.size
      || (input.standaloneBinding != null && content.target !== input.standaloneBinding.target)) throw new Error("Electron scene Capsule binding differs from its prebuilt content");
    return Object.freeze({ content, archiveFile: archive.name });
  })();
  const authorityResources = products.filter(({ name }) => authorityResourceNames.has(name)).map((resource) => Object.freeze({
    ...resource,
    path: join(input.outputRoot, resource.name),
  }));
  let standaloneBinding: Readonly<Record<string, unknown>> = Object.freeze({});
  if (input.standaloneBinding != null) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(input.standaloneBinding.target)) throw new Error("invalid Electron Standalone scene target");
    const closure = products.find(({ name }) => name === input.standaloneBinding!.closureResourceName);
    const launcher = products.find(({ name }) => name === input.standaloneBinding!.launcherResourceName);
    if (closure == null || launcher == null || closure.tree != null || launcher.tree != null || !authorityResourceNames.has(closure.name) || !authorityResourceNames.has(launcher.name)) {
      throw new Error("Electron Standalone scene binding must select exact authority resources");
    }
    standaloneBinding = Object.freeze({
      target: input.standaloneBinding.target,
      shellVersion: manifest.shell.version,
      shellBuildHash: manifest.shell.buildHash,
      closure: Object.freeze({ file: closure.name, sha256: closure.sha256, size: closure.size }),
      standalone: Object.freeze({ entrypoint: launcher.name, sha256: launcher.sha256, size: launcher.size }),
    });
  }
  await writeFile(sceneManifestPath, `${JSON.stringify({
    schemaVersion: 1,
    operation: "electron.scene.build",
    ...standaloneBinding,
    ...(capsule == null ? {} : { capsule }),
    authorityResources: [...authorityResourceNames].sort(),
    products,
  }, null, 2)}\n`, "utf8");
  const sceneManifestSha256 = createHash("sha256")
    .update(await readFile(sceneManifestPath))
    .digest("hex");
  const receiptPath = join(dirname(input.outputRoot), "scene-receipt.json");
  const receipt = {
    schemaVersion: 1 as const,
    operation: "electron.scene.build" as const,
    sceneRoot: input.outputRoot,
    sceneManifestPath,
    sceneManifestSha256,
    receiptPath,
    mainPath,
    rendererPreloadPath,
    shellManifestPath: packagedManifestPath,
    carrierConfigPath,
    authorityResources: Object.freeze(authorityResources),
  };
  await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
  return receipt;
}

/** Rehydrate a path-bearing receipt from one immutable, path-neutral scene. */
export async function loadElectronScene(sceneRootInput: string, expectedManifestSha256: string): Promise<ElectronSceneReceipt> {
  const sceneRoot = resolve(sceneRootInput);
  const sceneManifestPath = join(sceneRoot, "scene.json");
  const manifestBytes = await readFile(sceneManifestPath);
  if (!/^[a-f0-9]{64}$/u.test(expectedManifestSha256) || createHash("sha256").update(manifestBytes).digest("hex") !== expectedManifestSha256) {
    throw new Error("Electron scene manifest failed binding verification");
  }
  const manifest = JSON.parse(manifestBytes.toString("utf8")) as { schemaVersion?: unknown; operation?: unknown; products?: unknown; authorityResources?: unknown };
  if (manifest.schemaVersion !== 1 || manifest.operation !== "electron.scene.build" || !Array.isArray(manifest.products) || !Array.isArray(manifest.authorityResources)) {
    throw new Error("Electron scene manifest is invalid");
  }
  const products = new Map<string, Awaited<ReturnType<typeof describeSceneProduct>>>();
  for (const value of manifest.products) {
    if (value == null || typeof value !== "object" || Array.isArray(value)) throw new Error("Electron scene product is invalid");
    const product = value as { name?: unknown; sha256?: unknown; size?: unknown };
    if (typeof product.name !== "string" || !sceneResourceName.test(product.name) || products.has(product.name)
      || typeof product.sha256 !== "string" || !/^[a-f0-9]{64}$/u.test(product.sha256)
      || !Number.isSafeInteger(product.size) || (product.size as number) < 0) throw new Error("Electron scene product is invalid");
    const actual = await describeSceneProduct(sceneRoot, product.name);
    if (actual.sha256 !== product.sha256 || actual.size !== product.size) throw new Error(`Electron scene product failed binding verification: ${product.name}`);
    if (JSON.stringify(actual.tree) !== JSON.stringify((value as { tree?: unknown }).tree)) throw new Error(`Electron scene tree manifest differs: ${product.name}`);
    products.set(product.name, actual);
  }
  const authorityNames = manifest.authorityResources;
  if (authorityNames.some((name) => typeof name !== "string" || !products.has(name)) || new Set(authorityNames).size !== authorityNames.length) {
    throw new Error("Electron scene authority resource index is invalid");
  }
  const product = (name: string) => {
    if (!products.has(name)) throw new Error(`Electron scene lacks required product ${name}`);
    return join(sceneRoot, name);
  };
  return Object.freeze({
    schemaVersion: 1,
    operation: "electron.scene.build",
    sceneRoot,
    sceneManifestPath,
    sceneManifestSha256: expectedManifestSha256,
    receiptPath: join(dirname(sceneRoot), "scene-receipt.json"),
    mainPath: product("main.cjs"),
    rendererPreloadPath: product("renderer-mount-preload.cjs"),
    shellManifestPath: product("shell.json"),
    carrierConfigPath: product("carrier.json"),
    authorityResources: Object.freeze(authorityNames.map((name) => Object.freeze({ ...products.get(name)!, path: join(sceneRoot, name) }))),
  });
}
