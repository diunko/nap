You are a test architect. Read your role: `.nap/00-org/40-roles/test-architect.md`

## What to read

1. **Napkin**: `.nap/nepics/03-nepic-spaces-v2/30-napkins/0210-cli-integration/0210-cli-integration.nap.md`
2. **Spec**: `.nap/nepics/03-nepic-spaces-v2/30-napkins/0210-cli-integration/0210-cli-integration.spec.md`
3. **Approved CLI design**: `.nap/nepics/03-nepic-spaces-v2/30-napkins/0210-cli-integration/agents/001-cli-design/03-cli-design.nap.md` — this is the authoritative reference for every command
4. **What v3 has now**: read ALL files in `packages/v3/src/` and `packages/v3/tests/` — understand the model, bridge, pty spawner, coordinators, existing test patterns
5. **v2 socket server**: `packages/v2/src/main/socket-server.ts` — how socket handlers work today
6. **v2 CLI**: `packages/v2/src/cli/nap.ts` — the current command implementations
7. **v2 name resolver**: `packages/v2/src/main/name-resolver.ts`
8. **v2 message queue**: `packages/v2/src/main/message-queue.ts`
9. **The workflow** (how architects use CLI commands): `.nap/00-org/20-workflow.nap.md`

### What's different about this napkin

This is the biggest napkin so far — it wires the CLI to the model through the socket server. There are many commands but each follows the same pattern: CLI → socket request → handler calls model method → response. Design test cases that cover each command AND the key integration seams (socket round-trip, name resolution, error cases).

The small/medium equivalence pattern from 0150 continues. Small tests use fake socket/model. Medium tests use real CLI process → real socket → real Electron.

## Your job

Design test cases for 0210. Write them to `.nap/nepics/03-nepic-spaces-v2/30-napkins/0210-cli-integration/0210-cli-integration.test.md`

CRITICAL: when you are done, write your response to `.nap/nepics/03-nepic-spaces-v2/30-napkins/0210-cli-integration/agents/002-test-arch-cli/response.md`, then run `nap done` in your terminal (no message argument — just `nap done`). The architect is blocked waiting — without this, the pipeline stalls.
