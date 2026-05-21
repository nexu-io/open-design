#!/bin/bash
bash deploy/scripts/install.sh --non-interactive --port 19000 --no-systemd 2>&1 | sed 's|/Users/hackme/workspace/projects/fork/open-design|~/epicsagas/open-design|g' | sed 's|/Users/hackme|~|g'
