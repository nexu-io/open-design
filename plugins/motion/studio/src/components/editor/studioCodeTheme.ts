import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import { tags as t } from "@lezer/highlight";

// One Dark's layout on Studio's tokens: every colour is a theme.css variable, so the editor
// follows the light or dark theme the page paints with no editor reconfiguration.
const editorTheme = EditorView.theme({
  "&": { height: "100%", color: "var(--color-text-0)", backgroundColor: "var(--color-surface)" },
  ".cm-scroller": { overflow: "auto" },
  ".cm-content": { caretColor: "var(--color-text-0)" },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--color-text-0)" },
  "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection":
    { backgroundColor: "var(--color-on)" },
  ".cm-activeLine": { backgroundColor: "var(--color-hover)" },
  ".cm-selectionMatch": {
    backgroundColor: "transparent",
    outline: "1px solid var(--color-text-muted)",
  },
  ".cm-searchMatch": {
    backgroundColor: "transparent",
    outline: "1px solid var(--color-text-muted)",
  },
  ".cm-searchMatch.cm-searchMatch-selected": {
    backgroundColor: "transparent",
    outline: "2px solid var(--color-accent-ink)",
  },
  "&.cm-focused .cm-matchingBracket, &.cm-focused .cm-nonmatchingBracket": {
    backgroundColor: "var(--color-on)",
  },
  ".cm-gutters": {
    backgroundColor: "var(--color-surface)",
    color: "var(--color-text-muted)",
    border: "none",
  },
  ".cm-activeLineGutter": { backgroundColor: "var(--color-hover)", color: "var(--color-text-2)" },
  ".cm-foldPlaceholder": {
    backgroundColor: "transparent",
    border: "none",
    color: "var(--color-text-2)",
  },
  ".cm-panels": { backgroundColor: "var(--color-raised)", color: "var(--color-text-0)" },
  ".cm-panels.cm-panels-top": { borderBottom: "1px solid var(--color-border)" },
  ".cm-panels.cm-panels-bottom": { borderTop: "1px solid var(--color-border)" },
  ".cm-textfield": {
    backgroundColor: "var(--color-input)",
    color: "var(--color-text-0)",
    border: "1px solid var(--color-border-input)",
  },
  ".cm-button": {
    backgroundImage: "none",
    backgroundColor: "var(--color-hover)",
    color: "var(--color-text-0)",
    border: "1px solid var(--color-border)",
  },
  "&.cm-editor .cm-button:active": {
    backgroundImage: "none",
    backgroundColor: "var(--color-press)",
  },
  ".cm-specialChar": { color: "var(--color-danger-ink)" },
});

const highlightStyle = HighlightStyle.define([
  { tag: t.keyword, color: "var(--color-code-keyword)" },
  {
    tag: [t.name, t.deleted, t.character, t.propertyName, t.macroName],
    color: "var(--color-code-name)",
  },
  { tag: [t.function(t.variableName), t.labelName], color: "var(--color-code-function)" },
  { tag: [t.color, t.constant(t.name), t.standard(t.name)], color: "var(--color-code-constant)" },
  { tag: [t.definition(t.name), t.separator], color: "var(--color-text-0)" },
  {
    tag: [
      t.typeName,
      t.className,
      t.number,
      t.changed,
      t.annotation,
      t.modifier,
      t.self,
      t.namespace,
    ],
    color: "var(--color-code-type)",
  },
  {
    tag: [t.operator, t.operatorKeyword, t.url, t.escape, t.regexp, t.special(t.string)],
    color: "var(--color-code-operator)",
  },
  { tag: [t.meta, t.comment], color: "var(--color-code-comment)" },
  { tag: t.strong, fontWeight: "bold" },
  { tag: t.emphasis, fontStyle: "italic" },
  { tag: t.strikethrough, textDecoration: "line-through" },
  { tag: t.link, color: "var(--color-code-comment)", textDecoration: "underline" },
  { tag: t.heading, fontWeight: "bold", color: "var(--color-code-name)" },
  { tag: [t.atom, t.bool, t.special(t.variableName)], color: "var(--color-code-constant)" },
  { tag: [t.processingInstruction, t.string, t.inserted], color: "var(--color-code-string)" },
  { tag: t.invalid, color: "var(--color-danger-ink)" },
]);

export const studioCodeTheme = [editorTheme, syntaxHighlighting(highlightStyle)];
