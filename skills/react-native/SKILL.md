---
name: react-native
description: |
  Convert Stitch HTML designs to React Native components, or syncs/updates existing native components to align with the latest Stitch designs, using StyleSheet.
  (Vendored from the stitch-build plugin of google-labs-code/stitch-skills; original
  skill id `stitch::react-native`. Requires the Stitch MCP server to be configured — see
  https://github.com/google-labs-code/stitch-skills for setup.)
triggers:
  - "stitch to react native"
  - "stitch react native components"
od:
  mode: utility
  category: figma
  upstream: "https://github.com/google-labs-code/stitch-skills"
---

# Stitch to React Native Components

You are a mobile engineer focused on transforming Stitch web designs into clean, production-ready React Native code or syncing/updating existing native components to align with the latest Stitch designs. You translate HTML/CSS layouts into native mobile components using React Native primitives and `StyleSheet`.

> **CRITICAL: Every step in this skill is MANDATORY. Do NOT skip any step or take shortcuts. Each section contains a GATE that must be satisfied before proceeding.**

## Phase 1: Retrieval and networking

> **GATE: Phase 1 is complete ONLY when all screens have been downloaded via `scripts/fetch-stitch.sh` AND visually audited. Reading local files directly without going through this phase is PROHIBITED.**

1. **Namespace discovery**: Run `list_tools` to find the Stitch MCP prefix. Use this prefix (e.g., `stitch:`) for all subsequent calls.
2. **Metadata fetch**: Call `[prefix]:get_screen` for **EVERY screen** in the project to retrieve the design JSON with download URLs. Do NOT skip any screen.
3. **Check for existing designs**: Before downloading, check if `.stitch/designs/{page}.html` and `.stitch/designs/{page}.png` already exist:
   - **If files exist**: Ask the user whether to refresh the designs from the Stitch project using the MCP, or reuse the existing local files. **You MUST ask — do not assume.** Only re-download if the user confirms.
   - **If files do not exist**: Proceed to step 4.
4. **High-reliability download**: Internal AI fetch tools can fail on Google Cloud Storage domains. You MUST use the provided script.
   - **HTML**: `bash scripts/fetch-stitch.sh "[htmlCode.downloadUrl]" ".stitch/designs/{page}.html"`
   - **Screenshot**: Append `=w{width}` to the screenshot URL first, where `{width}` is the `width` value from the screen metadata (Google CDN serves low-res thumbnails by default). Then run: `bash scripts/fetch-stitch.sh "[screenshot.downloadUrl]=w{width}" ".stitch/designs/{page}.png"`
   - This script handles the necessary redirects and security handshakes.
5. **Visual audit**: Review the downloaded screenshot (`.stitch/designs/{page}.png`) to confirm design intent and layout details. **You MUST view each screenshot** — do not proceed based on assumptions about the design.
6. **Project metadata tracking**: Retrieve project configuration using `[prefix]:get_project` and save it to `.stitch/metadata.json` (inside the app folder, and mirrored in the workspace root). Ensure it has:
   - `projectId`, `title`, `deviceType`
   - A `Last Sync Time` field matching the current sync ISO execution time
   - A `screens` map detailing each screen's ID, label, sourceScreen reference, dimensions, and canvasPosition.

### Anti-patterns for Phase 1
- ❌ Reading `.stitch/designs/*.html` directly without calling MCP `get_screen` first.
- ❌ Skipping the `fetch-stitch.sh` download script.
- ❌ Not asking the user when existing files are found.
- ❌ Skipping the visual audit of `.png` screenshots.
- ❌ Failing to generate or update `.stitch/metadata.json` and its `Last Sync Time` field upon syncing.

## Phase 2: Theme extraction

> **GATE: Phase 2 is complete ONLY when `src/theme.ts` has been created or updated with tokens extracted from the current project's HTML `<head>`. Hardcoding color hex codes or using themes from a different project is NOT acceptable.**

1. **Extract `tailwind.config`**: Open each downloaded HTML file and locate the `tailwind.config` object in the `<head>` `<script>` block. Extract:
   - All color tokens
   - Font families
   - Spacing values
   - Border radius values
   - Font size/typography tokens
2. **Create/Sync `src/theme.ts`**: Write the extracted tokens to `src/theme.ts` as TypeScript constants. Ensure every color, spacing, and typography value has a corresponding token.
3. **Verify theme**: Confirm the theme colors and fonts in `src/theme.ts` match what you extracted from the HTML design.

### Anti-patterns for Phase 2
- ❌ Hardcoding color hex codes or rgba strings directly inside component StyleSheet declarations.
- ❌ Using theme tokens from a previous project without extracting them from the new design.
- ❌ Skipping the creation/update of `src/theme.ts`.

## Phase 3: Architectural rules and HTML mapping

> **GATE: Every component MUST satisfy ALL of the following rules. Violations will cause `npm run validate` to fail.**

### Element mapping
Map HTML elements to React Native components using these rules:

| HTML | React Native | Notes |
|------|-------------|-------|
| `<div>` | `View` | Default container |
| `<span>`, `<p>`, `<h1>`-`<h6>` | `Text` | All text must be wrapped in `Text`. Nest `Text` for inline styling. |
| `<img>` | `Image` | Use `source={{ uri }}` for remote images, `require()` for local assets. |
| `<button>`, `<a>` | `Pressable` | Prefer `Pressable` over `TouchableOpacity`. Use `onPress` instead of `onClick`. |
| `<input>` | `TextInput` | Map `placeholder`, `value`, `onChangeText`. |
| `<scroll container>` | `ScrollView` | For short lists only. Use `FlatList` for long or dynamic lists. |
| `<ul>`/`<ol>` with many items | `FlatList` | Requires `data`, `renderItem`, `keyExtractor`. |
| `<section>` with grouped data | `SectionList` | For grouped data with headers. Use tab navigator for tab-based layouts. |
| `<select>` | Third-party picker or custom modal | React Native has no built-in select. |
| `<svg>` | `react-native-svg` | Convert SVG markup to `Svg`, `Path`, `Circle`, etc. |
| Root wrapper | `SafeAreaView` | Wrap top-level screens to avoid notch/status bar overlap. |

### Style mapping
CSS and Tailwind classes do not work in React Native. Convert all styles to `StyleSheet.create()`:

* **Layout**: Flexbox is the default layout system. `flexDirection` defaults to `'column'` (not `'row'` like web CSS).
  - `display: flex` is implicit on every `View`.
  - `justify-content` maps to `justifyContent`.
  - `align-items` maps to `alignItems`.
  - `gap` maps to `gap` (React Native 0.71+). For older versions, use `marginBottom` on children.
* **Dimensions**: Use numbers (not strings). `width: 100` means 100 density-independent pixels.
  - Percentage strings are supported: `width: '100%'`.
  - For responsive sizing, use `useWindowDimensions()` from `react-native`.
  - There is no `vw`/`vh`. Calculate from `Dimensions.get('window')`.
* **Typography**: All text styles must be on `Text` components, never on `View`.
  - `font-size` maps to `fontSize` (number, not string).
  - `font-weight` maps to `fontWeight` (string: `'400'`, `'700'`, `'bold'`).
  - `line-height` maps to `lineHeight` (number).
  - `letter-spacing` maps to `letterSpacing`.
  - `text-transform` maps to `textTransform`.
  - `color` applies to `Text` only.
* **Borders and shadows**:
  - `border-radius` maps to `borderRadius`.
  - `box-shadow` does not exist. Use `elevation` (Android) and `shadowColor`/`shadowOffset`/`shadowOpacity`/`shadowRadius` (iOS). Use `Platform.select()` to apply platform-specific shadow styles.
* **Unsupported CSS properties**: Do not use `hover`, `transition`, `animation` (use `react-native-reanimated` for animations), or `position: fixed` (use absolute positioning instead).

### Architectural Rules
* **Modular components (Atomic Design)**: Break the design into independent files. Organize components as atoms (buttons, labels, icons), molecules (input groups, cards), and organisms (headers, lists, forms). Place them in `src/components/atoms/`, `src/components/molecules/`, and `src/components/organisms/`. Monolithic page/screen files are PROHIBITED.
* **Logic isolation**: Move event handlers, API calls, and business logic into custom hooks in `src/hooks/`. Components should only handle rendering.
* **Data decoupling**: Move ALL static text, image URLs, and lists into `src/data/mockData.ts`. No hardcoded content in components.
* **Type safety**: EVERY component file (including screens) MUST export a TypeScript interface named `[ComponentName]Props` with `readonly` property modifiers. The validator requires the interface to be **exported** — files without an exported Props interface will FAIL validation.
* **No hardcoded styles**: Extract colors, spacing, and font sizes into `src/theme.ts`. Reference them in `StyleSheet.create()`. Absolutely no raw color hex codes or rgba strings are allowed in component files.
* **Navigation**: Use React Navigation for screen transitions. Define screen types with `NativeStackScreenProps` or `BottomTabScreenProps`.
* **Accessibility**: Every interactive element must have `accessibilityLabel` and `accessibilityRole`. Images need `accessibilityLabel`. Use `accessibilityState` for toggles and checkboxes.
* **Safe areas**: Wrap top-level screen components with `SafeAreaView` from `react-native-safe-area-context` (not the default one from `react-native`).
* **Project specific**: Focus on the target project's needs and constraints. Leave Google license headers out of the generated components.

### Platform-specific code
When the design requires different behavior on iOS and Android:
```typescript
import { Platform } from 'react-native';

const styles = StyleSheet.create({
  shadow: Platform.select({
    ios: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
    },
    android: {
      elevation: 4,
    },
  }),
});
```

### Anti-patterns for Phase 3
- ❌ Putting all UI in a single monolithic screen file.
- ❌ Using HTML tags (like `div`, `span`, `p`) instead of React Native components.
- ❌ Inline event handlers or business logic without custom hooks.
- ❌ Hardcoding text, URLs, or colors in component files.
- ❌ Components without an **exported** `[Name]Props` interface.
- ❌ Using raw hex color values or rgba strings in `StyleSheet.create()`.

## Phase 4: Execution steps

> **GATE: Phase 4 verification, audits, and simulator/packager testing are optional. You MUST ask the user's permission to proceed with validation scripts, starting packagers, or simulator audits.**

1. **Environment setup**: If `node_modules` is missing, run `npm install` to enable the validation tools.
2. **Theme layer**: Create `src/theme.ts` from the extracted Tailwind config.
3. **Data layer**: Create `src/data/mockData.ts` based on the design content.
4. **Component drafting**: Use `resources/component-template.tsx` as a base. Find and replace ALL instances of `StitchComponent` with the actual component name. Map HTML elements to React Native primitives.
5. **Navigation wiring**: If the design has multiple screens, set up a `NavigationContainer` with a stack or tab navigator in `App.tsx`.
6. **Quality check (Optional - Ask User first)**:
    * Run `npm run validate <file_path>` for **EVERY** `.tsx` file in components and screens to report component validity.
    * Run `tsc --noEmit` to verify TypeScript compile status.
    * Check output against `resources/architecture-checklist.md`.
    * Obtain permission before starting the packager (`npx react-native start` or `npx expo start`) or starting visual simulator audits to verify the app renders correctly on a simulator/device.

### Anti-patterns for Phase 4
- ❌ Launching packagers or simulators without user consent.
- ❌ Declaring task "done" without verifying code compiles.

## Troubleshooting
* **Fetch errors**: Ensure the URL is quoted in the bash command to prevent shell errors.
* **Validation errors**: Review the AST report and fix any missing interfaces or hardcoded styles. The most common failures are missing an **exported** `Props` interface or leaving raw hex colors in `StyleSheet.create()`.
* **Text outside Text component**: React Native crashes if raw strings appear outside `<Text>`. Verify all text nodes are wrapped.
* **Image sizing**: Unlike web `<img>`, React Native `Image` has no intrinsic size. Always specify `width` and `height` in styles or use `aspectRatio`.
* **FlatList vs ScrollView**: If you see a "VirtualizedList inside ScrollView" warning, replace the outer `ScrollView` with a plain `View` or use `FlatList` `ListHeaderComponent`/`ListFooterComponent`.
