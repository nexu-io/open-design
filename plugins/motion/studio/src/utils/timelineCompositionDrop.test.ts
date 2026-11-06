import { describe, expect, it } from "vitest";
import { parseTimelineCompositionPayload } from "./timelineCompositionDrop";

describe("timeline composition drop", () => {
  it("parses valid composition payloads and rejects malformed ones", () => {
    expect(parseTimelineCompositionPayload('{"sourcePath":"scene.html"}')).toEqual({
      sourcePath: "scene.html",
    });
    expect(parseTimelineCompositionPayload('{"path":"scene.html"}')).toBeNull();
    expect(parseTimelineCompositionPayload("nope")).toBeNull();
  });
});
