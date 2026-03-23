* session resume fix — everything resumes by default

* the bug
  * on clean quit: all ptys killed → onExit fires → all sessions marked 'exited'
  * on next launch: resume code looks for 'running' → finds nothing → bare shell
  * resume was designed and tested against a state that never happens in practice

* the mental model (new)
  * default: everything resumes
  * the ONLY sessions that don't resume: ones where the agent exited BY ITSELF while the app was running normally
  * agent calls `nap done` → status 'done', pty still alive → resumes on next launch
  * agent process exits on its own (any exit code) while app running → 'exited' → NOT resumed
  * app closes → don't touch any statuses — leave everything as-is
  * next launch → resume everything that isn't 'exited'

* the fix
  * add `appIsClosing` flag in main process
  * set flag to true in `window-all-closed` before killing ptys
  * onExit handler: if appIsClosing → skip status update (leave as-is)
  * onExit handler: if NOT appIsClosing → mark 'exited' (agent died on its own)
  * on next launch: resume all sessions where status != 'exited'
    * 'running' → resume (was running when app closed)
    * 'done' → resume (agent finished but session is still there)
    * 'new' → resume (freshly created, never started)
    * 'exited' → don't resume (agent died on its own)

* what changes
  * `src/main/main.ts`
    * appIsClosing flag
    * onExit handler checks flag
    * window-all-closed sets flag before killAllPtys
  * `src/main/session-store.ts`
    * getArchitectForNepic → query status != 'exited' (not just 'running')
    * or: new function for "resumable sessions"
  * auto-resume on launch
    * architect: find most recent with ccSessionUuid where status != 'exited'
    * other agents: show all non-exited sessions as resumable

* this is a mental model change that leaks across multiple files
  * the test architect needs to audit ALL tests that touch session status, pty exit, clean quit, architect resume
  * this is not a one-line fix — it changes the fundamental assumption about what happens on quit
