# research questions

* just-bash
  * does it define its own filesystem abstraction?
    * if yes, what's the interface? compatible with lightning-fs?
    * if it uses Node `fs`, can we shim it?
  * how to register custom commands?
    * plugin API? fork? monkey-patch?
  * which built-ins work in browser?
    * ls, cat, cd, echo, mkdir, rm, cp, mv — which ones?
    * does piping work? redirection (>, >>)?
  * maintenance status
    * last commit date
    * npm downloads
    * open issues / PRs
    * is this a real project or a Vercel experiment?

* wterm
  * how to mount in a div?
  * input/output flow — how does keystroke reach the shell, how does output reach the screen?
  * ANSI escape code support (colors, bold, cursor movement)?
  * works in narrow div (~400px wide, fixed height)?
  * how does it connect to just-bash specifically?
    * is there a `@wterm/just-bash` package that wires them?
  * maintenance status (same questions as above)

* lightning-fs + isomorphic-git
  * confirm: `new LightningFS('name')` → pass as `fs` to `git.clone()`
  * CORS situation for git clone from browser
    * `cors.isomorphic-git.org` — public, reliable?
    * GitHub API as alternative transport?
    * do we need our own proxy?
  * performance: how long to clone a small repo (~1MB) into IDB?
  * can lightning-fs be shared between just-bash and Monaco simultaneously?
    * same IDB database, two consumers — any locking issues?

* testing with Playwright
  * can Playwright drive a page that has wterm?
    * wterm is DOM-based (not canvas) — should be queryable
  * how to type into the terminal?
    * simulate keystrokes? or does wterm expose an input API?
  * how to assert terminal output?
    * read DOM text content? or is there a buffer API?
  * can we assert async results (git clone takes time)?
    * wait for specific text to appear in terminal output?
  * proposed test structure for the four stories:
    * Story 1 (clone + ls + cat): type commands, assert output contains expected strings
    * Story 2 (git log): assert commit messages appear
    * Story 3 (edit + status): write file, assert status shows modified
    * Story 4 (commit + log): commit, assert new entry in log

* bundle size
  * all four libraries combined — rough estimate?
  * acceptable for Chrome extension? (extensions routinely ship 5-10MB)

* integration shape
  * what does the wiring code look like?
  * how many lines to connect all four?
  * any global state or singletons that would conflict with Monaco?
