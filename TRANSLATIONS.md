# Translations

> **Status: living document.** Maintainers refine this as the project's i18n
> needs evolve. Contributions welcome.

For general contribution flow, see [CONTRIBUTING.md](CONTRIBUTING.md). The
"Localization maintenance" section there documents what gets translated
(UI chrome, core docs, display metadata) and what does **not** (skills,
design systems, prompt bodies). This file covers **how** to add and
maintain a locale.

> **Why a separate file?** i18n contributors usually only need this surface
> — keeping locale workflow out of the main contribution guide isolates
> jargon (BCP-47, fallback chains, regional glossaries) from the broader
> code-workflow audience. CONTRIBUTING.md cross-links here for discovery.

## Maintained locales

UI dictionary lives in [`apps/web/src/i18n/locales/`](apps/web/src/i18n/locales/).
README translations live at the repo root. The `LOCALES` array in
[`apps/web/src/i18n/types.ts`](apps/web/src/i18n/types.ts) is the
authoritative list for the **UI dict**; the language switcher in the
READMEs covers any locale that has a translated README, dict or no dict.

| Code    | Language             | UI dict                | README              | Status |
| ------- | -------------------- | ---------------------- | ------------------- | ------ |
| `en`    | English              | `en.ts` (source)       | `README.md`         | active |
| `ar`    | العربية              | `ar.ts`                | —                   | active |
| `de`    | Deutsch              | `de.ts`                | `README.de.md`      | active |
| `es-ES` | Español (España)     | `es-ES.ts`             | —                   | active |
| `fa`    | فارسی                | `fa.ts`                | —                   | active |
| `hu`    | Magyar               | `hu.ts`                | —                   | active |
| `ja`    | 日本語               | `ja.ts`                | `README.ja-JP.md`   | active |
| `ko`    | 한국어               | `ko.ts`                | `README.ko.md`      | active |
| `pl`    | Polski               | `pl.ts`                | —                   | active |
| `pt-BR` | Português (Brasil)   | `pt-BR.ts`             | —                   | active |
| `ru`    | Русский              | `ru.ts`                | `README.ru.md`      | active |
| `zh-CN` | 简体中文             | `zh-CN.ts`             | `README.zh-CN.md`   | active |
| `zh-TW` | 繁體中文             | `zh-TW.ts`             | `README.zh-TW.md`   | active |
| `fr`    | Français             | `fr.ts`                | `README.fr.md`      | active |
| `uk`    | Українська           | `uk.ts`                | `README.uk.md`      | active |

> A locale may ship a UI dict, a README, or both. The two surfaces are
> independent — adding one without the other is a normal contribution.
> The English locale is the source of truth; missing UI keys fall back
> to English at runtime.
> Locales may also add translated core docs or display-only metadata in
> `apps/web/src/i18n/content*.ts`; keep those companion surfaces aligned
> with the locale's active scope.

## Adding a new locale

1. **Pick a BCP-47 code.** Use the regional form (`pt-BR`, `es-ES`,
   `zh-TW`) when the variant matters; the bare code (`fr`, `ru`) when it
   doesn't. `pt-BR` and a hypothetical `pt-PT` would coexist as separate
   locales — the same precedent applies to `en-US` / `en-GB` if a
   contributor wants to maintain both.
2. **Update [`apps/web/src/i18n/types.ts`](apps/web/src/i18n/types.ts):**
   - extend the `Locale` union
   - append your code to `LOCALES`
   - add a `LOCALE_LABEL[<code>]` entry — use the **native name** of the
     language (`Deutsch`, `日本語`, not `de`, `ja`)
3. **Create the dictionary** at
   `apps/web/src/i18n/locales/<code>.ts` — copy from `en.ts` and
   translate the values. Keys must match `en.ts` exactly; missing keys
   fall back to English.
4. **Register** your dictionary in
   [`apps/web/src/i18n/index.tsx`](apps/web/src/i18n/index.tsx) — both
   the import and the map entry:

   ```ts
   import { fr } from './locales/fr';
   // ...
   const DICTS: Record<Locale, Dict> = {
     // ...existing entries
     fr,
   };
   ```

5. **(Optional) Translate the README** — copy `README.md` to
   `README.<code>.md`. Use OpenCC `s2twp.json` for zh-CN ↔ zh-TW; use
   your judgment elsewhere.
6. **Update the language switcher in every existing README**
   (line ~27 of each `README*.md`). Match the order used in the existing
   switcher line and append your new locale at the end. The set of
   switcher links is the union of UI-dict locales and README-only
   locales — it is **not** identical to `LOCALES`. The constraint is
   simply that every switcher across all READMEs must list the same
   set in the same order, otherwise readers hit dead ends when jumping
   between languages.
7. **Run `pnpm typecheck`** to confirm the union and `DICTS` map agree.

## Backport policy

When the English README or UI dict gains new sections/keys, contributors
are **not required** to backport. The English fallback covers missing
keys at runtime. Locale maintainers (volunteers, often the original
author) are encouraged to refresh in a follow-up PR.

**Keep refresh PRs focused: one locale per PR, no mixed feature work.**

### Drift threshold

A locale is considered drifted when **either**:

- **≥20 untranslated UI keys** vs. `en.ts` (today this is checked
  manually with a key-diff; a CI warning is tracked as a follow-up — see
  [Deferred decisions](#deferred-decisions)), **or**
- **No refresh PR in 6+ months** while the English README or dict has
  changed

These are tripwires for moving a locale to **stale** status (below);
they're not auto-rejection rules.

## Stale locales

We don't delete locales. When a locale crosses a drift tripwire above:

1. Add a `⚠️ Stale (last refreshed YYYY-MM)` cell to its row in the
   maintained-locales table.
2. Drop a frontmatter comment at the top of the locale's `.ts` file:

   ```ts
   // ⚠️ Stale: last refreshed 2025-09. See TRANSLATIONS.md.
   export const fr: Dict = { ... };
   ```

3. The locale keeps compiling and rendering — readers still get
   partially-translated UI, which is better than removing it.

A new contributor can pick it up by submitting a refresh PR; the
markers come off when the drift threshold is back under control.

## Regional terminology

Translations follow the conventions of the target region's tech writing
community. Maintainers trust contributors to make idiomatic choices and
will not gate-keep on style.

### zh-CN ↔ zh-TW glossary

When converting between Simplified and Traditional Chinese, prefer
Taiwan-specific phrasing in zh-TW rather than character-only conversion.
This list grew out of [PR #194](https://github.com/nexu-io/open-design/pull/194)
and is meant as a starting point, not a rulebook.

#### Core terms

Easy mappings — most appear in OpenCC's `s2twp.json` and require no
human judgment:

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

#### Idiomatic / domain-specific

Mappings that needed human judgment in #194 — OpenCC won't catch them
and they're the **most useful to record** because the next translator
will hit the same choices:

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

**Tooling:** [OpenCC](https://github.com/BYVoid/OpenCC) with `s2twp.json`
handles roughly the Core terms automatically. The Idiomatic table is
where the human review pays off — start there when adapting an existing
zh-CN translation.

Other CJK / RTL glossaries can extend this section as locales mature.
Don't pre-emptively fill empty tables — add a row when a contributor
hits a real terminology choice that future PRs will face.

## Native-speaker review

**Strongly preferred but not blocking.** Maintainers may merge a locale
PR with a `nit` label if no native speaker has reviewed within ~7 days
and CI passes. Subsequent fixes are welcome as separate PRs.

> The 7-day window is a starting point, not a hard policy. Adjust based
> on your locale's contributor availability and the size of the change.

## Deferred decisions

These items are **decided to defer** — the team has agreed not to act
on them now, with rough triggers for revisiting:

- **Translation memory tooling** (Crowdin / Weblate / Lingui). Re-evaluate
  once the project hits ~12-15 active locales **or** when contributors
  start visibly duplicating effort across PRs.

## Open questions

Genuinely undecided — flagged so contributors know they're live design
discussions:

- **Source-of-truth drift CI.** A `pnpm i18n:diff` script that compares
  each locale's keys to `en.ts` and warns (not fails) when a locale
  exceeds the 20-key drift threshold. Tracked as a follow-up after this
  doc lands.
- **README freshness signal.** A small badge or front-matter timestamp
  on each `README.<code>.md` could help readers gauge how current a
  translation is.
- **Native-speaker review window.** Whether `~7 days` is too short for
  smaller language communities — adjust if real data shows otherwise.

If you have an opinion on any of the above, open an issue or comment on
[#195](https://github.com/nexu-io/open-design/issues/195).
