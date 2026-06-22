import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

// Dynamic imports of locales & content arrays
import { en } from '../apps/web/src/i18n/locales/en';
import { tr } from '../apps/web/src/i18n/locales/tr';
import { EN as solutionEn } from '../apps/landing-page/app/solution-pages-i18n/en';
import { TR as solutionTr } from '../apps/landing-page/app/solution-pages-i18n/tr';
import {
  TR_SKILL_COPY,
  TR_DESIGN_SYSTEM_SUMMARIES,
  TR_DESIGN_SYSTEM_CATEGORIES,
  TR_PROMPT_TEMPLATE_CATEGORIES,
  TR_PROMPT_TEMPLATE_TAGS,
  TR_PROMPT_TEMPLATE_COPY,
} from '../apps/web/src/i18n/content.tr';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

// Helper to sleep between requests to avoid rate-limiting
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const translationCache = new Map<string, string>();

// Free translation API using Google Translate single endpoint
async function translateText(text: string): Promise<string> {
  const trimmed = text.trim();
  if (!trimmed) return text;
  if (translationCache.has(trimmed)) {
    return translationCache.get(trimmed)!;
  }

  // Preserve placeholders (e.g. {count}, {{provider}}, {argument name="..."})
  const placeholders: string[] = [];
  const regex = /\{+[\s\S]+?\}+/g;
  const tokenized = trimmed.replace(regex, (match) => {
    placeholders.push(match);
    return `__PH_${placeholders.length - 1}__`;
  });

  try {
    await sleep(80); // Rate-limiting guard
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=tr&dt=t&q=${encodeURIComponent(tokenized)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP status ${res.status}`);
    const json = (await res.json()) as any;
    
    let translated = json[0].map((part: any) => part[0]).join('');

    // Restore placeholders
    for (let i = 0; i < placeholders.length; i++) {
      const ph = placeholders[i];
      translated = translated.replace(new RegExp(`__PH_${i}__`, 'gi'), ph);
    }
    
    translationCache.set(trimmed, translated);
    return translated;
  } catch (err) {
    console.error(`Error translating: "${trimmed}"`, err);
    return trimmed; // fallback to original English string on failure
  }
}

// Traverse directories recursively
async function globFiles(dir: string, ext: string): Promise<string[]> {
  const results: string[] = [];
  async function traverse(currentDir: string) {
    let entries;
    try {
      entries = await fs.readdir(currentDir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== 'node_modules' && entry.name !== '.git' && entry.name !== '.tmp') {
          await traverse(fullPath);
        }
      } else if (entry.isFile() && entry.name.endsWith(ext)) {
        results.push(fullPath);
      }
    }
  }
  await traverse(dir);
  return results;
}

// Simple YAML frontmatter parser for SKILL.md
function parseFrontmatter(content: string): { name?: string; description?: string } {
  const match = content.match(/^---\r?\n([\s\S]+?)\r?\n---/);
  if (!match) return {};
  const yaml = match[1];
  const result: any = {};
  
  // Custom simple line parser for YAML name & description
  const lines = yaml.split('\n');
  let currentKey: string | null = null;
  let currentVal: string[] = [];

  for (const line of lines) {
    const keyMatch = line.match(/^(\w+):\s*(.*)/);
    if (keyMatch) {
      if (currentKey) {
        result[currentKey] = currentVal.join('\n').trim();
      }
      currentKey = keyMatch[1];
      const rest = keyMatch[2];
      if (rest.startsWith('|')) {
        currentVal = [];
      } else {
        currentVal = [rest.replace(/^['"]|['"]$/g, '')];
      }
    } else if (currentKey && line.startsWith('  ')) {
      currentVal.push(line.substring(2));
    }
  }
  if (currentKey) {
    result[currentKey] = currentVal.join('\n').trim();
  }
  return result;
}

// Escape backslashes, single quotes, and newlines in output values
function escapeValue(v: string): string {
  return v
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n');
}

// Formatter to print object as pretty TS record string
function formatRecord(record: Record<string, string>): string {
  return Object.entries(record)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([k, v]) => `  '${k.replace(/'/g, "\\'")}': '${escapeValue(v)}',`)
    .join('\n');
}

// Translate flat object keys (locales en.ts -> tr.ts)
async function syncUiLocales() {
  console.log('Syncing UI locales (tr.ts)...');
  const trLocales: Record<string, string> = {};
  
  for (const key of Object.keys(en)) {
    const currentVal = (tr as Record<string, string>)[key];
    if (currentVal && currentVal.trim()) {
      trLocales[key] = currentVal;
    } else {
      console.log(`Translating missing UI key: "${key}" ("${en[key]}")`);
      trLocales[key] = await translateText(en[key]);
    }
  }

  // Generate sorted and normalized output
  const content = `import type { Dict } from '../types';

export const tr: Dict = {
${formatRecord(trLocales)}
};
`;
  await fs.writeFile(path.join(repoRoot, 'apps/web/src/i18n/locales/tr.ts'), content, 'utf8');
  console.log('UI locales (tr.ts) synced successfully.');
}

// Recursively traverse solution page templates
async function syncSolutionLocales() {
  console.log('Syncing solution pages (tr.ts)...');
  
  async function syncNested(enObj: any, trObj: any): Promise<any> {
    if (typeof enObj === 'string') {
      if (trObj && typeof trObj === 'string' && trObj.trim()) return trObj;
      return await translateText(enObj);
    }
    if (Array.isArray(enObj)) {
      const arr = [];
      for (let i = 0; i < enObj.length; i++) {
        arr.push(await syncNested(enObj[i], trObj ? trObj[i] : undefined));
      }
      return arr;
    }
    if (typeof enObj === 'object' && enObj !== null) {
      const obj: any = {};
      for (const k of Object.keys(enObj)) {
        obj[k] = await syncNested(enObj[k], trObj ? trObj[k] : undefined);
      }
      return obj;
    }
    return enObj;
  }

  const updatedSolutionTr = await syncNested(solutionEn, solutionTr);
  const content = `import type { SolutionLocaleCopy } from './types';

export const TR: SolutionLocaleCopy = ${JSON.stringify(updatedSolutionTr, null, 2)};
`;
  await fs.writeFile(path.join(repoRoot, 'apps/landing-page/app/solution-pages-i18n/tr.ts'), content, 'utf8');
  console.log('Solution pages (tr.ts) synced successfully.');
}

// Sync plugin-content.ts properties
async function syncPluginContent() {
  console.log('Syncing plugin input labels, placeholders, and values (plugin-content.ts)...');
  const filePath = path.join(repoRoot, 'apps/web/src/i18n/plugin-content.ts');
  let source = await fs.readFile(filePath, 'utf8');

  // Helper to parse existing records inside plugin-content.ts
  function parseLocalRecord(recordName: string): Record<string, string> {
    const match = source.match(new RegExp(`const\\s+${recordName}\\s*(?::\\s*Record<[^>]+>)?\\s*=\\s*\\{([\\s\\S]*?)\\};`));
    if (!match) return {};
    const entries: Record<string, string> = {};
    const entryRegex = /^\s*['"]([^'"]+)['"]\s*:\s*['"]([^'"]+)['"]\s*,?$/gm;
    let m;
    while ((m = entryRegex.exec(match[1])) !== null) {
      entries[m[1]] = m[2];
    }
    return entries;
  }

  const trInputLabels = parseLocalRecord('TR_INPUT_LABELS');
  const trDisplayValues = parseLocalRecord('TR_DISPLAY_VALUES');
  const trPlaceholders = parseLocalRecord('TR_PLACEHOLDERS');

  // Find all open-design.json files
  const pluginJsonFiles = await globFiles(repoRoot, 'open-design.json');
  
  for (const jsonPath of pluginJsonFiles) {
    try {
      const data = JSON.parse(await fs.readFile(jsonPath, 'utf8'));
      
      // Sync open-design.json inline title & description
      let modified = false;
      if (data.title_i18n) {
        if (!data.title_i18n.tr) {
          const enTitle = data.title_i18n.en || data.title;
          console.log(`Translating plugin title inline: "${enTitle}"`);
          data.title_i18n.tr = await translateText(enTitle);
          modified = true;
        }
      }
      if (data.description_i18n) {
        if (!data.description_i18n.tr) {
          const enDesc = data.description_i18n.en || data.description;
          console.log(`Translating plugin description inline: "${enDesc}"`);
          data.description_i18n.tr = await translateText(enDesc);
          modified = true;
        }
      }
      if (modified) {
        await fs.writeFile(jsonPath, JSON.stringify(data, null, 2) + '\n', 'utf8');
      }

      // Collect input fields
      const inputs = data.od?.inputs || [];
      for (const input of inputs) {
        if (input.label && !trInputLabels[input.label]) {
          console.log(`Translating plugin label: "${input.label}"`);
          trInputLabels[input.label] = await translateText(input.label);
        }
        if (input.placeholder && !trPlaceholders[input.placeholder]) {
          console.log(`Translating plugin placeholder: "${input.placeholder}"`);
          trPlaceholders[input.placeholder] = await translateText(input.placeholder);
        }
        if (input.options && Array.isArray(input.options)) {
          for (const opt of input.options) {
            if (typeof opt === 'string' && !trDisplayValues[opt]) {
              console.log(`Translating plugin option: "${opt}"`);
              trDisplayValues[opt] = await translateText(opt);
            }
          }
        }
        if (input.default && input.type === 'select') {
          if (!trDisplayValues[input.default]) {
            console.log(`Translating plugin select default: "${input.default}"`);
            trDisplayValues[input.default] = await translateText(input.default);
          }
        }
      }
    } catch (err) {
      console.error(`Failed parsing ${jsonPath}:`, err);
    }
  }

  // Update records in the source string
  function updateRecordBlock(recordName: string, recordObj: Record<string, string>) {
    const regex = new RegExp(`const\\s+${recordName}\\s*(?::\\s*Record<[^>]+>)?\\s*=\\s*\\{[\\s\\S]*?\\};`);
    const formatted = `const ${recordName}: Record<string, string> = {\n${formatRecord(recordObj)}\n};`;
    source = source.replace(regex, () => formatted);
  }

  updateRecordBlock('TR_INPUT_LABELS', trInputLabels);
  updateRecordBlock('TR_DISPLAY_VALUES', trDisplayValues);
  updateRecordBlock('TR_PLACEHOLDERS', trPlaceholders);

  await fs.writeFile(filePath, source, 'utf8');
  console.log('plugin-content.ts updated successfully.');
}

// Sync content.tr.ts tables
async function syncContentTables() {
  console.log('Syncing content tables (content.tr.ts)...');
  const skillCopy = { ...TR_SKILL_COPY } as Record<string, { description?: string; examplePrompt?: string }>;
  const dsSummaries = { ...TR_DESIGN_SYSTEM_SUMMARIES } as Record<string, string>;
  const dsCategories = { ...TR_DESIGN_SYSTEM_CATEGORIES } as Record<string, string>;
  const ptCategories = { ...TR_PROMPT_TEMPLATE_CATEGORIES } as Record<string, string>;
  const ptTags = { ...TR_PROMPT_TEMPLATE_TAGS } as Record<string, string>;
  const ptCopy = { ...TR_PROMPT_TEMPLATE_COPY } as Record<string, { summary?: string; title?: string }>;

  // 1. Scan Skills
  console.log('Scanning all skill files...');
  const skillMdFiles = await globFiles(repoRoot, 'SKILL.md');
  for (const skillPath of skillMdFiles) {
    try {
      const content = await fs.readFile(skillPath, 'utf8');
      const meta = parseFrontmatter(content);
      if (meta.name) {
        const id = meta.name;
        if (!skillCopy[id]) {
          skillCopy[id] = {};
        }
        if (meta.description && !skillCopy[id].description) {
          console.log(`Translating skill description for "${id}": "${meta.description}"`);
          skillCopy[id].description = await translateText(meta.description);
        }
        // Fallback or copy of description to examplePrompt if missing
        if (!skillCopy[id].examplePrompt) {
          // If the original has an examplePrompt defined elsewhere, translate it, otherwise translate the description
          console.log(`Generating example prompt for skill: "${id}"`);
          skillCopy[id].examplePrompt = skillCopy[id].description;
        }
      }
    } catch (err) {
      console.error(`Error parsing skill at ${skillPath}:`, err);
    }
  }

  // 2. Scan Design Systems
  console.log('Scanning design systems...');
  const dsDirs = await fs.readdir(path.join(repoRoot, 'design-systems'), { withFileTypes: true });
  for (const entry of dsDirs) {
    if (entry.isDirectory() && entry.name !== '_schema') {
      const manifestPath = path.join(repoRoot, 'design-systems', entry.name, 'manifest.json');
      try {
        const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
        const id = manifest.id || entry.name;
        if (manifest.description && !dsSummaries[id]) {
          console.log(`Translating design system summary for "${id}": "${manifest.description}"`);
          dsSummaries[id] = await translateText(manifest.description);
        }
        if (manifest.category && !dsCategories[manifest.category]) {
          console.log(`Translating design system category: "${manifest.category}"`);
          dsCategories[manifest.category] = await translateText(manifest.category);
        }
      } catch {
        // Ignored if manifest.json is missing or corrupted
      }
    }
  }

  // 3. Scan Prompt Templates
  console.log('Scanning prompt templates...');
  const ptJsonFiles = await globFiles(path.join(repoRoot, 'prompt-templates'), '.json');
  for (const ptPath of ptJsonFiles) {
    try {
      const template = JSON.parse(await fs.readFile(ptPath, 'utf8'));
      if (template.id) {
        const id = template.id;
        if (!ptCopy[id]) {
          ptCopy[id] = {};
        }
        if (template.title && !ptCopy[id].title) {
          console.log(`Translating template title for "${id}": "${template.title}"`);
          ptCopy[id].title = await translateText(template.title);
        }
        if (template.summary && !ptCopy[id].summary) {
          console.log(`Translating template summary for "${id}": "${template.summary}"`);
          ptCopy[id].summary = await translateText(template.summary);
        }
        if (template.category && !ptCategories[template.category]) {
          console.log(`Translating template category: "${template.category}"`);
          ptCategories[template.category] = await translateText(template.category);
        }
        if (template.tags && Array.isArray(template.tags)) {
          for (const tag of template.tags) {
            if (!ptTags[tag]) {
              console.log(`Translating template tag: "${tag}"`);
              ptTags[tag] = await translateText(tag);
            }
          }
        }
      }
    } catch (err) {
      console.error(`Error parsing template at ${ptPath}:`, err);
    }
  }

  // Formatter for nested objects (like SkillCopy & PromptTemplateCopy)
  function formatNestedRecord(record: Record<string, any>, itemFields: string[]): string {
    return Object.entries(record)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([k, v]) => {
        const inner = itemFields
          .map((f) => (v[f] ? `    ${f}: '${escapeValue(v[f])}',` : ''))
          .filter(Boolean)
          .join('\n');
        return `  '${k.replace(/'/g, "\\'")}': {\n${inner}\n  },`;
      })
      .join('\n');
  }

  const content = `import type { PromptTemplateSummary } from '../types';

export const TR_SKILL_COPY: Record<string, { description?: string; examplePrompt?: string }> = {
${formatNestedRecord(skillCopy, ['description', 'examplePrompt'])}
};

export const TR_DESIGN_SYSTEM_SUMMARIES: Record<string, string> = {
${formatRecord(dsSummaries)}
};

export const TR_DESIGN_SYSTEM_CATEGORIES: Record<string, string> = {
${formatRecord(dsCategories)}
};

export const TR_PROMPT_TEMPLATE_CATEGORIES: Record<string, string> = {
${formatRecord(ptCategories)}
};

export const TR_PROMPT_TEMPLATE_TAGS: Record<string, string> = {
${formatRecord(ptTags)}
};

export const TR_PROMPT_TEMPLATE_COPY: Record<string, Partial<Pick<PromptTemplateSummary, 'summary' | 'title'>>> = {
${formatNestedRecord(ptCopy, ['summary', 'title'])}
};
`;

  await fs.writeFile(path.join(repoRoot, 'apps/web/src/i18n/content.tr.ts'), content, 'utf8');
  console.log('content.tr.ts updated successfully.');
}

async function run() {
  try {
    await syncUiLocales();
    await syncSolutionLocales();
    await syncPluginContent();
    await syncContentTables();
    console.log('ALL LOCALIZATION FILES SYNCHRONIZED SUCCESSFULLY!');
  } catch (err) {
    console.error('Localization synchronization failed:', err);
    process.exitCode = 1;
  }
}

run();
