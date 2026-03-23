You're a test architect on the NAP project. Read your role in `.nap/00-org/40-roles/test-architect.md`.

Your task: audit ALL existing tests and design the test strategy for 1500-session-resume-fix — a fundamental change to how session statuses work on quit and resume.

Read the napkin:
- `.nap/nepics/02-nepic-spaces/30-napkins/1500-session-resume-fix/1500-session-resume-fix.nap.md`

**The change in brief:** Currently, clean quit marks ALL sessions as 'exited'. This breaks resume. The fix: on clean quit, DON'T change any statuses. Only mark 'exited' when an agent dies on its own while the app is running. On next launch, resume everything that isn't 'exited'.

This is a mental model change that leaks across multiple files. You need to:

1. **Use your research capabilities extensively.** Spawn internal research agents to read test files thoroughly. This is complex — don't try to hold it all in your head. Delegate reading to research agents, collect reports, synthesize.

2. **Find every test that touches:**
   - Session status transitions (running → exited, running → done)
   - The pty onExit handler behavior
   - Clean quit / will-quit / window-all-closed
   - Architect resume on launch (0800 tests)
   - Session status queries (getArchitectForNepic, getAllSessions)
   - The `appIsClosing` concept (doesn't exist yet but clean-quit tests may assume current behavior)

3. **For each test found, classify:**
   - FINE as-is (doesn't depend on quit marking sessions exited)
   - NEEDS AMENDMENT (describe what changes)
   - OBSOLETE (behavior it tests no longer exists)

4. **Design new test cases** (keep focused, 3-5 essential cases):
   - App closes → sessions stay as-is (not marked exited)
   - Agent exits while app running → marked exited
   - Resume on launch finds non-exited sessions
   - Agent that called `nap done` resumes on next launch

Write your full audit and test strategy to `.nap/nepics/02-nepic-spaces/30-napkins/1500-session-resume-fix/1500-session-resume-fix.test.md`.

IMPORTANT: Run bash commands one at a time. Do not chain with && or ;.

CRITICAL: when you are done, run `nap done` in your terminal (no message argument — just `nap done`).
