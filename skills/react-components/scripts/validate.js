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
    let tailwindIssues = [];

    console.log("🔍 Scanning AST...");

    const walk = (node) => {
      if (!node || typeof node !== 'object') return;
      if (Array.isArray(node)) {
        for (const item of node) walk(item);
        return;
      }
      if (typeof node.type !== 'string') return;
      if (node.type === 'TsInterfaceDeclaration' && node.id.value.endsWith('Props')) hasInterface = true;
      if (node.type === 'JSXAttribute' && (node.name?.value === 'className' || node.name?.name === 'className')) {
        if (node.value?.value && HEX_COLOR_REGEX.test(node.value.value)) tailwindIssues.push(node.value.value);
      }
      for (const key in node) {
        if (key === 'span') continue;
        if (node[key] && typeof node[key] === 'object') walk(node[key]);
      }
    };
    walk(ast);

    console.log(`--- Validation for: ${filename} ---`);
    if (hasInterface) {
      console.log("✅ Props declaration found.");
    } else {
      console.error("❌ MISSING: Props interface (must end in 'Props').");
    }

    if (tailwindIssues.length === 0) {
      console.log("✅ No hardcoded hex values found.");
    } else {
      console.error(`❌ STYLE: Found ${tailwindIssues.length} hardcoded hex codes.`);
      tailwindIssues.forEach(hex => console.error(`   - ${hex}`));
    }

    if (hasInterface && tailwindIssues.length === 0) {
      console.log("\n✨ COMPONENT VALID.");
      process.exit(0);
    } else {
      console.error("\n🚫 VALIDATION FAILED.");
      process.exit(1);
    }
  } catch (err) {
    console.error("❌ ERROR:", err.message);
    process.exit(1);
  }
}

validateComponent(process.argv[2]);
