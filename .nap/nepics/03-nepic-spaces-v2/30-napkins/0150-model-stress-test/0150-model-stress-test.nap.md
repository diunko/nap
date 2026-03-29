* 0150 — model stress test: prove the hard stuff
  * push the model with everything that broke v2
  * all tested on the model layer with fakes — no Electron needed
  * this + 0100 = the full POC. go/no-go after both land.

* async interface
  * 0100 model is sync — good enough for "load once"
  * real app needs async: filesystem I/O, watcher callbacks, potential network
  * migrate FileSystemReader to async (Promise-based)
  * model methods become async
  * MemoryFileSystem stays trivial — returns resolved promises
  * prove: async doesn't break testability. tests stay fast, fakes stay simple.

* filesystem watching
  * model reacts to live changes: agent writes file → model updates → onChange fires
  * add watch() to FileSystem interface: watch(dir, callback) → unsubscribe
  * FakeFileSystem gets a simulated watch: test code triggers "file changed" events manually
  * prove: watcher integration is testable with fakes
  * prove: debounce works (rapid changes → one model update, not 10)
  * v2's napkin-watcher.ts is reference — study it, but the model approach is different
    * v2 watched for file content; v3 watches for marker file changes

* write-back
  * model writes marker files: agent created → .agent.nap.json written
  * model writes napkin status: status change → .napkin.nap.json updated
  * add write methods to FileSystem interface: writeJSON(path, data)
  * the write-then-watch loop: model writes marker → watcher fires → must NOT re-process own writes
    * solution: model knows it just wrote, ignores the echo
    * or: watcher filters by source
  * prove: write + watch doesn't loop
  * prove: writes are testable — FakeFileSystem records writes, test asserts on them

* the full lifecycle on the model
  * s→r: loadFromFilesystem (async) → model populated → onChange fires
  * runtime: agent created → marker written → model updated → onChange fires
  * runtime: agent exits → marker updated (exited: true) → model updated
  * runtime: napkin status changes → marker updated → model updated
  * r→s: save UI state → done (ephemeral dies, markers already on disk)
  * s→r again: loadFromFilesystem → same state as before r→s (minus ephemeral)
  * prove: the full cycle works on the model with fakes

* journey tests (vitest, no Electron)
  * journey: load → create agent → marker written → model shows new agent
  * journey: load → agent exits → marker updated → model shows exited flag
  * journey: load → status change → marker updated → model reflects new status
  * journey: load → create agent → save UI state → reload from markers → same agents present
  * journey: rapid writes → debounce → single model update
  * journey: write-then-watch → no feedback loop

* medium tests — same scenarios through real Electron IPC
  * prove: small tests and medium tests give equivalent results
  * the same journey, tested both ways, same assertions
    * small: model + FakeFileSystem + FakeBridge → assert model state + store state
    * medium: real Electron + real fs + real IPC → assert renderer store state
  * medium: create agent → marker written on real disk → model updates → renderer shows new dot
  * medium: agent exits → marker updated → renderer shows exited state
  * medium: status change → marker updated → renderer reflects new status
  * medium: load → quit → reopen → renderer shows same state as before quit
  * this establishes the testing pattern for all future napkins:
    * business logic, user journeys → small tests on model with fakes (fast, many)
    * process boundary verification → medium tests in Electron (few, targeted)
    * future agents focus on small tests; only add medium when testing the IPC seam

* what's NOT in 0150
  * real ptys — model has the interface, we use fakes
  * CLI integration — 0300
  * UI changes — 0400

* done criteria
  * FileSystemReader is async (Promise-based), all 0100 tests still pass
  * watch() works with FakeFileSystem — test code triggers changes, model reacts
  * writeJSON() works — model writes markers, FakeFileSystem records them
  * write-then-watch doesn't loop
  * all lifecycle journey tests pass in vitest (small)
  * equivalent journey tests pass in Playwright (medium)
  * small and medium tests assert the same things — proving both approaches are equivalent
  * the full cycle (load → mutate → save → reload) preserves state in both layers
