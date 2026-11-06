$ErrorActionPreference = 'Stop'
$motionRoot = Split-Path -Parent $PSScriptRoot
& "$motionRoot/runtime/node/node.exe" "$motionRoot/scripts/configure-plugin.mjs"
if ($LASTEXITCODE -ne 0) { throw 'Plugin configuration failed' }
& codex plugin marketplace add $motionRoot
if ($LASTEXITCODE -ne 0) { throw 'Marketplace registration failed' }
& codex plugin add motion@openmotion-test
if ($LASTEXITCODE -ne 0) { throw 'Plugin installation failed' }
& codex plugin list --marketplace openmotion-test
if ($LASTEXITCODE -ne 0) { throw 'Plugin verification failed' }
