# 0500 — stories (definition of done)

## Story 1: Clone a repo from the terminal

Open the POC in Chrome. Type `git clone https://github.com/<small-public-repo>`. The terminal shows clone progress. When done, type `ls` — the repo directory appears. `cd` into it, `ls` again — files are there. `cat README.md` prints the content.

All of this is happening in IDB. No server. No Node.

## Story 2: Inspect git history

After cloning, type `git log --oneline`. Commit hashes and messages print to the terminal. The output is readable — proper formatting, maybe colors for the hash.

## Story 3: Edit and see status

`echo "hello" >> README.md` (or however just-bash handles redirection). Then `git status`. The terminal shows `README.md` as modified. `git diff` shows the change.

## Story 4: Commit locally

`git add .` then `git commit -m "test commit"`. `git log --oneline` now shows the new commit at the top. The commit lives in IDB — no push, but the local repo state is correct.
