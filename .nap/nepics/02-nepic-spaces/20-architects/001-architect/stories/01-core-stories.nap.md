* core user stories — NAP v2


* J1: the spark

  * first-time setup

    * do: run `nap init` in a project directory
        * see: `.nap/` directory created — 00-org/, nepics/01-v1/ scaffolded, nap.db initialized, architect session pre-created in SQLite
        * so that: the project is ready for agent collaboration without manual setup

    * do: run `nap init --add-skills --user`
        * see: napkin and napkin-format skills copied to `~/.claude/skills/`
        * so that: the `/napkin` command is available in all future Claude sessions

    * do: run `nap open --architect --name Nova .`
      * //A: must include `.` path arg — that's how nap open works
      * //A: also --name is how architect gets a display name
      * see: Electron app launches — three-column layout appears. Gutter shows one nepic icon ("V") with white active bar. Sidebar shows "[Architect] Nova" with green pulsing dot. Terminal shows architect booting with `claude --verbose --session-id <uuid>`.
      * //A: important detail: this is --session-id (first launch, session never existed), NOT --resume
      * so that: architect is live and ready to talk within seconds of first launch

  * starting a new era (returning user)

    * do: click (+) in the gutter
      * see: name input overlay appears next to the + button
      * //A: verify: is this actually an overlay, or is it a browser prompt() dialog? the implementation may differ from the story
      * so that: you name your era before it's created

    * do: type a name (e.g. "v3") and press Enter
      * see: new nepic icon appears in gutter with active white bar. Sidebar clears — fresh napkin list (empty). Terminal switches to new architect session booting up. Previous nepic's icon dims to inactive.
      * //A: key question: does the (+) architect get the TEMPLATE prompt from src/templates/? or a hardcoded string? we fixed this in 1400 — verify it's still working
      * so that: a whole new version space exists — fresh architect, fresh energy, same codebase

    * do: press Escape on the name input
      * see: input dismisses, nothing created
      * so that: you can bail if you change your mind

  * the brainstorming conversation

    * //A: these three stories are about CLAUDE behavior, not APP behavior. the app's job is just: terminal works, typing works, output renders. there's nothing to trace here — it's a normal terminal interaction. suggest collapsing into one story: "type in architect terminal, see claude respond"

    * do: type `/napkin` in the architect's terminal
      * see: architect enters brainstorming mode — responds with short bullets, pushes on constraints, dives rabbit holes, throws options
      * so that: ideas get stress-tested in pure thought before any code exists

    * do: type messy, half-formed ideas into the architect terminal
      * see: architect pushes back — "what happens when...?", "that contradicts...", "do you mean X or Y?"
      * so that: fuzzy thinking gets sharpened into precise constraints

    * do: say "napkin it" or "let's capture this"
      * see: architect writes a .nap.md file — three hundred bullets, labels not sentences, nesting all the way down. File appears in the architect's home dir in sidebar.
      * //A: the file appearing in sidebar IS an app interaction — fs watcher detects new file, sidebar updates. this is the testable part. the rest is claude behavior.
      * so that: the entire system exists as a compressed, readable document

  * reviewing the napkin

    * do: click the architect card in sidebar to focus it
      * see: card expands in place showing home dir files — prompt.md, scratch/, onboarding/. Rest of sidebar still visible below.
      * so that: you see what the architect has produced without leaving the app

    * do: press Cmd+E while architect card is focused
      * see: card switches to extended view — full file names, subdirectory contents expanded, hover controls (copy path, open in editor) appear on each file
      * so that: you can reach every artifact the architect produced

    * do: click the open-in-editor icon (arrow) on a .nap.md file
      * see: file opens in your system editor (VS Code, Cursor, etc.)
      * so that: you can read and edit the napkin in your preferred tool

    * do: add `//comments` inline in the napkin file in your editor
      * see: file saved on disk — architect can read changes when asked
      * //A: this is not an app story — it's editor behavior. the app's role: if the file is inside a watched dir, fs watcher detects the change and sidebar updates. that's the testable part.
      * so that: you collaborate with the architect through the actual files, not copy-pasting

    * do: go back to architect terminal. type "look at my comments on the napkin"
      * see: architect reads the file, addresses each comment, pushes back on some, agrees on others
      * //A: pure claude behavior, not an app interaction. remove or mark as "claude behavior, not testable"
      * so that: the napkin gets refined through human-AI iteration


* J2: the unfolding

  * architect breaks the mega-napkin

    * do: tell architect "break this into napkins"
      * see: architect creates directories under 30-napkins/ — 0100-this, 0200-that, 0300-the-other. Each gets a .nap.md with a slice of the mega-napkin. Sidebar populates with collapsed cards as the fs watcher detects new dirs.
      * //A: the "tell architect" part is claude behavior. the APP story is: "when new dirs appear in 30-napkins/, sidebar updates with new cards." split this into: claude action (not testable) + fs watcher response (testable)
      * so that: one monolithic napkin becomes twenty implementable features

    * do: scan the sidebar without clicking anything
      * see: each collapsed card shows: `* 0200-sqlite-persistence` + agent dots (none yet) + phase badge (backlog). 40 napkins fit in 40 lines.
      * //A: good — this is pure app rendering. but "backlog" as default phase: is that what we set? or is it derived from board symlinks? or from SQLite? the default for new napkins needs to be explicit.
      * so that: you read the entire project state at a glance

  * sequencing and status

    * do: architect runs `nap status 0100-design-sprint todo` then `nap status 0200-sqlite-persistence todo` etc.
      * see: phase badges update in sidebar (backlog → todo). Board symlinks move in 40-board/. Kanban reflects the new distribution.
      * so that: the roadmap takes shape — first batch to build, second batch after

    * do: press Cmd+` to open the kanban
      * see: overlay slides down from top (70vh). Five columns: BACKLOG (10), TODO (10), DOING (0), REVIEW (0), DONE (0). Each card collapsed — name + dots + arrow. Terminal still visible underneath.
      * //A: Cmd+` conflicts with macOS system shortcut. we added a renderer-side keydown fallback — verify it works. also: does the kanban actually render? this was one of the bugs reported.
      * so that: you see the shape of the entire version — where the weight is, what's coming

    * do: click a card name in kanban to expand it
      * see: card body unfolds — napkin bullets from .nap.md, artifact badges (nap filled, spec dimmed, test dimmed), agent dots
      * so that: you read the actual IDEAS, not just status labels

  * reviewing the split

    * do: click a napkin card in sidebar to focus it
      * see: card expands in place showing artifacts (nap.md) and agents (none yet). Rest of sidebar still visible as one-liners below.
      * so that: you inspect each napkin without losing the forest

    * do: click nap.md file entry in focused card
      * see: file opens in editor
      * so that: you can read the napkin slice and add inline comments

    * do: tell architect "these two should be one" or "this one is too big, split it"
      * //A: claude behavior. the app story: "when dirs are renamed/moved in 30-napkins/, sidebar updates." but we said napkins never move — this contradicts the persistence model. clarify: does the architect delete + recreate, or actually rename?
      * see: architect reorganizes dirs — merges or splits, updates .nap.md files. Sidebar updates via fs watcher.
      * so that: napkin boundaries match your mental model of the features

    * do: tell architect "0300 can wait, push to backlog"
      * //A: the app story is just: `nap status` command updates badge. the "tell architect" part is claude.
      * see: architect runs `nap status 0300-whatever backlog`. Card badge updates.
      * so that: scope is managed before any code is written


* J3: the pipeline

  * architect launches agents

    * do: architect runs `nap start claude "read prompt.md and write spec" --napkin 0100-design-sprint --name 001-test-arch --role test-arch`
      * see: new green pulsing dot appears on 0100-design-sprint card in sidebar. Architect terminal shows `{"id": "...", "name": "001-test-arch"}`.
      * //A: key question: does the dot actually appear UNDER the napkin card? the napkinSlug must match, and the renderer must connect session to card. this was one of the bugs — agents not showing under napkins.
      * so that: work begins on the first napkin — you can see it immediately in the sidebar

    * do: architect moves napkin to doing: `nap status 0100-design-sprint doing`
      * see: phase badge changes from "todo" to "doing" (green). Kanban column updates.
      * so that: the board reflects that work is actively happening

  * watching agents work

    * do: click an agent entry (e.g. 001-test-arch/) in the focused napkin card
      * see: terminal switches to that agent's session. Breadcrumb updates: `S > 0100-design-sprint > 001-test-arch`. Breadcrumb shows agent status (run/done).
      * //A: verify: does clicking the agent entry actually call store.setActive with the right terminal ID? the matching between agent dir name and session name must work.
      * so that: you can watch the agent think in real time — tool calls, reasoning, file writes

    * do: type a message in the agent's terminal while it's running
      * see: agent receives input and responds in context — it has full history, it was there the whole time
      * //A: this is just "terminal input works" — already covered by v1. not a new story.
      * so that: you can guide an agent mid-task with one sentence

  * agent lifecycle

    * do: agent calls `nap done` from within its session
      * see: dot changes from green pulsing (run) to blue filled (done) on the sidebar card. Terminal stays alive — agent is idle but resumable.
      * so that: you know the agent finished its task without checking the terminal

    * do: architect launches the next agent in the pipeline (e.g. fs-eng after test-arch is done)
      * see: second green dot appears on the same card. Now two dots: blue (done) + green (pulsing).
      * so that: the pipeline progresses — each agent picks up where the previous left off

    * do: test engineer finds bugs, architect routes failure back to fs-eng via `nap poke FS-100 "tests found 2 bugs, see test output"`
      * //A: WRONG. we explicitly decided NO POKE in agent workflows. architect communicates via files (response.md, questions.md). the architect would launch a new fs-eng agent with updated prompt, or write to a file the existing agent reads. remove this story or rewrite without poke.
      * see: fs-eng receives the message in its terminal, reads it, starts fixing
      * so that: bug fixes loop without human intervention — architect manages the flow

  * multiple napkins in parallel

    * do: architect launches agents on 0200, 0300 while 0100 is still in progress
      * see: sidebar shows green dots pulsing on multiple cards. Kanban DOING column has 3 cards with active dots.
      * so that: multiple features cook simultaneously — the machine runs in parallel

    * do: read the architect's terminal output
      * //A: this is claude behavior / scrollback reading. not an app interaction. remove or reframe as: "architect terminal shows recent nap start/nap nap output"
      * see: "TA-001 done. 9 test cases. Launching FS-001." / "FS-002 stuck on type error. Sending fix." / "TE-003 found 2 bugs. Routing back."
      * so that: the architect terminal is your single pane of glass — three sentences, full project state

  * reviewing completed napkins

    * do: architect moves napkin to review: `nap status 0100-design-sprint review`
      * see: phase badge changes to "review" (blue). Kanban card moves to REVIEW column.
      * so that: the project board reflects the handoff from agents to human review


* J4: the nap

  * closing and reopening

    * do: close the app (Cmd+Q, window close, or crash)
      * see: app closes. No data lost — session statuses frozen in SQLite (not set to exited). PTYs killed gracefully.
      * so that: quitting is safe — nothing changes state

    * do: reopen the app (`nap open .`)
      * //A: fixed: must include `.` path arg
      * see: app restores to previous state. ALL claude sessions auto-resume via `claude --resume <uuid>` — not just architect. Sidebar shows all napkin cards, phase badges restored. Agents that were running resume with green dots.
      * //A: FIXED: original said "other sessions show as orphaned." per 1600 design, ALL claude sessions auto-resume. no orphaned dots except for agents that exited on their own.
      * so that: you pick up exactly where you left off — close and open are invisible

    * do: click an agent that was 'exited' (died on its own before app close)
      * //A: REWRITTEN: the only non-resumable agents are ones that exited while the app was running. not "orphaned" — "exited." clicking could offer manual resume.
      * see: option to resume manually — agent restarts with `claude --resume <uuid>`
      * so that: even crashed agents can be brought back if their CC session exists

  * catching up after a nap

    * do: read the architect's terminal after reopening
      * see: architect's latest output summarizes what happened: "0200 done. TE-200 found a bug, FS-200 fixed it. 0210 stuck — FS-210 needs your input. 0100 in review."
      * //A: this depends on architect's prompt engineering (role doc says "summarize on resume"). the app's job is just: architect terminal shows claude output. the content is claude's responsibility.
      * so that: three sentences tell you the state of everything — no need to scan ten terminals

    * do: press Cmd+` to open kanban
      * see: yesterday: 5 doing, 8 todo, 7 backlog. Now: 3 doing, 2 review, 3 done, 7 todo, 5 backlog. The shape shifted.
      * so that: progress is visible at a glance — the distribution IS the information

  * going where you're needed

    * do: click the arrow (→) on a kanban card (e.g. 0210 that's stuck)
      * see: kanban slides away. Sidebar scrolls to 0210, card focuses with blue highlight. Terminal switches to the best agent (running > done > exited priority).
      * //A: "best agent" selection logic — is this implemented? what's the priority? this needs to be explicit for the engineer.
      * so that: one click goes from overview to deep work on the thing that needs you

    * do: type a short answer in the stuck agent's terminal: "expand in place, push siblings down"
      * see: agent reads the input, continues building immediately — it has full context, it just needed one sentence
      * //A: terminal input — already works from v1. not a new story.
      * so that: human input is surgical — you unblock the agent and move on

  * reviewing completed work

    * do: click a napkin card in REVIEW status
      * see: card focuses in sidebar showing artifacts (nap.md, spec.md) and agents with blue dots (done)
      * so that: you see what was produced for this feature

    * do: press Cmd+E on focused card
      * see: extended view shows full file tree — agent directories expand to show [terminal], prompt.md, response.md. File controls appear on hover.
      * so that: you can inspect every artifact, read the agent's deliverable, check the prompt

    * do: click [terminal] on an agent in extended view
      * see: terminal switches to that agent's session. You can scroll through their full conversation (100k scrollback).
      * //A: verify: is [terminal] click wired? does it call store.setActive? the extended view renders [terminal] as an entry but the click handler may not be connected.
      * so that: you can audit the agent's reasoning — every decision they made is right there

    * do: open spec.md in editor, add a comment: "//why is board-sync a separate module?"
      * see: file modified on disk
      * //A: editor behavior, not app. the app story: fs watcher detects change, sidebar updates if needed. but modifying a file doesn't change the card — only new/deleted files do. this story has no app-observable result.
      * so that: you leave feedback for the architect in the actual artifacts

    * do: tell architect "look at my inline comment on 0200 spec"
      * see: architect reads the file, explains reasoning or adjusts
      * //A: pure claude behavior. remove.
      * so that: review happens through files — the artifacts are the collaboration surface

    * do: tell architect "0200 looks good, move to done"
      * //A: the app story is: `nap status 0200 done` updates badge and kanban. the "tell architect" part is claude.
      * see: architect runs `nap status 0200-sqlite-persistence done`. Phase badge updates. Kanban card moves to DONE.
      * so that: reviewed work is marked complete — the board advances


* J5: the ship

  * assessing the version

    * do: open kanban (Cmd+`) late in the project
      * see: done: 12, review: 2, doing: 1, todo: 3, backlog: 2. 80% of the mega-napkin is built and tested.
      * so that: you see what shipped and what didn't — the board tells the truth

    * do: tell architect "these two todo items are nice-to-haves, push to backlog for next version"
      * //A: app story: `nap status` commands update badges. claude decides which ones.
      * see: architect runs `nap status` for each. Cards move to BACKLOG. Todo column empties.
      * so that: scope is cut honestly — what doesn't ship now ships next

  * architect succession

    * do: notice architect responses getting slower (context filling up)
      * see: token count high, responses take longer
      * //A: not an app interaction — this is observing claude behavior. remove or reframe.
      * so that: you recognize it's time for a handoff

    * do: tell architect "write your handoff"
      * see: architect writes handoff.md in their home dir (20-architects/001-architect/) — state of each napkin, decisions made and WHY, what's stuck, what's about to land
      * //A: claude behavior. the app story: new file appears in architect home dir → sidebar updates.
      * so that: everything the architect knows is captured for their successor

    * do: architect starts a new architect session (or you ask them to)
      * //A: HOW? this needs to be explicit. is it `nap start claude "read 002-architect/prompt.md" --role architect --dir 20-architects/002-nova`? or does the app have a "new architect" button? currently it's a CLI command — spell it out.
      * see: new architect (002-nova) appears in sidebar, reads predecessor's handoff, picks up the thread. Old architect card still visible (done, blue dot).
      * so that: leadership transitions without losing context

    * do: click the old architect card (001-architect, retired)
      * see: terminal shows their last state — scrollable history. Card shows "done" status.
      * so that: you can read historical context from any previous architect

    * do: type a question to the old architect: "why did you spec 0200 that way?"
      * see: old architect resumes (claude --resume), answers with full context — they were there
      * //A: how does resume trigger? user types in the terminal — but the pty is dead (app was closed and reopened, or architect session ended). does typing trigger a resume? or does the user need to click a "resume" button? this mechanic needs to be explicit.
      * so that: retired architects are knowledge banks, not tombstones

  * starting the next version

    * do: click (+) in the gutter
      * see: new nepic appears. Fresh architect boots. Fresh sidebar. Same codebase. Previous nepic icon still in gutter (click to switch back).
      * so that: you're not starting over — you're starting AGAIN, standing on what you built


* cross-cutting interactions

  * switching between nepics

    * do: click a nepic icon in the gutter (e.g. switch from "V3" back to "V2")
      * see: sidebar swaps to that nepic's napkin list with correct phases/dots. Terminal swaps to that nepic's architect. Active white bar moves. All sessions from other nepics keep running.
      * //A: "sessions from other nepics keep running" — ptys stay alive. but does the sidebar ONLY show the active nepic's agents? or all agents from all nepics? this was one of the reported bugs — agents not filtered by nepic.
      * so that: you can jump between eras — each is a complete context

  * switching between agents

    * do: click a different agent entry in a focused napkin card
      * see: terminal switches to that agent's session via DOM reparent (no re-render). Breadcrumb updates: `S > napkin-slug > agent-name`.
      * so that: switching is instant — you jump between agents like switching tabs

    * do: click "S" in the breadcrumb
      * see: terminal switches back to the architect
      * so that: one click returns to the command center

    * do: click the napkin name in the breadcrumb
      * see: sidebar scrolls to that napkin card, focuses it
      * so that: breadcrumb is bidirectional navigation — terminal and sidebar stay in sync

  * filtering

    * do: press Cmd+K
      * see: filter input in sidebar activates with blue border, cursor focused
      * so that: you can type immediately to find a napkin

    * do: type a substring (e.g. "sqlite")
      * see: sidebar filters to matching napkins only. Non-matching cards hidden.
      * so that: with 40 napkins you find the one you need instantly

    * do: press Escape
      * see: filter clears, all napkins visible again
      * so that: you return to the full view without clicking

  * ad-hoc terminals

    * do: press Cmd+T
      * //A: ASPIRATIONAL. current Cmd+T creates a bare shell (v1 behavior). the story says "new Claude session" — this is the tier 2 default from our lifecycle design. but it's NOT IMPLEMENTED YET. mark as future.
      * see: new Claude session starts — appears as free-floating entry in sidebar (below napkins, separated by divider). Terminal switches to it.
      * so that: you can spin up a Claude for a quick task without creating a napkin agent

    * do: press Cmd+Shift+T
      * //A: NOT IMPLEMENTED. no Cmd+Shift+T shortcut exists. mark as future.
      * see: bare shell terminal starts — appears in sidebar as free-floating session
      * so that: you have a regular terminal when you need one (git, npm, etc.)

  * agent finishes while you're elsewhere

    * do: you're looking at agent FS-200's terminal. Meanwhile TE-100 (in another napkin) calls `nap done`.
      * see: TE-100's dot changes from green pulsing to blue filled on its card in the sidebar. No interruption to your current terminal view.
      * so that: you see state changes peripherally — the sidebar is a live dashboard

  * scroll lock

    * do: scroll up in a terminal while an agent is actively writing
      * see: bottom border turns dim amber — "read mode". Terminal stops auto-scrolling so you can read.
      * //A: scroll lock is Cmd+G toggle, not automatic on scroll up. the story is imprecise. also: scroll lock was noted as having edge cases with Claude Code's ink rendering.
      * so that: you can read without output yanking you to the bottom

    * do: scroll back to bottom
      * see: border turns dim blue briefly — "follow mode". Auto-scroll resumes.
      * so that: you know you're back to live output

  * file interactions from sidebar

    * do: hover over a file entry in extended view
      * see: two controls appear — copy-path (clipboard icon) and open-in-editor (arrow icon)
      * so that: you access files without leaving the app

    * do: click copy-path control
      * see: relative path copied to clipboard
      * //A: our model uses absPath — should this copy absolute or relative? the snapshot model has absPath. clarify.
      * so that: you can paste the path in terminal or editor

    * do: click open-in-editor control
      * see: file opens in system default editor
      * so that: one click from sidebar to editing

  * using nap ps for status

    * do: architect runs `nap ps` in terminal
      * see: table showing all sessions — name, PID, status, napkin, role, session UUID, resumable flag. Tree structure showing parent-child relationships.
      * //A: tree ps is implemented in 1600. verify it works with real data.
      * so that: the single pane of glass — all agents, all states, one command

  * peeking at agents

    * do: architect runs `nap peek FS-210`
      * see: app's terminal switches to FS-210's session, focusing that agent
      * so that: architect can show you a specific agent's output from their terminal

  * reading agent output

    * do: architect runs `nap log FS-210`
      * see: full terminal scrollback dumped to stdout — the architect can read an agent's output without switching terminals
      * so that: the architect can monitor agents without UI context switches

  * waiting for agents

    * do: architect runs `nap nap TE-100` (waits for agent to finish)
      * see: command blocks until TE-100 calls `nap done`. Returns with exit code 0.
      * //A: FIXED: removed "prints the done message" — we decided no done messages
      * so that: the architect can sequence work — "wait for tests, then launch the next thing"

  * killing stuck agents

    * do: architect runs `nap kill FS-200`
      * see: agent's process killed. Dot changes to gray hollow (exited) in sidebar.
      * so that: stuck agents can be stopped without closing the app

    * do: architect runs `nap close FS-200`
      * see: agent killed and removed from session list
      * so that: dead sessions can be cleaned up

  * missing stories
    * //A: agent crashes unexpectedly (not nap done, not app close, not nap kill) — what does user see? dot turns gray? can they resume?
    * //A: nap ls — we designed it but it's not here. if we build it, it's a core interaction.
    * //A: what happens when you run `nap open .` and there's already an instance running? (currently: "nap is already running in this project")
    * //A: what happens when `nap init` is run in a dir that already has `.nap/`? (currently: error "already initialized")
