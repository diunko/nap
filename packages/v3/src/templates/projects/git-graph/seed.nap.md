* git-graph — 3D git history visualizer: mega napkin

* what this is
  * point it at a git repo, see its history as a 3D force-directed graph
  * commits are nodes, parent links are edges, branches are colors
  * fly through the graph — zoom into a cluster of activity, see who worked on what
  * the fun: every repo tells a different story — see your project's shape

* why it's interesting
  * git history is a DAG — perfect for graph visualization
  * the shape of a repo says a lot: trunk-based = spine, feature-branch = fractal
  * merge commits create dramatic convergence points
  * time adds a dimension: history has depth, not just breadth
  * practical: actually useful for understanding unfamiliar codebases

* tech stack
  * React + TypeScript
  * Three.js for 3D rendering (force-directed layout in 3D space)
  * isomorphic-git or simple shell exec for reading git data
  * d3-force-3d for the force simulation (or hand-rolled)
  * Vite for build


* nepic 01 — v1: core graph

  * napkin 0010 — git parser + force-directed layout
    * what: read git log, build graph, lay it out in 3D
    * git data extraction
      * parse git log: hash, parent hashes, author, date, message, branch refs
      * build adjacency list: each commit → parent commits
      * detect branch tips and merge commits
      * handle repos with 100-10000 commits (cap with depth limit for huge repos)
    * force-directed layout
      * each commit = node with position in 3D space
      * forces
        * link force: parent-child edges attract (spring)
        * charge force: nodes repel (avoid overlap)
        * time force: newer commits pushed in one direction (z-axis as time)
        * branch force: same-branch commits cluster on a lane
      * simulation: iterate until layout stabilizes, then freeze
      * layout should feel organic but readable — not a random cloud
    * rendering
      * nodes: small spheres (instanced mesh)
      * edges: lines connecting parent-child (THREE.LineSegments)
      * node size: uniform for now (v2 adds sizing)
      * node color: by branch (main=blue, feature branches=generated palette)
      * merge commits: slightly larger, draw edges to all parents
    * camera
      * orbit controls
      * zoom to fit: frame entire graph
      * click node: zoom to it, show tooltip

  * napkin 0020 — branch visualization + commit details
    * what: branches as colored streams, rich commit info on hover/click
    * branch coloring
      * each branch ref gets a distinct color (auto-generated palette)
      * commits colored by the branch they "belong to" (first-parent traversal)
      * merge commits: show multiple colors or a special merge color
      * branch labels: floating text at branch tips
    * commit details panel
      * click a node → side panel shows:
        * hash (short), author, date
        * commit message (full)
        * files changed (stat summary)
        * parent links (clickable → navigate to parent)
      * hover: tooltip with hash + first line of message
    * visual enhancements
      * edges: curved lines following branch lanes (not just straight)
      * HEAD marker: special glow on current HEAD
      * tag markers: diamond shapes at tagged commits
    * search: type to filter commits by message/author — matching nodes glow
    * stats bar: total commits, branch count, contributor count, time span

  * napkin 0030 — repo input + navigation
    * what: load any repo, navigate the graph intuitively
    * repo input
      * text field: paste path to local git repo
      * drag & drop: drop a folder
      * URL: clone from GitHub (isomorphic-git) — limited to small repos
      * demo repos: built-in buttons for sample repos (bundled git data)
    * navigation
      * minimap: 2D overview in corner, click to teleport
      * branch picker: dropdown to focus on one branch
      * time range filter: slider to show commits from date range only
      * "follow main" mode: camera tracks the main branch linearly
    * performance
      * for large repos (>1000 commits): LOD — distant nodes as dots
      * progressive loading: show first 100 commits immediately, add more
      * frame budget: maintain 60fps even at 5000 nodes


* nepic 02 — v2: time travel + diffs

  * napkin 0040 — time-travel slider
    * what: scrub through history, watch the repo grow
    * time slider: horizontal bar mapped to commit dates
    * as you scrub right:
      * nodes appear in chronological order
      * edges animate in
      * branches sprout from their fork points
      * merge commits pull branches together
    * play mode: auto-advance through time at adjustable speed
    * the visual narrative: watch a project go from first commit to today
    * milestone markers: tags and major merges highlighted on the timeline
    * activity heatmap: bar chart under the slider showing commits/week

  * napkin 0050 — diff viewer + file impact
    * what: see what changed in each commit, visualize file impact
    * diff panel
      * click a commit → show unified diff (syntax highlighted)
      * file tree: changed files in a collapsible tree
      * additions in green, deletions in red (standard)
    * file impact visualization
      * node size by: lines changed, files changed, or insertions
      * "big commits" stand out as large nodes
      * file heatmap: which files are changed most often (treemap view)
    * contributor view
      * color nodes by author instead of branch
      * see who works on what parts of the code
      * contributor legend with commit counts
    * blame threads: click a file → see all commits that touched it, connected by thread

  * napkin 0060 — comparison + collaboration view
    * what: compare branches, see team dynamics
    * branch comparison
      * select two branches → highlight divergence point
      * show commits unique to each branch
      * merge preview: simulate merge, show what would connect
    * collaboration graph
      * switch from commit graph to author graph
      * authors as large nodes, edges between authors who touch same files
      * edge weight by co-modification frequency
      * reveals team structure from code
    * PR view
      * if GitHub repo: overlay PR boundaries
      * each PR as a colored region enclosing its commits
      * PR status: merged (green region), open (blue region)
    * export
      * screenshot (PNG)
      * graph data (JSON)
      * embed: iframe-friendly URL for READMEs
