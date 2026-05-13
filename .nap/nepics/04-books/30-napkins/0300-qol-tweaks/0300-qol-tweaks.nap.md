# 0300 — quality of life tweaks

* tab size
  * set `tabSize: 2`, `insertSpaces: true` in napkin-markdown editor config
  * one-liner in ContentPane.tsx

* terminal link routing
  * today: terminal file links → shell.openPath → OS editor
  * fix: route through `routeLink()` instead
    * .nap/ path → left pane
    * code path → right pane (with :line → scroll to line)
  * swap `onOpen` callback in file-link-provider registration

* theme system
  * `src/renderer/themes.ts` — all theme definitions
    * each ThemeDef: Monaco theme + app shell CSS variables + role color map
    * 4 light + 1 dark to start
      * light-cream (warm, paper-like)
      * light-gray (cool, neutral)
      * light-sepia (e-reader feel)
      * light-blue (cool, slight blue tint)
      * dark (current)
    * exported as `const THEMES: ThemeDef[]`
    * user comments out unwanted themes — array shrinks
  * Cmd+T rotates through THEMES array
  * applies to whole window: both Monaco instances + sidebar + breadcrumbs + tab bar + gutter
  * persist by theme name in ui-state.json
    * saved theme not in array → fall back to first

* terminal tab refactor
  * single permanent terminal slot in right pane
    * always leftmost tab, position 0
    * can't pin, can't close, can't accumulate
    * title shows agent name (not UUID)
  * clicking agent [terminal] entries swaps what the slot shows
  * viewport into active agent, not a tab per agent
  * file tabs in right pane are separate, work as before

* git gutter bug fixes
  * bug: decorations don't refresh on app reopen or external file changes
    * cause: git-diff only re-requested on auto-save path, not on external change
    * cause: race on file open — diff response arrives after model swap
  * fix: re-request `file:git-diff` on every model update
    * content change from disk (external)
    * after auto-save
    * 200ms delay after model update (let git see new content)
  * add: `editor.onDidFocusEditorText` → request fresh git diff
    * catches stale decorations when switching tabs back

* rendered mode (Cmd+Shift+H)
  * global toggle for left pane: `leftPaneRenderMode: 'edit' | 'rendered'`
    * all tabs share the mode
    * toggle applies instantly to active tab
    * switching tabs keeps the mode
  * rendered view
    * parse markdown → HTML via markdown-it
    * tables render as actual tables
    * links render as styled anchors (click → routeLink, same as edit mode)
    * headers render with proper sizing
    * `---` renders as horizontal rule
    * role comments (//A:, //DU:, etc) → colored blocks
      * custom markdown-it plugin or regex post-process on HTML
  * read-only — no editing in rendered mode
  * Cmd+click on rendered element → switch to edit mode at source line
    * markdown-it token `map` property → `data-source-line` on each block element
    * Cmd+click handler: walk up DOM to nearest `[data-source-line]`
    * switch to Monaco, setPosition at that line, focus
  * no scroll sync needed — user navigates via Cmd+click

* tokenizer tweak
  * `//` with no role prefix → same color as `//DU:`
  * currently: generic `//` is muted gray-blue, `//DU:` is green
  * fix: change `comment` token color to match `comment.user` in theme

* not in scope
  * cmd-enter (agent interaction)
  * git commit integration
  * ProseMirror/Milkdown replacement (maybe later)
