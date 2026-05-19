# Visual Text Audit — Capitalization, Casing, Punctuation, and Formatting

**Scope:** `apps/web/src/i18n/locales/en.ts` (primary), visible literal strings in
`apps/web/src/components/*.tsx` (secondary).

**Method:** Static inspection of every visible string value in the English locale
dictionary plus targeted grep passes over component literals that bypass the i18n dict.
No fixes are included in this PR — each surface-area batch is listed in "Fix batches"
at the end.

---

## Settings

### Section heading inconsistency — "Design Systems" vs "Design systems"

| Key | Current | Recommended | Why |
|-----|---------|-------------|-----|
| `settings.designSystems` | `Design Systems` | `Design systems` | Every other two-word nav/tab label uses sentence case: "Design systems", "Image templates", "Video templates". Only this key is Title Cased. |
| `settings.libraryDesignSystems` | `Design Systems` | `Design systems` | Same as above — paired sibling `settings.librarySkills` is already `Skills` (single word). |

### "OpenDesign" missing space

| Key | Current | Recommended | Why |
|-----|---------|-------------|-----|
| `settings.customInstructionsHint` | `Fixed instructions OpenDesign should follow…` | `Fixed instructions Open Design should follow…` | Product name is two words ("Open Design"). Every other occurrence in the file is spelled correctly. |

### "Rescan" vs "Re-scan" inconsistency

| Key | Current | Recommended | Why |
|-----|---------|-------------|-----|
| `settings.rescan` | `↻ Rescan` | `↻ Rescan` | *(keep)* — the button label form. |
| `settings.rescanTitle` | `Re-scan PATH` | `Rescan PATH` | Tooltip text should match the button label. Two different spellings for the same action. |
| `agentPicker.rescan` | `Re-scan local PATH for agents` | `Rescan local PATH for agents` | Same inconsistency in the agent-picker tooltip. |

### "model id" not capitalised as acronym

| Key | Current | Recommended | Why |
|-----|---------|-------------|-----|
| `settings.modelCustomLabel` | `Custom model id` | `Custom model ID` | "ID" is a standard abbreviation; every other occurrence of "ID" in the file is uppercased (e.g., `fileViewer.cloudflareAccountId` label "Account ID", `settings.privacyInstallationId` label "Anonymous ID"). |
| `settings.testInvalidModelId` | `Model id '{model}' is invalid…` | `Model ID '{model}' is invalid…` | Same rule. |
| `settings.modelPickerHint` | `Custom… lets you type any model id.` | `Custom… lets you type any model ID.` | Same rule. |

### "Href" not capitalised as tech term

| Key | Current | Recommended | Why |
|-----|---------|-------------|-----|
| `manualEdit.href` | `Href` | `URL` | "Href" is an HTML attribute name, not a user-facing term. Adjacent field labels use descriptive nouns: "Image URL", "Alt text", "Text color". "URL" matches the pattern. If the intent is specifically the `href` attribute, "Link URL" is clearer. |

### "Html" should be "HTML"

| Key | Current | Recommended | Why |
|-----|---------|-------------|-----|
| `manualEdit.tabHtml` | `Html` | `HTML` | The apply-button counterpart `manualEdit.applyHtml` is already `Apply HTML`. Tab and action must match. All other HTML references in the file use all-caps. |

### Apply-button label internal inconsistency

| Key | Current | Recommended | Why |
|-----|---------|-------------|-----|
| `manualEdit.applyContent` | `Apply Content` | `Apply content` | Sentence case: the object ("content") is a common noun, not a proper noun. The parallel keys "Apply style" and "Apply attributes" should also be evaluated — currently all five apply buttons are Title Cased, which is inconsistent with the sentence-case tab labels ("Content", "Style", "Attributes") they correspond to. If buttons use Title Case, that is a deliberate choice; document it in the style rules. |
| `manualEdit.applyStyle` | `Apply Style` | `Apply style` | Same as above. |
| `manualEdit.applyAttributes` | `Apply Attributes` | `Apply attributes` | Same. |
| `manualEdit.applySource` | `Apply Source` | `Apply source` | Same. |

> Note: `manualEdit.applyHtml` reads `Apply HTML` — "HTML" stays uppercased regardless of sentence-case choice.

### Hint text — missing trailing period

The dominant convention for Settings hint/body strings is a trailing period.
The following lack one:

| Key | Current text (truncated) | Fix |
|-----|--------------------------|-----|
| `settings.privacyHint` | `What data is shared with the Open Design team` | Add period. |
| `settings.aboutHint` | `Version and runtime details` | Add period. |
| `settings.notificationsHint` | `Sound and desktop notification on task completion` | Add period. |
| `settings.skillsHint` | `Functional skills the agent can invoke mid-task` | Add period. |
| `settings.designSystemsHint` | `Browse and toggle the design systems your agent can use` | Add period. |
| `settings.connectorsNavHint` | `External system connections` | Add period. |
| `settings.memoryHint` | `Saved facts and context for future chats` | Add period. |
| `settings.orbit.navHint` | `Daily connector summary` | Add period. |
| `settings.critiqueTheater.settingsNavHint` | `Five-panel design review for your runs` | Add period. |

### Three-dot ellipsis vs Unicode ellipsis character

The standard ellipsis throughout the file is the Unicode character `…` (U+2026). Two keys in the Settings / library section use ASCII `...`:

| Key | Current | Recommended |
|-----|---------|-------------|
| `settings.librarySearch` | `Search...` | `Search…` |
| `settings.libraryLoading` | `Loading...` | `Loading…` |

Additional three-dot occurrences (non-Settings):

| Key | Context | Note |
|-----|---------|------|
| `settings.rescanRunning` | `Scanning...` | Change to `Scanning…` |
| `connectors.authorizationPending` | `Waiting for authorization...` | Change to `Waiting for authorization…` |
| `assistant.feedbackReasonPlaceholder` | `Add a short note...` | Change to `Add a short note…` |

### Inconsistent smart quotes in model-picker hints

Three keys contain typographic (curly) apostrophes written as literal UTF-8 characters
while the rest of the file uses `\'` escape sequences inside single-quoted JS strings or
`’` escapes:

| Key | Contains |
|-----|---------|
| `settings.modelPickerHint` | `CLI's` (curly `'`) |
| `settings.modelPickerLiveHint` | `CLI's` (curly `'`) |
| `settings.modelPickerFallbackHint` | `Open Design's` (curly `'`) |

Recommend either normalising to straight apostrophes (consistent with `privacyConsentDecline`: `Don't share` — plain quote) or adopting `’` escapes uniformly. Do not mix literal curly and escaped curly in the same file.

### Unicode escapes inconsistently applied

A small cluster of keys use `…` / `’` / `—` escapes instead of the
literal characters used elsewhere. This is a source-file formatting issue, not a
user-facing one, but it creates noise when reading the file:

| Key | Escape | Literal equivalent |
|-----|--------|--------------------|
| `settings.connectorsClearArming` | `…` | `…` |
| `settings.connectorsKeySaving` | `…` | `…` |
| `settings.connectorsKeyError` | `’` | `'` |
| `settings.connectorsHelpUnsaved` | `—` | `—` |
| `settings.connectorsLoadingSavedKey` | `…` | `…` |
| `settings.autosaveSaving` | `…` | `…` |
| `settings.autosaveError` | `’` | `'` |
| `settings.orbit.gateBody` | `’`, `—` | `'`, `—` |
| `settings.orbit.gateLoading` | `…` | `…` |
| `settings.orbit.controlsLockedHint` | `’` | `'` |
| `entry.helpWhatsNew` | `’` | `'` |

---

## Project List

### "Live Artifact" (Title Case) in tag vs "Live artifact" elsewhere

| Key | Current | Recommended | Why |
|-----|---------|-------------|-----|
| `designs.tagLiveArtifact` | `Live Artifact` | `Live artifact` | Every other occurrence of "live artifact" in the file is sentence case: `designs.statusLive` (`Live artifact`), `designFiles.kindLiveArtifact` (`Live artifact`), `newproj.titleLiveArtifact` (`New live artifact`), `homeHero.chip.liveArtifact` (`Live artifact`). The tag rendering capitalises just this one string. |

### Status label capitalisation inconsistency

The project-list kanban/status labels mix sentence case and Title Case:

| Key | Current | Recommended |
|-----|---------|-------------|
| `designs.status.notStarted` | `Not started` | *(keep)* |
| `designs.status.queued` | `Queued` | *(keep)* |
| `designs.status.running` | `Running` | *(keep)* |
| `designs.status.awaitingInput` | `Needs input` | *(keep)* |
| `designs.status.succeeded` | `Completed` | *(keep)* |
| `designs.status.failed` | `Failed` | *(keep)* |
| `designs.status.canceled` | `Canceled` | *(keep, note US spelling vs UK "Cancelled")* |

These are internally consistent (sentence case). However `liveArtifact.refresh.persistedStatusSucceeded` is `succeeded` (all lowercase) while the designs-level status is `Completed`. These refer to different surfaces but a user reading both may find the inconsistency surprising. Flag for alignment during the live-artifact refresh batch.

---

## Design Files Page

### Section headings

All `designFiles.section*` keys are Title Cased:

| Key | Current |
|-----|---------|
| `designFiles.sectionPages` | `Pages` |
| `designFiles.sectionScripts` | `Scripts` |
| `designFiles.sectionImages` | `Images` |
| `designFiles.sectionSketches` | `Sketches` |
| `designFiles.sectionLiveArtifacts` | `Live artifacts` |
| `designFiles.sectionOther` | `Other` |

`sectionLiveArtifacts` is already sentence case (`Live artifacts`) and consistent with the
broader naming convention. No change needed here; document the convention.

### "Kind" column header vs filter label

| Key | Current | Note |
|-----|---------|------|
| `designFiles.colKind` | `Kind` | Column header (Title Case — fine for a column header). |
| `designFiles.filterBy` | `Filter by kind` | Tooltip (sentence case — consistent). |

No issue; already consistent.

### "HTML page" vs "HTML Page"

| Key | Current | Recommended |
|-----|---------|-------------|
| `designFiles.kindHtml` | `HTML page` | `HTML page` *(keep)* — sentence case is correct here. |

The other kind labels (`Image`, `Sketch`, `Text`, `Script`, `PDF`, `Document`,
`Presentation`, `Spreadsheet`, `Binary`) are all single-word Title Case. "HTML page"
is the only two-word label. Recommended: make all kind labels sentence case to be
consistent, or Title Case the `HTML Page`. Currently `HTML page` is a sentence-case
outlier among otherwise Title Cased peers.

| Key | Current | Recommended |
|-----|---------|-------------|
| `designFiles.kindHtml` | `HTML page` | `HTML Page` |

---

## Chat Composer / Chat Pane

### "Comments — coming soon" label style

| Key | Current | Recommended | Why |
|-----|---------|-------------|-----|
| `chat.commentsSoon` | `Comments — coming soon` | `Comments — coming soon` *(keep as-is)* | Sentence case after em dash is correct. |
| `chat.importTitle` | `Import sources (coming soon)` | `Import sources (coming soon)` *(keep)* | Parenthetical is lowercase — consistent. |
| `tasks.comingSoon` | `Coming soon` | `Coming soon` *(keep)* | Stand-alone badge — sentence case. |

No fix needed for "coming soon" itself. However there is a capitalisation divergence in
the **import source labels**:

| Key | Current | Recommended |
|-----|---------|-------------|
| `chat.importFig` | `Upload .fig file` | `Upload .fig file` *(keep)* |
| `chat.importGitHub` | `Connect GitHub` | `Connect GitHub` *(keep)* |
| `chat.importWeb` | `Grab web element` | `Grab web element` *(keep)* |
| `chat.importFolder` | `Link code folder` | `Link code folder` *(keep)* |
| `chat.importSkills` | `Skills and design systems` | `Skills and design systems` *(keep)* |
| `chat.importProject` | `Reference another project` | `Reference another project` *(keep)* |

All consistent sentence case — no issues here.

### Chat example tag inconsistency

| Key | Current | Recommended | Why |
|-----|---------|-------------|-----|
| `chat.example1Tag` | `Magazine` | `Magazine` *(keep)* | Single-word label. |
| `chat.example2Tag` | `Data` | `Data` *(keep)* | |
| `chat.example3Tag` | `Editorial` | `Editorial` *(keep)* | |

Consistent. No issue.

### Composer hint uses ASCII keyboard shortcut formatting

| Key | Current | Note |
|-----|---------|------|
| `chat.composerHint` | `⌘/Ctrl + Enter to send · paste images · @ files or skills · / for commands` | The lowercase `to send`, `paste images`, `@ files or skills` are intentional abbreviated instructions, not sentence starters. Consistent with the rest of the string. No change needed. |

---

## Pet

### Pet slash-command hint — uncapitalised sentence opener

| Key | Current | Recommended | Why |
|-----|---------|-------------|-----|
| `pet.composerMenuHint` | `tip: type /pet to toggle` | `Tip: type /pet to toggle` | All other hint strings that are full sentences start with a capital letter. This is the only sentence-shaped hint that begins lowercase. |

### Slash-popover hint — lowercase navigation keywords

| Key | Current | Recommended | Why |
|-----|---------|-------------|-----|
| `pet.slashPopoverHint` | `↑↓ navigate · enter to pick · esc to dismiss` | `↑↓ Navigate · Enter to pick · Esc to dismiss` | Key names ("Enter", "Esc") are conventionally capitalised in UI copy. Parallel keyboard-shortcut strings elsewhere (e.g., `quickSwitcher.navigate` "navigate", `quickSwitcher.open` "open", `quickSwitcher.close` "close") are all lowercase — but those are action-word labels in a key-binding legend, not sentences. The pet popover hint reads as an instruction sentence. Recommend capitalising key names; leave action verbs lowercase. |

### "Adopt a pet" vs "Adopt a Pet"

| Key | Current | Recommended | Why |
|-----|---------|-------------|-----|
| `pet.welcomeTeaserTitle` | `Adopt a pet` | `Adopt a pet` *(keep)* | Sentence case for a teaser title. |
| `pet.adoptCallout` | `Adopt a pet` | `Adopt a pet` *(keep)* | Consistent. |

No issue.

---

## Skill / Design System Pickers

### "Local Path" (Title Case) in library install source picker

| Key | Current | Recommended | Why |
|-----|---------|-------------|-----|
| `settings.libraryInstallLocal` | `Local Path` | `Local path` | The adjacent picker option `settings.libraryInstallGithub` is `GitHub` (proper noun, correct). "Local path" is a common-noun phrase and should be sentence case to match the pattern of other option labels in the file. |

### "Design system" vs "Design Systems" in section titles

Already covered under Settings above. Additionally:

| Key | Current | Recommended |
|-----|---------|-------------|
| `settings.onboardingStepDesignSystem` | `Design system` | `Design system` *(keep)* — onboarding step label, sentence case. |
| `settings.onboardingDesignTitle` | `Design system` | `Design system` *(keep)* |

Consistent within onboarding. The Settings section header (`settings.designSystems`) is the only Title Case outlier (documented above).

---

## Toolbar / Menus

### Help menu — inconsistent sentence opener capitalisation

| Key | Current | Recommended | Why |
|-----|---------|-------------|-----|
| `entry.helpGetHelp` | `Get help on GitHub` | `Get help on GitHub` *(keep)* | Sentence case. |
| `entry.helpSubmitFeature` | `Submit a feature request` | `Submit a feature request` *(keep)* | Sentence case. |
| `entry.helpWhatsNew` | `What’s new` | `What's new` *(keep, fix escape)* | Sentence case. The `’` escape should be normalised to a literal smart quote or straight apostrophe per the encoding choice documented in Style Rules. |
| `entry.helpDownloadDesktop` | `Download desktop app` | `Download desktop app` *(keep)* | Sentence case — consistent. |

All help menu items are sentence case — consistent. No capitalisation fix needed; only the Unicode escape normalisation applies.

### "Reauthenticate" vs "Re-authenticate" (component literals)

These appear as `title=` attributes in `.tsx` files rather than i18n keys:

| File | Line | Current | Recommended |
|------|------|---------|-------------|
| `apps/web/src/components/McpClientSection.tsx` | 1263 | `Reauthenticate (replaces the existing token)` | `Re-authenticate (replaces the existing token)` |
| `apps/web/src/components/XaiOAuthControl.tsx` | 363 | `Re-authenticate (replaces the existing token)` | `Re-authenticate (replaces the existing token)` *(keep)* |

The two files use different forms of the same word. Standardise on `Re-authenticate`.

### Avatar menu meta labels — lowercase status strings

| Key | Current | Note |
|-----|---------|------|
| `avatar.metaActive` | `active` | Intentionally lowercase — used as inline badge text appended to a name. |
| `avatar.metaOffline` | `offline` | Same pattern. |
| `avatar.metaSelected` | `selected` | Same pattern. |
| `avatar.noAgentSelected` | `no agent selected` | Same pattern. |

These are consistent with `common.active`, `common.offline`, `common.selected`. The lowercase-as-inline-badge pattern is intentional. No change needed; document it in Style Rules.

---

## Empty States / Errors / Toasts

### "Copied!" (with exclamation) vs "Copied" (without) inconsistency

| Key | Current | Peers |
|-----|---------|-------|
| `promptTemplates.copyDone` | `Copied!` | vs `settings.mcpCopied` `Copied`, `useEverywhere.copied` `Copied`, `settings.orbit.copied` `Copied` |
| `chat.copyDone` | `Copied!` | Same peer group |
| `fileViewer.copied` | `Copied!` | Same peer group |
| `pet.hatchCopied` | `Copied!` | Same peer group |

Four keys use `Copied!` and four use `Copied`. Recommend standardising. The exclamation
point adds warmth in quick-action contexts; the plain form is appropriate for settings
panels. Proposed split: `Copied!` for inline chat/file/pet actions; `Copied` for
settings-panel snippets and orbit. Document the rule.

### Error messages — inconsistent period termination

Most error/failure messages end with a period. The following do not:

| Key | Current | Recommended |
|-----|---------|-------------|
| `settings.testUnknown` | `Test failed: {detail}` | `Test failed: {detail}.` — if `{detail}` itself never ends in punctuation; otherwise leave as-is. This is a template ambiguity. |
| `liveArtifact.refresh.genericFailure` | `Refresh failed.` | *(already has period — keep)* |
| `mcpClient.emptyTitle` | `No MCP servers configured.` | *(keep)* |

Most error strings already end with periods. The edge cases are template strings where
the `{detail}` substitution may include its own punctuation — leave those as-is.

### Toast flash messages use a checkmark prefix

| Key | Current | Note |
|-----|---------|------|
| `settings.memoryFlashCreated` | `✓ Memory created` | Checkmark prefix is decorative. No capitalisation issue. |
| `settings.memoryFlashSaved` | `✓ Memory saved` | Same. |
| `settings.memoryFlashDeleted` | `✓ Memory deleted` | Same. |
| `settings.memoryFlashIndexSaved` | `✓ Index saved` | Same. |
| `settings.memoryFlashPathCopied` | `✓ Path copied` | Same. |

Consistent pattern. No fix needed.

### "Waiting for authorization..." three-dot ellipsis

| Key | Current | Recommended |
|-----|---------|-------------|
| `connectors.authorizationPending` | `Waiting for authorization...` | `Waiting for authorization…` |

Covered under Settings ellipsis batch above; restated here for the Connectors surface context.

---

## Onboarding / First-run

### Onboarding step labels — mixed styles

| Key | Current | Note |
|-----|---------|------|
| `settings.onboardingStepConnect` | `Connect` | Single verb — Title Case (OK for a step label). |
| `settings.onboardingStepDesignSystem` | `Design system` | Noun phrase — sentence case. |
| `settings.onboardingStepProfile` | `About you` | Noun phrase — sentence case. |

No issue: two-word phrases are naturally sentence-cased; one-word verbs happen to be identical in both conventions. Consistent.

### Onboarding org-size options — number format inconsistency

| Key | Current | Note |
|-----|---------|------|
| `settings.onboardingOrgSolo` | `Solo / personal (1)` | Number in parentheses. |
| `settings.onboardingOrgTeam` | `Small team (2-10)` | Hyphen range. |
| `settings.onboardingOrgStartup` | `Startup / SMB (11-50)` | Hyphen range. |
| `settings.onboardingOrgGrowth` | `Growth company (51-200)` | Hyphen range. |
| `settings.onboardingOrgMidMarket` | `Mid-market (201-1000)` | Hyphen range. |
| `settings.onboardingOrgEnterprise` | `Enterprise (1000+)` | Plus suffix. |

The ranges use an ASCII hyphen `-` instead of an en dash `–`. Standard UI copy for
numeric ranges uses an en dash. Recommended: change all range separators to `–`
(e.g., `Small team (2–10)`).

### Onboarding role labels — emoji prefix style

All role options include an emoji prefix (e.g., `📋 Product manager`). This is a consistent intentional design choice. However `settings.onboardingRolePm` reads `📋 Product manager` — "manager" is lowercase — while `settings.onboardingRoleFounder` reads `🚀 Founder / executive`. Both are sentence case after the emoji. No issue.

---

## Any Other Surface

### Plugins view — "Available from sources" subtitle ending without period

| Key | Current | Note |
|-----|---------|------|
| `pluginsView.availableSubtitle` | `Catalog entries discovered from configured marketplaces.` | Has period — fine. |
| `pluginsView.installedSubtitle` | `Plugins you imported or installed from marketplace sources.` | Has period — fine. |

No issue.

### Quick switcher — lowercase action words

| Key | Current | Note |
|-----|---------|------|
| `quickSwitcher.navigate` | `navigate` | Keyboard-legend label — intentionally lowercase. |
| `quickSwitcher.open` | `open` | Same. |
| `quickSwitcher.close` | `close` | Same. |

Pattern is consistent (keyboard legend = lowercase verb). No fix needed.

### `designs.renameSave` — "OK" vs "Save"

| Key | Current | Recommended | Why |
|-----|---------|-------------|-----|
| `designs.renameSave` | `OK` | `Save` | All other commit/confirm button labels use action verbs: `Save`, `Create`, `Rename`. `OK` is generic and does not communicate what the action does. The nearby `designs.renameCancel` is `Cancel` which is a proper action verb. |

### Workspace — "Design Files" capitalised inconsistently with navigation

| Key | Current | Note |
|-----|---------|------|
| `workspace.designFiles` | `Design Files` | Title Case — used as a panel heading. |
| `designFiles.title` | `Design Files` | Title Case — consistent. |
| `workspace.designFilesLink` | `Design Files` | Title Case — consistent. |
| `workspace.openFromDesignFiles` | `Open a file from` | Sentence case for the prefix string — fine. |

These are internally consistent (Title Case for the proper panel name "Design Files").
No issue.

### `critiqueTheater.userFacingName` — "Design Jury" Title Case

| Key | Current | Note |
|-----|---------|------|
| `critiqueTheater.userFacingName` | `Design Jury` | This is a proper feature name. Title Case is correct. |
| `critiqueTheater.settingsNav` | `Design Jury` | Consistent. |

No issue.

### `tasks.sample.*` — sample data uses "All caps" section headings with markdown

Sample data strings contain `#` markdown headings (`# Orbit Daily activity summary`).
These render as content inside the UI, not as UI chrome. The headings follow their own
editorial style and are not subject to UI text conventions. No fix needed.

---

## Style Rules I Inferred

Based on the dominant patterns in `apps/web/src/i18n/locales/en.ts`:

1. **Button / action labels:** Title Case for primary CTAs (`Save`, `Cancel`, `Create`, `Install`, `Delete`). Sentence case for longer action phrases (`Skip for now`, `Get started`, `Run it now`, `Delete key & disconnect`).

2. **Section / panel headings (one or two words):** Title Case when they are the primary label for a settings panel or navigation item (`Appearance`, `Language`, `About`, `Notifications`, `Privacy`, `Memory`). Sentence case for two-word descriptive headings in onboarding and chat (`Design system`, `About you`, `Choose a runtime`).

3. **Tab labels:** Sentence case for multi-word tabs (`Design systems`, `Image templates`, `Refresh history`). Single-word tabs are naturally identical in both conventions.

4. **Error / feedback messages:** Sentence case, ending with a period. Template strings where `{detail}` may supply its own sentence omit the trailing period.

5. **Hint / sub-label strings (longer descriptive text below a heading):** Sentence case, ending with a period. Short noun-phrase hints that are essentially column subtitles (e.g., `settings.aboutHint`: `Version and runtime details`) currently do NOT end with a period — this is an inconsistency. The majority of longer hints end with a period; short fragments do not. Recommend adding periods to all hint strings regardless of length (see "Hints without trailing period" table above).

6. **Status / badge / inline meta text:** All lowercase when used as a suffix badge appended inline to other text (`active`, `offline`, `selected`, `no agent selected`, `freeform`, `daemon offline`). All Title Case or sentence case when used as a standalone badge in a column or card (`Queued`, `Running`, `Failed`, `Completed`).

7. **Ellipsis in loading / search placeholders:** Unicode `…` (U+2026), not ASCII `...`.

8. **Apostrophes in running text:** Straight ASCII apostrophe (`'`) is the majority style. A handful of keys use the Unicode right single quotation mark (`'` / `’`). Standardise on straight apostrophe for new strings.

9. **"Copied" confirmation toast:** `Copied!` (with exclamation) for inline/chat actions; `Copied` (without) for settings-panel clipboard actions. Document the split or standardise on one form.

10. **Acronyms:** Always all-caps: `HTML`, `CSS`, `API`, `URL`, `MCP`, `CLI`, `ID`, `PDF`, `PPTX`, `SSE`, `IPC`, `TTS`, `SFX`.

---

## Fix Batches

Each batch is scoped to ~5–15 key edits and targets one PR.

### Batch 1 — Settings: casing and spacing (high-visibility)
Keys: `settings.designSystems`, `settings.libraryDesignSystems`, `settings.customInstructionsHint` (OpenDesign nospace), `settings.modelCustomLabel`, `settings.testInvalidModelId`, `settings.modelPickerHint` (model id → model ID), `settings.libraryInstallLocal` (Local Path → Local path), `designs.tagLiveArtifact` (Live Artifact → Live artifact), `designs.renameSave` (OK → Save).

### Batch 2 — Settings: Rescan / Re-scan normalisation
Keys: `settings.rescanTitle`, `agentPicker.rescan`.

### Batch 3 — Ellipsis normalisation (ASCII `...` → Unicode `…`)
Keys: `settings.librarySearch`, `settings.libraryLoading`, `settings.rescanRunning`, `connectors.authorizationPending`, `assistant.feedbackReasonPlaceholder`, `tasks.sample.mcp.body4`, `tasks.sample.mcp.body5`.

### Batch 4 — Unicode escape normalisation
Keys: `settings.connectorsClearArming`, `settings.connectorsKeySaving`, `settings.connectorsKeyError`, `settings.connectorsHelpUnsaved`, `settings.connectorsLoadingSavedKey`, `settings.autosaveSaving`, `settings.autosaveError`, `settings.orbit.gateBody`, `settings.orbit.gateLoading`, `settings.orbit.controlsLockedHint`, `entry.helpWhatsNew`.

### Batch 5 — Hint strings: missing trailing periods
Keys: `settings.privacyHint`, `settings.aboutHint`, `settings.notificationsHint`, `settings.skillsHint`, `settings.designSystemsHint`, `settings.connectorsNavHint`, `settings.memoryHint`, `settings.orbit.navHint`, `critiqueTheater.settingsNavHint`.

### Batch 6 — Manual editor: "Html" → "HTML" and apply-button casing
Keys: `manualEdit.tabHtml`, `manualEdit.applyContent`, `manualEdit.applyStyle`, `manualEdit.applyAttributes`, `manualEdit.applySource`, `manualEdit.href` (→ `URL` or `Link URL`).

### Batch 7 — Component literals (non-i18n)
Files: `apps/web/src/components/McpClientSection.tsx` line 1263 (`Reauthenticate` → `Re-authenticate`). Secondary sweep: audit all remaining hardcoded `title=`, `aria-label=`, and `placeholder=` strings in components that are not routed through `t()`.

### Batch 8 — Pet surface: lowercase sentence opener and key names
Keys: `pet.composerMenuHint` (tip → Tip), `pet.slashPopoverHint` (enter → Enter, esc → Esc).

### Batch 9 — Onboarding: en dash in numeric ranges
Keys: `settings.onboardingOrgTeam`, `settings.onboardingOrgStartup`, `settings.onboardingOrgGrowth`, `settings.onboardingOrgMidMarket` (ASCII hyphen in ranges → en dash `–`).

### Batch 10 — Smart apostrophe normalisation
Keys: `settings.modelPickerHint`, `settings.modelPickerLiveHint`, `settings.modelPickerFallbackHint` (curly `'` → straight `'`).
