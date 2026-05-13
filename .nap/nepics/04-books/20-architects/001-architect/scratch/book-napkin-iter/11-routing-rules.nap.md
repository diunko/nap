# routing rules — cmd-enter → which agent

* the problem
  * user hits cmd-enter in a file
  * which agent gets poked?
  * needs to be obvious, configurable, easy to tweak

* inputs available
  * file path (which dir, which napkin, which agent)
  * cursor line content (which // prefix)
  * current file's napkin context (from .napkin.nap.json walking up)
  * running agents (from nap3 ps)
  * last-poked agent (session state)

* outputs
  * agent name (for nap3 poke)
  * message to send (file path + context)

* routing strategy (ordered, first match wins)
  * 1. explicit prefix on current line
    * //FS: → find running fs-eng in this napkin
    * //A: → architect
    * //TA: → test-arch in this napkin
  * 2. file location
    * inside agents/001-fs-eng-foo/ → 001-fs-eng-foo
    * inside agents/002-test-eng-bar/ → 002-test-eng-bar
  * 3. napkin context
    * file is a napkin doc (0100-test-infra.nap.md)
    * → architect (napkins are architect's domain)
  * 4. fallback
    * last-poked agent
    * or: show a picker

* the rules file
  * .nap/routing.yaml? or .nap/00-org/routing.md?
  * should be human-readable, not code
  * something like:
    * prefix //FS → role fs-eng, scope napkin
    * prefix //A → name architect
    * path agents/* → agent from dir name
    * fallback → last-poked or picker
  * easy to modify — the whole point is trying out what works
  * can start as hardcoded logic, extract to config when patterns settle

* status bar indicator
  * bottom of content pane: "→ 001-fs-eng-research" (current target)
  * click to change
  * updates when you move cursor to a line with different prefix
  * or stays fixed until you explicitly change it

* what gets sent
  * nap3 poke <agent> "read <filepath> and respond to // comments"
  * agent sees full file, finds new // comments, responds with //ROLE: inline
  * simple, file-based, no special protocol
