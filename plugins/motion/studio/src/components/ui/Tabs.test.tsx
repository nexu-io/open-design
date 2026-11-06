// @vitest-environment happy-dom

/**
 * Tabs: proves the shared strip reaches every tab by arrow key, something
 * three of Studio's six hand-rolled strips don't.
 */
import React, { act } from "react";
import { afterEach, expect, it } from "vitest";
import { cleanupMounted, mountHost } from "./mountHost.testHelpers";
import { Tab, TabPanel, Tabs, TabsList } from "./Tabs";

const TABS = ["code", "comps", "assets", "catalog"];

afterEach(cleanupMounted);

function mount(): HTMLElement {
  return mountHost(
    <Tabs defaultValue="code">
      <TabsList aria-label="Sidebar panels">
        {TABS.map((id) => (
          <Tab key={id} value={id}>
            {id}
          </Tab>
        ))}
      </TabsList>
      {TABS.map((id) => (
        <TabPanel key={id} value={id}>
          {id} panel
        </TabPanel>
      ))}
    </Tabs>,
  );
}

function tab(host: HTMLElement, id: string): HTMLElement {
  const el = host.querySelector<HTMLElement>(`[data-tab-id="${id}"]`);
  if (!el) throw new Error(`no tab for ${id}`);
  return el;
}

function selected(host: HTMLElement): string | null {
  return (
    host.querySelector('[role="tab"][aria-selected="true"]')?.getAttribute("data-tab-id") ?? null
  );
}

/** Base UI moves the roving tabindex synchronously and the focus one task later. */
async function arrow(key: string): Promise<void> {
  const target = document.activeElement ?? document.body;
  act(() => {
    target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, composed: true }));
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

it("moves selection and focus with the arrow keys", async () => {
  const host = mount();
  act(() => tab(host, "code").focus());

  await arrow("ArrowRight");

  expect(selected(host)).toBe("comps");
  expect(document.activeElement).toBe(tab(host, "comps"));
});

it("jumps to the first and last tab with Home and End", async () => {
  const host = mount();
  act(() => tab(host, "code").focus());

  await arrow("End");
  expect(selected(host)).toBe("catalog");
  expect(document.activeElement).toBe(tab(host, "catalog"));

  await arrow("Home");
  expect(selected(host)).toBe("code");
  expect(document.activeElement).toBe(tab(host, "code"));
});

it("labels the visible panel with its tab", () => {
  const host = mount();
  const panel = host.querySelector('[role="tabpanel"]:not([hidden])');

  expect(panel?.textContent).toBe("code panel");
  expect(panel?.getAttribute("aria-labelledby")).toBe(tab(host, "code").id);
});

it("carries data-tab-id, which the sidebar's focus restore looks up", () => {
  // LeftSidebar finds a tab with `[data-tab-id="…"]` to restore focus after a
  // programmatic switch. An attribute the primitive owns survives a reskin;
  // the class it used to match on does not.
  const host = mount();

  expect(
    [...host.querySelectorAll("[data-tab-id]")].map((el) => el.getAttribute("data-tab-id")),
  ).toEqual(TABS);
});
