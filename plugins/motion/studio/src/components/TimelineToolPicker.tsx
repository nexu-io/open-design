import { useI18n } from "../i18n/I18n";
import type { ReactNode } from "react";
import { ArrowLineLeft, ArrowLineRight, CaretDown } from "@phosphor-icons/react";
import { usePlayerStore } from "../player";
import { Scissors } from "../icons/SystemIcons";
import { Menu, MenuItem } from "./ui";
import { cn } from "./ui/cn";
import { flatIdle } from "./timelineToolbarStyles";
import { keyHint, useStudioKeys } from "../player/components/studioShortcuts";

function SelectIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
      <path d="M2 0.5L10 6L6.5 6.5L8.5 11L6.5 11.5L4.5 7L2 9Z" />
    </svg>
  );
}

interface ToolRow {
  label: string;
  shortcut: string;
  icon: ReactNode;
  active: boolean;
  run: () => void;
}

/** One button for the active timeline tool; its menu switches tools or selects clips around the playhead. */
export function TimelineToolPicker({ showSelectAroundPlayhead = true }) {
  const { t } = useI18n();
  const activeTool = usePlayerStore((s) => s.activeTool);
  const keys = useStudioKeys();
  const store = () => usePlayerStore.getState();
  const rows: ToolRow[] = [
    {
      label: "Select",
      shortcut: keyHint("selectTool", keys),
      icon: <SelectIcon />,
      active: activeTool === "select",
      run: () => store().setActiveTool("select"),
    },
    {
      label: "Split",
      shortcut: keyHint("razorTool", keys),
      icon: <Scissors size={16} />,
      active: activeTool === "razor",
      run: () => store().setActiveTool("razor"),
    },
  ];
  if (showSelectAroundPlayhead) {
    rows.push(
      {
        label: "Select leftward",
        shortcut: keyHint("selectLeftward", keys),
        icon: <ArrowLineLeft size={16} aria-hidden="true" />,
        active: false,
        run: () => store().selectLeftward(),
      },
      {
        label: "Select rightward",
        shortcut: keyHint("selectRightward", keys),
        icon: <ArrowLineRight size={16} aria-hidden="true" />,
        active: false,
        run: () => store().selectRightward(),
      },
    );
  }
  const current = rows.find((row) => row.active) ?? rows[0];
  return (
    <Menu
      aria-label={t("Timeline tools")}
      trigger={
        <button
          type="button"
          aria-label={t("Timeline tool: {value0}", { value0: t(current.label) })}
          className={cn(flatIdle, "gap-0.5")}
        >
          {current.icon}
          <CaretDown size={10} weight="bold" aria-hidden="true" />
        </button>
      }
    >
      {rows.map((row) => (
        <MenuItem
          key={t(row.label)}
          shortcut={row.shortcut}
          onClick={row.run}
          data-active={row.active || undefined}
          className={row.active ? "bg-press text-text-0" : undefined}
        >
          <span className="flex items-center gap-2">
            {row.icon}
            {t(row.label)}
          </span>
        </MenuItem>
      ))}
    </Menu>
  );
}
