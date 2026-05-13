# markdown styling in monaco

* the goal
  * napkin format readable as-is in monospace
  * but styled inline — not rendered to HTML, still editable text
  * like a code editor that understands markdown semantics

* token-level styling (monaco tokenizer)
  * `# heading` → bold, larger or brighter color
  * `## subheading` → bold, slightly less prominent
  * `* bullet` → the `*` gets a subtle color, content stays default
  * `**bold**` → bold (keep the `**` markers visible but dimmed)
  * `` `code` `` → monospace background tint (like GH inline code)
  * `[link text](url)` → link-colored, clickable
  * `→` arrows → accent color
  * indentation guides → subtle vertical lines (like code indent guides)

* napkin-specific prefix styling
  * `//` comment → distinct color (e.g. muted gray-blue)
  * `//A:` architect → color-coded to role (e.g. blue, matching agent badge)
  * `//DU:` Dima → different color (e.g. green)
  * `//FS:` fs-eng → another color
  * `//TA:` test-arch → another color
  * prefix token is colored, rest of line inherits
  * the prefix doubles as: visual indicator + routing hint (see 05)
    * //DU: something something teseting bla

* file:line link detection
  * pattern: path ending in `:NNN` or `#LNNN` or standard markdown link with path
  * styled as clickable link (underline, link color)
  * click → opens in code pane (see 04)
  * hover → maybe preview first few lines? (later)

* what stays raw
  * `*` bullet markers visible (not replaced with •)
  * `**` bold markers visible (dimmed, not hidden)
  * indentation is literal spaces (not collapsed)
  * the file IS the source of truth — what you see is what's on disk

* implementation approach
  * custom monarch tokenizer for "napkin-markdown" language
  * extend monaco's built-in markdown mode
  * add token rules for //, //A:, //DU:, file:line patterns
  * map tokens to theme colors
  * relatively straightforward — monarch is declarative regex
