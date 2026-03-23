# Wishlist

Each bullet is a "what if." Not a todo. Not a spec. An idea with energy — something that made someone's eyes light up when they said it out loud. If you read this list and don't feel a pull to build at least one of these, we wrote them wrong.

* What if agents had names?
  * Not `001-fs-eng-sqlite` — a *name*
  * You spawn an architect and it's "Ari"
  * Your fullstack eng is "Kit"
  * The test engineer who keeps finding the gnarliest bugs is "Sage"
  * You look at the sidebar and it's a team, not a spreadsheet
  * "Sage found a race condition in the shutdown path" — everyone knows who you mean
  * The role is still there, the feature is still there
    * but now there's a character attached to the work
    * the scrollback of their thinking feels like reading a colleague's notes, not a log file

* What if every agent just... knew how the team works?
  * NAP as workspace, not terminal manager — like Slack, not tmux
  * `nap --help-workflow` — any agent runs it, gets: here's how we communicate, here's the workflow, here's your team
  * `nap poke --name Nova --message "Hey, it's fs-eng-0200, how do I signal that I'm blocked?"` — ask the architect like you'd DM a team lead
  * the role doc says WHO you work with, not just WHAT to do
  * every agent knows: poke, nap, done — the way you know Slack has channels and threads
  * bootstrapping question: how do you take a codebase and bring it into NAP?
    * fresh project? existing repo? mid-flight project with history?
    * what's the minimum setup to go from "code in a folder" to "agents collaborating"
    * scaffolding, onboarding, team structure — all from one command?

* What if spawning an agent was as easy as Claude Code's internal agents?
  * right now: create directory, write prompt.md, `nap start 'claude ... read prompt.md ...'`
    * three manual steps before an agent even exists
    * every agent that wants to launch a sub-agent has to know this dance
  * what if: `nap spawn --napkin 0100 --role fs-eng --name "sqlite-schema"`
    * creates the agent dir in the napkin's `agents/` folder
    * returns the path — caller writes prompt.md there
    * or: takes prompt inline — `nap spawn --prompt "do X, write Y"`
    * auto-wires parent-child via NAP_SESSION_ID
    * agent appears in sidebar immediately, green dot, ready to watch
  * the feel: launching a sub-agent should be as natural as Claude Code spawning an internal agent
    * but visible — full terminal, full session, human can click and talk
  * parent-child tracking already exists (NAP_SESSION_ID)
    * just needs the scaffolding to be automated
  * flat structure in `agents/` dir, parent-child tracked in metadata
    * no nested dirs — all agents are peers in the folder, relationships are data

* What if the architect could approve agent permission requests?
  * right now: agent hits a CC permission prompt → blocks until human clicks the terminal
    * human might be away, asleep, in meetings
    * the whole pipeline stalls on "do you want to run npm test?"
  * a system agent that watches for permission prompts across all agents
    * detects the prompt pattern in pty output
    * evaluates: is this obviously safe? (running tests, reading files, writing to expected paths)
    * if safe → auto-approve
    * if uncertain → escalate to architect or human
      * architect can approve from their own terminal
      * human can approve remotely (mobile, Slack, push notification?)
  * privilege levels
    * agents get a permission profile based on role
    * test engineer: can run tests, read code — auto-approve these
    * fullstack engineer: can write code, run typecheck — auto-approve
    * anything destructive (git push, rm -rf, deploy) → always escalate
  * the feel: agents don't block on obvious permissions
    * like giving your CI pipeline the right credentials
    * you don't approve every `npm install` manually

* What if poke was a real collaboration tool?
  * poke works now (text → Escape → CR) but the workflow around it is raw
  * problem: poked messages arrive as if the human typed them
    * agent can't tell who sent it — human? architect? another agent?
    * stuck messages in input buffer if agent isn't at a prompt
  * need: sender identity — `//003-test-eng: hey, I'm blocked on X`
    * agent sees who's talking, can respond appropriately
  * need: timing — only poke when agent is at a prompt, not mid-output
    * detect prompt state from pty output before poking?
  * need: protocol — when do you poke vs write to a file vs launch a new agent?
    * poke = quick question, real-time, like a DM
    * file = structured handoff, async, like an email
    * new agent = new task, fresh context
  * for now: don't use poke in agent workflows, only done + response.md

* What if claude flags were configurable in one place?
  * right now `--verbose` is hardcoded in multiple spots (nap start prompts, architect resume, orphan resume)
  * easy to forget one — then that agent runs without verbose and you can't see its thinking
  * one config: `.nap/00-org/claude-flags` or a field in nap.db
    * `--verbose --session-id <auto>` as the baseline
    * per-role overrides? architect gets `--verbose`, test-eng gets `--verbose --allowedTools ...`?
  * nap start, nap spawn, architect resume — all read from the same config
  * change once, applies everywhere

* What if "done" agents were still pokeable?
  * right now `nap poke` rejects agents with status=done
  * but the pty is still alive — the CC session is sitting at a prompt
  * "done" means "finished the main task" not "conversation over"
  * you should be able to poke them with follow-up bugs, questions, iterations
  * maybe: poke changes status from done back to running?
  * or: poke works regardless of status, status is just a signal to the architect
  * the agent's CC session has full context — wasting it by locking them out

* What if `nap init` was agentic?
  * right now: scaffolds templates, static files, done
  * what if it read the project first?
    * package.json, README, git history, source structure
    * generated a tailored architect onboarding
    * maybe even a first-pass mega napkin draft
  * the architect starts with understanding, not just templates
  * but: keep it optional — fast static init is the default, agentic is a flag
    * `nap init` — fast, static templates
    * `nap init --smart` — reads project, generates context
