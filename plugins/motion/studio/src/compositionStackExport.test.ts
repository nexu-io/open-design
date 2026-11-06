import { expect, it } from "vitest";
import { CompositionBreadcrumb, useCompositionStack } from "@hyperframes/studio";

it("exports the composition stack hook beside the breadcrumb it feeds", () => {
  expect(typeof useCompositionStack).toBe("function");
  expect(typeof CompositionBreadcrumb).toBe("function");
});
