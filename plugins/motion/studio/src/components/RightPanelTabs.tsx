import { useI18n } from "../i18n/I18n";
/**
 * The inspector tab strip on the shared Tabs primitive. The selected tab is derived from the
 * panel's state; in the legacy split inspector two can be open, only one holds `aria-selected`.
 */

import { Tab, Tabs, TabsList, Tooltip, cn } from "./ui";

export interface RightPanelTabDescriptor {
  /** Stable id, also the `data-tab-id` attribute the strip is queried by. */
  id: string;
  label: string;
  tooltip: string;
  /** Whether this tab's content is on screen right now. */
  active: boolean;
  /** Run when the strip moves to this tab, by click or by arrow key. */
  onSelect: () => void;
}

/** The look `aria-selected` gives the selected tab, for a second open pane. */
const SELECTED_LOOK = "bg-hover text-text-0";

export function RightPanelTabs({
  tabs,
  activateOnFocus = true,
}: {
  tabs: readonly RightPanelTabDescriptor[];
  /** False when `onSelect` toggles a pane, so an arrow key only moves focus. */
  activateOnFocus?: boolean;
}) {
  const { t } = useI18n();
  // `null` when the layout holds a tab this strip does not show (block params),
  // which leaves every tab unselected, exactly as the old buttons did.
  const value = tabs.find((tab) => tab.active)?.id ?? null;

  return (
    <Tabs
      value={value}
      onValueChange={(next) => {
        tabs.find((tab) => tab.id === next)?.onSelect();
      }}
    >
      <TabsList
        aria-label={t("Inspector panels")}
        activateOnFocus={activateOnFocus}
        className="flex min-w-0 items-center gap-1 overflow-hidden rounded-none border-b border-border-strong bg-transparent px-3 py-2"
      >
        {tabs.map((tab) => (
          <Tooltip key={tab.id} label={tab.tooltip} side="bottom">
            <Tab
              value={tab.id}
              className={cn("h-ctl-lg rounded-lg px-3 font-medium", tab.active && SELECTED_LOOK)}
            >
              {tab.label}
            </Tab>
          </Tooltip>
        ))}
      </TabsList>
    </Tabs>
  );
}
