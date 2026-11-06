import {
  buildDomEditStylePatchOperation,
  buildDomEditTextPatchOperation,
  buildTextFieldChildLocator,
  type DomEditTextField,
} from "../components/editor/domEditing";
import type { PatchOperation } from "../utils/sourcePatcher";

function hasSameKeysInSamePositions(
  originalFields: DomEditTextField[],
  nextFields: DomEditTextField[],
): boolean {
  return originalFields.every((field, index) => nextFields[index]?.key === field.key);
}

function inlineStyleValue(styles: Record<string, string>, property: string): string | null {
  return Object.prototype.hasOwnProperty.call(styles, property) ? styles[property] : null;
}

function inlineStyleProperties(
  originalStyles: Record<string, string>,
  nextStyles: Record<string, string>,
): string[] {
  return Array.from(new Set([...Object.keys(originalStyles), ...Object.keys(nextStyles)]));
}

// fallow-ignore-next-line complexity
export function buildTextFieldChildOperations(
  originalFields: DomEditTextField[],
  nextFields: DomEditTextField[],
): PatchOperation[] | null {
  if (originalFields.length !== nextFields.length) return null;
  if (!hasSameKeysInSamePositions(originalFields, nextFields)) return null;
  if (nextFields.some((field) => field.source === "text-node")) return null;
  if (nextFields.some((field) => field.source !== "child")) return null;
  if (originalFields.some((field) => field.source !== "child")) return null;

  const originalByKey = new Map(originalFields.map((field) => [field.key, field]));
  const operations: PatchOperation[] = [];

  for (const nextField of nextFields) {
    const originalField = originalByKey.get(nextField.key);
    const locator = buildTextFieldChildLocator(originalFields, nextField.key);
    if (!originalField || !locator) return null;

    if (nextField.value !== originalField.value) {
      operations.push(buildDomEditTextPatchOperation(nextField.value, locator));
    }

    for (const property of inlineStyleProperties(
      originalField.inlineStyles,
      nextField.inlineStyles,
    )) {
      const originalValue = inlineStyleValue(originalField.inlineStyles, property);
      const nextValue = inlineStyleValue(nextField.inlineStyles, property);
      if (nextValue !== originalValue) {
        operations.push(buildDomEditStylePatchOperation(property, nextValue, locator));
      }
    }
  }

  return operations;
}
