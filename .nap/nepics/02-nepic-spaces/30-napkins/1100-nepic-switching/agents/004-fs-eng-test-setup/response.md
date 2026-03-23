## Test project created at `~/dvl/aibanana/test-nap/`

Theme: **BiteBridge** — a food delivery platform.

### Structure

**01-foundation** (completed nepic — v1 core):
- 5 napkins: auth-system, restaurant-onboarding, menu-management, order-pipeline, payment-integration
- Board: 3 done, 1 review, 1 doing
- Agents: test-arch + fs-eng on most napkins, one with test-eng too

**02-next-phase** (active nepic — delivery & growth):
- 8 napkins: real-time-tracking, driver-matching, push-notifications, rating-system, search-filters, promo-engine, analytics-dashboard, multi-location
- Board: 1 backlog, 1 todo, 2 doing, 2 review, 2 done
- Agents: test-arch + fs-eng on the active napkins, full pipeline (3 agents) on completed ones
- Architect prompt at `20-architects/001-architect/prompt.md`

### Details
- All board symlinks use `../../30-napkins/NNNN-feature` relative paths
- Every napkin has a `.nap.md` with 3-5 realistic top-level bullets
- Agent dirs have prompt.md/response.md where appropriate (done agents have both, in-progress have prompt only)
- git repo initialized
- No files modified in the nap source repo
