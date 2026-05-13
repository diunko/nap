# 0310 — git diff uses wrong cwd for separate .nap repo

* the bug
  * some projects use .nap/ as a separate git repo (.nap has its own .git/)
  * parent project has .nap in .gitignore
  * git gutter runs `git diff` with `cwd: projectCwd` (parent repo)
  * parent git doesn't know about .nap files → diff returns nothing or all-untracked

* the fix
  * run `git -C <dirname(filePath)> diff -- <filePath>`
  * git walks up from dirname to find nearest .git/
  * .nap files → finds .nap/.git/
  * code files → finds project/.git/
  * both just work, no conditional logic needed

* scope
  * change cwd in `file:git-diff` IPC handler (main.ts)
  * same change for `git ls-files` check
  * affects: `execFile('git', [...], { cwd: ... })`
