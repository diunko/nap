# gitlab support — stories

## GL1: clone from GitLab

* link: `github.com/diunko/nap-test-main/pull/1#nap-repo=gitlab/dmitry.unkovsky/nap-test-nap&napkin=01-v1/0100-delivery-pipeline`
* reviewer opens panel → settings → enters GitLab PAT → save
* panel auto-clones from gitlab.grammarly.io (not github.com)
* nav populates with space-pizza content
* chapters load in editor, napkin-markdown styled
* file:line links navigate to GitHub (diunko/nap-test-main) — the code repo

## GL2: GitLab token persists

* enter GitLab PAT once
* close panel, reopen
* token restored from storage — clone works without re-entering
* GitHub token and GitLab token are independent — changing one doesn't affect the other

## GL3: two repos, two providers

* reviewer has .nap on GitLab (grammarly internal), code on GitHub (open source)
* link specifies `nap-repo=gitlab/...`
* clone uses GitLab PAT, file:line links use GitHub (no auth needed for public repo)
* the two auth contexts don't interfere

## GL4: wrong or missing GitLab token

* link specifies `nap-repo=gitlab/...`
* reviewer opens panel without entering GitLab PAT
* clone fails (401 from GitLab)
* terminal shows error, notification suggests entering a GitLab token in settings
* reviewer enters token, clone retry works

## GL5: return visit from GitLab clone

* previously cloned from GitLab, session in IDB
* reopen panel → IDB has the repo, nav populates instantly
* no re-clone, no network call
* fetch latest still works (uses stored GitLab token)

## GL6: fixture sync script

* run `./fixtures/sync-gitlab.sh`
* script reads GITLAB_API_TOKEN from .env
* pushes .nap fixture content to gitlab.grammarly.io/dmitry.unkovsky/nap-test-nap
* the GitLab repo now has the same content as the GitHub fixture repo
* Playwright tests can clone from GitLab using this fixture
