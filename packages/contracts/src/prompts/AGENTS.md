# Shared prompt contracts

Before editing prompt composition, read
[`apps/daemon/src/prompts/AGENTS.md`](../../../../apps/daemon/src/prompts/AGENTS.md).
This directory owns API/BYOK prompt mirrors and canonical host directives consumed
by daemon, BYOK, and OD Next paths. Keep it pure: no daemon-private imports or I/O.
