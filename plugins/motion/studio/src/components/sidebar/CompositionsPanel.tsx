import type { ComponentProps } from "react";
import { resolveMasterCompositionPath } from "../../utils/studioUrlState";
import { CompositionsTab } from "./CompositionsTab";

type Props = Omit<ComponentProps<typeof CompositionsTab>, "masterCompositionPath">;

/** The Compositions dock panel body; the root badge comes from the filtered composition list. */
export function CompositionsPanel(props: Props) {
  return (
    <CompositionsTab
      {...props}
      masterCompositionPath={resolveMasterCompositionPath(props.compositions)}
    />
  );
}
