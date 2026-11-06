import { describe, expect, it } from "vitest";
import {
  buildDefaultGradientModel,
  insertGradientStop,
  parseGradient,
  serializeGradient,
} from "./gradientValue";

describe("parseGradient", () => {
  it("parses linear gradients", () => {
    expect(
      parseGradient("linear-gradient(135deg, rgba(15, 23, 42, 0.58), rgba(255, 255, 255, 0.04))"),
    ).toMatchObject({
      kind: "linear",
      repeating: false,
      angle: 135,
      stops: [
        { color: "rgba(15, 23, 42, 0.58)", position: 0 },
        { color: "rgba(255, 255, 255, 0.04)", position: 100 },
      ],
    });
  });

  it("parses radial gradients", () => {
    expect(
      parseGradient("radial-gradient(circle closest-side at 20% 35%, #ff0000 10%, #0000ff 90%)"),
    ).toMatchObject({
      kind: "radial",
      shape: "circle",
      radialSize: "closest-side",
      centerX: 20,
      centerY: 35,
    });
  });

  it("parses conic gradients", () => {
    expect(
      parseGradient("conic-gradient(from 45deg at 40% 60%, #111111 0%, #ffffff 100%)"),
    ).toMatchObject({
      kind: "conic",
      angle: 45,
      centerX: 40,
      centerY: 60,
    });
  });

  it("parses repeating gradients", () => {
    expect(
      parseGradient("repeating-linear-gradient(90deg, #000000 0%, #ffffff 50%)"),
    ).toMatchObject({
      kind: "linear",
      repeating: true,
      angle: 90,
    });
  });
});

describe("serializeGradient", () => {
  it("serializes default gradient models", () => {
    expect(serializeGradient(buildDefaultGradientModel("rgba(60, 230, 172, 0.18)"))).toBe(
      "linear-gradient(135deg, rgba(60, 230, 172, 0.18) 0%, rgba(255, 255, 255, 0.04) 100%)",
    );
  });

  it("round-trips parsed gradients", () => {
    const parsed = parseGradient(
      "repeating-conic-gradient(from 90deg at 25% 75%, rgba(0, 0, 0, 0.5) 0%, rgba(255, 255, 255, 0.1) 100%)",
    );
    expect(parsed).not.toBeNull();
    expect(serializeGradient(parsed!)).toBe(
      "repeating-conic-gradient(from 90deg at 25% 75%, rgba(0, 0, 0, 0.5) 0%, rgba(255, 255, 255, 0.1) 100%)",
    );
  });
});

describe("insertGradientStop", () => {
  it("inserts a stop at the clicked position with an interpolated color", () => {
    const parsed = parseGradient("linear-gradient(90deg, #000000 0%, #ffffff 100%)");
    expect(parsed).not.toBeNull();

    expect(insertGradientStop(parsed!, 25)).toMatchObject({
      stops: [
        { color: "#000000", position: 0 },
        { color: "#404040", position: 25 },
        { color: "#ffffff", position: 100 },
      ],
    });
  });
});
