# state persistence

* persist UI state across panel close/reopen
  * Zustand persist middleware → IndexedDB
  * partialize controls what gets saved
  * session key isolates per-PR state

* the hard part
  * hydration timing — store must wait for IDB read before rendering
  * version migration when schema changes
