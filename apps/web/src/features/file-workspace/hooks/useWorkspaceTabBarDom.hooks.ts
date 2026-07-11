// Feature-local hook for the file-workspace tab-bar DOM cluster: a
// whole-window file-drop guard, wheel-to-horizontal-scroll translation on
// the tab bar, scroll-the-active-tab-into-view, and the
// overflow/`--ds-system-tab-w` remeasurement effect. None of these carry
// business state beyond `tabsOverflowing` — every `window`/`document`/DOM
// read-write lives behind the injected `WorkspaceTabBarDomPort` (see
// `providers/dom.ts`), so this hook stays DOM-free itself.
import { useEffect, useState, type RefObject } from 'react';
import type { DesignSystemSummary } from '../../../types';
import { workspaceTabBarDomPort } from '../dependencies';
import type { WorkspaceTabBarDomPort } from '../ports';
import { scrollWorkspaceTabsWithWheel } from '../rules';
import { DESIGN_FILES_TAB, DESIGN_SYSTEM_TAB, QUESTIONS_TAB } from '../constants';

export interface WorkspaceTabBarDomParams {
  tabsBarRef: RefObject<HTMLDivElement | null>;
  activeTab: string;
  browserTabsCount: number;
  designSystemProject: DesignSystemSummary | null;
  tabNamesCount: number;
}

export interface WorkspaceTabBarDomController {
  tabsOverflowing: boolean;
}

export function useWorkspaceTabBarDom(
  port: WorkspaceTabBarDomPort,
  params: WorkspaceTabBarDomParams,
): WorkspaceTabBarDomController {
  const { tabsBarRef, activeTab, browserTabsCount, designSystemProject, tabNamesCount } = params;
  const [tabsOverflowing, setTabsOverflowing] = useState(false);

  useEffect(() => port.subscribeWindowFileDropGuard(), [port]);

  useEffect(() => {
    const tabBar = tabsBarRef.current;
    if (!tabBar) return;
    return port.subscribeTabBarWheelScroll(tabBar, (event) => {
      scrollWorkspaceTabsWithWheel(tabBar, event);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [port]);

  // Browser-style tab bar: when the active tab changes (open from a chat
  // file chip, switch via Cmd+P, etc.), scroll it into view so the user
  // can always see what they have selected even when the strip overflows.
  // The Design Files entry is already sticky-pinned, so we only scroll
  // for real workspace tabs. Issue #775.
  useEffect(() => {
    if (activeTab === DESIGN_FILES_TAB || activeTab === DESIGN_SYSTEM_TAB || activeTab === QUESTIONS_TAB) return;
    const tabBar = tabsBarRef.current;
    if (!tabBar) return;
    port.scrollActiveTabIntoView(tabBar);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [port, activeTab]);

  useEffect(() => {
    const tabBar = tabsBarRef.current;
    if (!tabBar) return;
    const measure = () => {
      setTabsOverflowing(tabBar.scrollWidth > tabBar.clientWidth + 1);
      // Pin the sticky Design Files tab to the exact right edge of the sticky
      // Design System tab (its real, locale-dependent width + the 2px flex gap),
      // so the two read as adjacent instead of leaving a hardcoded-offset gap.
      const systemTab = tabBar.querySelector<HTMLElement>('.ws-tab.design-system-tab');
      if (systemTab) {
        tabBar.style.setProperty('--ds-system-tab-w', `${Math.round(systemTab.offsetWidth) + 2}px`);
      } else {
        tabBar.style.removeProperty('--ds-system-tab-w');
      }
    };
    return port.subscribeTabBarOverflowMeasure(tabBar, measure);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [port, browserTabsCount, designSystemProject, tabNamesCount]);

  return { tabsOverflowing };
}

/**
 * Wirer: binds the real DOM bridges and returns a ready-to-call hook. This is
 * the default the orchestrator injects; swap it via the component prop in
 * tests.
 */
export function useWiredWorkspaceTabBarDom(
  params: WorkspaceTabBarDomParams,
): WorkspaceTabBarDomController {
  return useWorkspaceTabBarDom(workspaceTabBarDomPort, params);
}
