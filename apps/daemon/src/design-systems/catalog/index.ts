/** @module catalog/index
 * Read-only catalog layer: design system listing, reading, asset resolution, source context fetching, and HTML preview/showcase rendering.
 * All operations here are non-mutating — writes live in user/ and import/.
 */
export {
  clearDesignSystemAssetsCacheForTests,
  digestDesignSystemContext,
  isDesignTokenChannelEnabled,
  readDesignSystemAssets,
  resolveDesignSystemAssets,
} from './assets.js';
export {
  listDesignSystems,
  readDesignSystem,
  readDesignSystemPackageInfo,
  readDesignSystemPullFile,
  readDesignSystemStaticFile,
} from './reader.js';
export * from './source-context.js';
export * from './showcase.js';
export * from './preview.js';
