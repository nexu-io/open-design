/**
 * Copyright 2026 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import swc from '@swc/core';
import fs from 'node:fs';
import path from 'node:path';

const HEX_COLOR_REGEX = /#[0-9A-Fa-f]{3,8}\b/;
const RGBA_COLOR_REGEX = /^rgba?\(\s*\d/;
const HTML_ELEMENTS = ['div', 'span', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'img', 'button', 'a', 'input', 'ul', 'ol', 'li', 'section', 'header', 'footer', 'nav', 'main'];

async function validateComponent(filePath) {
  if (!filePath) {
    console.error("Usage: node validate.js <path-to-component>");
    process.exit(1);
  }
  try {
    const code = fs.readFileSync(filePath, 'utf-8');
    const filename = path.basename(filePath);
    const ast = await swc.parse(code, { syntax: "typescript", tsx: true });
    let hasInterface = false;
    let hasExportedInterface = false;
    let colorIssues = [];
    let htmlElements = [];

    console.log("Scanning AST...");

    const walk = (node, parent) => {
      if (!node || typeof node !== 'object') return;
      if (Array.isArray(node)) {
        for (const item of node) walk(item, parent);
        return;
      }
      if (typeof node.type !== 'string') return;

      if (node.type === 'TsInterfaceDeclaration' && node.id.value.endsWith('Props')) {
        hasInterface = true;
        if (parent?.type === 'ExportDeclaration') {
          hasExportedInterface = true;
        }
      }

      // Check for hardcoded hex values in strings
      if (node.type === 'StringLiteral' && HEX_COLOR_REGEX.test(node.value)) {
        colorIssues.push(node.value);
      }

      // Check for rgba() color strings
      if (node.type === 'StringLiteral' && RGBA_COLOR_REGEX.test(node.value)) {
        colorIssues.push(node.value);
      }

      // Check for HTML elements used as JSX tags
      if (node.type === 'JSXOpeningElement' && node.name?.type === 'Identifier') {
        const tagName = node.name.value;
        if (HTML_ELEMENTS.includes(tagName)) {
          htmlElements.push(tagName);
        }
      }

      for (const key in node) {
        if (key === 'span') continue;
        if (node[key] && typeof node[key] === 'object') walk(node[key], node);
      }
    };
    walk(ast, null);

    console.log(`--- Validation for: ${filename} ---`);

    let valid = true;

    if (hasExportedInterface) {
      console.log("PASS: Exported Props interface found.");
    } else if (hasInterface) {
      console.error("WARN: Props interface found but not exported. Add 'export' keyword.");
      valid = false;
    } else {
      console.error("FAIL: Missing Props interface (must end in 'Props' and be exported).");
      valid = false;
    }

    if (colorIssues.length === 0) {
      console.log("PASS: No hardcoded color values found.");
    } else {
      console.error(`FAIL: Found ${colorIssues.length} hardcoded colors. Use theme.ts instead.`);
      colorIssues.forEach(c => console.error(`   - ${c}`));
      valid = false;
    }

    if (htmlElements.length === 0) {
      console.log("PASS: No HTML elements found. Using React Native primitives.");
    } else {
      const unique = [...new Set(htmlElements)];
      console.error(`FAIL: Found HTML elements: ${unique.join(', ')}. Replace with React Native components.`);
      valid = false;
    }

    if (valid) {
      console.log("\nCOMPONENT VALID.");
      process.exit(0);
    } else {
      console.error("\nVALIDATION FAILED.");
      process.exit(1);
    }
  } catch (err) {
    console.error("ERROR:", err.message);
    process.exit(1);
  }
}

validateComponent(process.argv[2]);
