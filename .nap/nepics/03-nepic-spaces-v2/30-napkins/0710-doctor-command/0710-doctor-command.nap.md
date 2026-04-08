* 0710 — nap3 doctor
  * standalone diagnostic: no socket, no running app, no project layout required
  * spawns claude in current terminal with baked-in prompt
  * claude explores .nap/, compares against conventions, reports findings

* how it works
  * `nap3 doctor` in any directory
  * CLI finds .nap/ by walking up (same as nap3 open)
  * spawns: `claude --verbose "<doctor-prompt>"` in the current terminal (not detached)
  * the prompt is baked into the CLI binary — read from templates/doctor/prompt.md at build time
  * no socket needed, no app running, works on broken projects
  * claude explores, diagnoses, reports. user reads the report in their terminal.

* the prompt
  * already written: packages/v3/src/templates/doctor/prompt.md
  * contains: full project structure conventions, marker file formats, naming rules
  * contains: diagnostic checklist (critical / warning / info)
  * contains: report format
  * completely self-contained — references no external files

* build integration
  * the doctor prompt must be embedded in the CLI binary
  * at build time: read templates/doctor/prompt.md, embed as string in nap.ts
  * or: copy to out/ alongside CLI, resolve at runtime via __dirname
  * same pattern as how templates/ are handled for nap3 init

* implementation
  * add `doctor` case to CLI switch in nap.ts
  * find project root (walk up for .nap/)
  * spawn claude with the baked-in prompt + `--cwd <project-root>`
  * not detached — runs in current terminal, user sees output live
  * optional: `--fix` flag to auto-fix simple issues (missing markers, gitignore)
    * only after diagnosis, with confirmation

* testing
  * small: verify prompt is embedded/resolvable, CLI parses doctor command
  * medium: create a broken test project (missing markers, wrong structure), run nap3 doctor, verify claude produces a report mentioning the issues

* done criteria
  * `nap3 doctor` runs on a healthy project → clean bill of health
  * `nap3 doctor` runs on a broken project → specific findings
  * works without nap3 open, without socket, without any running app
  * prompt is self-contained and baked into the binary
