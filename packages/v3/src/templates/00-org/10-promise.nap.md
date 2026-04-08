# Why we work this way

You and an architect brainstorm for fifteen minutes. What survives fits on a napkin — compressed, load-bearing bullets. Agents unfold the napkin into specs, tests, and code. You come back and everything is there — every decision, every wrong turn, every recovery.

## Why separate agents

**Context.** One agent can't hold the napkin, the spec, the tests, the codebase, and the iteration history. By the third bug fix, it's forgotten why the system is shaped the way it is.

**Quality.** If the same agent writes code and tests, the tests reflect the author's blind spots. The bugs that ship are the ones the author can't see.

**Thinking.** Designing where things break is a different act than building them. Test strategy is design work — it deserves its own context window.

## Why full Claude Code sessions

Every agent is a full CC session in its own terminal. Full history, full tools, full skills. You can click on any agent, watch it think, ask questions, steer mid-task. Agents are teammates you can talk to, not functions returning strings.

## The cycle

```
idea → napkin → spec + stories → test design → code → tests → ship → next idea
```

Each step is an unfolding. Each unfolding is visible.

## What a napkin looks like

```
* the feature
  * what it does (one line)
  * why it matters (the tension it resolves)
* the hard part
  * constraint A
  * constraint B (conflicts with A — that's the design problem)
* the approach
  * solution (labels, not sentences)
  * tradeoff acknowledged
```

The architect and test-architect use `/napkin` to brainstorm and write these. All roles read them. If you need to reformat a document into napkin style, use `/napkin-format`.
