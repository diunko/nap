* 0620 — archived agents

* agent did work (prompt.md, response.md) but session is lost
  * can't resume — click shows empty terminal
  * work is in files, nobody owns it

* archived = new marker flag
  * distinct from exited: exited = session exists, agent stopped. archived = session gone, files remain.
  * skip on auto-resume — don't try --resume on dead sessions

* click archived agent → successor spawns
  * fresh Claude with generated prompt: "you own this now, read prompt.md + response.md, explore the code"
  * once started: archived clears, new UUID, regular agent from here

* nap3 import-agents <nepic-dir>
  * scans for agent dirs with prompt.md but no marker
  * creates markers with archived: true
  * how you bring a manual-workflow project into NAP

* dot style: role color + dashed border, no checkmark, no fill
  * label: "archived"
