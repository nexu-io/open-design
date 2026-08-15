# Architecture Quality Gate

### Structural integrity
- [ ] Components organized by Atomic Design: atoms, molecules, organisms in `src/components/`.
- [ ] Logic extracted to custom hooks in `src/hooks/`.
- [ ] No monolithic files. Each component in its own file.
- [ ] All static text, image URIs, and list data moved to `src/data/mockData.ts`.

### Type safety and syntax
- [ ] Every component exports a `[ComponentName]Props` interface with `readonly` property modifiers.
- [ ] File is syntactically valid TypeScript (no parse errors).
- [ ] Placeholders from template (e.g., `StitchComponent`) have been replaced with actual names.
- [ ] Navigation screen params are typed with `NativeStackScreenProps` or equivalent.

### React Native primitives
- [ ] No HTML elements (`div`, `span`, `p`, `img`, `button`). Only React Native components.
- [ ] All text wrapped in `Text` components. No raw strings inside `View`.
- [ ] `Pressable` used for interactive elements (not `TouchableOpacity` or `TouchableHighlight`).
- [ ] `FlatList` used for dynamic/long lists (not `ScrollView` with `.map()`).
- [ ] `Image` components have explicit `width` and `height` or `aspectRatio`.

### Styling
- [ ] All styles defined via `StyleSheet.create()` at the bottom of the file.
- [ ] No inline style objects (use `StyleSheet` references).
- [ ] No hardcoded hex values. Colors referenced from `src/theme.ts`.
- [ ] Shadows use `Platform.select()` for iOS/Android differences.
- [ ] `flexDirection` explicitly set where row layout is needed (default is `column`).

### Accessibility
- [ ] Interactive elements have `accessibilityLabel` and `accessibilityRole`.
- [ ] Images have descriptive `accessibilityLabel`.
- [ ] Toggle/checkbox elements use `accessibilityState`.

### Platform handling
- [ ] Top-level screens wrapped with `SafeAreaView` from `react-native-safe-area-context`.
- [ ] Platform-specific code uses `Platform.select()` or `Platform.OS` checks.
- [ ] Responsive dimensions use `useWindowDimensions()` (not hardcoded pixel values for screen-relative sizing).
