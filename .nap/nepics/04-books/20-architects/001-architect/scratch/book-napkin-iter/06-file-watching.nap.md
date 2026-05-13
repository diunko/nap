# file watching

* the problem
  * user edits file in content pane
  * agent edits same file via nap3 poke → CC writes to disk
    * // yeah, that's why we often save baseline to git
    * // and agent turn ends up as non-staged edits
    * // that we can get through git diff and show in monaco
  * monaco needs to show both edits without losing cursor

* watch mechanism
  * fs.watch on open files (node side, nap.app already has file watchers?)
  * on change: read file, update monaco model
  * debounce: 200-500ms (agent might write multiple times rapidly)

* cursor preservation
  * if change is BELOW cursor → no problem, cursor stays
  * if change is ABOVE cursor → cursor line shifts
  * if change is AT cursor → conflict
  * simple approach: save cursor offset from start of file
    * after update, find nearest matching line, place cursor
  * good enough — this isn't collaborative editing, it's turn-based
    * // yes, exactly!
    * // idk, maybe cursor just gone
      * // scroll-y is prob more important, but def not P0 atm

* conflict between user edit and agent edit
  * rare — user types //, hits cmd-enter, waits for agent
    * // right, also git commit
      * // some simple way umm to
        * // like, it auto-saves; and cmd-s actually amends latest "working" commit
        * // or, like distinguishing when last commit is "closed"
          * // (and should keep it and create new working commit rather than overwriting)
    * // if user edits, and file changes on disk, it's standard code editor situation
      * // smth like: reload file?
  * while waiting, user shouldn't edit the same region
  * no locking needed — just "last write wins"
  * if user types while agent is responding → agent's next write includes user's changes
    * because agent reads the file fresh before responding

* what triggers a re-render
  * file content changed on disk → update monaco model
    * // this should be standard for electron app + monaco
      * // bacisally follow vscode patterns
  * monaco model change → update token styling (automatic)
  * new // comments appear with correct prefix colors (automatic via tokenizer)

* file creation
  * agent creates a new file (e.g. response.md)
  * nav tree should update
  * but don't auto-open — let user click to open
  * exception: if user is watching that agent's output → auto-open?
