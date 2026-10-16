// @vitest-environment jsdom
import { Blob as NodeBlob } from "node:buffer";
import { spawnSync } from "node:child_process";
import { createHash, randomUUID, webcrypto } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { compileFunction, constants as vmConstants } from "node:vm";
import ts from "typescript";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TouchpointComponentV2ManifestSchema as currentManifestSchema, type TouchpointDiagnostic, type TouchpointSdk, } from "@open-design/contracts";
import { verifyWebTouchpoint as currentVerify, type WebTouchpointContent, type WebTouchpointContext, type WebTouchpointHostContext, } from "../../src/components/touchpoint-component";
import producerMetadata from "../fixtures/cms/historical-client/v0.23.0/amr-runtime-api1.json";
import producerPlacements from "../fixtures/cms/historical-client/v0.23.0/amr-runtime-api1-placements.json";
import roleProducer from "../fixtures/cms/historical-client/v0.23.0/amr-role-runtime-api1.json";
import binding from "../fixtures/cms/historical-client/v0.23.0/source-manifest.json";
// Keep each fixture file below the static gate's 1 MiB limit. Restoring the
// original key preserves the producer payload hash and all exact runtime bytes.
const producer = { ...producerMetadata, placements: producerPlacements };
/**
 * This is an OD consumer regression, not an AMR compiler reimplementation.
 * The immutable fixture includes the original ZIP and actual getPreviewVersion
 * DTOs. Only the two old TS sources are transpiled here; AMR entry/resource bytes
 * are never generated or rewritten. jsdom does not prove image/font decoding,
 * geometry, native browser Blob imports or an unchanged signed old binary.
 */
const fixtureRoot = pathToFileURL(`${resolve(process.cwd(), "tests/fixtures/cms/historical-client/v0.23.0")}/`);
const sha = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");
const digest = (value: string | Uint8Array) => `sha256:${sha(value)}`;
// jsdom's Function belongs to a VM realm without an import callback. Explicitly
// select Node's genuine ESM loader, keeping module parsing/execution native.
const nativeImport = compileFunction("return import(url)", ["url"], {
    importModuleDynamically: vmConstants.USE_MAIN_CONTEXT_DEFAULT_LOADER,
}) as (url: string) => Promise<unknown>;
const dataModule = (code: string, identity: string) => `data:text/javascript;base64,${Buffer.from(code).toString("base64")}#${identity}`;
const contractsRequire = createRequire(resolve(process.cwd(), "../../packages/contracts/package.json"));
type Verified = {
    resourceUrls: Map<string, string>;
    entryUrl: string;
    dispose: () => void;
};
type FixtureInstance = {
    events: string[];
    disposed: boolean;
    phase: string;
    fontReady: Promise<boolean>;
};
type OldElement = HTMLElement & {
    mount: (url: string, hash: string, context: WebTouchpointContext, resources: Map<string, string>, actions?: ReadonlySet<string>, options?: {
        dispatchAction?: (id: string) => Promise<void>;
        requestClose?: () => void;
        onDiagnostic?: (diagnostic: TouchpointDiagnostic) => void;
    }) => Promise<void>;
    update: (context: WebTouchpointContext, resources: Map<string, string>) => Promise<void>;
    dispose: () => Promise<void>;
    getDiagnostics: () => readonly TouchpointDiagnostic[];
};
type OldLoader = {
    OpenDesignTouchpointElement: CustomElementConstructor;
    verifyWebTouchpoint: (content: WebTouchpointContent) => Promise<Verified>;
    webTouchpointContext: (content: WebTouchpointContent, host: WebTouchpointHostContext) => WebTouchpointContext | undefined;
    hasWebTouchpointCloseControl: (element: OldElement) => boolean;
    supportsWebTouchpointCapabilities: (content: WebTouchpointContent, required: unknown, supported: ReadonlySet<string>) => boolean;
    webTouchpointModuleCache: {
        metrics: () => {
            count: number;
            nativeEsmCount: number;
            failed: number;
        };
    };
};
type OldContract = {
    TouchpointComponentV2ManifestSchema: {
        safeParse: (value: unknown) => {
            success: boolean;
        };
    };
    TouchpointModuleCache: new (limit: number) => unknown;
    TouchpointUpdateQueue: new <Context>(apply: (context: Context) => Promise<void>, diagnose?: (code: string) => void) => {
        schedule: (context: Context) => Promise<void>;
        cancel: () => void;
    };
    createTouchpointSdk: (host: {
        signal: AbortSignal;
        actionIds: ReadonlySet<string>;
        resources: ReadonlyMap<string, string>;
        now: () => number;
        dispatchAction?: (id: string) => Promise<void>;
        requestClose?: () => void;
        diagnose?: (diagnostic: TouchpointDiagnostic) => void;
    }) => {
        sdk: TouchpointSdk;
        revoke: () => void;
    };
};
function dto(index = 0): WebTouchpointContent {
    // Clone only inputs used for mutation tests; the source JSON stays immutable.
    return structuredClone(producer.placements[index]!.transportDto) as WebTouchpointContent;
}
function context(loader: OldLoader, value: WebTouchpointContent, locale = "en-US") {
    const result = loader.webTouchpointContext(value, {
        locale, theme: "light", fontFamily: "sans-serif",
        cssVariables: { "--background": "white", "--foreground": "black" },
    });
    expect(result?.locale).toBe(locale);
    return result!;
}
function completion<T>() {
    let resolve!: (value: T) => void;
    let reject!: (reason: unknown) => void;
    const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
    return { promise, resolve, reject };
}
// Register a fresh old class/cache per test; CustomElementRegistry cannot delete
// registrations. No fake namespace is ever inserted into the module cache.
const cleanups: Array<() => Promise<void> | void> = [];
afterEach(async () => {
    const failures: unknown[] = [];
    try {
        for (const cleanup of cleanups.splice(0).reverse()) {
            try {
                await cleanup();
            }
            catch (error) {
                failures.push(error);
            }
        }
    }
    finally {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    }
    if (failures.length)
        throw new AggregateError(failures, "historical_harness_cleanup_failed");
});

describe("source-pinned old client consumption of an actual registered role producer", () => {
  const roleDto = () =>
    structuredClone(
      roleProducer.placements[0]!.transportDto,
    ) as WebTouchpointContent;
  const roleHarness = () =>
    historicalHarness({
      entries: roleProducer.placements.map(
        (placement) => placement.transportDto,
      ),
      fontBase64: roleProducer.source.font.base64,
    });
  it("pins actual producer ZIP, registered renderer, every artifact, manifest and serializer DTO", () => {
    const pin = binding.roleProducerFixture;
    const bytes = readFileSync(new URL(pin.file, fixtureRoot));
    expect(sha(bytes)).toBe(pin.sha256);
    expect(bytes.length).toBe(pin.sizeBytes);
    expect(roleProducer.provenance.producerGitHead).toBe(pin.producerGitHead);
    const { payloadSha256, ...unsigned } = roleProducer;
    expect(digest(JSON.stringify(unsigned))).toBe(payloadSha256);
    for (const asset of [
      roleProducer.sourceZip,
      roleProducer.source.renderer,
      roleProducer.source.font,
      roleProducer.runtime.canonicalManifest,
      ...Object.values(roleProducer.runtime.artifacts),
    ]) {
      const content = Buffer.from(asset.base64, "base64");
      expect(content.length).toBe(asset.sizeBytes);
      expect(digest(content)).toBe(asset.sha256);
    }
    expect(roleProducer.sourceZip.sha256).toBe(pin.sourcePackageHash);
    expect(roleProducer.runtime.canonicalManifest.sha256).toBe(
      pin.manifestHash,
    );
    expect(
      Buffer.from(
        roleProducer.runtime.canonicalManifest.base64,
        "base64",
      ).toString(),
    ).toBe(JSON.stringify(roleProducer.runtime.manifest));
    const inventory = Object.entries(roleProducer.runtime.artifacts).sort(
      ([left], [right]) => left.localeCompare(right),
    );
    expect(
      digest(
        inventory.map(([path, asset]) => `${path}\0${asset.sha256}`).join("\n"),
      ),
    ).toBe(pin.artifactHash);
    expect(roleProducer.runtime.artifactHash).toBe(pin.artifactHash);
    expect(roleProducer.source.template.renderer.digest).toBe(
      roleProducer.source.renderer.sha256,
    );
    expect(roleProducer.runtime.manifest.material.sourceDslVersion).toBe(3);
    const selectedPlacements = new Set(
      roleProducer.runtime.manifest.placements.map((item) => item.key),
    );
    expect(roleProducer.runtime.manifest.roleBindings).toEqual({
      version: 1,
      bindings: roleProducer.source.template.roleBindings.bindings
        .filter((item) => selectedPlacements.has(item.placementKey))
        .sort((a, b) => {
          for (const key of [
            "placementKey",
            "fieldKey",
            "buttonId",
            "role",
          ] as const) {
            if (a[key] < b[key]) return -1;
            if (a[key] > b[key]) return 1;
          }
          return 0;
        }),
    });
    expect(
      roleProducer.provenance.producerSourceSha256[
        "packages/shared/src/material-action-roles.ts"
      ],
    ).toMatch(/^sha256:[a-f0-9]{64}$/);
    const artifacts: Record<string, { base64: string; sha256: string }> =
      roleProducer.runtime.artifacts;
    for (const placement of roleProducer.placements) {
      const value = placement.transportDto;
      const selected = value.manifest.placements.find(
        (item) => item.key === value.placementKey,
      )!;
      expect(value.manifest).toEqual(roleProducer.runtime.manifest);
      const build = value.buildIdentity!;
      expect(build.sourcePackageHash).toBe(pin.sourcePackageHash);
      expect(build.manifestHash).toBe(pin.manifestHash);
      expect(build.artifactHash).toBe(pin.artifactHash);
      expect(build.fingerprint).toBe(
        [
          build.builderVersion,
          build.validatorVersion,
          build.optimizationConfigVersion,
          build.sourcePackageHash,
          build.manifestHash,
          build.artifactHash,
        ].join("\n"),
      );
      expect(value.manifestHash).toBe(pin.manifestHash);
      expect(digest(value.entryModule)).toBe(value.entryDigest);
      expect(
        Buffer.from(value.entryModule).equals(
          Buffer.from(artifacts[value.entryPath]!.base64, "base64"),
        ),
      ).toBe(true);
      expect(value.resources.map((item) => item.path).sort()).toEqual(
        [selected.entry, ...selected.resources].sort(),
      );
      for (const resource of value.resources) {
        expect(resource.bytes).toBe(artifacts[resource.path]!.base64);
        expect(resource.digest).toBe(artifacts[resource.path]!.sha256);
      }
      for (const action of selected.staticActions)
        expect(Object.keys(action).sort()).toEqual(["id", "target"]);
    }
  });
  it("executes exact verified entry bytes and preserves explicit roles through locale reorder, cache reuse and cleanup", async () => {
    const h = await roleHarness();
    const value = roleDto();
    const verified = await h.loader.verifyWebTouchpoint(value);
    cleanups.push(verified.dispose);
    const selected = value.manifest.placements.find(
      (item) => item.key === value.placementKey,
    )!;
    const actionIds = new Set(selected.staticActions.map((item) => item.id));
    const english = context(h.loader, value, "en");
    const french = context(h.loader, value, "fr");
    const expected = (locale: "en" | "fr") =>
      roleProducer.source.materialSource.locales[locale].buttons.map(
        (button) => ({
          id: button.id,
          role: roleProducer.runtime.manifest.roleBindings.bindings.find(
            (binding) =>
              binding.placementKey === value.placementKey &&
              binding.fieldKey === "buttons" &&
              binding.buttonId === button.id,
          )?.role,
          label: button.label,
        }),
      );
    const snapshot = () =>
      [
        ...h.element.shadowRoot!.querySelectorAll<HTMLButtonElement>("button"),
      ].map((button) => ({
        id: button.dataset.id,
        role: button.dataset.role,
        label: button.textContent,
      }));
    await h.element.mount(
      verified.entryUrl,
      value.entryDigest,
      english,
      verified.resourceUrls,
      actionIds,
    );
    expect(snapshot()).toEqual(expected("en"));
    expect(h.loader.webTouchpointModuleCache.metrics()).toMatchObject({
      count: 1,
      nativeEsmCount: 1,
      failed: 0,
    });
    await h.element.update(french, verified.resourceUrls);
    expect(snapshot()).toEqual(expected("fr"));
    await h.element.dispose();
    expect(h.element.shadowRoot!.childNodes.length).toBe(0);
    expect(h.fonts.size).toBe(0);
    await h.element.mount(
      verified.entryUrl,
      value.entryDigest,
      english,
      verified.resourceUrls,
      actionIds,
    );
    expect(snapshot()).toEqual(expected("en"));
    expect(h.importedDigests).toEqual([value.entryDigest]);
    await h.element.dispose();
    await h.element.update(french, verified.resourceUrls);
    expect(h.element.shadowRoot!.childNodes.length).toBe(0);
    expect(h.element.getDiagnostics()).toEqual([]);
    expect(h.fonts.size).toBe(0);
    verified.dispose();
    expect([...h.blobs.keys()].every((url) => h.revoked.includes(url))).toBe(
      true,
    );
    // This renderer proves role projection, not SDK navigation or image decode.
  });
  it.each(["role", "missing_role", "entry", "resource"])(
    "old verifier rejects %s tamper before native import",
    async (change) => {
      const h = await roleHarness();
      const value = roleDto();
      if (change === "role") {
        const manifest = value.manifest as typeof roleProducer.runtime.manifest;
        manifest.roleBindings.bindings[0]!.role = "secondary";
      }
      if (change === "missing_role")
        Reflect.deleteProperty(value.manifest, "roleBindings");
      if (change === "entry") value.entryModule += "\n// tamper";
      if (change === "resource")
        value.resources[0]!.bytes = Buffer.from("tamper").toString("base64");
      await expect(h.loader.verifyWebTouchpoint(value)).rejects.toThrow(
        "touchpoint_integrity_failed",
      );
      expect(h.importedDigests).toEqual([]);
      expect(h.loader.webTouchpointModuleCache.metrics().count).toBe(0);
      expect([...h.blobs.keys()].every((url) => h.revoked.includes(url))).toBe(
        true,
      );
    },
  );
});
async function historicalHarness(
  input: Readonly<{
    entries: readonly Readonly<{ entryDigest: string; entryModule: string }>[];
    fontBase64: string;
  }> = {
    entries: producer.placements.map((placement) => placement.transportDto),
    fontBase64: producer.source.font.base64,
  },
) {
  const identity = randomUUID();
  const routeKey = `historicalImport_${identity}`;
  const sources = binding.sources.map((source) => {
    const bytes = readFileSync(new URL(source.snapshot, fixtureRoot));
    expect(sha(bytes)).toBe(source.sha256);
    expect(bytes.length).toBe(source.sizeBytes);
    return bytes.toString("utf8");
  });
  expect(ts.version).toBe(binding.dependencies.typescript);
  expect(contractsRequire("zod/package.json").version).toBe(
    binding.dependencies.zod,
  );
  const zodUrl = pathToFileURL(contractsRequire.resolve("zod")).href;
  function compile(
    source: string,
    dependency: string,
    target: string,
    routeImport = false,
  ) {
    const imports: string[] = [];
    let dynamicImports = 0;
    const result = ts.transpileModule(source, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
      },
      reportDiagnostics: true,
      transformers: {
        before: [
          (compiler) => {
            const visit: ts.Visitor = (node) => {
              if (
                ts.isImportDeclaration(node) &&
                ts.isStringLiteral(node.moduleSpecifier) &&
                !node.importClause?.isTypeOnly
              ) {
                imports.push(node.moduleSpecifier.text);
                expect(node.moduleSpecifier.text).toBe(dependency);
                return compiler.factory.updateImportDeclaration(
                  node,
                  node.modifiers,
                  node.importClause,
                  compiler.factory.createStringLiteral(target),
                  node.attributes,
                );
              }
              if (
                ts.isCallExpression(node) &&
                node.expression.kind === ts.SyntaxKind.ImportKeyword
              ) {
                expect(routeImport).toBe(true);
                expect(node.arguments.length).toBe(1);
                expect(node.arguments[0]?.getText()).toBe("entryUrl");
                dynamicImports++;
                return compiler.factory.createCallExpression(
                  compiler.factory.createElementAccessExpression(
                    compiler.factory.createIdentifier("globalThis"),
                    compiler.factory.createStringLiteral(routeKey),
                  ),
                  undefined,
                  node.arguments,
                );
              }
              return ts.visitEachChild(node, visit, compiler);
            };
            return (file) => ts.visitNode(file, visit) as ts.SourceFile;
          },
        ],
      },
    });
    expect(imports).toEqual([dependency]);
    expect(dynamicImports).toBe(routeImport ? 1 : 0);
    expect(
      result.diagnostics?.filter(
        (item) => item.category === ts.DiagnosticCategory.Error,
      ),
    ).toEqual([]);
    return result.outputText;
  }
  // jsdom Blob lacks arrayBuffer; use the real Node Blob for exact byte routing.
  // Keep DOM AbortController intact: jsdom EventTarget requires its own signal.
  vi.stubGlobal("Blob", NodeBlob);
  vi.stubGlobal("crypto", webcrypto);
  // jsdom has no font engine. Observe only the real module's API calls and
  // original font bytes; native Chromium below establishes glyph decoding.
  const fontCalls: string[] = [];
  class ObservedFontFace {
    status: FontFaceLoadStatus = "unloaded";
    constructor(
      readonly family: string,
      readonly source: ArrayBuffer,
      readonly descriptors: FontFaceDescriptors,
    ) {
      fontCalls.push("construct");
      expect(Buffer.from(new Uint8Array(source))).toEqual(
        Buffer.from(input.fontBase64, "base64"),
      );
    }
    load() {
      fontCalls.push("load");
      this.status = "loaded";
      return Promise.resolve(this);
    }
  }
  const fonts = new Set<ObservedFontFace>();
  const fontSet = {
    add(face: ObservedFontFace) {
      fontCalls.push("add");
      fonts.add(face);
      return this;
    },
    delete(face: ObservedFontFace) {
      fontCalls.push("delete");
      return fonts.delete(face);
    },
  };
  vi.stubGlobal("FontFace", ObservedFontFace);
  const fontDescriptor = Object.getOwnPropertyDescriptor(document, "fonts");
  Object.defineProperty(document, "fonts", {
    configurable: true,
    value: fontSet,
  });
  cleanups.push(() => {
    if (fontDescriptor)
      Object.defineProperty(document, "fonts", fontDescriptor);
    else Reflect.deleteProperty(document, "fonts");
  });
  const blobs = new Map<string, NodeBlob>();
  const revoked: string[] = [];
  const importedDigests: string[] = [];
  const create = vi.spyOn(URL, "createObjectURL").mockImplementation((blob) => {
    const url = `blob:historical/${identity}/${blobs.size}`;
    blobs.set(url, blob as NodeBlob);
    return url;
  });
  vi.spyOn(URL, "revokeObjectURL").mockImplementation((url) => {
    revoked.push(url);
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      const blob = blobs.get(url);
      if (!blob || revoked.includes(url))
        throw new Error(`unexpected_transport:${url}`);
      return new Response(await blob.arrayBuffer(), {
        headers: { "content-type": blob.type },
      });
    }),
  );
  vi.stubGlobal(routeKey, async (url: string) => {
    const blob = blobs.get(url);
    if (!blob || revoked.includes(url))
      throw new Error("unverified_or_revoked_blob_import");
    const bytes = Buffer.from(await blob.arrayBuffer());
    const entry = input.entries.find(
      (entry) => entry.entryDigest === digest(bytes),
    );
    expect(
      entry,
      "routing must use exact producer entry bytes materialized by the old verifier",
    ).toBeDefined();
    expect(bytes.equals(Buffer.from(entry!.entryModule))).toBe(true);
    importedDigests.push(digest(bytes));
    return nativeImport(
      dataModule(bytes.toString("utf8"), `${identity}-${digest(bytes)}`),
    );
  });
  const contractUrl = dataModule(compile(sources[1]!, "zod", zodUrl), identity);
  const contract = (await nativeImport(contractUrl)) as OldContract;
  const loader = (await nativeImport(
    dataModule(
      compile(sources[0]!, "@open-design/contracts", contractUrl, true),
      identity,
    ),
  )) as OldLoader;
  expect(loader.webTouchpointModuleCache).toBeInstanceOf(
    contract.TouchpointModuleCache,
  );
  expect(loader.webTouchpointModuleCache.metrics()).toMatchObject({
    count: 0,
    nativeEsmCount: 0,
    failed: 0,
  });
  const tag = `historical-touchpoint-${identity}`;
  customElements.define(tag, loader.OpenDesignTouchpointElement);
  const element = document.createElement(tag) as OldElement;
  document.body.append(element);
  cleanups.push(async () => {
    await element.dispose();
    element.remove();
  });
  return {
    loader,
    contract,
    element,
    blobs,
    revoked,
    importedDigests,
    create,
    fonts,
    fontCalls,
  };
}
// The app already uses pure-Node CDP component probes. Keep the socket outside
// jsdom, require an explicit executable, and own only this process/profile.
// This exercises native Blob ESM and font glyphs in the supplied modern browser;
// it does not establish a signed historical binary or an old syntax-engine floor.
const nativeExecutable = process.env.CMS_HISTORICAL_CHROMIUM_EXECUTABLE;
const nativeProbe = String.raw`
import { spawn } from 'node:child_process';
import { strict as assert } from 'node:assert';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const input = JSON.parse(readFileSync(process.argv[1], 'utf8'));
const fixtureKind = input.fixtureKind ?? 'legacy';
assert.ok(['legacy', 'registered-roles'].includes(fixtureKind), 'unsupported_historical_fixture_kind');
const profile = mkdtempSync(join(tmpdir(), 'cms-historical-chromium-'));
let chrome, socket, send;
const pending = new Map(), listeners = new Set();
let sequence = 0;
function bounded(promise, label, ms = 12000) {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => {
    timer = setTimeout(() => reject(Error(label + '_timeout')), ms);
  })]).finally(() => clearTimeout(timer));
}
async function stop() {
  socket?.close();
  if (chrome?.pid && chrome.exitCode === null && chrome.signalCode === null) {
    const exited = new Promise(resolve => chrome.once('exit', resolve));
    chrome.kill('SIGTERM');
    try { await bounded(exited, 'chromium_stop', 3000); }
    catch { chrome.kill('SIGKILL'); await bounded(exited, 'chromium_kill', 3000); }
  }
  rmSync(profile, { recursive: true, force: true });
}
const deadline = setTimeout(async () => {
  process.stderr.write('historical_native_deadline\n');
  try { await stop(); } finally { process.exit(1); }
}, 80000);
function once(method, sessionId) {
  let listener;
  return bounded(new Promise(resolve => {
    listener = message => {
      if (message.method === method && message.sessionId === sessionId) {
        listeners.delete(listener); resolve(message.params);
      }
    };
    listeners.add(listener);
  }), method).finally(() => listeners.delete(listener));
}
async function evaluate(sessionId, fn, value) {
  const expression = '(' + fn.toString() + ')(' + JSON.stringify(value ?? null) + ')';
  const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId);
  if (result.exceptionDetails) throw Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
}
async function mountCase({ bundle, dto }) {
  if (!window.isSecureContext) throw Error('historical_secure_context_required');
  const created = new Set(), revoked = new Set();
  const create = URL.createObjectURL.bind(URL), revoke = URL.revokeObjectURL.bind(URL);
  URL.createObjectURL = blob => { const url = create(blob); created.add(url); return url; };
  URL.revokeObjectURL = url => { revoked.add(url); revoke(url); };
  const loaderUrl = URL.createObjectURL(new Blob([bundle], { type: 'text/javascript' }));
  const loader = await import(loaderUrl);
  const verified = await loader.verifyWebTouchpoint(dto);
  loader.ensureWebTouchpointElement();
  const host = document.createElement('opend-touchpoint');
  document.body.append(host);
  const selected = dto.manifest.placements.find(p => p.key === dto.placementKey);
  const actions = [], resolvedTargets = [], diagnostics = [];
  let closes = 0;
  const context = loader.webTouchpointContext(dto, { locale: 'en-US', theme: 'light', fontFamily: 'sans-serif', cssVariables: {} });
  await host.mount(verified.entryUrl, dto.entryDigest, context, verified.resourceUrls,
    new Set(selected.staticActions.map(action => action.id)), {
      dispatchAction: async id => {
        const action = selected.staticActions.find(action => action.id === id);
        if (!action) throw Error('undeclared_action');
        actions.push(id); resolvedTargets.push({ id, target: action.target });
      }, requestClose: () => { closes++; }, onDiagnostic: diagnostic => diagnostics.push(diagnostic)
    });
  const title = host.shadowRoot.querySelector('h2'), image = host.shadowRoot.querySelector('img');
  if (!title || !image) throw Error('historical_native_dom_missing');
  if (!await host.instance.fontReady) throw Error('historical_font_load_failed');
  await image.decode();
  title.getBoundingClientRect();
  await document.fonts.ready;
  window.historicalCase = { loader, host, verified, context, dto, created, revoked, loaderUrl,
    actions, resolvedTargets, diagnostics, get closes() { return closes; }, captured: [...host.shadowRoot.querySelectorAll('button')] };
  return { title: title.textContent, locale: host.shadowRoot.querySelector('section').lang,
    placement: host.shadowRoot.querySelector('section').dataset.placement,
    imageWidth: image.naturalWidth, imageHeight: image.naturalHeight,
    documentFonts: [...document.fonts].map(face => ({ family: face.family, status: face.status })) };
}
async function lifecycleCase() {
  const state = window.historicalCase;
  const tick = () => new Promise(resolve => requestAnimationFrame(resolve));
  for (const button of state.captured) { button.click(); await tick(); }
  const actions = [...state.actions], closes = state.closes;
  await state.host.update({ ...state.context, locale: 'zh-CN' }, state.verified.resourceUrls);
  const titleZh = state.host.shadowRoot.querySelector('h2').textContent;
  const localeZh = state.host.shadowRoot.querySelector('section').lang;
  for (const button of state.captured) button.click();
  await tick();
  const staleAfterUpdate = state.actions.length === actions.length && state.closes === closes;
  const currentButtons = [...state.host.shadowRoot.querySelectorAll('button')];
  await state.host.dispose();
  for (const button of [...state.captured, ...currentButtons]) button.click();
  await state.host.update(state.context, state.verified.resourceUrls);
  await tick();
  state.verified.dispose(); URL.revokeObjectURL(state.loaderUrl);
  return { actions, resolvedTargets: state.resolvedTargets, closes, titleZh, localeZh, staleAfterUpdate,
    staleAfterDispose: state.actions.length === actions.length && state.closes === closes,
    shadowEmpty: state.host.shadowRoot.childNodes.length === 0,
    fontsAfterDispose: [...document.fonts].map(face => face.family),
    resourceRevoked: [...state.verified.resourceUrls.values()].every(url => state.revoked.has(url)), diagnostics: state.diagnostics };
}
async function negativeCase({ rawEntry }) {
  const state = window.historicalCase;
  const hash = async value => 'sha256:' + [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))].map(n => n.toString(16).padStart(2, '0')).join('');
  const variants = [
    ['manifest', dto => { dto.manifest.contentLine += '-tampered'; }],
    ['entry', dto => { dto.entryModule += '\n// tampered'; }],
    ['resource', dto => { dto.resources.find(resource => resource.path === 'pixel.png').bytes = btoa('tampered'); }],
    ['missing', dto => { dto.resources.pop(); }],
    ['extra', dto => { dto.resources.push({ ...dto.resources[0], path: 'extra.js' }); }],
    ['duplicate', dto => { dto.resources.push({ ...dto.resources[0] }); }],
    ['api2_countdown', async dto => {
      dto.runtime.apiVersion = 2; dto.manifest.runtimeApiVersion = 2;
      for (const placement of dto.manifest.placements) placement.requiredCapabilities.push('countdown-v1');
      dto.manifestHash = await hash(JSON.stringify(dto.manifest));
    }]
  ];
  const before = state.loader.webTouchpointModuleCache.metrics();
  const results = [];
  for (const [name, mutate] of variants) {
    const dto = structuredClone(state.dto); await mutate(dto);
    let error = '';
    try { const verified = await state.loader.verifyWebTouchpoint(dto); verified.dispose(); }
    catch (reason) { error = String(reason); }
    results.push({ name, error });
  }
  const rawUrl = URL.createObjectURL(new Blob([Uint8Array.from(atob(rawEntry), char => char.charCodeAt(0))], { type: 'text/javascript' }));
  let rawError = '';
  try { await import(rawUrl); } catch (reason) { rawError = String(reason); }
  finally { URL.revokeObjectURL(rawUrl); }
  return { results, rawError, cacheBefore: before, cacheAfter: state.loader.webTouchpointModuleCache.metrics(),
    allBlobUrlsRevoked: [...state.created].every(url => state.revoked.has(url)) };
}
async function mountRoleCase({ bundle, dto }) {
  if (!window.isSecureContext) throw Error('historical_secure_context_required');
  const created = new Set(), revoked = new Set();
  const create = URL.createObjectURL.bind(URL), revoke = URL.revokeObjectURL.bind(URL);
  URL.createObjectURL = blob => { const url = create(blob); created.add(url); return url; };
  URL.revokeObjectURL = url => { revoked.add(url); revoke(url); };
  const loaderUrl = URL.createObjectURL(new Blob([bundle], { type: 'text/javascript' }));
  const loader = await import(loaderUrl);
  const verified = await loader.verifyWebTouchpoint(dto);
  loader.ensureWebTouchpointElement();
  const host = document.createElement('opend-touchpoint');
  document.body.append(host);
  const selected = dto.manifest.placements.find(p => p.key === dto.placementKey);
  if (!selected) throw Error('historical_role_placement_missing');
  const diagnostics = [];
  const context = loader.webTouchpointContext(dto, { locale: 'en', theme: 'light', fontFamily: 'sans-serif', cssVariables: {} });
  if (!context) throw Error('historical_role_context_missing');
  await host.mount(verified.entryUrl, dto.entryDigest, context, verified.resourceUrls,
    new Set(selected.staticActions.map(action => action.id)), { onDiagnostic: value => diagnostics.push(value) });
  const snapshot = () => [...host.shadowRoot.querySelectorAll('button')].map(node => ({ id: node.dataset.id, role: node.dataset.role, label: node.textContent }));
  await document.fonts.ready;
  const button = host.shadowRoot.querySelector('button');
  if (!button) throw Error('historical_role_dom_missing');
  button.getBoundingClientRect();
  window.historicalRoleCase = { loader, host, verified, context, dto, snapshot, created, revoked, loaderUrl, diagnostics };
  return { english: snapshot(), cache: loader.webTouchpointModuleCache.metrics() };
}
async function negativeRoleCase() {
  const state = window.historicalRoleCase;
  const cacheBefore = state.loader.webTouchpointModuleCache.metrics();
  const results = [];
  for (const [name, mutate] of [
    ['entry', dto => { dto.entryModule += '\n// tampered'; }],
    ['resource', dto => {
      const resource = dto.resources.find(item => item.path !== dto.entryPath);
      if (!resource) throw Error('historical_role_resource_missing');
      resource.bytes = btoa('tampered');
    }],
    ['role', dto => {
      const binding = dto.manifest.roleBindings.bindings[0];
      binding.role = binding.role === 'primary' ? 'secondary' : 'primary';
    }],
    ['role_missing', dto => { delete dto.manifest.roleBindings; }],
  ]) {
    const dto = structuredClone(state.dto); mutate(dto);
    let error = '';
    try { const verified = await state.loader.verifyWebTouchpoint(dto); verified.dispose(); }
    catch (reason) { error = String(reason); }
    results.push({ name, error });
  }
  return { results, cacheBefore, cacheAfter: state.loader.webTouchpointModuleCache.metrics() };
}
async function lifecycleRoleCase() {
  const state = window.historicalRoleCase;
  await state.host.update({ ...state.context, locale: 'fr' }, state.verified.resourceUrls);
  const french = state.snapshot();
  await state.host.dispose();
  await state.host.update(state.context, state.verified.resourceUrls);
  state.verified.dispose(); URL.revokeObjectURL(state.loaderUrl);
  return { french, shadowEmpty: state.host.shadowRoot.childNodes.length === 0,
    fontsAfterDispose: [...document.fonts].map(face => face.family),
    allBlobUrlsRevoked: [...state.created].every(url => state.revoked.has(url)), diagnostics: state.diagnostics };
}
try {
  // esbuild must also run in pure Node: jsdom's encoder/typed-array realms differ.
  const require = createRequire(input.contractsPackage);
  const esbuild = require('esbuild');
  assert.equal(esbuild.version, input.dependencies.esbuild);
  assert.equal(require('zod/package.json').version, input.dependencies.zod);
  const sources = input.sources.map(source => {
    const bytes = Buffer.from(source.base64, 'base64');
    assert.equal(createHash('sha256').update(bytes).digest('hex'), source.sha256);
    return bytes.toString('utf8');
  });
  const built = await esbuild.build({ stdin: { contents: sources[0], loader: 'ts', sourcefile: input.sources[0].originalPath },
    bundle: true, write: false, platform: 'browser', format: 'esm', target: 'es2022',
    plugins: [{ name: 'pinned-old-contract', setup(build) {
      build.onResolve({ filter: /^@open-design\/contracts$/ }, () => ({ path: 'old-contract', namespace: 'historical' }));
      build.onLoad({ filter: /^old-contract$/, namespace: 'historical' }, () => ({
        contents: sources[1], loader: 'ts', resolveDir: input.contractsDirectory
      }));
    } }] });
  assert.equal(built.outputFiles.length, 1);
  input.bundle = built.outputFiles[0].text;
  chrome = spawn(process.env.CMS_HISTORICAL_CHROMIUM_EXECUTABLE, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank'
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  const endpoint = await bounded(new Promise((resolve, reject) => {
    let stderr = '';
    const onData = data => {
      stderr = (stderr + String(data)).slice(-8192);
      const match = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (match) { chrome.stderr.off('data', onData); resolve(match[1]); }
    };
    chrome.stderr.on('data', onData);
    chrome.once('error', reject);
    chrome.once('exit', (code, signal) => reject(Error('chromium_exited_before_ready:' + code + ':' + signal + ':' + stderr)));
  }), 'chromium_ready');
  socket = new WebSocket(endpoint);
  await bounded(new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  }), 'cdp_open');
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.id) {
      const slot = pending.get(message.id);
      if (slot) { pending.delete(message.id); message.error ? slot.reject(Error(JSON.stringify(message.error))) : slot.resolve(message.result); }
    }
    for (const listener of [...listeners]) listener(message);
  });
  socket.addEventListener('close', () => {
    for (const slot of pending.values()) slot.reject(Error('cdp_closed'));
    pending.clear();
  });
  send = (method, params = {}, sessionId) => {
    const id = ++sequence;
    return bounded(new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params, sessionId }));
    }), method).finally(() => pending.delete(id));
  };
  const version = await send('Browser.getVersion');
  const report = { version: version.product, fixtureKind, cases: [] };
  for (const placement of input.fixture.placements) {
    const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
    const errors = [];
    const observer = message => {
      if (message.sessionId !== sessionId) return;
      if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails);
      if (message.method === 'Fetch.requestPaused') {
        const request = message.params;
        const fulfilled = request.request.url === 'https://cms-fixture.invalid/'
          ? send('Fetch.fulfillRequest', { requestId: request.requestId, responseCode: 200,
              responseHeaders: [{ name: 'Content-Type', value: 'text/html' }],
              body: Buffer.from('<!doctype html><html><body></body></html>').toString('base64') }, sessionId)
          : send('Fetch.failRequest', { requestId: request.requestId, errorReason: 'Aborted' }, sessionId);
        fulfilled.catch(error => errors.push(String(error)));
      }
    };
    listeners.add(observer);
    try {
      for (const method of ['Runtime.enable', 'Page.enable', 'DOM.enable', 'CSS.enable']) await send(method, {}, sessionId);
      await send('Fetch.enable', { patterns: [{ urlPattern: '*' }] }, sessionId);
      const loaded = once('Page.loadEventFired', sessionId);
      await send('Page.navigate', { url: 'https://cms-fixture.invalid/' }, sessionId); await loaded;
      const mount = await evaluate(sessionId, fixtureKind === 'registered-roles' ? mountRoleCase : mountCase, { bundle: input.bundle, dto: placement.transportDto });
      await send('DOM.getDocument', { depth: -1, pierce: true }, sessionId);
      const object = await send('Runtime.evaluate', { expression: fixtureKind === 'registered-roles'
        ? 'window.historicalRoleCase.host.shadowRoot.querySelector("button")'
        : 'window.historicalCase.host.shadowRoot.querySelector("h2")', returnByValue: false }, sessionId);
      const node = await send('DOM.requestNode', { objectId: object.result.objectId }, sessionId);
      const fonts = (await send('CSS.getPlatformFontsForNode', { nodeId: node.nodeId }, sessionId)).fonts;
      let lifecycle, negative;
      if (fixtureKind === 'registered-roles') {
        negative = await evaluate(sessionId, negativeRoleCase);
        lifecycle = await evaluate(sessionId, lifecycleRoleCase);
      } else {
        lifecycle = await evaluate(sessionId, lifecycleCase);
        const rawPath = input.fixture.source.manifest.placements.find(item => item.key === placement.placementKey).entry;
        negative = await evaluate(sessionId, negativeCase, { rawEntry: input.fixture.source.files[rawPath].base64 });
      }
      report.cases.push({ placementKey: placement.placementKey, mount, fonts, lifecycle, negative, errors });
    } finally { listeners.delete(observer); await send('Target.closeTarget', { targetId }); }
  }
  process.stdout.write('CMS_HISTORICAL_NATIVE:' + JSON.stringify(report) + '\n');
} finally { clearTimeout(deadline); await stop(); }
`;
function historicalBrowserSources() {
    return binding.sources.map((source) => {
        const bytes = readFileSync(new URL(source.snapshot, fixtureRoot));
        expect(sha(bytes)).toBe(source.sha256);
        return { ...source, base64: bytes.toString("base64") };
    });
}
it.skipIf(!nativeExecutable)("explicit Chromium: real old Blob loader decodes PNG/font glyphs and fences lifecycle/invalid deliveries", async () => {
    const directory = mkdtempSync(join(tmpdir(), "cms-historical-native-input-"));
    try {
        const input = join(directory, "input.json");
        writeFileSync(input, JSON.stringify({ sources: historicalBrowserSources(), dependencies: binding.dependencies,
            contractsPackage: resolve(process.cwd(), "../../packages/contracts/package.json"),
            contractsDirectory: resolve(process.cwd(), "../../packages/contracts"), fixture: producer }));
        const run = spawnSync(process.execPath, ["--input-type=module", "-e", nativeProbe, input], {
            encoding: "utf8", timeout: 90000, maxBuffer: 4 * 1024 * 1024,
            env: { ...process.env, CMS_HISTORICAL_CHROMIUM_EXECUTABLE: nativeExecutable },
        });
        expect(run.error, run.stderr).toBeUndefined();
        expect(run.status, run.stderr).toBe(0);
        const line = run.stdout.split("\n").find((value) => value.startsWith("CMS_HISTORICAL_NATIVE:"));
        expect(line, run.stderr).toBeDefined();
        type NativeCase = {
            placementKey: string;
            mount: {
                title: string;
                locale: string;
                placement: string;
                imageWidth: number;
                imageHeight: number;
                documentFonts: Array<{
                    family: string;
                    status: string;
                }>;
            };
            fonts: Array<{
                isCustomFont: boolean;
                glyphCount: number;
            }>;
            lifecycle: {
                actions: string[];
                resolvedTargets: Array<{
                    id: string;
                    target: unknown;
                }>;
                closes: number;
                titleZh: string;
                localeZh: string;
                staleAfterUpdate: boolean;
                staleAfterDispose: boolean;
                shadowEmpty: boolean;
                fontsAfterDispose: string[];
                resourceRevoked: boolean;
                diagnostics: unknown[];
            };
            negative: {
                results: Array<{
                    name: string;
                    error: string;
                }>;
                rawError: string;
                cacheBefore: unknown;
                cacheAfter: unknown;
                allBlobUrlsRevoked: boolean;
            };
            errors: unknown[];
        };
        const report = JSON.parse(line!.slice("CMS_HISTORICAL_NATIVE:".length)) as {
            version: string;
            cases: NativeCase[];
        };
        expect(report.version).toMatch(/Chrome|Chromium/);
        expect(report.cases.map((entry) => entry.placementKey)).toEqual(producer.placements.map((entry) => entry.placementKey));
        for (const entry of report.cases) {
            expect(entry.mount).toEqual({ title: "Synthetic historical fixture", locale: "en-US", placement: entry.placementKey,
                imageWidth: 2, imageHeight: 2, documentFonts: [{ family: "HistoricalFixture", status: "loaded" }] });
            expect(entry.fonts.filter((font) => font.isCustomFont).reduce((count, font) => count + font.glyphCount, 0)).toBeGreaterThan(0);
            expect(entry.lifecycle).toEqual({ actions: ["fixture-learn", "fixture-settings"], resolvedTargets: [
                    { id: "fixture-learn", target: { kind: "https", url: "https://example.com/historical-fixture" } },
                    { id: "fixture-settings", target: { kind: "internal", path: "/settings" } },
                ], closes: 1, titleZh: "合成历史兼容性测试", localeZh: "zh-CN", staleAfterUpdate: true,
                staleAfterDispose: true, shadowEmpty: true, fontsAfterDispose: [], resourceRevoked: true, diagnostics: [] });
            expect(entry.negative.results.map((result) => result.name)).toEqual(["manifest", "entry", "resource", "missing", "extra", "duplicate", "api2_countdown"]);
            for (const result of entry.negative.results)
                expect(result.error).toContain("touchpoint_integrity_failed");
            expect(entry.negative.rawError).toMatch(/relative|module specifier/i);
            expect(entry.negative.cacheAfter).toEqual(entry.negative.cacheBefore);
            expect(entry.negative.allBlobUrlsRevoked).toBe(true);
            expect(entry.errors).toEqual([]);
        }
        console.info("CMS historical native evidence", JSON.stringify({ browser: report.version,
            fixtureSha256: binding.producerFixture.sha256,
            cases: report.cases.map((entry) => ({ placementKey: entry.placementKey,
                customGlyphs: entry.fonts.filter((font) => font.isCustomFont).reduce((count, font) => count + font.glyphCount, 0),
                invalidDeliveriesRejected: entry.negative.results.length, rawBlobRejected: !!entry.negative.rawError })) }));
    }
    finally {
        rmSync(directory, { recursive: true, force: true });
    }
}, 100000);
it.skipIf(!nativeExecutable)(
  "registered role producer fixture: explicit Chromium old verifier SDK native ESM roles and cleanup",
  async () => {
    const pin = binding.roleProducerFixture;
    const bytes = readFileSync(new URL(pin.file, fixtureRoot));
    expect(sha(bytes)).toBe(pin.sha256);
    expect(bytes.length).toBe(pin.sizeBytes);
    const { payloadSha256, ...unsigned } = roleProducer;
    expect(digest(JSON.stringify(unsigned))).toBe(payloadSha256);
    const directory = mkdtempSync(
      join(tmpdir(), "cms-historical-role-native-input-"),
    );
    try {
      const input = join(directory, "input.json");
      writeFileSync(
        input,
        JSON.stringify({
          sources: historicalBrowserSources(),
          dependencies: binding.dependencies,
          contractsPackage: resolve(
            process.cwd(),
            "../../packages/contracts/package.json",
          ),
          contractsDirectory: resolve(
            process.cwd(),
            "../../packages/contracts",
          ),
          fixtureKind: "registered-roles",
          fixture: roleProducer,
        }),
      );
      const run = spawnSync(
        process.execPath,
        ["--input-type=module", "-e", nativeProbe, input],
        {
          encoding: "utf8",
          timeout: 90000,
          maxBuffer: 4 * 1024 * 1024,
          env: {
            ...process.env,
            CMS_HISTORICAL_CHROMIUM_EXECUTABLE: nativeExecutable,
          },
        },
      );
      expect(run.error, run.stderr).toBeUndefined();
      expect(run.status, run.stderr).toBe(0);
      const line = run.stdout
        .split("\n")
        .find((value) => value.startsWith("CMS_HISTORICAL_NATIVE:"));
      expect(line, run.stderr).toBeDefined();
      type Button = { id: string; role?: string; label: string };
      type RoleNativeCase = {
        placementKey: string;
        mount: { english: Button[]; cache: { nativeEsmCount: number } };
        fonts: Array<{
          familyName: string;
          isCustomFont: boolean;
          glyphCount: number;
        }>;
        lifecycle: {
          french: Button[];
          shadowEmpty: boolean;
          fontsAfterDispose: string[];
          allBlobUrlsRevoked: boolean;
          diagnostics: unknown[];
        };
        negative: {
          results: Array<{ name: string; error: string }>;
          cacheBefore: unknown;
          cacheAfter: unknown;
        };
        errors: unknown[];
      };
      const report = JSON.parse(
        line!.slice("CMS_HISTORICAL_NATIVE:".length),
      ) as {
        version: string;
        fixtureKind: string;
        cases: RoleNativeCase[];
      };
      expect(report.version).toMatch(/Chrome|Chromium/);
      expect(report.fixtureKind).toBe("registered-roles");
      expect(report.cases.map((entry) => entry.placementKey)).toEqual(
        roleProducer.placements.map((entry) => entry.placementKey),
      );
      for (const entry of report.cases) {
        const bindings =
          roleProducer.runtime.manifest.roleBindings.bindings.filter(
            (item) => item.placementKey === entry.placementKey,
          );
        const expected = (locale: "en" | "fr") =>
          roleProducer.source.materialSource.locales[locale].buttons.map(
            (button) => ({
              id: button.id,
              label: button.label,
              role: bindings.find(
                (item) =>
                  item.fieldKey === "buttons" && item.buttonId === button.id,
              )?.role,
            }),
          );
        expect(entry.mount.english).toEqual(expected("en"));
        expect(entry.lifecycle.french).toEqual(expected("fr"));
        expect(entry.mount.cache.nativeEsmCount).toBeGreaterThan(0);
        const customFonts = entry.fonts.filter((font) => font.isCustomFont);
        expect(
          customFonts.reduce((count, font) => count + font.glyphCount, 0),
        ).toBeGreaterThan(0);
        expect(
          customFonts.some((font) => font.familyName === "Albert Sans"),
        ).toBe(true);
        expect(entry.negative.results.map((result) => result.name)).toEqual([
          "entry",
          "resource",
          "role",
          "role_missing",
        ]);
        for (const result of entry.negative.results)
          expect(result.error).toContain("touchpoint_integrity_failed");
        expect(entry.negative.cacheAfter).toEqual(entry.negative.cacheBefore);
        expect(entry.lifecycle).toEqual({
          french: expected("fr"),
          shadowEmpty: true,
          fontsAfterDispose: [],
          allBlobUrlsRevoked: true,
          diagnostics: [],
        });
        expect(entry.errors).toEqual([]);
      }
      console.info(
        "CMS historical role native evidence",
        JSON.stringify({
          browser: report.version,
          fixtureSha256: pin.sha256,
          producerGitHead: roleProducer.provenance.producerGitHead,
          boundary:
            "Unchanged old source in supplied modern browser; sequential locale/cleanup, no navigation or signed client/old engine claim",
          cases: report.cases.map((entry) => ({
            placementKey: entry.placementKey,
            customGlyphs: entry.fonts
              .filter((font) => font.isCustomFont)
              .reduce((count, font) => count + font.glyphCount, 0),
            integrityNegatives: entry.negative.results.length,
          })),
        }),
      );
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  },
  100000,
);
describe("source-pinned v0.23.0 consumption of actual AMR ZIP build DTOs", () => {
  it("pins both sources, dependency closure, original ZIP, all artifacts and serializer provenance", () => {
    expect(binding.historicalClient.commit).toBe(
      "c2aba14421c7b6ee1ace4bee3636d3bf64ee1fa0",
    );
    expect(binding.sources.map((source) => source.sha256)).toEqual([
      "c2c45db438113019f30a3ec0ba9481820899a5e47226a4d42cc5f6b83844c5b5",
      "6f70786b2910dc8bc845bc267650ae134be317a8c49233bbfd557b5a6ca95dec",
    ]);
    for (const source of binding.sources)
      expect(sha(readFileSync(new URL(source.snapshot, fixtureRoot)))).toBe(
        source.sha256,
      );
    // Reassemble the original serialized bytes as well as the imported object;
    // the pinned file digest still covers every byte in both storage parts.
    const metadata = readFileSync(new URL(binding.producerFixture.file, fixtureRoot), "utf8");
    const placements = readFileSync(new URL("amr-runtime-api1-placements.json", fixtureRoot), "utf8").trimEnd();
    const bytes = Buffer.from(metadata.replace('  "placements": []', `  "placements": ${placements}`));
    expect(sha(bytes)).toBe(
      "7aead54bcd4643054704ee25e4c312d02a42e8a4b1c380d0d383e65b25755128",
    );
    expect(sha(bytes)).toBe(binding.producerFixture.sha256);
    expect(bytes.length).toBe(binding.producerFixture.sizeBytes);
    const { payloadSha256, ...unsigned } = producer;
    expect(digest(JSON.stringify(unsigned))).toBe(payloadSha256);
    for (const asset of [
      producer.sourceZip,
      producer.source.font,
      producer.runtime.canonicalManifest,
      ...Object.values(producer.source.files),
      ...Object.values(producer.runtime.artifacts),
    ]) {
      const content = Buffer.from(asset.base64, "base64");
      expect(content.length).toBe(asset.sizeBytes);
      expect(digest(content)).toBe(asset.sha256);
    }
    expect(producer.sourceZip.sha256).toBe(producer.sourcePackageHash);
    expect(producer.runtime.canonicalManifest.sha256).toBe(
      producer.runtime.manifestHash,
    );
    expect(
      Buffer.from(
        producer.runtime.canonicalManifest.base64,
        "base64",
      ).toString(),
    ).toBe(JSON.stringify(producer.runtime.manifest));
    const inventory = Object.entries(producer.runtime.artifacts).sort(
      ([left], [right]) => left.localeCompare(right),
    );
    expect(
      digest(
        inventory
          .map(([path, artifact]) => `${path}\0${artifact.sha256}`)
          .join("\n"),
      ),
    ).toBe(producer.runtime.artifactHash);
    const build = producer.runtime.buildIdentity;
    expect(build.fingerprint).toBe(
      [
        build.builderVersion,
        build.validatorVersion,
        build.optimizationConfigVersion,
        build.sourcePackageHash,
        build.manifestHash,
        build.artifactHash,
      ].join("\n"),
    );
    for (const key of [
      "sourcePackageHash",
      "manifestHash",
      "artifactHash",
    ] as const) {
      expect(build[key]).toBe(binding.producerFixture[key]);
    }
    expect(producer.provenance.producerGitHead).toBe(
      binding.producerFixture.producerGitHead,
    );
    expect(producer.provenance.compiler).toMatchObject({
      esbuild: "0.28.1",
      target: "es2022",
      format: "esm",
      platform: "browser",
    });
    expect(
      producer.provenance.producerSourceSha256[
        "services/api/src/touchpoints/package-worker.ts"
      ],
    ).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(
      producer.placements.map((placement) => placement.placementKey),
    ).toEqual([
      "opend.home.campaign-modal",
      "opend.home.hover-entry",
      "opend.home.hover-layer",
    ]);
    const artifacts: Record<
      string,
      {
        base64: string;
        sha256: string;
      }
    > = producer.runtime.artifacts;
    for (const placement of producer.placements) {
      const value = placement.transportDto;
      expect(value.buildIdentity).toEqual(build);
      expect(value.manifest).toEqual(producer.runtime.manifest);
      expect(value.manifestHash).toBe(build.manifestHash);
      expect(digest(value.entryModule)).toBe(placement.entryDigest);
      expect(
        Buffer.from(value.entryModule).equals(
          Buffer.from(artifacts[placement.entryPath]!.base64, "base64"),
        ),
      ).toBe(true);
      for (const resource of value.resources) {
        expect(resource.bytes).toBe(artifacts[resource.path]!.base64);
        expect(resource.digest).toBe(artifacts[resource.path]!.sha256);
      }
      const sourceEntry =
        producer.source.files[
          placement.entryPath.replace(
            ".vela-wrapper.js",
            "",
          ) as keyof typeof producer.source.files
        ];
      expect(Buffer.from(sourceEntry.base64, "base64").toString()).toContain(
        "using scope",
      );
      expect(value.entryModule).not.toMatch(/\busing scope\b/);
      expect(value.entryModule).toContain("__callDispose");
    }
  });
  it.each([0, 1, 2])(
    "verifies and executes placement %s through locale/resources/actions/update/dispose and cache reuse",
    async (index) => {
      const h = await historicalHarness();
      const value = dto(index);
      expect(
        h.contract.TouchpointComponentV2ManifestSchema.safeParse(value.manifest)
          .success,
      ).toBe(true);
      const placement = value.manifest.placements.find(
        (item) => item.key === value.placementKey,
      )!;
      expect(placement.requiredCapabilities).toEqual(["static-action"]);
      expect(
        h.loader.supportsWebTouchpointCapabilities(
          value,
          placement.requiredCapabilities,
          new Set(["static-action"]),
        ),
      ).toBe(true);
      const verified = await h.loader.verifyWebTouchpoint(value);
      cleanups.unshift(verified.dispose);
      expect(h.importedDigests).toEqual([]);
      expect([...verified.resourceUrls.keys()].sort()).toEqual(
        [placement.entry, ...placement.resources].sort(),
      );
      const dispatched: string[] = [];
      let done = completion<void>();
      const close = vi.fn();
      const bridge = async (id: string) => {
        expect(placement.staticActions.some((action) => action.id === id)).toBe(
          true,
        );
        dispatched.push(id);
        done.resolve();
      };
      await h.element.mount(
        verified.entryUrl,
        value.entryDigest,
        context(h.loader, value),
        verified.resourceUrls,
        new Set(placement.staticActions.map((action) => action.id)),
        { dispatchAction: bridge, requestClose: close },
      );
      // Observe the real returned fixture state and SDK without replacing callbacks
      // or wrapping the module's mount/update/dispose exports.
      const internals = h.element as unknown as {
        instance: FixtureInstance;
        sdkLifecycle: {
          sdk: TouchpointSdk;
        };
        updateQueue: unknown;
      };
      const instance = internals.instance;
      const sdk = internals.sdkLifecycle.sdk;
      expect(internals.updateQueue).toBeInstanceOf(
        h.contract.TouchpointUpdateQueue,
      );
      expect(sdk.runtimeApiVersion).toBe(1);
      expect(instance.events).toEqual(["mount-scope-disposed"]);
      expect(h.importedDigests).toEqual([value.entryDigest]);
      expect(h.loader.webTouchpointModuleCache.metrics()).toMatchObject({
        count: 1,
        nativeEsmCount: 1,
        failed: 0,
      });
      const root = h.element.shadowRoot!;
      const view = root.querySelector<HTMLElement>(
        "section.historical-fixture",
      )!;
      expect(view).toBeVisible();
      expect(view.dataset.placement).toBe(value.placementKey);
      expect(view.lang).toBe("en-US");
      expect(root.querySelector("h2")?.textContent).toBe(
        "Synthetic historical fixture",
      );
      expect(h.loader.hasWebTouchpointCloseControl(h.element)).toBe(true);
      const image = root.querySelector<HTMLImageElement>("img")!;
      expect(image.src).toBe(verified.resourceUrls.get("pixel.png"));
      expect(Buffer.from(await (await fetch(image.src)).arrayBuffer())).toEqual(
        Buffer.from(producer.runtime.artifacts["pixel.png"].base64, "base64"),
      );
      expect(h.blobs.get(image.src)?.type).toBe("image/png");
      const fontStyle = root.querySelector<HTMLStyleElement>(
        "style[data-font-sha256]",
      )!;
      expect(fontStyle.dataset.fontSha256).toBe(producer.source.font.sha256);
      expect(fontStyle.textContent).toContain("font-family:HistoricalFixture");
      await instance.fontReady;
      expect(h.fontCalls).toEqual(["construct", "add", "load"]);
      expect([...h.fonts].map((face) => face.family)).toEqual([
        "HistoricalFixture",
      ]);
      expect([...h.fonts][0]!.descriptors).toEqual({
        style: "normal",
        weight: "100 900",
      });
      const learn = root.querySelector<HTMLButtonElement>(
        '[data-action-id="fixture-learn"]',
      )!;
      learn.click();
      await done.promise;
      expect(dispatched).toEqual(["fixture-learn"]);
      await sdk.dispatchAction("not-registered");
      expect(dispatched).toEqual(["fixture-learn"]);
      expect(h.element.getDiagnostics()).toContainEqual({
        code: "sdk_unregistered_action",
        detail: "not-registered",
      });
      root.querySelector<HTMLButtonElement>("[data-close]")!.click();
      expect(close).toHaveBeenCalledTimes(1);
      const staleSettings = root.querySelector<HTMLButtonElement>(
        '[data-action-id="fixture-settings"]',
      )!;
      await h.element.update(
        context(h.loader, value, "zh-CN"),
        verified.resourceUrls,
      );
      expect(internals.instance).toBe(instance);
      expect(instance.phase).toBe("updated");
      expect(instance.events).toEqual([
        "mount-scope-disposed",
        "update-scope-disposed",
      ]);
      expect(view.lang).toBe("zh-CN");
      expect(root.querySelector("h2")?.textContent).toBe("合成历史兼容性测试");
      expect(
        root.querySelector('[data-action-id="fixture-settings"]')?.textContent,
      ).toBe("设置");
      staleSettings.click();
      expect(dispatched).toEqual(["fixture-learn"]);
      const settings = root.querySelector<HTMLButtonElement>(
        '[data-action-id="fixture-settings"]',
      )!;
      done = completion<void>();
      settings.click();
      await done.promise;
      expect(dispatched).toEqual(["fixture-learn", "fixture-settings"]);
      const detachedClose =
        root.querySelector<HTMLButtonElement>("[data-close]")!;
      await h.element.dispose();
      expect(sdk.signal.aborted).toBe(true);
      expect(instance.disposed).toBe(true);
      expect(instance.events).toEqual([
        "mount-scope-disposed",
        "update-scope-disposed",
        "cleanup",
        "dispose-scope-disposed",
      ]);
      expect(root.childNodes.length).toBe(0);
      expect(h.fonts.size).toBe(0);
      expect(h.fontCalls).toEqual(["construct", "add", "load", "delete"]);
      settings.click();
      detachedClose.click();
      await sdk.dispatchAction("fixture-learn");
      sdk.requestClose();
      expect(sdk.getResourceUrl("pixel.png")).toBeUndefined();
      expect(dispatched).toEqual(["fixture-learn", "fixture-settings"]);
      expect(close).toHaveBeenCalledTimes(1);
      expect(h.element.getDiagnostics().map((item) => item.code)).toEqual([
        "sdk_unregistered_action",
        "sdk_revoked_action",
        "sdk_revoked_close",
      ]);
      await h.element.update(context(h.loader, value), verified.resourceUrls);
      expect(root.childNodes.length).toBe(0);
      verified.dispose();
      expect(
        [...verified.resourceUrls.values()].every((url) =>
          h.revoked.includes(url),
        ),
      ).toBe(true);
      const again = await h.loader.verifyWebTouchpoint(value);
      cleanups.unshift(again.dispose);
      await h.element.mount(
        again.entryUrl,
        value.entryDigest,
        context(h.loader, value),
        again.resourceUrls,
      );
      expect(root.querySelector("h2")?.textContent).toBe(
        "Synthetic historical fixture",
      );
      expect(h.importedDigests).toEqual([value.entryDigest]);
      expect(h.loader.webTouchpointModuleCache.metrics()).toMatchObject({
        count: 1,
        nativeEsmCount: 1,
        failed: 0,
      });
      await h.element.dispose();
    },
  );
  it("denies registered actions/close when the platform bridge is unavailable", async () => {
    const h = await historicalHarness();
    const value = dto();
    const verified = await h.loader.verifyWebTouchpoint(value);
    cleanups.unshift(verified.dispose);
    await h.element.mount(
      verified.entryUrl,
      value.entryDigest,
      context(h.loader, value),
      verified.resourceUrls,
      new Set(["fixture-learn", "fixture-settings"]),
    );
    const sdk = (
      h.element as unknown as {
        sdkLifecycle: {
          sdk: TouchpointSdk;
        };
      }
    ).sdkLifecycle.sdk;
    await sdk.dispatchAction("fixture-learn");
    sdk.requestClose();
    expect(h.element.getDiagnostics()).toEqual([
      { code: "touchpoint_action_denied", detail: "fixture-learn" },
      { code: "touchpoint_close_denied", detail: value.placementKey },
    ]);
  });
  it("blocks aborted SDK operations and runs real cleanup callbacks on revoke", async () => {
    const h = await historicalHarness();
    const controller = new AbortController();
    const action = vi.fn(async () => {});
    const close = vi.fn();
    const cleanup = vi.fn();
    const lifecycle = h.contract.createTouchpointSdk({
      signal: controller.signal,
      actionIds: new Set(["fixture-learn"]),
      resources: new Map(),
      now: () => 0,
      dispatchAction: action,
      requestClose: close,
    });
    lifecycle.sdk.onCleanup(cleanup);
    controller.abort();
    await lifecycle.sdk.dispatchAction("fixture-learn");
    lifecycle.sdk.requestClose();
    expect(action).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
    expect(cleanup).not.toHaveBeenCalled();
    lifecycle.revoke();
    lifecycle.revoke();
    expect(cleanup).toHaveBeenCalledTimes(1);
    const lateCleanup = vi.fn();
    lifecycle.sdk.onCleanup(lateCleanup);
    expect(lateCleanup).toHaveBeenCalledTimes(1);
  });
  it("uses the real old queue to coalesce first/latest work and settle all schedule promises", async () => {
    const h = await historicalHarness();
    const first = completion<void>();
    const latest = completion<void>();
    const apply = vi.fn((value: number) =>
      value === 1 ? first.promise : latest.promise,
    );
    const diagnose = vi.fn();
    const queue = new h.contract.TouchpointUpdateQueue(apply, diagnose);
    const promises = [queue.schedule(1), queue.schedule(2), queue.schedule(3)];
    expect(promises[0]).toBe(promises[1]);
    expect(promises[1]).toBe(promises[2]);
    let settled = 0;
    for (const promise of promises)
      void promise.then(() => {
        settled++;
      });
    expect(apply.mock.calls).toEqual([[1]]);
    first.resolve();
    await first.promise;
    expect(apply.mock.calls).toEqual([[1], [3]]);
    expect(settled).toBe(0);
    latest.resolve();
    await Promise.all(promises);
    expect(settled).toBe(3);
    expect(diagnose.mock.calls).toEqual([["component_update_expired"]]);
  });
  it("fences queued work when the real old queue is cancelled during pending apply", async () => {
    const h = await historicalHarness();
    const pending = completion<void>();
    const apply = vi.fn(() => pending.promise);
    const diagnose = vi.fn();
    const queue = new h.contract.TouchpointUpdateQueue(apply, diagnose);
    const first = queue.schedule(1);
    const queued = queue.schedule(2);
    queue.cancel();
    await queue.schedule(3);
    expect(apply.mock.calls).toEqual([[1]]);
    pending.resolve();
    await Promise.all([first, queued]);
    expect(apply.mock.calls).toEqual([[1]]);
    expect(diagnose.mock.calls).toEqual([["component_update_expired"]]);
  });
  it("propagates real old queue failure to queued and subsequent schedules", async () => {
    const h = await historicalHarness();
    const pending = completion<void>();
    const apply = vi.fn(() => pending.promise);
    const queue = new h.contract.TouchpointUpdateQueue(apply);
    const first = queue.schedule(1);
    const queued = queue.schedule(2);
    // Attach rejection handlers before rejecting the actual in-flight apply.
    const settled = Promise.allSettled([first, queued]);
    const failure = new Error("historical_apply_failure");
    pending.reject(failure);
    expect(await settled).toEqual([
      { status: "rejected", reason: failure },
      { status: "rejected", reason: failure },
    ]);
    await expect(queue.schedule(3)).rejects.toBe(failure);
    expect(apply.mock.calls).toEqual([[1]]);
  });
  it.each(["manifest", "entry", "resource", "extra", "missing", "duplicate"])(
    "refuses %s tamper or incomplete selected resource closure before import",
    async (corruption) => {
      const h = await historicalHarness();
      const value = dto();
      if (corruption === "manifest") value.manifest.contentLine += "-tampered";
      if (corruption === "entry") value.entryModule += "\n// tampered";
      if (corruption === "resource")
        value.resources.find(
          (resource) => resource.path === "pixel.png",
        )!.bytes = Buffer.from("tampered").toString("base64");
      if (corruption === "extra")
        value.resources.push(
          structuredClone(
            dto(1).resources.find(
              (resource) => resource.path === "hover-entry.js.vela-wrapper.js",
            )!,
          ),
        );
      if (corruption === "missing")
        value.resources = value.resources.filter(
          (resource) => resource.path !== "pixel.png",
        );
      if (corruption === "duplicate")
        value.resources.push(structuredClone(value.resources[0]!));
      await expect(h.loader.verifyWebTouchpoint(value)).rejects.toThrow(
        "touchpoint_integrity_failed",
      );
      expect(h.importedDigests).toEqual([]);
      expect(h.loader.webTouchpointModuleCache.metrics().count).toBe(0);
      expect([...h.blobs.keys()].every((url) => h.revoked.includes(url))).toBe(
        true,
      );
    },
  );
  it("old API2/countdown refuses before import while current verifier accepts API1/API2 and rejects tamper", async () => {
    const h = await historicalHarness();
    const api2 = dto();
    api2.runtime.apiVersion = 2;
    api2.manifest.runtimeApiVersion = 2;
    for (const placement of api2.manifest.placements)
      placement.requiredCapabilities.push("countdown-v1");
    api2.manifestHash = digest(JSON.stringify(api2.manifest));
    expect(
      h.contract.TouchpointComponentV2ManifestSchema.safeParse(api2.manifest)
        .success,
    ).toBe(false);
    expect(
      h.loader.supportsWebTouchpointCapabilities(
        api2,
        api2.manifest.placements[0]!.requiredCapabilities,
        new Set(["static-action"]),
      ),
    ).toBe(false);
    await expect(h.loader.verifyWebTouchpoint(api2)).rejects.toThrow(
      "touchpoint_integrity_failed",
    );
    expect(h.create).not.toHaveBeenCalled();
    expect(h.importedDigests).toEqual([]);
    expect(h.loader.webTouchpointModuleCache.metrics().count).toBe(0);
    for (const value of [dto(), api2]) {
      expect(currentManifestSchema.safeParse(value.manifest).success).toBe(
        true,
      );
      const verified = await currentVerify(value);
      verified.dispose();
      const bad = structuredClone(value);
      bad.entryModule += "\n// altered";
      await expect(currentVerify(bad)).rejects.toThrow(
        "touchpoint_integrity_failed",
      );
    }
    expect(dto().runtime.apiVersion).toBe(1);
    expect(dto().manifest.placements[0]!.requiredCapabilities).toEqual([
      "static-action",
    ]);
    expect(h.importedDigests).toEqual([]);
  });
});
