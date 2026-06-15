// Bundle entry point — passed to @remotion/bundler bundle() by the Remotion
// adapter's native render path. registerRoot wires the DataRollup composition
// into Remotion. (RFC-08 Phase 2)
import { registerRoot } from 'remotion';
import { RemotionRoot } from './Root';

registerRoot(RemotionRoot);
