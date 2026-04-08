* 0710 — nap3 doctor
  * standalone diagnostic: no socket, no running app, no project layout required
  * spawns claude in current terminal with a combined prompt
  * claude explores .nap/, compares against conventions, reports findings

* how it works
  * `nap3 doctor` in any directory
  * CLI finds .nap/ by walking up (same as nap3 open)
  * CLI finds the nap repo (same resolution as nap3 dev — walk up from __dirname to package root)
  * reads two files at runtime from the repo:
    * `src/templates/00-org/50-internals.md` — the full system anatomy
    * `src/templates/doctor/diagnostic.md` — the diagnostic process + report format
  * concatenates: diagnostic framing + internals + diagnostic phases
  * spawns: `claude --verbose "<combined-prompt>"` in the current terminal (not detached)
  * no build step, no embedding — reads the source files directly
  * works on broken projects because the knowledge comes from the nap repo, not the project

* the two source files
  * `50-internals.md` — filesystem layout, marker anatomy, lifecycle, CLI reference, failure patterns
    * maintained as a shared doc — also available to agents as optional reading
    * single source of truth: update once, doctor gets it automatically
  * `diagnostic.md` — doctor-specific: who you are, 7-phase diagnostic process, report format
    * unique to the doctor — the framing and the checklist

* implementation
  * add `doctor` case to CLI switch in nap.ts
  * resolve nap repo root (same as dev command)
  * read both files with fs.readFileSync
  * combine: diagnostic.md preamble + "\n---\n## System anatomy\n\n" + internals.md content + "\n---\n" + diagnostic.md phases
  * find project root (walk up for .nap/), pass as --cwd
  * spawn claude not detached — runs in current terminal, user sees output live
  * optional: `--fix` flag to auto-fix simple issues (missing markers, gitignore)
    * only after diagnosis, with confirmation

* testing
  * small: verify both files are resolvable from CLI, prompt concatenation works
  * medium: create a broken test project (missing markers, wrong structure), run nap3 doctor, verify claude produces a report mentioning the issues

* done criteria
  * `nap3 doctor` runs on a healthy project → clean bill of health
  * `nap3 doctor` runs on a broken project → specific findings
  * works without nap3 open, without socket, without any running app
  * prompt assembled at runtime from two source files (no build step)
  * when 50-internals.md is updated, doctor automatically gets the new knowledge
