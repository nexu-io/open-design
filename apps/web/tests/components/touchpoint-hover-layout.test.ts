// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	ensureWebTouchpointElement,
	HOVER_HOST_LAYOUT_CSS,
	webTouchpointModuleCache,
	type WebTouchpointContext,
} from "../../src/components/touchpoint-component";

afterEach(() => vi.restoreAllMocks());

const BASE_HOST_CSS =
	":host { color-scheme: var(--vela-touchpoint-theme); font-family: var(--vela-touchpoint-font-family); color: var(--foreground); background: var(--background); } *, *::before, *::after { box-sizing: border-box; }";

const contextFor = (placementKey: string) => ({
	placementKey, locale: "en-US", theme: "light", fontFamily: "Arial",
	cssVariables: {}, mode: "production", instanceId: "fixture", contentVersionId: "fixture",
}) as WebTouchpointContext;

describe("OPEND-3323 hover material layout defaults", () => {
	it.each(["opend.home.hover-entry", "opend.home.hover-layer"])(
		"keeps %s defaults first when material mount and update replace the shadow content",
		async (placementKey) => {
			const Element = ensureWebTouchpointElement();
			const element = new Element();
			const context = contextFor(placementKey);
			const render = (root: ShadowRoot) => {
				root.innerHTML = '<style>.crop { height: 72px; object-fit: cover; }</style><img class="crop" width="640" height="480">';
				return root;
			};
			vi.spyOn(webTouchpointModuleCache, "import").mockResolvedValue({
				mount: render,
				update: (instance: unknown) => { render(instance as ShadowRoot); },
			});
			const assertStyles = () => {
				const root = element.shadowRoot!;
				const defaults = root.querySelectorAll("style[data-vela-touchpoint-host]");
				expect(defaults).toHaveLength(1);
				expect(root.firstChild).toBe(defaults[0]);
				expect(defaults[0]!.textContent).toBe(BASE_HOST_CSS + HOVER_HOST_LAYOUT_CSS);
				// Authored CSS stays after the zero-specificity defaults.
				expect(root.querySelectorAll("style")[1]!.textContent).toContain("object-fit: cover");
				expect(root.querySelector("img")?.getAttribute("height")).toBe("480");
			};
			try {
				await element.mount("fixture", "fixture", context, new Map());
				assertStyles();
				await element.update({ ...context, theme: "dark" }, new Map());
				assertStyles();
			} finally {
				await element.dispose();
			}
		},
	);

	it("only adds zero-specificity intrinsic sizing, never a width or font size", () => {
		expect(HOVER_HOST_LAYOUT_CSS).toContain("height: auto");
		expect(HOVER_HOST_LAYOUT_CSS).toContain(":where(");
		expect(HOVER_HOST_LAYOUT_CSS).not.toMatch(/font-size|(?<!max-)width:\s*\d/);
	});

	it.each(["opend.home.campaign-modal", "opend.home.account-badge"])(
		"keeps %s host styling unchanged",
		async (placementKey) => {
			const Element = ensureWebTouchpointElement();
			const element = new Element();
			vi.spyOn(webTouchpointModuleCache, "import").mockResolvedValue({ mount: () => ({}) });
			await element.mount("fixture", "fixture", contextFor(placementKey), new Map());
			expect(element.shadowRoot!.querySelector("style")!.textContent).toBe(BASE_HOST_CSS);
			await element.dispose();
		},
	);
});
