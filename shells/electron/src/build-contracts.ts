/** Pure product artifact composition. Release controllers and local fixtures
 * can bundle this leaf without visiting compiler or native installer modules. */
export { composeElectronCapsuleManifest, electronCompositeShellBuildHash, validateElectronCapsuleContent, validateElectronCapsuleRelease, assertElectronCapsuleReleaseManifest } from "@open-design/electron-kit/contracts";
export type { ElectronCapsuleContent, ElectronCapsuleManifest, ElectronCapsuleRelease } from "@open-design/electron-kit/contracts";
