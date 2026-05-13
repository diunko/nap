# monaco config

* two instances, same component, different config
  * content pane: markdown mode, custom styling
  * code pane: auto-detect (typescript, json, yaml, etc)

* shared config
  * read-write (both panes are editable)
  * minimap: off (too noisy for this use)
  * line numbers: on for code, off for content (or subtle)
  * word wrap: on for content, off for code
  * font: monospace for both (napkin format is designed for monospace)
  * theme: dark (match nap.app)

* content pane specifics
  * language: custom markdown mode (or extend built-in)
  * custom tokenizer for napkin-format constructs (see 03)
  * no autocomplete (you're writing prose, not code)
  * soft wrap at pane width

* code pane specifics
  * language: auto-detect from file extension
  * read-only by default (you're reading reference code, not editing)
  * go-to-definition: enabled if LSP available, otherwise just display
  * line highlight on navigation (flash the target line)

* tab model
  * each pane manages its own tabs independently
  * tab = { filePath, scrollPosition, cursorPosition }
  * closing last tab → pane stays empty (or collapses)
  * no cross-pane tab dragging (keep it simple)

* file model
  * content pane: files from .nap repo
  * code pane: files from parent repo (coda)
  * monaco models created on demand, cached
  * file watcher updates model when file changes on disk
