* setup command — user stories

* story 1: add guardian to existing project
  * i have a running project, agents keep getting stuck on permissions
  * i run `nap3 setup --guardian`
  * guardian agent created, hook configured
  * next time i open the app, guardian starts alongside architect
  * permissions route through guardian — no more clicking through dialogs

* story 2: import a manual-workflow project
  * i have a project where i used napkins and agents manually
  * agent dirs have prompt.md + response.md but no marker files
  * i run `nap3 setup --import`
  * markers created for all napkins and agents
  * i open the app — sidebar shows everything
  * i click an agent → successor flow, fresh Claude reads the original work
  * for the architect: i find the CC session UUID, paste it into the marker
  * restart app → architect resumes with full context

* story 3: add skills to project
  * i want napkin and napkin-format skills available in this project
  * i run `nap3 setup --skills`
  * skills copied to .claude/skills/
  * all agents can now use /napkin and /napkin-format

* story 4: combine multiple setup flags
  * new team member joins, wants the full setup on existing project
  * `nap3 setup --guardian --skills --import`
  * all three things happen in one command

* story 5: run setup twice — idempotent
  * i already ran setup --guardian yesterday
  * i run it again today → no error, no duplicate, no-op
  * guardian marker already exists → skipped
  * hook config already in settings.json → skipped
