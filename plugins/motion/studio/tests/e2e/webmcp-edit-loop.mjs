#!/usr/bin/env node
/**
 * Real-browser proof of Studio's complete WebMCP edit loop.
 *
 * The runner owns its environment: it copies the checked-in adversarial fixture
 * to a temporary directory, symlinks that copy into Studio's ignored project
 * directory, starts a bounded Vite server, injects the real
 * `document.modelContext.registerTool` producer boundary before React mounts,
 * and calls the registered tool definitions through their `execute` callbacks.
 * It never calls a tool implementation directly and never mutates the fixture.
 *
 * Run from the repository root:
 *
 *   node packages/studio/tests/e2e/webmcp-edit-loop.mjs
 *
 * Optional environment:
 *
 *   WEBMCP_E2E_PORT=5197
 *   WEBMCP_E2E_EVIDENCE_DIR=/absolute/output/directory
 *   PUPPETEER_EXECUTABLE_PATH=/absolute/path/to/chrome
 */
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  readdirSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { arch, platform, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
import { resolveChromeExecutable } from "./chrome-executable.mjs";

const E2E_DIR = dirname(fileURLToPath(import.meta.url));
const STUDIO_DIR = resolve(E2E_DIR, "../..");
const FIXTURE_DIR = join(E2E_DIR, "fixtures/webmcp-edit-loop");
const PROJECT_ID = "webmcp-edit-loop";
const REQUESTED_PORT = process.env.WEBMCP_E2E_PORT ? Number(process.env.WEBMCP_E2E_PORT) : null;
const PORT = REQUESTED_PORT ?? (await findAvailablePort());
const ORIGIN = `http://127.0.0.1:${PORT}`;
const RUN_ID = new Date().toISOString().replace(/[:.]/g, "-");
const EVIDENCE_DIR = resolve(
  process.env.WEBMCP_E2E_EVIDENCE_DIR || join(E2E_DIR, "evidence", PROJECT_ID, RUN_ID),
);
const TOOL_COUNT = 12;
const NAVIGATION_TIMEOUT_MS = 90_000;
const RENDER_TIMEOUT_MS = 120_000;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function findAvailablePort() {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("Could not allocate a Studio test port"));
        return;
      }
      server.close((error) => (error ? reject(error) : resolvePort(address.port)));
    });
  });
}

// Bounded polling is the contract here: startup failure must include the child logs.
// fallow-ignore-next-line complexity
async function waitForServer(child, logs) {
  const deadline = Date.now() + NAVIGATION_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Studio server exited early (${child.exitCode})\n${logs.join("")}`);
    }
    try {
      const response = await fetch(`${ORIGIN}/api/projects`);
      if (response.ok) return;
    } catch {
      // The port is not listening yet.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
  throw new Error(`Studio server did not become ready in ${NAVIGATION_TIMEOUT_MS}ms`);
}

function startStudioServer(logs) {
  const child = spawn("bun", ["run", "dev", "--", "--port", String(PORT), "--strictPort"], {
    cwd: STUDIO_DIR,
    env: { ...process.env, HYPERFRAMES_AUTO_PROXY: "false" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const record = (chunk) => {
    logs.push(String(chunk));
    if (logs.length > 120) logs.shift();
  };
  child.stdout.on("data", record);
  child.stderr.on("data", record);
  return child;
}

function installModelContextHarness(disabled) {
  if (window.top !== window) return;
  if (disabled) {
    const key = "hf-studio-ui-preferences";
    const previous = JSON.parse(localStorage.getItem(key) ?? "{}");
    localStorage.setItem(key, JSON.stringify({ ...previous, agentToolsEnabled: false }));
  }

  const registered = new Map();
  const pending = new Map();
  const registrationLog = [];
  let nextCallId = 0;

  const abortError = () => new DOMException("Registration aborted", "AbortError");
  const modelContext = {
    async registerTool(tool, options = {}) {
      await Promise.resolve();
      if (options.signal?.aborted) throw abortError();
      if (registered.has(tool.name)) {
        throw new DOMException(`Tool ${tool.name} is already registered`, "InvalidStateError");
      }
      registered.set(tool.name, tool);
      registrationLog.push(tool.name);
      options.signal?.addEventListener(
        "abort",
        () => {
          if (registered.get(tool.name) === tool) registered.delete(tool.name);
        },
        { once: true },
      );
    },
  };

  Object.defineProperty(document, "modelContext", {
    configurable: true,
    value: modelContext,
  });
  Object.defineProperty(window, "__webMcpHarness", {
    configurable: true,
    value: {
      names: () => [...registered.keys()].sort(),
      registrationLog: () => [...registrationLog],
      definitions: () =>
        [...registered.values()].map((tool) => ({
          name: tool.name,
          inputSchema: tool.inputSchema ?? null,
          annotations: tool.annotations ?? null,
        })),
      startCall(name, input) {
        const tool = registered.get(name);
        if (!tool) throw new Error(`Tool ${name} is not registered`);
        const callId = ++nextCallId;
        const controller = new AbortController();
        pending.set(callId, Promise.resolve(tool.execute(input, { signal: controller.signal })));
        return callId;
      },
      async awaitCall(callId) {
        const promise = pending.get(callId);
        if (!promise) throw new Error(`Unknown call ${callId}`);
        try {
          return await promise;
        } finally {
          pending.delete(callId);
        }
      },
      async call(name, input) {
        const callId = this.startCall(name, input);
        return this.awaitCall(callId);
      },
    },
  });
}

async function callTool(page, name, input = {}) {
  return page.evaluate(
    ({ toolName, toolInput }) => window.__webMcpHarness.call(toolName, toolInput),
    { toolName: name, toolInput: input },
  );
}

async function startToolCall(page, name, input) {
  return page.evaluate(
    ({ toolName, toolInput }) => window.__webMcpHarness.startCall(toolName, toolInput),
    { toolName: name, toolInput: input },
  );
}

async function awaitToolCall(page, callId) {
  return page.evaluate((id) => window.__webMcpHarness.awaitCall(id), callId);
}

async function waitForToolSurface(page, expectedCount = TOOL_COUNT) {
  await page.waitForFunction(
    (count) => window.__webMcpHarness?.names().length === count,
    { timeout: NAVIGATION_TIMEOUT_MS },
    expectedCount,
  );
  // Registration is sequential. Require a stable settled count rather than a
  // transient prefix that happens to equal the expected number.
  await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  const names = await page.evaluate(() => window.__webMcpHarness.names());
  assert(names.length === expectedCount, `Expected ${expectedCount} settled tools, got ${names}`);
  return names;
}

// The tool may truthfully refuse while the preview is replacing its document.
// fallow-ignore-next-line complexity
async function waitForReadyLook(page) {
  const deadline = Date.now() + NAVIGATION_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const result = await callTool(page, "studio_look", { limit: 200 });
    if (result.ok && result.sceneStatus === "ready" && result.elementCount > 0) return result;
    await new Promise((resolveWait) => setTimeout(resolveWait, 150));
  }
  throw new Error("studio_look never observed a ready scene");
}

async function waitForLens(page, phase) {
  await page.waitForSelector(`[data-topology-lens="${phase}"] [data-topology-target="true"]`, {
    visible: true,
    timeout: NAVIGATION_TIMEOUT_MS,
  });
  return page.evaluate((expectedPhase) => {
    const player = document.querySelector("hyperframes-player");
    const frame = player?.shadowRoot?.querySelector("iframe");
    return {
      parentPhase: document
        .querySelector("[data-topology-lens]")
        ?.getAttribute("data-topology-lens"),
      iframeHasLens: Boolean(frame?.contentDocument?.querySelector("[data-topology-lens]")),
      targetText: frame?.contentDocument?.querySelector("#duplicate-headline")?.textContent?.trim(),
      expectedPhase,
    };
  }, phase);
}

async function savePageScreenshot(page, name) {
  await page.screenshot({ path: join(EVIDENCE_DIR, name), fullPage: false });
}

async function saveAnimatedPageScreenshot(page, name) {
  // Capture after the motion has become legible, not on the first rendered frame.
  await new Promise((resolveWait) => setTimeout(resolveWait, 96));
  await savePageScreenshot(page, name);
}

async function savePreviewScreenshot(page, name) {
  const handle = await page.evaluateHandle(() => {
    const player = document.querySelector("hyperframes-player");
    return player?.shadowRoot?.querySelector("iframe") ?? null;
  });
  const element = handle.asElement();
  assert(element, "Could not find the Studio preview iframe");
  await element.screenshot({ path: join(EVIDENCE_DIR, name) });
  await handle.dispose();
}

async function capturePreviewHash(page) {
  const handle = await page.evaluateHandle(() => {
    const player = document.querySelector("hyperframes-player");
    return player?.shadowRoot?.querySelector("iframe") ?? null;
  });
  const element = handle.asElement();
  assert(element, "Could not find the Studio preview iframe");
  const bytes = await element.screenshot({ type: "png" });
  await handle.dispose();
  return sha256(bytes);
}

async function waitForPreviewHashChange(page, previousHash) {
  const deadline = Date.now() + NAVIGATION_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const currentHash = await capturePreviewHash(page);
    if (currentHash !== previousHash) return currentHash;
    await new Promise((resolveWait) => setTimeout(resolveWait, 40));
  }
  throw new Error("Open Studio preview pixels stayed stale while the write was pending");
}

async function saveImageEvidenceFromBrowser(url, evidenceName, contentType) {
  assert(browser, "Browser is unavailable for image evidence");
  const evidencePage = await browser.newPage();
  try {
    await evidencePage.setViewport({ width: 1200, height: 800, deviceScaleFactor: 1 });
    await evidencePage.goto(url, {
      waitUntil: "networkidle0",
      timeout: RENDER_TIMEOUT_MS,
    });
    const image = await evidencePage.waitForSelector("img", {
      visible: true,
      timeout: RENDER_TIMEOUT_MS,
    });
    assert(image, `Browser did not render image evidence for ${url}`);
    const outputPath = join(EVIDENCE_DIR, evidenceName);
    if (contentType.includes("jpeg")) {
      await image.screenshot({ path: outputPath, type: "jpeg", quality: 92 });
    } else {
      await image.screenshot({ path: outputPath, type: "png" });
    }
  } finally {
    await evidencePage.close();
  }
}

async function fetchImage(url, evidenceName, expectedContentType = null) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), RENDER_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    assert(response.ok, `Image request failed (${response.status}) for ${url}`);
    const contentType = response.headers.get("content-type") ?? "";
    assert(contentType.startsWith("image/"), `Expected image bytes, got ${contentType} for ${url}`);
    if (expectedContentType) {
      assert(
        contentType.includes(expectedContentType),
        `Expected ${expectedContentType}, got ${contentType} for ${url}`,
      );
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    assert(bytes.length > 1_000, `Image evidence was unexpectedly small (${bytes.length} bytes)`);
    await saveImageEvidenceFromBrowser(url, evidenceName, contentType);
    return { contentType, sha256: sha256(bytes), size: bytes.length };
  } finally {
    clearTimeout(timeout);
  }
}

async function findMountedThumbnailUrl(page, sourceFile, previous = null) {
  await page.waitForFunction(
    ({ source, old }) =>
      [...document.querySelectorAll('.hf-dock img[src*="/thumbnail/"]')].some(
        (image) => image.src.includes(source) && (!old || image.src !== old),
      ),
    { timeout: RENDER_TIMEOUT_MS },
    { source: sourceFile, old: previous },
  );
  return page.evaluate((source) => {
    const image = [...document.querySelectorAll('.hf-dock img[src*="/thumbnail/"]')].find(
      (candidate) => candidate.src.includes(source),
    );
    return image?.src ?? null;
  }, sourceFile);
}

function targetForSource(look, sourceFile) {
  const candidates = look.elements.filter(
    (element) => element.sourceFile === sourceFile && element.handle.includes("duplicate-headline"),
  );
  assert(
    candidates.length === 1,
    `Expected one duplicate headline in ${sourceFile}, got ${candidates.length}`,
  );
  return candidates[0];
}

// An agent follows the refusal hint with a fresh look, but never retries forever.
// fallow-ignore-next-line complexity
async function selectWithBoundedReacquire(page, initialTarget, sourceFile) {
  let target = initialTarget;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const selection = await callTool(page, "studio_select", { handle: target.handle });
    if (selection.ok) return { selection, target };
    const targetChanged =
      selection.kind === "invalid" &&
      selection.reason === "the target changed while it was resolving";
    if (!targetChanged || attempt === 2) {
      throw new Error(
        `studio_select failed after ${attempt + 1} attempt(s): ${JSON.stringify(selection)}`,
      );
    }
    target = targetForSource(await waitForReadyLook(page), sourceFile);
  }
  throw new Error("unreachable selection retry state");
}

// Linear browser acceptance scenario. Splitting it would hide the causal chain
// between the write receipt, source bytes, overlay, thumbnail, frame, and reload.
// fallow-ignore-next-line complexity
async function runBrowserProof(page) {
  const mutationResponses = [];
  await page.evaluateOnNewDocument(installModelContextHarness, false);
  await page.setRequestInterception(true);
  page.on("request", (request) => {
    if (
      request.method() === "POST" &&
      (request.url().includes("/file-mutations/") || request.url().includes("/gsap-mutations/"))
    ) {
      setTimeout(() => void request.continue(), 340);
      return;
    }
    void request.continue();
  });
  page.on("response", (response) => {
    if (!response.url().includes("/file-mutations/patch-element/")) return;
    void response
      .json()
      .then((body) => mutationResponses.push({ status: response.status(), body }))
      .catch(() => undefined);
  });

  await page.goto(`${ORIGIN}/#project/${PROJECT_ID}`, {
    waitUntil: "domcontentloaded",
    timeout: NAVIGATION_TIMEOUT_MS,
  });
  const registeredTools = await waitForToolSurface(page);
  const definitions = await page.evaluate(() => window.__webMcpHarness.definitions());
  const writeTools = definitions.filter(
    (definition) =>
      definition.name.startsWith("studio_") &&
      [
        "studio_set_text",
        "studio_set_style",
        "studio_transform",
        "studio_add_animation",
        "studio_update_animation",
        "studio_add_keyframe",
        "studio_delete_animation",
      ].includes(definition.name),
  );
  for (const tool of writeTools) {
    assert(tool.inputSchema?.required?.includes("handle"), `${tool.name} does not require handle`);
  }

  const lookBefore = await waitForReadyLook(page);
  let left = targetForSource(lookBefore, "compositions/left-card.html");
  const right = targetForSource(lookBefore, "compositions/right-card.html");
  assert(left.handle !== right.handle, "Duplicate authored ids produced the same handle");
  assert(
    left.parentHandle && right.parentHandle && left.depth > 0 && right.depth > 0,
    `Nested targets did not report source hierarchy: ${JSON.stringify([left, right])}`,
  );

  const selected = await selectWithBoundedReacquire(page, left, "compositions/left-card.html");
  left = selected.target;
  const { selection } = selected;
  assert(
    selection.ok && selection.handle === left.handle,
    `studio_select did not select the left handle: ${JSON.stringify(selection)}`,
  );
  assert(
    selection.box.width > 1 && selection.box.height > 1,
    `studio_select returned inert geometry: ${JSON.stringify(selection)}`,
  );
  const selectedTarget = await page.waitForSelector('[data-dom-edit-selection-box="true"]', {
    visible: true,
    timeout: NAVIGATION_TIMEOUT_MS,
  });
  assert(selectedTarget, "studio_select did not expose the agent target in Studio");
  await savePageScreenshot(page, "00-agent-target-selected.png");

  const thumbnailBeforeUrl = await findMountedThumbnailUrl(page, "left-card.html");
  assert(thumbnailBeforeUrl, "No mounted left-card thumbnail URL was found");
  const thumbnailBefore = await fetchImage(
    thumbnailBeforeUrl,
    "thumbnail-before.jpg",
    "image/jpeg",
  );

  const frameBeforeResult = await callTool(page, "studio_frame", { time: 1, settleMs: 0 });
  assert(frameBeforeResult.ok, `Initial studio_frame failed: ${JSON.stringify(frameBeforeResult)}`);
  const frameBefore = await fetchImage(
    new URL(frameBeforeResult.url, ORIGIN),
    "frame-before.png",
    "image/png",
  );

  const leftSourcePath = join(globalThis.__webmcpProjectRoot, "compositions/left-card.html");
  const rightSourcePath = join(globalThis.__webmcpProjectRoot, "compositions/right-card.html");
  const leftSourceBefore = readFileSync(leftSourcePath, "utf8");
  const rightSourceBefore = readFileSync(rightSourcePath, "utf8");

  const previewBeforeText = await capturePreviewHash(page);
  const firstCall = await startToolCall(page, "studio_set_text", {
    handle: left.handle,
    text: "Agent saved this",
  });
  const acquiring = await waitForLens(page, "acquiring");
  assert(acquiring.parentPhase === "acquiring", "New target did not enter acquisition");
  assert(!acquiring.iframeHasLens, "Topology Lens leaked into the preview iframe DOM");
  const previewDuringText = await waitForPreviewHashChange(page, previewBeforeText);
  await saveAnimatedPageScreenshot(page, "01-new-target-acquiring.png");
  await savePreviewScreenshot(page, "02-preview-during-action.png");

  // Start the source renderer while acquisition is visible, but do not await
  // its comparatively slow Chrome capture before observing the short seal.
  const frameDuringActionCall = await startToolCall(page, "studio_frame", { time: 1, settleMs: 0 });

  const firstReceipt = await awaitToolCall(page, firstCall);
  assert(firstReceipt.ok, `Text write failed: ${JSON.stringify(firstReceipt)}`);
  assert(
    ["saved", "verified"].includes(firstReceipt.stage),
    `Expected durable receipt, got ${JSON.stringify(firstReceipt)}; mutation=${JSON.stringify(mutationResponses.at(-1))}`,
  );
  assert(firstReceipt.changed === true, "First write did not report a durable change");
  assert(
    firstReceipt.target?.sourceFile === "compositions/left-card.html",
    `Receipt named the wrong source: ${JSON.stringify(firstReceipt.target)}`,
  );
  const sealing = await waitForLens(page, "sealing");
  assert(!sealing.iframeHasLens, "Persisted seal leaked into the preview iframe DOM");
  await saveAnimatedPageScreenshot(page, "03-persisted-seal.png");
  const frameDuringActionResult = await awaitToolCall(page, frameDuringActionCall);
  assert(frameDuringActionResult.ok, "studio_frame failed after starting during acquisition");
  const frameDuringAction = await fetchImage(
    new URL(frameDuringActionResult.url, ORIGIN),
    "frame-during-action.png",
    "image/png",
  );

  const repeatedCall = await startToolCall(page, "studio_set_style", {
    handle: left.handle,
    styles: { color: "#67e8f9" },
  });
  const localizing = await waitForLens(page, "localizing");
  assert(
    localizing.parentPhase === "localizing",
    "Repeated target reacquired instead of localizing",
  );
  await saveAnimatedPageScreenshot(page, "04-repeated-target-localizing.png");
  const repeatedReceipt = await awaitToolCall(page, repeatedCall);
  assert(
    repeatedReceipt.ok && repeatedReceipt.stage === "saved",
    "Repeated style write was not saved",
  );

  const newTargetCall = await startToolCall(page, "studio_set_style", {
    handle: right.handle,
    styles: { color: "#f5f3ff" },
  });
  const reacquiring = await waitForLens(page, "acquiring");
  assert(reacquiring.parentPhase === "acquiring", "Changing targets did not restore acquisition");
  await saveAnimatedPageScreenshot(page, "05-new-target-reacquiring.png");
  const newTargetReceipt = await awaitToolCall(page, newTargetCall);
  assert(
    newTargetReceipt.ok && newTargetReceipt.changed === false,
    `Sibling no-op was not truthful: ${JSON.stringify(newTargetReceipt)}`,
  );

  const previewBeforeTransform = await capturePreviewHash(page);
  const transformReceipt = await callTool(page, "studio_transform", {
    handle: left.handle,
    width: 280,
    height: 60,
  });
  assert(
    transformReceipt.ok && transformReceipt.applied.includes("resize"),
    `Transform did not land: ${JSON.stringify(transformReceipt)}`,
  );
  const previewAfterTransform = await capturePreviewHash(page);
  assert(
    previewAfterTransform !== previewBeforeTransform,
    "Open Studio preview pixels stayed stale after transform success",
  );

  const animationTime = 0.25;
  const seekBeforeAnimation = await callTool(page, "studio_seek", { time: animationTime });
  assert(seekBeforeAnimation.ok, "Could not seek before the live-animation proof");
  const previewBeforeAnimation = await capturePreviewHash(page);
  const animationReceipt = await callTool(page, "studio_add_animation", {
    handle: left.handle,
    method: "from",
  });
  assert(
    animationReceipt.ok,
    `Animation write failed: ${JSON.stringify(animationReceipt)}; mutation=${JSON.stringify(mutationResponses.at(-1))}`,
  );
  const sourceAfterAnimation = readFileSync(leftSourcePath, "utf8");
  assert(
    sourceAfterAnimation.includes("gsap"),
    "Animation tool returned before the GSAP source write was durable",
  );
  const seekAfterAnimation = await callTool(page, "studio_seek", { time: animationTime });
  assert(seekAfterAnimation.ok, "Could not seek after the live-animation proof");
  const previewAfterAnimation = await capturePreviewHash(page);
  assert(
    previewAfterAnimation !== previewBeforeAnimation,
    "Open Studio preview pixels stayed stale after animation success",
  );
  await savePreviewScreenshot(page, "05-live-animation-preview.png");

  const leftSourceAfter = readFileSync(leftSourcePath, "utf8");
  const rightSourceAfter = readFileSync(rightSourcePath, "utf8");
  assert(
    leftSourceAfter.includes("Agent saved this"),
    "Left source file did not persist the text edit",
  );
  assert(leftSourceAfter.includes("#67e8f9"), "Left source file did not persist the style edit");
  assert(leftSourceAfter !== leftSourceBefore, "Target source stayed byte-for-byte unchanged");
  assert(rightSourceAfter === rightSourceBefore, "The duplicate-id sibling source was modified");

  const thumbnailAfterUrl = await findMountedThumbnailUrl(
    page,
    "left-card.html",
    thumbnailBeforeUrl,
  );
  assert(thumbnailAfterUrl, "Mounted thumbnail URL did not advance after persistence");
  const beforeRevision = new URL(thumbnailBeforeUrl).searchParams.get("revision");
  const afterRevision = new URL(thumbnailAfterUrl).searchParams.get("revision");
  assert(beforeRevision !== afterRevision, `Thumbnail revision stayed at ${beforeRevision}`);
  const thumbnailAfter = await fetchImage(thumbnailAfterUrl, "thumbnail-after.jpg", "image/jpeg");
  assert(
    thumbnailAfter.sha256 !== thumbnailBefore.sha256,
    "Fresh thumbnail bytes matched stale bytes",
  );

  const frameAfterResult = await callTool(page, "studio_frame", { time: 1, settleMs: 200 });
  assert(
    frameAfterResult.ok,
    `Post-write studio_frame failed: ${JSON.stringify(frameAfterResult)}`,
  );
  const frameAfter = await fetchImage(
    new URL(frameAfterResult.url, ORIGIN),
    "frame-after.png",
    "image/png",
  );
  assert(
    frameAfter.sha256 !== frameBefore.sha256,
    "Post-write frame bytes matched pre-write frame",
  );
  await savePageScreenshot(page, "06-studio-after.png");

  const historyBeforeReload = (await callTool(page, "studio_look", { limit: 1 })).history;
  assert(
    historyBeforeReload?.canUndo && historyBeforeReload.undoLabel,
    "Write did not enter undo history",
  );

  await page.reload({ waitUntil: "domcontentloaded", timeout: NAVIGATION_TIMEOUT_MS });
  await waitForToolSurface(page);
  const lookAfterReload = await waitForReadyLook(page);
  const leftAfterReload = targetForSource(lookAfterReload, "compositions/left-card.html");
  const inspectAfterReload = await callTool(page, "studio_inspect", {
    handle: leftAfterReload.handle,
  });
  assert(inspectAfterReload.ok, "Reloaded target could not be inspected by its new handle");
  assert(inspectAfterReload.text?.includes("Agent saved this"), "Reload lost the persisted text");
  assert(
    inspectAfterReload.inlineStyles?.color === "#67e8f9" ||
      inspectAfterReload.styles?.color?.includes("103, 232, 249"),
    `Reload lost the persisted style: ${JSON.stringify(inspectAfterReload.inlineStyles)}`,
  );
  assert(
    lookAfterReload.history.undoLabel === historyBeforeReload.undoLabel,
    `Reload changed undo identity (${historyBeforeReload.undoLabel} -> ${lookAfterReload.history.undoLabel})`,
  );
  await savePageScreenshot(page, "07-reload-persistence.png");

  return {
    registeredTools,
    writeSchemasRequireHandle: writeTools.map((tool) => tool.name),
    duplicateTargets: [left, right],
    selection,
    receipts: {
      first: firstReceipt,
      repeated: repeatedReceipt,
      siblingNoOp: newTargetReceipt,
      transform: transformReceipt,
      animation: animationReceipt,
    },
    lens: { acquiring, sealing, localizing, reacquiring },
    source: {
      changed: "compositions/left-card.html",
      unchanged: "compositions/right-card.html",
      leftBefore: sha256(leftSourceBefore),
      leftAfter: sha256(leftSourceAfter),
      rightBefore: sha256(rightSourceBefore),
      rightAfter: sha256(rightSourceAfter),
    },
    thumbnail: {
      beforeRevision,
      afterRevision,
      before: thumbnailBefore,
      after: thumbnailAfter,
    },
    frame: {
      before: frameBefore,
      duringAction: frameDuringAction,
      after: frameAfter,
      liveTextPreview: { before: previewBeforeText, during: previewDuringText },
      livePreview: { before: previewBeforeAnimation, after: previewAfterAnimation },
      transformPreview: { before: previewBeforeTransform, after: previewAfterTransform },
    },
    reload: {
      text: inspectAfterReload.text,
      color: inspectAfterReload.inlineStyles?.color ?? inspectAfterReload.styles?.color,
      undoLabel: lookAfterReload.history.undoLabel,
    },
  };
}

async function proveDisabledPreference(browser) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument(installModelContextHarness, true);
  await page.goto(`${ORIGIN}/#project/${PROJECT_ID}`, {
    waitUntil: "domcontentloaded",
    timeout: NAVIGATION_TIMEOUT_MS,
  });
  await page.waitForFunction(() => document.querySelector("hyperframes-player"), {
    timeout: NAVIGATION_TIMEOUT_MS,
  });
  await new Promise((resolveWait) => setTimeout(resolveWait, 500));
  const names = await page.evaluate(() => window.__webMcpHarness.names());
  assert(names.length === 0, `Disabled preference registered tools: ${names.join(", ")}`);
  await page.close();
  return { registeredTools: names };
}

const chromeExecutable = resolveChromeExecutable();
if (!chromeExecutable) {
  console.error("No Chrome executable found. Set PUPPETEER_EXECUTABLE_PATH.");
  process.exit(2);
}
assert(Number.isInteger(PORT) && PORT > 0 && PORT < 65_536, `Invalid WEBMCP_E2E_PORT: ${PORT}`);

mkdirSync(EVIDENCE_DIR, { recursive: true });
const tempRoot = mkdtempSync(join(tmpdir(), "hf-webmcp-edit-loop-"));
const projectRoot = join(tempRoot, PROJECT_ID);
const dataProjectsDir = join(STUDIO_DIR, "data/projects");
const projectLink = join(dataProjectsDir, PROJECT_ID);
const serverLogs = [];
let server = null;
let browser = null;

try {
  cpSync(FIXTURE_DIR, projectRoot, { recursive: true });
  mkdirSync(dataProjectsDir, { recursive: true });
  assert(!existsSync(projectLink), `${projectLink} already exists; refusing to replace it`);
  symlinkSync(projectRoot, projectLink, "dir");
  globalThis.__webmcpProjectRoot = projectRoot;

  server = startStudioServer(serverLogs);
  await waitForServer(server, serverLogs);
  browser = await puppeteer.launch({
    executablePath: chromeExecutable,
    headless: true,
    args: ["--disable-gpu", "--no-first-run", "--no-default-browser-check"],
  });
  const page = await browser.newPage();
  page.setDefaultTimeout(NAVIGATION_TIMEOUT_MS);
  await page.setViewport({ width: 1600, height: 1000, deviceScaleFactor: 1 });

  const consoleErrors = [];
  const failedResponses = [];
  page.on("pageerror", (error) => consoleErrors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(`console: ${message.text()}`);
  });
  page.on("response", (response) => {
    if (response.status() >= 400) {
      failedResponses.push({ status: response.status(), url: response.url() });
    }
  });

  const proof = await runBrowserProof(page);
  const disabledPreference = await proveDisabledPreference(browser);
  const allowedFfmpegProbeMisses = failedResponses.filter((response) => {
    const url = new URL(response.url);
    return response.status === 404 && url.pathname === "/api/environment/ffmpeg";
  });
  assert(
    allowedFfmpegProbeMisses.length === failedResponses.length,
    `Unexpected failed browser response: ${JSON.stringify(failedResponses)}`,
  );
  assert(
    consoleErrors.length === allowedFfmpegProbeMisses.length &&
      consoleErrors.every((message) => message.includes("404 (Not Found)")),
    `Unexpected browser console error: ${JSON.stringify(consoleErrors)}`,
  );
  const environment = {
    browser: await browser.version(),
    platform: platform(),
    architecture: arch(),
    viewport: { width: 1600, height: 1000, deviceScaleFactor: 1 },
    origin: ORIGIN,
    headless: true,
  };
  const report = {
    ok: true,
    environment,
    proof,
    disabledPreference,
    consoleErrors,
    failedResponses,
    allowedResourceWarning: {
      path: "/api/environment/ffmpeg",
      reason:
        "The standalone Vite server lacks the optional CLI probe; Studio treats it as unknown.",
      occurrences: allowedFfmpegProbeMisses.length,
    },
    evidenceFiles: readdirSync(EVIDENCE_DIR).sort(),
  };
  writeFileSync(join(EVIDENCE_DIR, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ ok: true, environment, evidenceDir: EVIDENCE_DIR, proof }, null, 2));
} catch (error) {
  const failure = {
    ok: false,
    error: error instanceof Error ? (error.stack ?? error.message) : String(error),
    serverLogs: serverLogs.join("").slice(-12_000),
  };
  console.error(failure.error);
  process.exitCode = 1;
} finally {
  await browser?.close().catch(() => undefined);
  if (server && server.exitCode === null) {
    server.kill("SIGTERM");
    await Promise.race([
      new Promise((resolveExit) => server.once("exit", resolveExit)),
      new Promise((resolveWait) => setTimeout(resolveWait, 2_000)),
    ]);
    if (server.exitCode === null) server.kill("SIGKILL");
  }
  if (existsSync(projectLink)) {
    const linkedRoot = realpathSync(projectLink);
    const expectedRoot = realpathSync(projectRoot);
    assert(linkedRoot === expectedRoot, `Refusing to remove unexpected project link ${linkedRoot}`);
    unlinkSync(projectLink);
  }
  rmSync(tempRoot, { recursive: true });
}
