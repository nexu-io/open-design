import { describe, expect, it } from "vitest";
import { mergeStyleIntoTag } from "./htmlEditor";

describe("mergeStyleIntoTag", () => {
  it.each([
    ['<div style="color: red; opacity: 1">', '<div style="color: red; opacity: 0.5">'],
    ["<div style='color: red; opacity: 1'>", "<div style='color: red; opacity: 0.5'>"],
    ['<div style="">', '<div style="opacity: 0.5">'],
    ["<div style=''>", "<div style='opacity: 0.5'>"],
    ['<div style="color:\nred">', '<div style="color: red; opacity: 0.5">'],
    ["<div style='font-family: \"a\"'>", "<div style='font-family: \"a\"; opacity: 0.5'>"],
    ["<div style=\"font-family: 'a'\">", "<div style=\"font-family: 'a'; opacity: 0.5\">"],
    [
      "<div style=\"color:red\" style='color:blue'>",
      "<div style=\"color: red; opacity: 0.5\" style='color:blue'>",
    ],
    ['<div STYLE="color:red">', '<div STYLE="color:red" style="opacity: 0.5">'],
    ['<div style = "color:red">', '<div style = "color:red" style="opacity: 0.5">'],
    ['<div data-style="color:red">', '<div data-style="color: red; opacity: 0.5">'],
    ["<img/>", '<img style="opacity: 0.5"/>'],
    ['<div style="color:red>', '<div style="color:red style="opacity: 0.5">'],
  ])("preserves quote and source behavior (case %#)", (tag, expected) => {
    expect(mergeStyleIntoTag(tag, "opacity: 0.5")).toBe(expected);
    expect(mergeStyleIntoTag(tag, " \n")).toBe(tag);
  });

  it.each(['"', "'"])("handles long values delimited by %s", (quote) => {
    const value = "a".repeat(100_000);
    const tag = `<div style=${quote}--label:${value}${quote}>`;
    expect(mergeStyleIntoTag(tag, "opacity: 0.5")).toBe(
      `<div style=${quote}--label: ${value}; opacity: 0.5${quote}>`,
    );
    const opener = `style=${quote}a`;
    expect(mergeStyleIntoTag(`<div style=${quote}${opener.repeat(10_000)}>`, "opacity: 0.5")).toBe(
      `<div style=${quote}opacity: 0.5${quote}a${opener.repeat(9_999)}>`,
    );
    const unterminated = `<div style=${quote}${value}>`;
    expect(mergeStyleIntoTag(unterminated, "opacity: 0.5")).toBe(
      `<div style=${quote}${value} style="opacity: 0.5">`,
    );
  });
});
