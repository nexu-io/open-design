#!/bin/bash
# Open Design launcher - activates Node 24 and starts the app
cd ~/projects/open-design
export PATH="/opt/homebrew/opt/fnm/bin:$PATH"
eval "$(fnm env --shell bash)"
fnm use 24
pnpm tools-dev run web