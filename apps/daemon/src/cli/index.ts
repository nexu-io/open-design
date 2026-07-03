// @ts-nocheck
/** @module cli
 * Public API barrel for the CLI domain. Re-exports subcommand entry handlers
 * from domain subdirectory barrels via explicit named re-exports, consumed by
 * the src/cli.ts entry shim. Every handler maps to an `od <subcommand> …`
 * route registered in SUBCOMMAND_MAP. The core/ foundation kernel (flag
 * parsing, daemon-url resolution, input intake, run-event streaming) lives
 * separately and is imported by each domain as needed.
 */
export { runAutomation } from './automation/index.js';
export { runBrand } from './brand/index.js';
export { runExport } from './export/index.js';
export { runFigma } from './figma/index.js';
export { runAtoms, runCraft, runDesignSystems, runLibrary, runSkills } from './library/index.js';
export { runMcp } from './mcp/index.js';
export { runMedia } from './media/index.js';
export { runMemory } from './memory/index.js';
export { runMarketplace, runPlugin } from './plugin/index.js';
export { runChat, runConversation, runFiles, runProject, runRun } from './project/index.js';
export { runResearch } from './research/index.js';
export { runShare } from './share/index.js';
export { runAmr, runConfig, runDaemon, runDiagnostics, runDoctor, runStatus, runVersion } from './system/index.js';
export { runTemplates } from './templates/index.js';
export { runUi } from './ui/index.js';
