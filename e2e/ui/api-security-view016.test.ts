// Explicit sandbox replay. Private schemaVersion=1 fixture provides actors/spaces,
// cfg also requires canonical name/database/databaseUrl. Exact workspaceName, models=[Flash,value,top] actual catalog IDs, cfg URLs/sourceRoot,
// runtime velaBin+sha256, sourceBinding={amr,od} exact checked-out heads, and runtime
// sourceTuple={amr,open-design,od-landing}. Names, paths and versions are inputs; Free/paid permission expectations
// below remain fixed. Run only through the live canonical ownership wrapper.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { clusterTest as test, expect } from "@/playwright/suite";
import { createToolsDevSuite, e2eWorkspaceRoot } from "@/tools-dev/runtime";
import {
  warmPlaywrightWebRuntime,
  warmPlaywrightDaemonRuntime,
} from "@/playwright/runtime-lifecycle";
import { T } from "@/timeouts";
import { validateApiSecurityFixture } from "../lib/playwright/api-security.config.ts";

test("[P1] VIEW-016 real cached model selector A B A", async ({
  page,
}, info) => {
  test.setTimeout(T.xlong * 5);
  const validated = validateApiSecurityFixture();
  const { fixture: f, fixtureText, actualHeads, verifyOwner, cliDevice } = validated;
  const dir = process.env.VIEW016_RUNTIME!;
  assert(Array.isArray(f.models) && f.models.length === 3 && new Set(f.models).size === 3,
    "models must be the actual catalog IDs in Flash, value, top category order");
  const actor = f.actors["view016-owner"],
    A = f.spaces["free-a"],
    B = f.spaces["paid-b"];
  const namespace = `view016-${process.pid}-${randomUUID().slice(0, 6)}`;
  const root = join(e2eWorkspaceRoot(), ".tmp", "e2e", namespace),
    scratch = join(root, "scratch"),
    home = join(scratch, "amr-home");
  const runtime = createToolsDevSuite({
    root,
    namespace,
    ownerPid: process.pid,
    dataDir: join(scratch, "data"),
    toolsDevRoot: join(scratch, "tools-dev"),
    codexHomeDir: join(scratch, "codex-home"),
  });
  await mkdir(home, { recursive: true, mode: 0o700 });
  await mkdir(runtime.dataDir, { recursive: true });
  const vela = f.runtime.velaBin;
  const velaSha256 = createHash("sha256").update(await readFile(vela)).digest("hex");
  assert.equal(velaSha256, f.runtime.velaSha256, "Actual CLI binary must match private fixture binding");
  for (const space of [A, B]) assert(typeof space.workspaceName === "string" && space.workspaceName.length > 0, "Exact workspace display names are required");
  assert.notEqual(A.workspaceId, B.workspaceId);
  await writeFile(
    join(home, "config.json"),
    JSON.stringify({
      profiles: {
        local: {
          controlKey: cliDevice.tokens.controlKey,
          runtimeKey: cliDevice.tokens.runtimeKey,
          apiUrl: f.cfg.urls.api,
          linkUrl: f.cfg.urls.link,
          user: { id: actor.userId, email: actor.email, name: "VIEW016 QA" },
        },
      },
    }),
    { mode: 0o600 },
  );
  const config = {
    privacyDecisionAt: 1,
    telemetry: { metrics: false, content: false, artifactManifest: false },
    mode: "daemon",
    agentId: "amr",
    model: f.models[0],
    onboardingCompleted: true,
    agentModels: { amr: { model: f.models[0] } },
    agentCliEnv: { amr: { OPEN_DESIGN_AMR_PROFILE: "local", VELA_BIN: vela } },
  };
  await writeFile(
    join(runtime.dataDir, "app-config.json"),
    JSON.stringify(config),
  );
  const env = {
    AMR_HOME: home,
    VELA_BIN: vela,
    VELA_PROFILE: "local",
    OPEN_DESIGN_AMR_PROFILE: "local",
    VELA_API_URL: f.cfg.urls.api,
    VELA_LINK_URL: f.cfg.urls.link,
    VELA_CONTROL_KEY: cliDevice.tokens.controlKey,
    OD_WORKSPACE_CONTEXT_SOURCE: "vela",
    OD_VELA_WEB_URL: f.cfg.urls.web,
    OD_COLLAB_TRANSPORT: "off",
    OD_RESOURCE_TRANSPORT: "off",
    OD_TEAM_PROJECTS_TRANSPORT: "off",
  };
  const popups: string[] = [];
  page.on("popup", async (popup) => {
    popups.push(popup.url());
    await popup.close();
  });
  const events: any[] = [];
  page.on("response", async (r) => {
    const path = new URL(r.url()).pathname;
    if (/workspace|agents|models|vela/.test(path)) {
      try {
        events.push({
          at: new Date().toISOString(),
          path,
          method: r.request().method(),
          status: r.status(),
          workspace: r.request().headers()["x-od-workspace-id"],
          body: await r.json(),
        });
      } catch {}
    }
  });
  await page.context().route("**/*", (route) => {
    const u = new URL(route.request().url());
    return !u.protocol.startsWith("http") ||
      ["127.0.0.1", "localhost", "[::1]"].includes(u.hostname)
      ? route.continue()
      : route.abort();
  });
  await page.addInitScript(
    ({ config, A }) => {
      localStorage.setItem("open-design:config", JSON.stringify(config));
      localStorage.setItem("open-design:locale", "en");
      localStorage.setItem("open-design:locale-source", "manual");
      sessionStorage.setItem(
        "od.workspaceSelection.v1",
        JSON.stringify({
          workspaceId: A.workspaceId,
          workspaceMemberId: A.ownerMemberId,
        }),
      );
    },
    { config, A },
  );
  const out: any = {
    at: new Date().toISOString(),
    sourceBinding: actualHeads,
    sourceTuple: f.sourceTuple,
    sourceRoles: validated.sourceRoles,
    canonicalStatus: validated.canonicalStatus,
    fixtureSha256: createHash("sha256").update(fixtureText).digest("hex"),
    velaSha256,
    cliDevice: { provenance: cliDevice.provenance, initialSelectedWorkspaceId: cliDevice.initialSelectedWorkspaceId },
    stages: [],
    runtime: {
      namespace,
      root,
      dataDir: runtime.dataDir,
      toolsDevRoot: runtime.toolsDevRoot,
    },
    boundary:
      "Real daemon+web tools-dev with real canonical AMR and CLI; no mocked business API. Browser only model selector/cache, no external provider or payments.",
  };
  try {
    await runtime.startWeb(env);
    await warmPlaywrightWebRuntime(runtime.url.web("/"));
    await warmPlaywrightDaemonRuntime(runtime.url.daemon("/api/health"));
    await page.goto(runtime.url.web("/"), {
      waitUntil: "domcontentloaded",
      timeout: T.xlong,
    });
    await expect(page.getByTestId("home-hero-input")).toBeVisible({
      timeout: T.xlong,
    });
    async function select(space: any) {
      const current = await page.evaluate(
        () =>
          JSON.parse(
            sessionStorage.getItem("od.workspaceSelection.v1") ?? "null",
          )?.workspaceId,
      );
      if (current === space.workspaceId) return;
      const toggle = page.getByTestId("entry-rail-collapse");
      if ((await toggle.getAttribute("aria-expanded")) !== "true")
        await toggle.click({ timeout: T.medium });
      const switcher = page.getByTestId("workspace-switcher");
      if ((await switcher.getAttribute("aria-expanded")) !== "true")
        await switcher.click({ timeout: T.medium });
      const row = page
        .getByTestId("workspace-switcher-list")
        .getByRole("menuitem")
        .filter({ hasText: space.workspaceName });
      const changed = page.waitForResponse(
        (r) =>
          r.request().method() === "PUT" &&
          new URL(r.url()).pathname === "/api/workspace/active",
        { timeout: T.medium },
      );
      await row.click({ timeout: T.medium });
      const r = await changed;
      expect(r.ok()).toBe(true);
      expect((await r.json()).context.workspaceId).toBe(space.workspaceId);
      await expect
        .poll(() =>
          page.evaluate(
            () =>
              JSON.parse(
                sessionStorage.getItem("od.workspaceSelection.v1") ?? "null",
              )?.workspaceId,
          ),
        )
        .toBe(space.workspaceId);
    }
    for (const [label, space] of [
      ["A-first", A],
      ["B", B],
      ["A-return", A],
    ] as const) {
      await select(space);
      await page.getByTestId("inline-model-switcher-chip").click();
      const pop = page.getByTestId("inline-model-switcher-popover");
      await expect(pop).toBeVisible();
      await expect(
        page.getByTestId(`inline-model-switcher-compact-model-${f.models[0]}`),
      ).toBeVisible({ timeout: T.long });
      const stage: any = { label, workspaceId: space.workspaceId, rows: [] };
      for (const model of f.models) {
        if (!(await pop.isVisible()))
          await page
            .getByTestId("inline-model-switcher-chip")
            .click({ timeout: T.medium });
        const row = page.getByTestId(
          `inline-model-switcher-compact-model-${model}`,
        );
        const present = await row.count();
        const disabled = present
          ? await row.getAttribute("aria-disabled")
          : null;
        const title = present ? await row.getAttribute("title") : null;
        const value = async () =>
          page.evaluate(() => {
            const c = JSON.parse(
              localStorage.getItem("open-design:config") ?? "{}",
            );
            return c.agentModels?.amr?.model ?? c.model;
          });
        const before = await value();
        let after = before;
        if (present) {
          if (disabled === "true")
            await row.press("Enter", { timeout: T.medium });
          else await row.click({ timeout: T.medium });
          await expect
            .poll(value, { timeout: T.medium })
            .toBe(disabled === "true" ? before : model);
          after = await value();
        }
        stage.rows.push({
          model,
          present,
          ariaDisabled: disabled,
          title,
          selectionAction:
            disabled === "true" ? "native_keyboard_Enter" : "click",
          selectedBefore: before,
          selectedAfter: after,
        });
      }
      if (!(await pop.isVisible()))
        await page
          .getByTestId("inline-model-switcher-chip")
          .click({ timeout: T.medium });
      out.stages.push(stage);
      await page.screenshot({
        path: info.outputPath(`${label}.png`),
        fullPage: true,
      });
      await page.getByTestId("inline-model-switcher-chip").click();
    }
    out.status = out.stages.every((s: any) =>
      s.rows.every(
        (r: any) =>
          r.present === 1 &&
          r.ariaDisabled ===
            (s.label === "B" || r.model === f.models[0] ? null : "true"),
      ),
    )
      ? "ui_matrix_passed"
      : "product_failure_paid_B_locked";
    for (const s of out.stages)
      for (const row of s.rows) {
        expect.soft(row.present).toBe(1);
        expect
          .soft(row.ariaDisabled)
          .toBe(s.label === "B" || row.model === f.models[0] ? null : "true");
      }
  } catch (e) {
    out.status = "failed_or_environment";
    out.error = String(e);
    throw e;
  } finally {
    out.events = events;
    out.upgradePopups = popups;
    out.finishedAt = new Date().toISOString();
    const cleanupErrors: string[] = [];
    const persist = () => writeFile(join(dir, "view016-od-browser-evidence.private.json"), JSON.stringify(out, null, 2), { mode: 0o600 });
    await persist().catch((e) => cleanupErrors.push(`initial evidence: ${String(e)}`));
    await page.screenshot({ path: info.outputPath("final.png"), fullPage: true }).catch(() => undefined);
    await page.close().catch((e) => cleanupErrors.push(`page close: ${String(e)}`));
    await runtime.stopWeb(env).catch((e) => cleanupErrors.push(`tools-dev stop: ${String(e)}`));
    out.cleanup = await runtime.status(env).catch((e) => { cleanupErrors.push(`tools-dev status: ${String(e)}`); return { error: String(e) }; });
    try { verifyOwner(); out.postVerify = { exitCode: 0, at: new Date().toISOString() }; }
    catch (e) { cleanupErrors.push(`ownership verify: ${String(e)}`); out.postVerify = { error: String(e) }; }
    out.cleanupErrors = cleanupErrors;
    out.cleanupFinishedAt = new Date().toISOString();
    await persist();
    if (cleanupErrors.length && !out.error) throw new Error(`VIEW016 cleanup failed: ${cleanupErrors.join("; ")}`);
  }
});
