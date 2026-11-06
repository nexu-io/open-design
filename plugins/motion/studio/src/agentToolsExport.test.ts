import { expect, it } from "vitest";
import { buildStudioTools, collectStudioLookScene } from "@hyperframes/studio";

it("exports Studio's agent tools for a host's own edit session", () => {
  const names = buildStudioTools({ current: {} as never }).map((tool) => tool.name);
  expect(names).toEqual(expect.arrayContaining(["studio_look", "studio_seek"]));
  expect(typeof collectStudioLookScene).toBe("function");
});
