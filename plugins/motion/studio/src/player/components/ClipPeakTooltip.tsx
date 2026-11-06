import { cloneElement, createContext, useState, type ReactElement } from "react";
import { Tooltip } from "../../components/ui/Tooltip";

export const ClipPeakDescriptionContext = createContext<((detail: string | null) => void) | null>(
  null,
);

export function ClipPeakTooltip({
  children,
}: {
  children: ReactElement<{ title?: string; "aria-describedby"?: string }>;
}) {
  const [detail, setDetail] = useState<string | null>(null);
  return (
    <ClipPeakDescriptionContext.Provider value={setDetail}>
      <Tooltip label={detail ?? ""} disabled={detail === null}>
        {cloneElement(children, { title: detail === null ? children.props.title : undefined })}
      </Tooltip>
    </ClipPeakDescriptionContext.Provider>
  );
}
