export const cssWideAndSpecialColorKeywords = new Set([
  "transparent",
  "currentcolor",
  "inherit",
  "initial",
  "unset",
  "revert",
]);

export const realNamedColors = [
  "aliceblue",
  "antiquewhite",
  "aqua",
  "aquamarine",
  "azure",
  "beige",
  "bisque",
  "black",
  "blanchedalmond",
  "blue",
  "blueviolet",
  "brown",
  "burlywood",
  "cadetblue",
  "chartreuse",
  "chocolate",
  "coral",
  "cornflowerblue",
  "cornsilk",
  "crimson",
  "cyan",
  "darkblue",
  "darkcyan",
  "darkgoldenrod",
  "darkgray",
  "darkgreen",
  "darkgrey",
  "darkkhaki",
  "darkmagenta",
  "darkolivegreen",
  "darkorange",
  "darkorchid",
  "darkred",
  "darksalmon",
  "darkseagreen",
  "darkslateblue",
  "darkslategray",
  "darkslategrey",
  "darkturquoise",
  "darkviolet",
  "deeppink",
  "deepskyblue",
  "dimgray",
  "dimgrey",
  "dodgerblue",
  "firebrick",
  "floralwhite",
  "forestgreen",
  "fuchsia",
  "gainsboro",
  "ghostwhite",
  "gold",
  "goldenrod",
  "gray",
  "green",
  "greenyellow",
  "grey",
  "honeydew",
  "hotpink",
  "indianred",
  "indigo",
  "ivory",
  "khaki",
  "lavender",
  "lavenderblush",
  "lawngreen",
  "lemonchiffon",
  "lightblue",
  "lightcoral",
  "lightcyan",
  "lightgoldenrodyellow",
  "lightgray",
  "lightgreen",
  "lightgrey",
  "lightpink",
  "lightsalmon",
  "lightseagreen",
  "lightskyblue",
  "lightslategray",
  "lightslategrey",
  "lightsteelblue",
  "lightyellow",
  "lime",
  "limegreen",
  "linen",
  "magenta",
  "maroon",
  "mediumaquamarine",
  "mediumblue",
  "mediumorchid",
  "mediumpurple",
  "mediumseagreen",
  "mediumslateblue",
  "mediumspringgreen",
  "mediumturquoise",
  "mediumvioletred",
  "midnightblue",
  "mintcream",
  "mistyrose",
  "moccasin",
  "navajowhite",
  "navy",
  "oldlace",
  "olive",
  "olivedrab",
  "orange",
  "orangered",
  "orchid",
  "palegoldenrod",
  "palegreen",
  "paleturquoise",
  "palevioletred",
  "papayawhip",
  "peachpuff",
  "peru",
  "pink",
  "plum",
  "powderblue",
  "purple",
  "rebeccapurple",
  "red",
  "rosybrown",
  "royalblue",
  "saddlebrown",
  "salmon",
  "sandybrown",
  "seagreen",
  "seashell",
  "sienna",
  "silver",
  "skyblue",
  "slateblue",
  "slategray",
  "slategrey",
  "snow",
  "springgreen",
  "steelblue",
  "tan",
  "teal",
  "thistle",
  "tomato",
  "turquoise",
  "violet",
  "wheat",
  "white",
  "whitesmoke",
  "yellow",
  "yellowgreen",
];

const cssDeclarationPattern = /(?:^|[;{])\s*[-_a-zA-Z][-_a-zA-Z0-9]*\s*:\s*(?<value>[^;{}]+)/g;
const cssNamedColors = new Set(realNamedColors);

export type CssNamedColorMatch = {
  index: number;
  value: string;
};

const cssHexColorPattern = /^#[0-9a-fA-F]{3,8}\b/;

export function collectCssNamedColorMatches(source: string): CssNamedColorMatch[] {
  return collectCssHardcodedColorMatches(source).filter((match) => cssNamedColors.has(match.value.toLowerCase()));
}

export function collectCssHardcodedColorMatches(source: string): CssNamedColorMatch[] {
  const matches: CssNamedColorMatch[] = [];
  const scannableSource = maskCssCommentsAndStrings(source);

  for (const declaration of scannableSource.matchAll(cssDeclarationPattern)) {
    const declarationValue = declaration.groups?.value;
    if (declarationValue === undefined) continue;

    const valueOffset = (declaration.index ?? 0) + declaration[0].lastIndexOf(declarationValue);
    matches.push(...collectCssHardcodedColorMatchesFromDeclarationValue(declarationValue, valueOffset));
  }

  return matches;
}

function maskCssCommentsAndStrings(source: string): string {
  const characters = source.split("");
  let index = 0;

  while (index < characters.length) {
    const current = characters[index];
    const next = characters[index + 1];

    if (current === "/" && next === "*") {
      const endIndex = source.indexOf("*/", index + 2);
      const exclusiveEnd = endIndex === -1 ? characters.length : endIndex + 2;
      maskRange(characters, index, exclusiveEnd);
      index = exclusiveEnd;
      continue;
    }

    if (current === '"' || current === "'") {
      const exclusiveEnd = skipCssString(source, index, current);
      maskRange(characters, index, exclusiveEnd);
      index = exclusiveEnd;
      continue;
    }

    index += 1;
  }

  return characters.join("");
}

function maskRange(characters: string[], startIndex: number, exclusiveEnd: number): void {
  for (let index = startIndex; index < exclusiveEnd; index += 1) {
    if (characters[index] !== "\n") characters[index] = " ";
  }
}

function collectCssHardcodedColorMatchesFromDeclarationValue(
  declarationValue: string,
  sourceOffset: number,
): CssNamedColorMatch[] {
  const matches: CssNamedColorMatch[] = [];
  let index = 0;

  while (index < declarationValue.length) {
    const current = declarationValue[index];
    const next = declarationValue[index + 1];

    if (current === "/" && next === "*") {
      const commentEnd = declarationValue.indexOf("*/", index + 2);
      index = commentEnd === -1 ? declarationValue.length : commentEnd + 2;
      continue;
    }

    if (current === '"' || current === "'") {
      index = skipCssString(declarationValue, index, current);
      continue;
    }

    const hexColor = declarationValue.slice(index).match(cssHexColorPattern)?.[0];
    if (hexColor !== undefined) {
      matches.push({ index: sourceOffset + index, value: hexColor });
      index += hexColor.length;
      continue;
    }

    const functionName = readCssIdentifier(declarationValue, index);
    if (functionName !== undefined && functionName.value.toLowerCase() === "url") {
      const functionStart = skipCssWhitespace(declarationValue, functionName.endIndex);
      if (declarationValue[functionStart] === "(") {
        index = skipCssFunction(declarationValue, functionStart);
        continue;
      }
    }

    if (functionName !== undefined && functionName.value.toLowerCase() === "var") {
      const functionStart = skipCssWhitespace(declarationValue, functionName.endIndex);
      if (declarationValue[functionStart] === "(") {
        const functionEnd = skipCssFunction(declarationValue, functionStart);
        const fallbackStart = cssVarFallbackStartIndex(declarationValue, functionStart, functionEnd);
        if (fallbackStart !== undefined) {
          matches.push(
            ...collectCssHardcodedColorMatchesFromDeclarationValue(
              declarationValue.slice(fallbackStart, functionEnd - 1),
              sourceOffset + fallbackStart,
            ),
          );
        }
        index = functionEnd;
        continue;
      }
    }

    if (functionName !== undefined && ["rgb", "rgba", "hsl", "hsla"].includes(functionName.value.toLowerCase())) {
      const functionStart = skipCssWhitespace(declarationValue, functionName.endIndex);
      if (declarationValue[functionStart] === "(") {
        const functionEnd = skipCssFunction(declarationValue, functionStart);
        matches.push({ index: sourceOffset + index, value: declarationValue.slice(index, functionEnd) });
        index = functionEnd;
        continue;
      }
    }

    const identifier = readCssIdentifier(declarationValue, index);
    if (identifier === undefined) {
      index += 1;
      continue;
    }

    const normalizedValue = identifier.value.toLowerCase();
    if (cssNamedColors.has(normalizedValue) && !cssWideAndSpecialColorKeywords.has(normalizedValue)) {
      matches.push({ index: sourceOffset + index, value: identifier.value });
    }

    index = identifier.endIndex;
  }

  return matches;
}

function readCssIdentifier(source: string, startIndex: number): { value: string; endIndex: number } | undefined {
  const start = source[startIndex];
  if (start === undefined || !/[A-Za-z_]/.test(start)) return undefined;

  let endIndex = startIndex + 1;
  while (endIndex < source.length && /[-_A-Za-z0-9]/.test(source[endIndex] ?? "")) {
    endIndex += 1;
  }

  return { value: source.slice(startIndex, endIndex), endIndex };
}

function skipCssString(source: string, startIndex: number, quote: string): number {
  let index = startIndex + 1;
  while (index < source.length) {
    const current = source[index];
    if (current === "\\") {
      index += 2;
      continue;
    }

    if (current === quote) return index + 1;
    index += 1;
  }

  return source.length;
}

function skipCssWhitespace(source: string, startIndex: number): number {
  let index = startIndex;
  while (index < source.length && /\s/.test(source[index] ?? "")) index += 1;
  return index;
}

function skipCssFunction(source: string, openParenIndex: number): number {
  let depth = 1;
  let index = openParenIndex + 1;

  while (index < source.length) {
    const current = source[index];
    const next = source[index + 1];

    if (current === "/" && next === "*") {
      const commentEnd = source.indexOf("*/", index + 2);
      index = commentEnd === -1 ? source.length : commentEnd + 2;
      continue;
    }

    if (current === '"' || current === "'") {
      index = skipCssString(source, index, current);
      continue;
    }

    if (current === "(") depth += 1;
    if (current === ")") {
      depth -= 1;
      if (depth === 0) return index + 1;
    }

    index += 1;
  }

  return source.length;
}

function cssVarFallbackStartIndex(source: string, openParenIndex: number, functionEndIndex: number): number | undefined {
  let depth = 0;
  let index = openParenIndex + 1;

  while (index < functionEndIndex - 1) {
    const current = source[index];
    const next = source[index + 1];

    if (current === "/" && next === "*") {
      const commentEnd = source.indexOf("*/", index + 2);
      index = commentEnd === -1 ? functionEndIndex - 1 : Math.min(commentEnd + 2, functionEndIndex - 1);
      continue;
    }

    if (current === '"' || current === "'") {
      index = skipCssString(source, index, current);
      continue;
    }

    if (current === "(") depth += 1;
    if (current === ")") depth -= 1;
    if (current === "," && depth === 0) return index + 1;

    index += 1;
  }

  return undefined;
}
