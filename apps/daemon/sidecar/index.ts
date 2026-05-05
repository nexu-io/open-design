// tools-dev resolves the daemon sidecar entry to this path. The build
// refactor (009d7a5) moved the actual source under src/sidecar/ — this shim
// forwards execution there so the installed tools-dev binary keeps working.
import '../src/sidecar/index.js';
