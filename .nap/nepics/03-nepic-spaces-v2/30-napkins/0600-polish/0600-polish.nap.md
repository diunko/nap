* 0600 — polish: things to fix
  * living doc — add items as they come up during use
  * consolidate, prioritize, then launch agents

* debug panel default closed
  * problem: flickers open briefly on app launch even when saved state says collapsed
  * default to closed for all users
  * preserve state after first toggle (if user opens it, remember that)
  * fix: render collapsed initially, expand only after state load confirms it should be open

* kanban: three columns, not five
  * problem: five columns (backlog/todo/doing/review/done) is too much visual noise
  * internal statuses stay as-is — don't change the model
  * kanban groups them into three:
    * backlog = backlog + todo
    * doing = doing + review
    * done = done
  * simpler to scan, same information

* medium tests: headless by default
  * problem: test windows blink rapidly during `npm run test:v3:medium` — distracting, not useful
  * v3 main.ts missing `show: false` on BrowserWindow — always shows window
  * v2 has the fix: `show: false` + `win.once('ready-to-show', () => { if (!NAP_TEST || HEADED) win.show() })`
  * fix: copy v2 pattern. default headless. `HEADED=1` env var to show windows for debugging.
  * add `test:v3:medium:headed` script to package.json

* nap3 rename napkin <old-slug> <new-slug>
  * problem: typos in napkin names (e.g. voice transcription: "nodes" → "notes") can't be fixed
  * napkin created through CLI, dir name is the identity, no way to rename
  * fix: `nap3 rename napkin 0200-notes 0200-nodes`
    * socket → model renames dir on disk
    * updates .napkin.nap.json if it references the slug
    * updates all agent markers that reference this napkin
    * pushes new snapshot → sidebar reflects new name
  * just the CLI command — no UI needed for now
