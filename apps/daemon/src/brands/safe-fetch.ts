// Preserve the brand API while sharing the public-host/DNS/redirect guard.
export { assertPublicAssetUrl as assertPublicBrandUrl, createValidatingLookup, fetchPublicAsset as fetchExternalBrandAsset } from '../public-asset-fetch.js';
