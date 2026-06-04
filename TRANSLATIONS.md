# Translation Guide

> **Quick start for contributors:** This guide helps you add a new language translation to Open Design in ~2 hours instead of ~8 hours. Follow the checklist, avoid common mistakes, and ship your PR with confidence.

For general contribution flow, see [CONTRIBUTING.md](CONTRIBUTING.md). The "Localization maintenance" section there documents the boundary between translated surfaces and agent-facing source material. This file covers **how** to add and maintain a locale across the surfaces contributors touch most often: UI chrome, root READMEs, core docs, and display metadata.

> **Why a separate file?** i18n contributors usually only need this surface — keeping locale workflow out of the main contribution guide isolates jargon (BCP-47, fallback chains, regional glossaries) from the broader code-workflow audience. CONTRIBUTING.md cross-links here for discovery.

---

## 🚀 Quick Start: Adding Your Language in 5 Steps

**New to translation contributions?** Start here. This checklist covers the 80% case.

### Step 1: Choose Your Language Code

Pick a standard code:
- Two-letter for most languages: `de`, `fr`, `it`, `sv`
- Regional variants when needed: `pt-BR`, `zh-CN`, `zh-TW`, `es-ES`
- Use hyphens, not underscores: `zh-CN` ✅ not `zh_CN` ❌

### Step 2: Translate the README

```bash
# Copy and translate
cp README.md README.it.md
# Edit README.it.md in your editor
```

**What to translate:**
- ✅ All text, headings, descriptions
- ✅ Alt text: `alt="Open Design banner"`
- ✅ Link text: `[Quickstart](QUICKSTART.md)` → `[Guida rapida](QUICKSTART.it.md)` (if that file exists; otherwise keep `QUICKSTART.md` target)

**What NOT to translate:**
- ❌ Code snippets, commands, file paths
- ❌ URLs, GitHub usernames, repo names
- ❌ Brand names: "Open Design", "Claude Code"
- ❌ Technical terms: CLI, API, BYOK, daemon

### Step 3: Update ALL Language Switchers (Critical!)

**This is the most commonly forgotten step.** You must update the language switcher in:
1. Your new `README.it.md` (bold your language)
2. **Every existing `README.*.md` file** (add your language as a link)

Find the line that looks like this (around line 30):

```html
<p align="center"><a href="README.md">English</a> · <a href="README.es.md">Español</a> · ... · <b>Italiano</b></p>
```

**Files to update:** `README.md`, `README.ar.md`, `README.de.md`, `README.es.md`, `README.fr.md`, `README.ja-JP.md`, `README.ko.md`, `README.pt-BR.md`, `README.ru.md`, `README.tr.md`, `README.uk.md`, `README.zh-CN.md`, `README.zh-TW.md`

### Step 4: Add UI Dictionary (Optional but Recommended)

Create `apps/web/src/i18n/locales/it.ts`:

```typescript
import type { Dict } from '../types';
import { en } from './en';

export const it: Dict = {
  ...en, // Fallback to English for missing keys
  // Translate these UI strings
  'common.create': 'Crea',
  'common.cancel': 'Annulla',
  'settings.language': 'Lingua',
  'entry.tabDesigns': 'Design',
  'entry.tabTemplates': 'Modelli',
  // ... see en.ts for full list
};
```

> **Note:** The `Dict` type enforces that all keys match those in `en.ts`. Invented keys like `'nav.home'` will fail TypeScript compilation.

Then register it in `apps/web/src/i18n/index.tsx` and `apps/web/src/i18n/types.ts` (see [detailed steps below](#adding-a-new-locale)).

**Don't forget to update test fixtures:** Add your locale code to `EXPECTED_LOCALES` in `apps/web/tests/i18n/locales.test.ts` and add a `LOCALE_LABEL` assertion (e.g., `expect(LOCALE_LABEL.it).toBe('Italiano');`). Run `pnpm --filter @open-design/web test` to verify.

### Step 5: Test and Submit

```bash
# Type check
pnpm typecheck

# Run i18n checks
pnpm i18n:check

# Visual check: open your README.it.md in GitHub preview
# Verify all links work, images load, language switcher displays correctly
```

**PR title:** `feat(i18n): add Italian translation`

**PR checklist:**
- [ ] README translated
- [ ] Language switcher updated in ALL existing READMEs
- [ ] UI dictionary added (if applicable)
- [ ] All links tested
- [ ] `pnpm i18n:check` passes

---

## 📋 Supported Languages

Open Design currently supports **19 languages** across different surfaces:

| Language             | Code    | README | UI Dict | Core Docs | Status |
| -------------------- | ------- | ------ | ------- | --------- | ------ |
| English              | `en`    | ✅     | ✅      | ✅        | source |
| العربية (Arabic)     | `ar`    | ✅     | ✅      | —         | active |
| Deutsch              | `de`    | ✅     | ✅      | ✅        | active |
| Español              | `es-ES` | ✅     | ✅      | —         | active |
| فارسی (Persian)      | `fa`    | —      | ✅      | —         | active |
| Français             | `fr`    | ✅     | ✅      | ✅        | active |
| Magyar (Hungarian)   | `hu`    | —      | ✅      | —         | active |
| Bahasa Indonesia     | `id`    | —      | ✅      | —         | active |
| Italiano             | `it`    | —      | ✅      | —         | active |
| 日本語 (Japanese)    | `ja`    | ✅     | ✅      | ✅        | active |
| 한국어 (Korean)      | `ko`    | ✅     | ✅      | ✅        | active |
| Polski (Polish)      | `pl`    | —      | ✅      | —         | active |
| Português (Brasil)   | `pt-BR` | ✅     | ✅      | ✅        | active |
| Русский (Russian)    | `ru`    | ✅     | ✅      | —         | active |
| ภาษาไทย (Thai)       | `th`    | —      | ✅      | —         | active |
| Türkçe (Turkish)     | `tr`    | ✅     | ✅      | —         | active |
| Українська           | `uk`    | ✅     | ✅      | —         | active |
| 简体中文             | `zh-CN` | ✅     | ✅      | ✅        | active |
| 繁體中文             | `zh-TW` | ✅     | ✅      | —         | active |

**Translation surfaces:**
- **README**: Root documentation (`README.{lang}.md`)
- **UI Dict**: Web interface strings (`apps/web/src/i18n/locales/{lang}.ts`)
- **Core Docs**: `QUICKSTART.{lang}.md`, `CONTRIBUTING.{lang}.md`

> **Note:** You can contribute any subset of these surfaces. Start with README (highest impact), then add UI dictionary and core docs when you have time.

### File Locations

- **UI dictionaries**: [`apps/web/src/i18n/locales/`](apps/web/src/i18n/locales/)
- **Root READMEs**: Beside [`README.md`](README.md) in project root
- **Core docs**: Beside [`QUICKSTART.md`](QUICKSTART.md) and [`CONTRIBUTING.md`](CONTRIBUTING.md)
- **Display metadata**: `apps/web/src/i18n/content*.ts` (optional, for gallery/examples)

The `LOCALES` array in [`apps/web/src/i18n/types.ts`](apps/web/src/i18n/types.ts) is the authoritative list for UI dictionaries. Root README language switchers cover every locale that has a root README; this set can differ from `LOCALES`.

---

## 📖 Detailed Guide

### Adding a new locale

**For UI dictionary + README translation:**

1. **Pick a BCP-47 code.** Use the regional form (`pt-BR`, `es-ES`, `zh-TW`) when the variant matters; the bare code (`fr`, `ru`, `it`) when it doesn't. `pt-BR` and a hypothetical `pt-PT` would coexist as separate locales — the same precedent applies to `en-US` / `en-GB` if a contributor wants to maintain both.

2. **Update [`apps/web/src/i18n/types.ts`](apps/web/src/i18n/types.ts):**
   - Extend the `Locale` union with your code
   - Append your code to the `LOCALES` array
   - Add a `LOCALE_LABEL[<code>]` entry — use the **native name** of the language (`Italiano`, `日本語`, not `it`, `ja`)

   ```typescript
   export type Locale = 'en' | 'de' | 'fr' | 'it' | /* ... */;
   
   export const LOCALES: Locale[] = ['en', 'de', 'fr', 'it', /* ... */];
   
   export const LOCALE_LABEL: Record<Locale, string> = {
     en: 'English',
     de: 'Deutsch',
     fr: 'Français',
     it: 'Italiano',
     // ...
   };
   ```

   **Then update test fixtures:** In [`apps/web/tests/i18n/locales.test.ts`](apps/web/tests/i18n/locales.test.ts), add your locale to the `EXPECTED_LOCALES` array and add a `LOCALE_LABEL` assertion:
   
   ```typescript
   const EXPECTED_LOCALES = ['en', 'id', 'de', /* ... */, 'it', /* ... */];
   
   // In the test body:
   expect(LOCALE_LABEL.it).toBe('Italiano');
   ```

   **If your locale is RTL (Arabic, Hebrew, Persian, Urdu, etc.):** also append your code to `RTL_LOCALES` in [`apps/web/src/i18n/index.tsx`](apps/web/src/i18n/index.tsx). This array controls the `dir="rtl"` attribute on `<html>` at runtime — without it the web UI renders LTR regardless of language. The current list is:

   ```typescript
   const RTL_LOCALES: Locale[] = ['ar', 'fa'];
   ```

3. **Create the dictionary** at `apps/web/src/i18n/locales/<code>.ts`:
   - Copy from `en.ts` and translate the values
   - Keys must match `en.ts` exactly
   - Missing keys fall back to English at runtime
   - Use `...en` spread for partial translations

   ```typescript
   import type { Dict } from '../types';
   import { en } from './en';

  export const it: Dict = {
    ...en, // Fallback for untranslated keys
    'common.create': 'Crea',
    'common.cancel': 'Annulla',
    'common.save': 'Salva',
    'settings.language': 'Lingua',
    'entry.tabDesigns': 'Design',
    'entry.tabTemplates': 'Modelli',
    // ... translate all keys from en.ts
  };
   ```

4. **Register your dictionary** in [`apps/web/src/i18n/index.tsx`](apps/web/src/i18n/index.tsx):

   ```typescript
   import { it } from './locales/it';
   // ...
   const DICTS: Record<Locale, Dict> = {
     en,
     de,
     fr,
     it, // Add your locale here
     // ...
   };
   ```

5. **Translate the root README:**
   - Copy `README.md` to `README.<code>.md`
   - Repository precedent may use a documentation-region code that differs from the UI dict code when that is the familiar docs filename, such as `README.ja-JP.md` with UI locale `ja`, or `README.es.md` with UI locale `es-ES`
   - Translate all prose, headings, alt text, and link text
   - Keep code snippets, URLs, and brand names in English
   - Update internal links: `[Quickstart](QUICKSTART.md)` → `[Guida rapida](QUICKSTART.it.md)` (if that file exists)

6. **Update the language switcher in EVERY root README** (line ~30 of each `README*.md`):
   - Match the order used in the English README
   - Include the same set everywhere
   - Bold the current language: `<b>Italiano</b>`
   - Link to other languages: `<a href="README.it.md">Italiano</a>`

   **Standard order:**
   ```html
   <p align="center"><a href="README.md">English</a> · <a href="README.es.md">Español</a> · <a href="README.pt-BR.md">Português (Brasil)</a> · <a href="README.de.md">Deutsch</a> · <a href="README.fr.md">Français</a> · <a href="README.zh-CN.md">简体中文</a> · <a href="README.zh-TW.md">繁體中文</a> · <a href="README.ko.md">한국어</a> · <a href="README.ja-JP.md">日本語</a> · <a href="README.ar.md">العربية</a> · <a href="README.ru.md">Русский</a> · <a href="README.uk.md">Українська</a> · <a href="README.tr.md">Türkçe</a> · <a href="README.it.md">Italiano</a></p>
   ```

7. **(Optional) Translate core docs:**
   - Copy `QUICKSTART.md` → `QUICKSTART.<code>.md`
   - Copy `CONTRIBUTING.md` → `CONTRIBUTING.<code>.md`
   - Follow existing examples: `QUICKSTART.fr.md`, `CONTRIBUTING.pt-BR.md`, `CONTRIBUTING.ja-JP.md`
   - Update links from the translated README to the translated core docs

8. **(Optional) Translate display metadata** in `apps/web/src/i18n/content*.ts`:
   - Keep this to display-only metadata for examples, gallery cards, and localized content chrome
   - Agent-executed prompts, skill instructions, design systems, and prompt bodies stay in their source language so prompt QA remains centralized

9. **Run checks:**
   ```bash
   pnpm typecheck  # Confirms locale union and DICTS map agree
   pnpm i18n:check  # Enforces UI locale registration and README switcher consistency
   pnpm --filter @open-design/web test  # Covers locale/content drift tests
   ```

### Translation Best Practices

**What to translate:**
- ✅ All prose text, headings, descriptions
- ✅ Alt text in images: `alt="Open Design banner"` → `alt="Banner di Open Design"`
- ✅ Badge labels where appropriate: `discord-join` → `discord-unisciti`
- ✅ Code comments in examples (if instructional)
- ✅ Link text: `[Quickstart](QUICKSTART.md)` → `[Guida rapida](QUICKSTART.it.md)` (if that file exists; otherwise keep `QUICKSTART.md` target)

**What NOT to translate:**
- ❌ Code snippets (commands, file paths, variable names)
- ❌ URLs and domain names
- ❌ GitHub usernames and repository names
- ❌ Brand names: "Open Design", "Claude Code", "Anthropic", "Vercel"
- ❌ Technical terms with no standard translation: CLI, API, SDK, BYOK, daemon, sidecar, monorepo, artifact, iframe
- ❌ Command output (keep terminal output in English as it appears in actual software)

**Terminology guidelines:**
- Use the English term with a brief explanation in parentheses on first use if no standard translation exists:
  ```
  Open Design è un'alternativa open-source (codice aperto) a Claude Design.
  ```
- For regional variants (zh-CN vs zh-TW, pt-BR vs pt-PT), choose the most widely understood variant for your target audience
- See [Regional terminology](#regional-terminology) section for specific glossaries

### Badge Translation

Some badges in the README can be localized by changing the badge URL:

```markdown
<!-- English -->
<a href="https://discord.gg/qhbcCH8Am4"><img alt="Discord" src="https://img.shields.io/badge/discord-join-5865F2?style=flat-square&logo=discord&logoColor=white" /></a>

<!-- Italian -->
<a href="https://discord.gg/qhbcCH8Am4"><img alt="Discord" src="https://img.shields.io/badge/discord-unisciti-5865F2?style=flat-square&logo=discord&logoColor=white" /></a>
```

**Translate these badge labels:**
- Download button: `download` → your language
- Quickstart badge: `quickstart` → your language  
- Discord: `join` → your language

**Keep these badges in English:**
- GitHub stats (stars, forks, issues, PRs, contributors, commits)
- Version numbers and release info
- License
- Technical counts (agents, skills, design systems)

---

## 🌍 Regional Terminology

### General Guidelines

Translations follow the conventions of the target region's tech writing community. Maintainers trust contributors to make idiomatic choices and will not gate-keep on style.

**Technical terms to keep in English:**
- Open Design, Claude Code, Claude Design
- Skills, Design Systems
- BYOK (Bring Your Own Key)
- CLI, API, SDK
- Daemon, sidecar
- Monorepo, workspace
- Artifact, iframe
- Git, GitHub, Vercel

**Terms to translate when standard exists:**
- "local-first" → your language's equivalent
- "open-source" → your language's equivalent
- "installation" → your language's equivalent
- "quickstart" → your language's equivalent
- "settings" → your language's equivalent

### French (`fr`) Glossary

French UI copy should read naturally for a technical product audience without
turning product/runtime terms into vague French approximations. Keep these
rules stable across `apps/web/src/i18n/locales/fr.ts`, French core docs, and
French display metadata.

#### Keep in English

Keep the exact English/token form for names, protocols, commands, environment
variables, code identifiers, package names, file extensions, and technical
runtime nouns that are clearer in English:

| English source | French usage |
| -------------- | ------------ |
| Open Design | Open Design |
| Claude Code, Codex, Cursor, Gemini, OpenCode | Claude Code, Codex, Cursor, Gemini, OpenCode |
| CLI, API, SDK, MCP, HTTP, REST, SSE, JSONL | CLI, API, SDK, MCP, HTTP, REST, SSE, JSONL |
| BYOK | BYOK |
| runtime | runtime |
| daemon | daemon |
| sidecar | sidecar |
| headless | headless |
| plugin | plugin |
| prompt | prompt |
| token | token |
| iframe | iframe |
| monorepo, workspace | monorepo, workspace |
| `od`, `pnpm`, `pnpm tools-dev` | `od`, `pnpm`, `pnpm tools-dev` |
| `OD_DATA_DIR`, `OD_WEB_PORT`, `{provider}` | `OD_DATA_DIR`, `OD_WEB_PORT`, `{provider}` |
| `.zip`, `.html`, `.md`, `.json` | `.zip`, `.html`, `.md`, `.json` |

Use French grammar around preserved terms:

- `le daemon local`, `un runtime`, `des plugins`, `les prompts`
- `l’API`, `un endpoint REST`, `un flux SSE`
- `la CLI locale`, `un serveur MCP`

#### Translate When Standard

Translate ordinary UI terms, workflow labels, and non-identifier product copy
when a natural French equivalent exists:

| English source | French |
| -------------- | ------ |
| Settings | Paramètres |
| Save | Enregistrer |
| Cancel | Annuler |
| Delete | Supprimer |
| Folder | Dossier |
| File | Fichier |
| Download | Télécharger |
| Upload | Téléverser |
| Search | Rechercher |
| Preview | Aperçu |
| Project | Projet |
| Conversation | Conversation |
| Dashboard | Tableau de bord |
| Schedule | Planification |
| Automation | Automatisation |
| Artifact | Artefact |
| Live artifact | Artefact dynamique |
| Design files | Fichiers de design |
| Slide deck | Présentation |
| Engineering handoff | Transmission aux ingénieurs |
| Shipped (product/software status) | Livré |

#### Context-Sensitive Choices

- `Skill` stays `Skill` when it names the Open Design/Claude skill format.
  Translate only generic prose such as "ability" or "capability" as
  `capacité`.
- `Design System` may stay `Design System` when referring to the product
  registry/object name. In explanatory prose, `système de design` is also
  acceptable when it improves readability.
- `runtime` stays `runtime` as a noun. Labels like "execution mode" can still
  use `mode d’exécution`.
- `source` can stay `source` for provenance labels, but translate ordinary
  "data source" as `source de données`.
- Do not translate command output or examples that users should see exactly in
  their terminal.

### zh-CN ↔ zh-TW Glossary

When converting between Simplified and Traditional Chinese, prefer Taiwan-specific phrasing in zh-TW rather than character-only conversion. This list grew out of [PR #194](https://github.com/nexu-io/open-design/pull/194) and is meant as a starting point, not a rulebook.

**Tooling:** [OpenCC](https://github.com/BYVoid/OpenCC) with `s2twp.json` handles most core terms automatically. The idiomatic table below is where human review pays off.

#### Core terms (automated by OpenCC)

| English      | zh-CN  | zh-TW   |
| ------------ | ------ | ------- |
| screen       | 屏幕   | 螢幕    |
| stack        | 栈     | 堆疊    |
| project      | 项目   | 專案    |
| software     | 软件   | 軟體    |
| video        | 视频   | 影片    |
| file         | 文件   | 檔案    |
| document     | 文档   | 文件    |
| message      | 信息   | 訊息    |
| network      | 网络   | 網路    |
| database     | 数据库 | 資料庫  |
| user         | 用户   | 使用者  |
| default      | 默认   | 預設    |
| real-time    | 实时   | 即時    |
| install      | 安装   | 安裝    |
| settings     | 设置   | 設定    |
| menu         | 菜单   | 選單    |
| compatible   | 兼容   | 相容    |
| bind         | 绑定   | 綁定    |
| desktop      | 桌面端 | 桌面版  |
| mobile       | 移动端 | 行動版  |

#### Idiomatic / domain-specific (requires human judgment)

These mappings needed human judgment in #194 — OpenCC won't catch them and they're the **most useful to record** because the next translator will hit the same choices:

| English / context        | zh-CN     | zh-TW     |
| ------------------------ | --------- | --------- |
| fallback / safety net    | 兜底      | 備援      |
| bundle / package up      | 捆绑      | 納入      |
| live, dynamic            | 活的      | 動態的    |
| plan (noun)              | 计划      | 計畫      |
| color palette            | 色板      | 色票      |
| spec doc                 | 规范文件  | 規格文件  |
| course-correction        | 介入纠偏  | 介入修正  |
| crash, screw up (slang)  | 翻车      | 出包      |
| go viral (slang)         | 出圈      | 爆紅      |

### Portuguese: pt-BR vs pt-PT

**Brazilian Portuguese (`pt-BR`)** differs significantly from European Portuguese:

| English    | pt-BR      | pt-PT (avoid) |
| ---------- | ---------- | ------------- |
| app        | aplicativo | aplicação     |
| screen     | tela       | ecrã          |
| download   | baixar     | descarregar   |
| mouse      | mouse      | rato          |
| to click   | clicar     | clicar        |

Use Brazilian Portuguese for `pt-BR` translations. If a contributor wants to add European Portuguese, use code `pt-PT`.

### Spanish: `es-ES` (Spain)

The shipped UI locale is **`es-ES`** with label `Español (España)`, so the dictionary and root README target European Spanish. The README filename `README.es.md` is a docs-precedent code that differs from the UI code (see the [adding a new locale](#adding-a-new-locale) step that documents this pattern); both surfaces describe the same Spain Spanish locale.

| English    | es-ES (use)  | Avoid (Latin American) |
| ---------- | ------------ | ---------------------- |
| computer   | ordenador    | computadora (LatAm)    |
| app        | aplicación   | app (anglicism)        |
| to download| descargar    | bajar (informal)       |
| file       | archivo      | fichero (dated Spain)  |
| mobile     | móvil        | celular (LatAm)        |

If a contributor wants neutral or Latin American Spanish, propose a separate locale (e.g. `es-419`) in a follow-up PR — do not drift `es-ES` toward a different regional variant, as the existing `Español (España)` label sets reader expectations.

### Arabic: RTL and Technical Terms

**Arabic (`ar`)** uses Modern Standard Arabic (MSA) understood across all Arabic-speaking regions:

- Use right-to-left (RTL) text direction — **Markdown handles this automatically for `README.*.md` files**
- The **web UI requires manual registration**: append your locale code to `RTL_LOCALES` in [`apps/web/src/i18n/index.tsx`](apps/web/src/i18n/index.tsx) (currently `['ar', 'fa']`), otherwise `<html dir="rtl">` is never set and the UI renders LTR
- Technical terms are often kept in English with Arabic explanation
- Numbers and dates can use Western Arabic numerals (0-9) for technical content
- Keep code blocks and URLs left-to-right

**Example:**
```markdown
Open Design هو البديل مفتوح المصدر لـ Claude Design
```

### Other Languages

Other CJK / RTL glossaries can extend this section as locales mature. Don't pre-emptively fill empty tables — add a row when a contributor hits a real terminology choice that future PRs will face.

---

## ✅ Testing Your Translation

Before submitting your PR, verify:

### 1. Visual Check

Open your translated README in GitHub's preview or a local Markdown viewer:
- ✅ Language switcher displays correctly
- ✅ All links work (no 404s)
- ✅ Images load
- ✅ Code blocks render properly
- ✅ Tables are aligned
- ✅ Badges display
- ✅ RTL text flows correctly (for Arabic, Persian, etc.)

### 2. Link Validation

Check all internal links point to existing files:

```bash
# Example: verify Italian links
grep -o 'README\.[a-z-]*\.md' README.it.md | sort -u
grep -o 'QUICKSTART\.[a-z-]*\.md' README.it.md | sort -u
grep -o 'CONTRIBUTING\.[a-z-]*\.md' README.it.md | sort -u
```

All linked files should exist in the repository. If a translated file doesn't exist yet, link to the English version.

### 3. Language Switcher Audit

Verify the language switcher in your new file:
- ✅ Lists all supported languages (13+)
- ✅ Current language is bolded: `<b>Italiano</b>`
- ✅ All other languages are links: `<a href="README.it.md">Italiano</a>`
- ✅ Links use correct file names (e.g., `README.ja-JP.md` not `README.ja.md`)
- ✅ Order matches the standard order

### 4. Consistency Check

Compare structure with English version:
- ✅ Same number of sections
- ✅ Same heading hierarchy (H1, H2, H3)
- ✅ Same code examples (untranslated)
- ✅ Same images and badges (with translated alt text)
- ✅ No missing or extra content

### 5. Run Automated Checks

```bash
# Type check (if you added UI dictionary)
pnpm typecheck

# i18n structural checks
pnpm i18n:check

# Web package tests (if you added UI dictionary)
pnpm --filter @open-design/web test
```

All checks must pass before submitting your PR.

---

## 📤 Submitting Your Translation

### PR Title Format

```
feat(i18n): add [Language] translation
```

**Examples:**
- `feat(i18n): add Italian translation`
- `feat(i18n): add Swedish translation`
- `feat(i18n): add Vietnamese translation`

### PR Description Template

```markdown
## Summary
Adds [Language] translation for Open Design documentation.

## Translation Scope
- [x] README.[lang].md
- [ ] QUICKSTART.[lang].md (optional)
- [ ] CONTRIBUTING.[lang].md (optional)
- [x] UI dictionary (`apps/web/src/i18n/locales/[lang].ts`)
- [x] Language switcher updated in all existing READMEs

## Files Modified
Updated language switcher in:
- [x] README.md
- [x] README.ar.md
- [x] README.de.md
- [x] README.es.md
- [x] README.fr.md
- [x] README.ja-JP.md
- [x] README.ko.md
- [x] README.pt-BR.md
- [x] README.ru.md
- [x] README.tr.md
- [x] README.uk.md
- [x] README.zh-CN.md
- [x] README.zh-TW.md

## Translation Notes
[Any regional choices, terminology decisions, or context for reviewers]

Example:
- Used neutral Spanish terminology to be understood across all regions
- Kept technical terms like "CLI", "API", "BYOK" in English as they're widely recognized
- Translated "open-source" as "código abierto" (standard term in Spanish tech community)

## Checklist
- [ ] All prose text translated
- [ ] Code snippets kept in English
- [ ] Internal links updated to point to translated files (or English if not available)
- [ ] Language switcher added to new files
- [ ] Language switcher updated in ALL existing README files
- [ ] Badges localized where appropriate
- [ ] Visual preview looks correct
- [ ] All links tested (no 404s)
- [ ] `pnpm typecheck` passes (if UI dictionary added)
- [ ] `pnpm i18n:check` passes
```

### Review Process

**Native-speaker review is strongly preferred but not blocking.** Maintainers may merge a locale PR with a `nit` label if no native speaker has reviewed within ~7 days and CI passes. Subsequent fixes are welcome as separate PRs.

> The 7-day window is a starting point, not a hard policy. Adjust based on your locale's contributor availability and the size of the change.

## 🔄 Maintaining Existing Translations

### When English Content Changes

Translations are **not automatically updated** when the English source changes. This is intentional — we prefer slightly outdated translations over machine-translated ones.

**If you notice outdated content:**
1. Check the English version's recent commits
2. Update the translated sections that changed
3. Submit a PR with title: `fix(i18n): update [Language] translation`

**You are NOT required to:**
- Monitor English changes continuously
- Update translations immediately
- Translate every minor edit

### Maintenance Workflow

When a PR changes English copy, check which surface changed and update the matching translated surfaces deliberately:

- **UI chrome:** Update `apps/web/src/i18n/locales/en.ts` first, then add translated values to active locale dictionaries when the PR owns that refresh. Partial dictionaries may inherit from English with `...en`.
- **Root README:** Keep root README language switchers in sync across all root `README*.md` files. Check badge counts, Quickstart links, supported agent lists, and release/download links against `README.md` during a refresh.
- **Core docs:** Keep translated `QUICKSTART.*.md` and `CONTRIBUTING.*.md` aligned with their English source when the locale owns those docs.
- **Display metadata:** Update `apps/web/src/i18n/content*.ts` alongside `content.ts` when that locale maintains display metadata.

### Automated Checks

**P0 check (hard-fail in CI):**
```bash
pnpm i18n:check
```

This enforces:
- UI locale registration
- Root README switcher consistency
- Root README links to translated core docs

These are structural issues that must be fixed before merge.

### Known Drift

Several translated READMEs currently lag behind English in:
- Badge counts
- Supported agent lists
- Quickstart/download links

These will be cleaned up in focused PRs. See [Backport policy](#backport-policy) below.

---

## 📋 Backport Policy

When the English README or UI dict gains new sections/keys, contributors are **not required** to backport. The English fallback covers missing keys at runtime. Locale maintainers (volunteers, often the original author) are encouraged to refresh in a follow-up PR.

**Keep refresh PRs focused: one locale per PR, no mixed feature work.**

### Drift Threshold

A locale is considered drifted when **either**:

- **≥20 untranslated UI keys** vs. `en.ts` (today this is checked manually with a key-diff; a CI warning is tracked as a follow-up — see [Open questions](#open-questions)), **or**
- **No refresh PR in 6+ months** while the English README or dict has changed

These are tripwires for moving a locale to **stale** status (below); they're not auto-rejection rules.

### Stale Locales

We don't delete locales. When a locale crosses a drift tripwire above:

1. Add a `⚠️ Stale (last refreshed YYYY-MM)` cell to its row in the [Supported Languages](#-supported-languages) table.
2. Drop a frontmatter comment at the top of the locale's `.ts` file:

   ```typescript
   // ⚠️ Stale: last refreshed 2025-09. See TRANSLATIONS.md.
   export const fr: Dict = { ... };
   ```

3. The locale keeps compiling and rendering — readers still get partially-translated UI, which is better than removing it.

A new contributor can pick it up by submitting a refresh PR; the markers come off when the drift threshold is back under control.

### Partial Translations

It's okay to translate only README initially. Add QUICKSTART and CONTRIBUTING later when you have time.

**Mark partial translations in your PR:**
```markdown
## Translation Status
- [x] README.it.md (complete)
- [ ] QUICKSTART.it.md (planned)
- [ ] CONTRIBUTING.it.md (planned)
```

---

## ❓ FAQ

### Q: Which file should I translate first?

**A:** Always start with `README.md`. It's the first thing users see and has the highest impact. Then add UI dictionary, then QUICKSTART, then CONTRIBUTING.

### Q: Do I need to translate code comments in examples?

**A:** Yes, if they're instructional. No, if they're part of actual code output.

```bash
# English
pnpm tools-dev  # Start the development server

# Italian
pnpm tools-dev  # Avvia il server di sviluppo
```

### Q: Should I translate command output?

**A:** No. Keep terminal output in English as it appears in the actual software.

```bash
# Keep this in English
$ pnpm tools-dev
Starting daemon on port 17456...
Web server running at http://localhost:17573
```

### Q: What if my language doesn't have a word for "open-source"?

**A:** Use the English term with a brief explanation in parentheses on first use:

```markdown
Open Design è un'alternativa open-source (codice aperto) a Claude Design.
```

After the first use, you can use just the English term.

### Q: How do I handle right-to-left (RTL) languages like Arabic?

**README:** Markdown and GitHub automatically handle RTL text direction — just write naturally in your language and keep code blocks / URLs left-to-right.

**UI locale:** The web app does not auto-detect. You must append your locale code to `RTL_LOCALES` in [`apps/web/src/i18n/index.tsx`](apps/web/src/i18n/index.tsx) (currently `['ar', 'fa']`). Without this, the `<html dir="rtl">` attribute is never set and the UI renders LTR regardless of language. See the [detailed steps](#adding-a-new-locale) under step 2.

```markdown
<!-- README: Arabic text flows RTL automatically -->
Open Design هو البديل مفتوح المصدر لـ Claude Design

<!-- Code blocks stay LTR -->
```bash
pnpm tools-dev
```
```

### Q: Can I use machine translation?

**A:** Machine translation as a starting point is fine, but you **must** review and edit it carefully. Native-quality translation is the goal. Reviewers will check for machine-translation artifacts like:
- Unnatural phrasing
- Incorrect technical terms
- Missing context
- Literal translations that don't make sense

### Q: What if I find an error in the English version?

**A:** Fix the English version first in a separate PR, then update translations. Don't propagate errors.

### Q: Should I translate the CHANGELOG?

**A:** No. CHANGELOG stays in English only. It's a technical document for maintainers.

### Q: How do I handle version numbers and dates?

**A:** Keep version numbers in English format (`v1.0.0`). Dates can be localized:
- English: `2026-05-12` or `May 12, 2026`
- Italian: `12 maggio 2026`
- Japanese: `2026年5月12日`
- Spanish: `12 de mayo de 2026`

### Q: What about the language switcher order?

**A:** Follow the standard order shown in [Step 3](#step-3-update-all-language-switchers-critical). New languages go at the end.

### Q: Can I add a language that's not on the list?

**A:** Yes! Follow this guide and submit a PR. We welcome all languages.

### Q: Who reviews translation PRs?

**A:** Ideally a native speaker or fluent reviewer. If no native reviewer is available, maintainers will check structure and merge based on community feedback after ~7 days.

### Q: What if I only want to translate the README, not the UI dictionary?

**A:** That's perfectly fine! README-only translations are valuable. You can add the UI dictionary later, or another contributor can add it.

### Q: How do I know if my translation is good enough?

**A:** Ask yourself:
- Would a native speaker understand this naturally?
- Does it sound like it was written in this language, not translated?
- Are technical terms used correctly?
- Would I be comfortable showing this to my colleagues?

If yes to all, it's good enough!

### Q: Can I update an existing translation that has errors?

**A:** Yes! Submit a PR with title `fix(i18n): improve [Language] translation` and explain what you fixed in the description.

---

## 🆘 Getting Help

- **Questions?** Open a [GitHub Discussion](https://github.com/nexu-io/open-design/discussions)
- **Found an issue?** Open a [GitHub Issue](https://github.com/nexu-io/open-design/issues)
- **Want to chat?** Join our [Discord](https://discord.gg/qhbcCH8Am4)
- **Need a review?** Tag `@nexu-io/maintainers` in your PR

---

## 🎯 Open Questions

Genuinely undecided — flagged so contributors know they're live design discussions:

- **Source-of-truth drift CI.** A `pnpm i18n:diff` script that compares each locale's keys to `en.ts` and warns (not fails) when a locale exceeds the 20-key drift threshold. Tracked as a follow-up after this doc lands.
- **README freshness signal.** A small badge or front-matter timestamp on each `README.<code>.md` could help readers gauge how current a translation is.
- **Native-speaker review window.** Whether `~7 days` is too short for smaller language communities — adjust if real data shows otherwise.

If you have an opinion on any of the above, open an issue or comment on [#195](https://github.com/nexu-io/open-design/issues/195).

---

## 🚧 Deferred Decisions

These items are **decided to defer** — the team has agreed not to act on them now, with rough triggers for revisiting:

- **Translation memory tooling** (Crowdin / Weblate / Lingui). Re-evaluate once the project hits ~12-15 active locales **or** when contributors start visibly duplicating effort across PRs.
- **README template-driven generation** (e.g. [NRG](https://github.com/nanolaba/readme-generator), custom `.src.md` build scripts, All Contributors-style tooling). Re-evaluate once the project hits ≥15 locales **or** README structural edits become more frequent than monthly. Discussion in [#195](https://github.com/nexu-io/open-design/issues/195): template-driven generation solves the "update line 27 in 10 README variants" brittleness, but forces a shared structure that today's locale variants intentionally diverge from (e.g. `README.zh-TW.md`'s "上手體驗" section, the pt-BR / pt-PT precedent for content-level — not just translation-level — differences). Worth revisiting once locale voice is more settled or the manual-update cost grows.

---

## 🙏 Credits

Thank you to all our translation contributors! 🌍

Every translation makes Open Design accessible to more developers worldwide.

**Current contributors:**
- See [Contributors](https://github.com/nexu-io/open-design/graphs/contributors) for the full list

---

**Ready to contribute?** Pick a language, follow the [Quick Start](#-quick-start-adding-your-language-in-5-steps), and submit your PR. We can't wait to see Open Design in your language! 🚀
