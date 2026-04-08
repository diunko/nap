* 0700 — workflow rethink: what's wrong with the current templates

* stale references
  * 30-structure.nap.md references nap.db (SQLite) — v3 has no database
  * 30-structure.nap.md references 40-board/ with symlinks — v3 uses marker files
  * 20-workflow.nap.md says "status lives in symlinks" — v3 uses .napkin.nap.json
  * architect.md says "move symlinks in 40-board/" — should be `nap3 set-status`
  * no mention of marker files (.agent.nap.json, .napkin.nap.json) anywhere

* roles don't know about each other
  * architect doesn't mention guardian, doesn't know about permission system
  * fs-eng doesn't know the guardian might approve/deny their tool calls
  * test-eng doesn't know about the small/medium testing pattern (model + fakes vs real Electron)
  * test-arch doesn't know about the model layer testing approach (fake filesystem, fake bridge)
  * guardian doesn't know what's normal for each role (fs-eng installs packages, architect doesn't write code)
  * nobody knows who else is on the team — each role file is an island

* workflow doc is flat and procedural
  * describes steps (1. napkin 2. spec 3. code 4. test) but not the shape of the team
  * doesn't explain: what happens when an agent needs permission? what happens when a session dies?
  * doesn't explain: how the app works, what the sidebar shows, what the debug panel is for
  * doesn't explain: the human's role — when do they intervene, what do they see, how do they steer
  * the pipeline is one section among many — should be the centerpiece

* no system overview
  * a new agent reads 4 files and has no idea how the app works
  * no mention of: model layer, bridge, snapshots, marker files as persistence
  * no mention of: nap3 CLI commands beyond start/done/nap
  * no mention of: the Electron app, the sidebar, the kanban, the terminal
  * no "here's how everything fits together in 30 seconds"

* role files are too generic
  * they describe what the role does but not HOW in THIS system
  * no examples of actual commands they'll run
  * no examples of what their prompt.md looks like
  * no examples of what their response.md should contain
  * fs-eng doesn't know about the monorepo structure (packages/v2, packages/v3)
  * test-arch doesn't have examples of fixture patterns or journey test design

* the promise doc is good but disconnected
  * explains WHY well (context windows, quality, visibility)
  * but the WHY doesn't connect to the HOW in the other docs
  * feels like a manifesto you read once and forget
  * should be woven into the workflow, not a separate file

* what's missing entirely
  * guardian role doc — exists as a template prompt but not as a 40-roles/ file
  * the human's role — what they do, when they intervene, what signals to watch for
  * successor/handoff flow — what happens when an architect runs out of context
  * archived agents — what they are, how to adopt orphaned work
  * the permission system — how it works, what the guardian does, how to escalate
  * nap3 CLI reference — not a man page, just "here are the commands you'll use"
  * project structure beyond .nap/ — where does the actual code live?
