# how nap works — the UX mental model

## the problem this solves

* agents generate code faster than humans can comprehend it
  * a PR with 50 changed files, 3000 lines — where do you start?
  * inline PR comments are scattered — they don't tell a story
  * the reviewer needs a guide: what to read first, why, where the tricky parts are
* mini-books solve the comprehension bottleneck
  * the author writes a narrative guide alongside the PR
  * committed to a .nap repo (separate from code, always on main)
  * markdown files with file:line links into the codebase
  * threaded // comments are the discussion medium
  * the guide IS the review — not a supplement to it

## navigation, map, territory

* three layers in how you interact with code through nap
  * navigation — how you find things
  * map — what you read to understand
  * territory — the actual thing (code, terminals, running agents)

* in nap.app (desktop)
  * navigation: sidebar with napkin cards, agent dots, status phases
  * map: left pane — napkins, specs, mini-books, agent prompts (Monaco editor)
  * territory: right pane — terminals (running agents), source code
  * you navigate to a napkin, read its map, jump into territory when needed

* in the extension (Chrome side panel)
  * navigation: nav tree on right — napkin cards, agent dots, file tree
  * map: editor on left — mini-book chapters (Monaco, napkin-markdown tokenizer)
  * territory: GitHub tab — the actual code, linked via file:line
  * terminal: escape hatch into territory (git ops, exploration)
  * the reviewer navigates to a chapter, reads the map, jumps to territory via Cmd+click

## the sidebar — navigation surface

* everything is `*` — bullets all the way down
  * napkins are `*` with a name and a status (doing, backlog, done)
  * files under a napkin are `*` with a filename
  * agents are `*` replaced by a colored dot (the key visual innovation)
  * nesting = zooming in. same metaphor as the napkin format itself.
  * no folders, no triangles — the tree IS bullets

* napkin cards
  * collapsed: one line — `* 0100-delivery-pipeline [dots] doing`
  * focused: header + body — files and agents visible
  * extended: body + agent file trees + [terminal] entries
  * click header to focus/unfocus
  * one focused card at a time (like workflowy zoom)

* agent dots encode two dimensions (Tufte — max info per element)
  * COLOR = role (who they are in the pipeline)
    * test-arch: orange. fs-eng: green. test-eng: gray. architect: blue.
  * SHAPE = status (where they are in their lifecycle)
    * filled circle: running
    * dashed border + checkmark: done
    * hollow circle: exited/archived
  * dots appear in card headers (summary) and agent rows (detail)
  * agents sit at the same indent level as files — agents/ dir is skipped

* files in the tree
  * main file (0100-feature.nap.md): bold
  * .md files: link color, clickable → opens in editor
  * directories: muted color, name ends with /
  * everything visible and navigable — the nav is a window into the napkin's full directory

## the editor — map surface

* Monaco code editor with custom tokenizer (napkin-markdown)
  * NOT rendered HTML — editable monospace text with syntax coloring
  * the reviewer reads AND edits in the same surface
  * this is deliberate: editing (adding // comments) is part of reviewing

* what the tokenizer colors
  * `# heading` → bold, brighter
  * `* bullet` → dimmed `*` marker, normal content
  * `//` → green (generic comment)
  * `//DU:` → green (user), `//A:` → blue (architect), `//TA:` → orange
  * `**bold**` → bold text, dimmed markers
  * `` `code` `` → tinted background
  * `[file.ts:42](/path#L42)` → underlined, link color, always visible
  * this is the napkin visual language — you can scan 300 lines in a minute

* tabs
  * ephemeral tab: single-click in nav → italic tab, reuses the slot
  * permanent tab: double-click or start editing → normal font, own slot
  * Terminal tab always present
  * maps the same concept as "glancing" vs "reading" — ephemeral = glancing

* key behaviors
  * shift-enter: continues the line pattern (indent + bullet + // prefix)
  * Cmd+click on links: routes by type
    * file:line → GitHub tab navigates to that line
    * .md → loads in editor (stay in the map)
    * https:// → new tab
  * auto-save: debounced write to LightningFS (same IDB the terminal sees)

## the terminal — territory portal

* bash + git in the browser (wterm + just-bash + lightning-fs + isomorphic-git)
* dark theme always (bg #1e1e1e) — visually distinct from the map surface
* the terminal IS the git UI — no commit button, you type commands
* `git clone` → files appear in nav tree
* `git status` → see what you changed
* `git commit && git push` → push your review comments
* it's the escape hatch, not the primary surface
* use case: end of review, commit your // comments

## the two-repo bridge (extension-specific)

* the .nap repo and the code repo are separate
  * .nap: cloned into IDB, shown in nav + editor, editable
  * code: on GitHub, never cloned, linked via file:line URLs
  * file:line links in the mini-book resolve to the CODE repo, not the .nap repo
* the extension bridges them
  * reviewer reads .nap content in the side panel
  * clicks a link → GitHub tab shows the code
  * reads the code, comes back to the chapter
  * the reading experience alternates between map (.nap) and territory (GitHub)

## the workflow

* entry: PR author shares a link with a #fragment
  * `github.com/org/repo/pull/42#nap-repo=github/org/repo-nap&napkin=01-v1/0100-feature`
  * extension parses the fragment, auto-clones, focuses on the specified napkin
* reading: nav → chapter → read → Cmd+click → code → back → next chapter
* commenting: type `//DU: question` inline → auto-saves
* pushing: terminal → `git add . && git commit -m "review" && git push`
* return visit: panel remembers state, [fetch latest] pulls updates

## where this is going (from DU thoughts)

* read: `.nap/nepics/05-extension/20-architects/001-architect/scratch/v0-take1/session1/10-du-thoughts.nap.md`
* v0: what we're building now — side panel reader + editor + terminal
* v2: workflowy mode — zoom into subtrees via setHiddenAreas(), breadcrumbs
* v3: rich editing — bullet anchors, cross-file linking, diff layers
* v4: collaboration — concurrent cursors, presentation mode
* don't make decisions that close off these paths
