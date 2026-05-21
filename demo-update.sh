#!/bin/bash
bash deploy/scripts/update.sh --non-interactive 2>&1 | sed 's|/Users/hackme/workspace/projects/fork/open-design|~/epicsagas/open-design|g' | sed 's|/Users/hackme|~|g'
