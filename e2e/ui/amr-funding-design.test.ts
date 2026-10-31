// Frozen client 2026-10-20/r506 F07/F10. These controlled HTTP fixtures
// witness the running UI's full frame/cascade; real funding evidence is separate.
import { expect, test } from "@/playwright/suite";
import {
  applyStandardMocks,
  routeAgents,
  routeSuccessfulRuns,
} from "@/playwright/mock-factory";
import { mockSignedInVelaAccount } from "@/playwright/visual";
import {
  AMR_PERSONAL_WORKSPACE_CONTEXT,
  createProjectViaApi,
  gotoProject,
  seedBrowserConfig,
} from "@/playwright/amr";
import { T } from "@/timeouts";
const cases = [
  { id: "F07", tier: "pro", role: "owner", failure: "funding" },
  { id: "F10", tier: "pro", role: "member", failure: "funding" },
  { id: "RUN-004-Free-Owner", tier: "free", role: "owner", failure: "funding" },
  { id: "RUN-004-Go-Owner", tier: "go", role: "owner", failure: "funding" },
  { id: "RUN-004-Max-Owner", tier: "max", role: "owner", failure: "funding" },
  { id: "RUN-004-Admin", tier: "pro", role: "admin", failure: "funding" },
  { id: "SignedOut-control", tier: "pro", role: "owner", failure: "signedout" },
];
for (const scenario of cases)
  test(
    "[P0] Frozen funding dialog " + scenario.id,
    async ({ page }, testInfo) => {
      await page.setViewportSize({ width: 1440, height: 960 });
      await page.addInitScript(() => {
        localStorage.setItem("open-design:locale", "zh-CN");
        localStorage.setItem("open-design:locale-source", "manual");
      });
      await applyStandardMocks(page);
      await mockSignedInVelaAccount(page, {
        plan: scenario.tier,
        balanceUsd: "0.00",
      });
      await routeAgents(page, [
        {
          id: "amr",
          name: "OpenDesign AMR",
          bin: "vela",
          available: true,
          version: "test",
          models: [{ id: "glm-5", label: "glm-5" }],
        },
      ]);
      const config = {
        mode: "daemon",
        agentId: "amr",
        skillId: null,
        designSystemId: null,
        onboardingCompleted: true,
        privacyDecisionAt: 1,
        agentModels: { amr: { model: "glm-5" } },
        telemetry: { metrics: false, content: false, artifactManifest: false },
      };
      await seedBrowserConfig(page, config);
      await page.route("**/api/app-config", (route) =>
        route.fulfill({ json: { config } }),
      );
      const projectId = "visual-" + scenario.id + "-" + Date.now();
      await createProjectViaApi(
        page,
        projectId,
        scenario.id + " frozen visual",
        {
          accountPlan: scenario.tier,
          accountBalanceUsd: "0.00",
          accountCredits: 0,
        },
      );
      const context = {
        ...AMR_PERSONAL_WORKSPACE_CONTEXT,
        workspaceType: "team",
        role: scenario.role,
        planId: scenario.tier === "free" ? null : "team_" + scenario.tier,
        permissions: {
          ...AMR_PERSONAL_WORKSPACE_CONTEXT.permissions,
          canManageBilling: scenario.role === "owner",
          canManageAutoRecharge: scenario.role === "owner",
          canManageMembers: scenario.role !== "member",
        },
      };
      await page.route("**/api/workspace/context", (route) =>
        route.fulfill({ json: { context } }),
      );
      await page.route(
        `**/api/projects/${projectId}/workspace-scope`,
        (route) =>
          route.fulfill({
            json: {
              scope: {
                kind: "team",
                projectId,
                workspaceId: context.workspaceId,
                visibility: "personal",
                context,
              },
            },
          }),
      );
      await page.route("**/api/workspace/billing/preflight?**", (route) =>
        route.fulfill({
          json: {
            preflight: {
              schemaVersion: 1,
              workspaceId: context.workspaceId,
              workspaceMemberId: context.workspaceMemberId,
              modelId: "glm-5",
              generatedAt: new Date().toISOString(),
              balanceUsd: "0",
              funding: "wallet",
              fundingCheck:
                scenario.failure === "funding" ? "insufficient" : "available",
              modelCovered: false,
              codingPlan: {
                workspaceId: context.workspaceId,
                generatedAt: new Date().toISOString(),
                eligible: false,
                tier: null,
                windows: [],
              },
            },
          },
        }),
      );
      const runs = await routeSuccessfulRuns(page, {
        runId: "unexpected-visual-run-" + scenario.id + "-" + Date.now(),
      });
      await gotoProject(page, projectId);
      const input = page.getByTestId("chat-composer-input");
      await expect(input).toBeVisible({ timeout: T.long });
      if (scenario.failure === "signedout") {
        await page.route("**/api/integrations/vela/wallet**", (route) =>
          route.fulfill({
            json: {
              status: "signed_out",
              profile: "test",
              user: null,
              balanceUsd: null,
              stale: false,
            },
          }),
        );
        // The invitation polls normal auth status; keep this expired-session Given consistent.
        await page.route("**/api/integrations/vela/status", (route) =>
          route.fulfill({
            json: {
              loggedIn: false,
              loginInFlight: false,
              profile: "test",
              user: null,
              account: null,
            },
          }),
        );
      }
      await input.fill(scenario.id + " original draft");
      await page.getByTestId("chat-send").click();
      const modal =
        scenario.role === "owner"
          ? page.getByTestId("amr-balance-dialog")
          : page.getByRole("dialog", { name: "团队额度不足" });
      await expect(modal).toBeVisible({ timeout: T.long });
      await testInfo.attach(scenario.id + "-initial-modal", {
        body: await page.screenshot(),
        contentType: "image/png",
      });
      await testInfo.attach(scenario.id + "-initial-focus", {
        body: JSON.stringify(
          await modal.evaluate((element) => ({
            ancestors: (() => {
              const a = [];
              for (let n: Element | null = element; n; n = n.parentElement)
                a.push({
                  tag: n.tagName,
                  id: n.id,
                  inert: n.hasAttribute("inert"),
                  ariaHidden: n.getAttribute("aria-hidden"),
                });
              return a;
            })(),
            active: document.activeElement?.outerHTML,
            focusInModal: element.contains(document.activeElement),
            tooltips: [...document.querySelectorAll("[role=tooltip]")].map(
              (n) => ({
                html: n.outerHTML,
                visible: n.checkVisibility({
                  checkOpacity: true,
                  checkVisibilityCSS: true,
                }),
              }),
            ),
            inert: [...document.querySelectorAll("[inert]")].map((n) => ({
              tag: n.tagName,
              id: n.id,
              testId: n.getAttribute("data-testid"),
            })),
            ariaHidden: [...document.querySelectorAll("[aria-hidden=true]")]
              .slice(0, 15)
              .map((n) => ({
                tag: n.tagName,
                id: n.id,
                testId: n.getAttribute("data-testid"),
              })),
          })),
          null,
          2,
        ),
        contentType: "application/json",
      });
      await modal.locator("img").evaluateAll(async (nodes) => {
        await Promise.all(nodes.map((n) => (n as HTMLImageElement).decode()));
      });
      await expect
        .poll(() =>
          modal
            .locator("img")
            .evaluateAll((nodes) =>
              nodes.every((n) => (n as HTMLImageElement).naturalWidth > 0),
            ),
        )
        .toBe(true);
      await page.evaluate(() => document.fonts.ready);
      await modal.evaluate(async (e) => {
        await Promise.all(
          e
            .getAnimations({ subtree: true })
            .map((a) => a.finished.catch(() => {})),
        );
      });
      await page.mouse.move(0, 0);
      const capture = async (name: string, target: typeof modal) => {
        await testInfo.attach(name + "-viewport", {
          body: await page.screenshot(),
          contentType: "image/png",
        });
        await testInfo.attach(name + "-panel", {
          body: await target.screenshot(),
          contentType: "image/png",
        });
        await testInfo.attach(name + "-geometry", {
          body: JSON.stringify(
            await target.evaluate((element) => ({
              viewport: { width: innerWidth, height: innerHeight },
              dpr: devicePixelRatio,
              backdrop: (() => {
                const e = element.parentElement!;
                const s = getComputedStyle(e);
                return {
                  tag: e.tagName,
                  background: s.backgroundColor,
                  filter: s.backdropFilter,
                  padding: s.padding,
                  overflow: s.overflow,
                };
              })(),
              nodes: [
                element,
                ...element.querySelectorAll("h2,p,ul,li,button,img"),
              ].map((node) => {
                const r = node.getBoundingClientRect(),
                  s = getComputedStyle(node);
                return {
                  tag: node.tagName,
                  text: node.textContent,
                  rect: { x: r.x, y: r.y, width: r.width, height: r.height },
                  font: s.font,
                  lineHeight: s.lineHeight,
                  margin: s.margin,
                  padding: s.padding,
                  background: s.backgroundColor,
                  color: s.color,
                  radius: s.borderRadius,
                  shadow: s.boxShadow,
                  outline: s.outline,
                  hover: node.matches(":hover"),
                  focusVisible: node.matches(":focus-visible"),
                };
              }),
            })),
            null,
            2,
          ),
          contentType: "application/json",
        });
      };
      await capture(scenario.id, modal);
      if (scenario.failure === "signedout") {
        // This pre-existing invitation is outside the Oct20 funding-frame change.
        await expect(modal).toHaveCSS("border-radius", "12px");
        await expect(modal).toHaveCSS("background-color", "rgb(250, 250, 250)");
        const oldScrim = await modal.evaluate((e) => {
          const s = getComputedStyle(e.parentElement!);
          return { background: s.backgroundColor, filter: s.backdropFilter };
        });
        expect(oldScrim).toEqual({
          background: "rgba(255, 255, 255, 0.6)",
          filter: "blur(50px)",
        });
        await expect(page.getByTestId("amr-balance-dialog-plans")).toHaveCount(
          0,
        );
        expect(runs.bodies).toHaveLength(0);
        await modal.getByRole("button", { name: "关闭", exact: true }).click();
        await expect(modal).toHaveCount(0);
        return;
      }
      await expect
        .soft(modal)
        .toHaveCSS("background-color", "rgb(255, 255, 255)", {
          timeout: T.short,
        });
      await expect
        .soft(modal)
        .toHaveCSS("border-radius", "16px", { timeout: T.short });
      await expect
        .soft(modal)
        .toHaveCSS("line-height", "normal", { timeout: T.short });
      expect
        .soft(await modal.evaluate((e) => getComputedStyle(e).fontFamily))
        .not.toContain("Albert");
      await expect
        .soft(modal.locator("h2"))
        .toHaveCSS("line-height", "normal", { timeout: T.short });
      await expect
        .soft(modal.locator("h2"))
        .toHaveCSS("margin-bottom", "10px", { timeout: T.short });
      expect
        .soft(await modal.evaluate((e) => e.contains(document.activeElement)))
        .toBe(true);
      const backdrop = await modal.evaluate((e) => {
        const s = getComputedStyle(e.parentElement!);
        return {
          background: s.backgroundColor,
          filter: s.backdropFilter,
          padding: s.padding,
        };
      });
      expect
        .soft(backdrop)
        .toEqual({
          background: "rgba(0, 0, 0, 0.28)",
          filter: "none",
          padding: "16px",
        });
      if (scenario.role === "owner") {
        await expect
          .soft(modal.locator("li"))
          .toHaveText(
            [
              "无需复杂配置，海量 SOTA 模型任选",
              "邀请成员免费加入，共享额度",
              "支持多模态图像创作，图文一站生成",
              "作品一键发布上线，链接随时分享",
            ],
            { timeout: T.short },
          );
        if (scenario.tier === "max") {
          await expect.soft(page.getByTestId("amr-balance-dialog-plans")).toHaveCount(0);
        } else {
          await expect
            .soft(page.getByTestId("amr-balance-dialog-plans"))
            .toHaveCSS("background-color", "rgb(53, 53, 53)", {
              timeout: T.short,
            });
        }
      } else {
        await expect
          .soft(modal.locator("p"))
          .toHaveText(
            "当前团队额度不足，请联系团队空间所有者充值或升级订阅。",
            { timeout: T.short },
          );
        await expect
          .soft(page.getByTestId("amr-balance-owner-dismiss"))
          .toHaveCSS("background-color", "rgb(53, 53, 53)", {
            timeout: T.short,
          });
      }
      expect(runs.bodies).toHaveLength(0);
      await expect(modal.getByText(/自动充值|Auto.?recharge/i)).toHaveCount(0);
      await page.keyboard.press("Tab");
      await expect(modal.getByRole("button").first()).toBeFocused();
      await expect(modal.getByRole("button").first()).toHaveCSS(
        "outline-color",
        "rgb(21, 148, 71)",
      );
      await expect(modal.getByRole("button").first()).toHaveCSS(
        "outline-width",
        "2px",
      );
      await expect(modal.getByRole("button").first()).toHaveCSS(
        "outline-offset",
        "3px",
      );
      await page.keyboard.press("Escape");
      await expect(modal).toHaveCount(0);
      await expect(input).toHaveText(scenario.id + " original draft");
      await testInfo.attach("scenario", {
        body: JSON.stringify({
          scenario,
          fixtureOnly: true,
          actualRunPosts: runs.bodies.length,
          scope: context,
        }),
        contentType: "application/json",
      });
    },
  );
