import { describe, expect, it } from "vitest";

import {
  validateOpenDesignProductRuntimeProjection,
  validateOpenDesignProductRuntimeReadRequest,
} from "@/runtime/product-runtime.js";

describe("OpenDesign product runtime contract", () => {
  it("accepts only the finite read request", () => {
    expect(validateOpenDesignProductRuntimeReadRequest({ schemaVersion: 1, operation: "read" }))
      .toEqual({ schemaVersion: 1, operation: "read" });
    expect(() => validateOpenDesignProductRuntimeReadRequest({ schemaVersion: 1, operation: "invoke", command: "anything" }))
      .toThrow("fields must be exactly");
  });

  it("projects only normalized loopback Web and daemon endpoints", () => {
    expect(validateOpenDesignProductRuntimeProjection({
      schemaVersion: 1,
      web: { url: "http://127.0.0.1:17579" },
      daemon: { url: "http://[::1]:17578/" },
    })).toEqual({
      schemaVersion: 1,
      web: { url: "http://127.0.0.1:17579/" },
      daemon: { url: "http://[::1]:17578/" },
    });
  });

  it("rejects remote, credentialed, executable, and expanded projections", () => {
    const projection = (url: string) => ({
      schemaVersion: 1,
      web: { url },
      daemon: { url: "http://localhost:17578/" },
    });
    for (const url of [
      "https://open-design.ai/",
      "http://10.0.0.1:17579/",
      "http://user:secret@localhost:17579/",
      "file:///etc/passwd",
      "javascript:alert(1)",
    ]) expect(() => validateOpenDesignProductRuntimeProjection(projection(url))).toThrow();
    expect(() => validateOpenDesignProductRuntimeProjection({
      ...projection("http://localhost:17579/"),
      runtimeRoot: "/private/runtime",
    })).toThrow("fields must be exactly");
  });
});
