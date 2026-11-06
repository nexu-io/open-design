// @vitest-environment happy-dom

import { afterEach, describe, expect, it } from "vitest";
import { PromptPreviewModal } from "./PromptPreviewModal";
import { cleanupMounted, mountHost } from "../ui/mountHost.testHelpers";

afterEach(cleanupMounted);

describe("PromptPreviewModal", () => {
  it("gives the prompt editor a stable accessible name", () => {
    const prompt = "Change the title";
    const title = "Example";
    const host = mountHost(<PromptPreviewModal title={title} prompt={prompt} onClose={() => {}} />);
    const dialog = host.querySelector('[role="dialog"]');
    const textarea = host.querySelector("textarea");

    expect(dialog?.getAttribute("aria-label")).toBe("Ask agent: Example");
    expect(textarea?.getAttribute("aria-label")).toBe("Prompt");
    expect(textarea?.getAttribute("aria-label")).not.toBe(prompt);
    expect(textarea?.getAttribute("aria-label")).not.toBe(dialog?.getAttribute("aria-label"));
  });
});
