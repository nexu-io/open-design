/** @module export/core
 * Foundation kernel for the export domain: the pure, dependency-free `exportRoutePath`
 * primitive that maps an export format to its daemon export route path.
 * core imports no sibling subdirectory; every other export/ subdir may import it directly.
 */
export { exportRoutePath } from './route-paths.js';
