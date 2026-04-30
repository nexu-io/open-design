#!/usr/bin/env node
// @ts-nocheck
import { startServer } from './server.js';

const args = process.argv.slice(2);
let port = Number(process.env.OD_PORT) || 7456;
let open = true;

for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '-p' || a === '--port') {
    port = Number(args[++i]);
  } else if (a === '--no-open') {
    open = false;
  } else if (a === '-h' || a === '--help') {
    console.log(`Usage: od [--port <n>] [--no-open]

Starts a local daemon that:
  * scans PATH for installed code-agent CLIs (claude, codex, gemini, opencode, cursor-agent, ...)
  * serves a tiny web chat UI at http://localhost:<port>
  * proxies messages (text + images) to the selected agent via child-process spawn
`);
    process.exit(0);
  }
}

startServer({ port }).then(url => {
  console.log(`[od] listening on ${url}`);
  if (open) {
    const opener = process.platform === 'darwin' ? 'open'
      : process.platform === 'win32' ? 'start'
      : 'xdg-open';
    import('node:child_process').then(({ spawn }) => {
      spawn(opener, [url], { detached: true, stdio: 'ignore' }).unref();
    });
  }
});
