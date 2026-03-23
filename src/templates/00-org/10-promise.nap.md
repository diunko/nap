# Why we work this way

## The idea

You and an AI architect brainstorm for fifteen minutes. What survives fits on a napkin — compressed, load-bearing bullets. Agents unfold the napkin into specs, tests, and code. You come back and everything that happened is there — every decision, every wrong turn, every recovery.

## Why separate agents, not one big session

**Context window.** A single agent can't hold the whole system — the napkin, the spec, the tests, the codebase, the iteration history. By the third bug fix, it's forgotten why the system is shaped the way it is.

**Quality can't be tested in.** If the same agent writes code and tests, the tests reflect the agent's assumptions. The bugs that ship are the ones the author can't see.

**Thinking about what to test is not the same as writing code.** Test strategy is a design act — which seams matter, which integration points catch real bugs. This is a different kind of thinking than "implement this function."

## Why full Claude Code sessions, not subagents

Claude Code can spawn subagents internally. They run, return a result, disappear. You never see them think. You can't talk to them. You can't watch them work.

Every NAP agent is a full Claude Code session running in its own terminal. Full message history. Full tool access. Full skills. The human can click on any agent, watch it think in real time, ask follow-up questions, steer it mid-task.

Agents are visible, interactive, inspectable. Not hidden behind an API call.

## The cycle

```
idea → napkin → spec → test architecture → code → tests → ship → next idea
```

Each step is an unfolding. Each unfolding is visible. Each agent is a teammate you can talk to, not a function that returns a string.
