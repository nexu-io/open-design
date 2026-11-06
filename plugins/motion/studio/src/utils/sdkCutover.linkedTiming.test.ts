import { describe, expect, it, vi } from "vitest";
import { openComposition } from "@hyperframes/sdk";
import { cutoverCommittedOrThrow, sdkTimingBatchPersist } from "./sdkCutover";
import { getStudioSaveErrorMessage } from "./studioSaveDiagnostics";

vi.mock("../components/editor/manualEditingAvailability", () => ({
  STUDIO_SDK_CUTOVER_ENABLED: true,
  STUDIO_SDK_RESOLVER_SHADOW_ENABLED: false,
}));
vi.mock("./studioTelemetry", () => ({
  trackStudioEvent: vi.fn(),
}));

const OFFSET_LINKED_HTML = `
<div data-hf-id="hf-stage" data-hf-root style="width:1280px;height:720px" data-duration="10">
  <video data-hf-id="hf-talk" src="talk.mp4" muted data-link="lk-1" data-start="2" data-duration="6" data-track-index="0"></video>
  <audio data-hf-id="hf-talk-audio" src="talk.mp4" data-link="lk-1" data-start="3" data-duration="5" data-track-index="2"></audio>
</div>
`.trim();

describe("a linked trim the SDK refuses", () => {
  it("fails the cutover with the SDK's reason, which the resize toast shows, and writes nothing", async () => {
    const session = await openComposition(OFFSET_LINKED_HTML);
    const before = session.serialize();
    const deps = {
      editHistory: { recordEdit: vi.fn().mockResolvedValue(undefined) },
      writeProjectFile: vi.fn().mockResolvedValue(undefined),
      reloadPreview: vi.fn(),
      publishSession: vi.fn(),
      createCandidateSession: async () => session,
    };
    const result = await sdkTimingBatchPersist(
      [{ hfId: "hf-talk", timingUpdate: { start: 2, duration: 0.5 } }],
      "index.html",
      session,
      deps,
    );
    expect(result.status).toBe("failed");
    let thrown: unknown;
    try {
      cutoverCommittedOrThrow(result);
    } catch (error) {
      thrown = error;
    }
    expect(getStudioSaveErrorMessage(thrown)).toBe(
      "Linked audio would start after the new end. Unlink or trim the audio first.",
    );
    expect(deps.writeProjectFile).not.toHaveBeenCalled();
    expect(deps.editHistory.recordEdit).not.toHaveBeenCalled();
    expect(session.serialize()).toBe(before);
  });
});
