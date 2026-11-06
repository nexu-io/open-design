import { afterEach, describe, expect, it, vi } from "vitest";
import { Window } from "happy-dom";
import { copyTextToClipboard } from "./clipboard";

function installDocument(execCommand: (command: string) => boolean): void {
  const window = new Window();
  Object.assign(window, { SyntaxError });
  Object.defineProperty(window.document, "execCommand", {
    configurable: true,
    value: execCommand,
  });
  vi.stubGlobal("document", window.document);
}

function installNavigator(
  writeText: (text: string) => Promise<void>,
  userAgent = "Mozilla/5.0 Chrome/120.0.0.0 Safari/537.36",
): void {
  vi.stubGlobal("navigator", {
    clipboard: { writeText },
    userAgent,
  });
}

describe("copyTextToClipboard", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses the synchronous selection copy path first in Safari", async () => {
    const execCommand = vi.fn((command: string) => command === "copy");
    const writeText = vi.fn((_text: string) => Promise.resolve());

    installDocument(execCommand);
    installNavigator(
      writeText,
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15",
    );

    await expect(copyTextToClipboard("copy me")).resolves.toBe(true);

    expect(execCommand).toHaveBeenCalledWith("copy");
    expect(writeText).not.toHaveBeenCalled();
    expect(document.querySelector("textarea")).toBeNull();
  });

  it("uses navigator.clipboard first outside Safari", async () => {
    const execCommand = vi.fn((command: string) => command === "copy");
    const writeText = vi.fn((_text: string) => Promise.resolve());

    installDocument(execCommand);
    installNavigator(writeText);

    await expect(copyTextToClipboard("copy me")).resolves.toBe(true);

    expect(writeText).toHaveBeenCalledWith("copy me");
    expect(execCommand).not.toHaveBeenCalled();
  });

  it("falls back to selection copy outside Safari when navigator.clipboard fails", async () => {
    const execCommand = vi.fn((command: string) => command === "copy");
    const writeText = vi.fn((_text: string) => Promise.reject(new Error("blocked")));

    installDocument(execCommand);
    installNavigator(writeText);

    await expect(copyTextToClipboard("copy me")).resolves.toBe(true);

    expect(writeText).toHaveBeenCalledWith("copy me");
    expect(execCommand).toHaveBeenCalledWith("copy");
  });

  it("reports failure when both copy paths fail", async () => {
    const execCommand = vi.fn(() => false);
    const writeText = vi.fn((_text: string) => Promise.reject(new Error("blocked")));

    installDocument(execCommand);
    installNavigator(
      writeText,
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15",
    );

    await expect(copyTextToClipboard("copy me")).resolves.toBe(false);

    expect(execCommand).toHaveBeenCalledWith("copy");
    expect(writeText).toHaveBeenCalledWith("copy me");
    expect(document.querySelector("textarea")).toBeNull();
  });
});
