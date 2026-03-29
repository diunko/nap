# Direction for nepic 03

The human is back after a week away. They want a fresh take — same vision, different approach. Less rigid, more flexible, simpler.

## What the human said

> "I would frame it a little bit differently. Maybe less rigid, maybe more flexible, maybe simpler in a way."

> "The whole thing kinda falls apart on every user journey."

> "I'd rather spend my time on actually using the app and reporting more subtle bugs, not when each flow doesn't work on every step."

## The state of things

The code is there — 16 napkins implemented, 232 medium + 140 small tests pass. But the user journeys don't work end-to-end. The individual components were built and tested in isolation. The wiring between them falls apart.

## What you own

You own this nepic. The previous work is reference — the code, the design, the lessons. But the decisions are yours and the human's. Maybe the approach is: fix the journeys one by one. Maybe it's: simplify the architecture. Maybe it's: throw out some of the complexity and ship something smaller that actually works.

The human will tell you what they want. Start by exploring the codebase, understanding what's there, and brainstorming with them using /napkin.

## Reference materials

Everything from nepic 02 is in `.nap/nepics/02-nepic-spaces/`:
- `10-docs/01-inputs.nap.md` — the mega napkin
- `20-architects/001-architect/scratch/` — all design iterations (milestones, persistence model, technical journeys, agent lifecycle)
- `20-architects/001-architect/stories/` — designer journeys + PM stories with architect review
- `30-napkins/0100-design-sprint/` — design sprint with HTML mocks and screenshots
- `30-napkins/0100-design-sprint/agents/003-ux-design-review/screenshots/` — the visual reference

The workflow docs in `.nap/00-org/` are current and accurate.
