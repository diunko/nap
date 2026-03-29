* raft-viz — Raft consensus algorithm visualizer: mega napkin

* what this is
  * browser-based interactive visualization of the Raft consensus protocol
  * nodes on a canvas, messages flying between them, state machines ticking
  * you can partition the network, kill nodes, watch leader election happen
  * pedagogical — makes distributed systems intuition visual and visceral
  * the fun: you're the chaos monkey — break things, watch the protocol recover

* why it's interesting
  * Raft is designed to be understandable — perfect for visualization
  * every state transition has visual meaning (follower → candidate → leader)
  * log replication is spatial — entries flowing from leader to followers
  * network partitions create drama — split brain, competing leaders, resolution
  * each run plays out differently depending on timing and your interventions

* tech stack
  * React + TypeScript
  * HTML Canvas (or SVG) for the node/message visualization
  * no heavy 3D libs — this is a 2D problem, keep it light
  * Web Workers for the Raft state machines (optional — could just use timers)
  * Vite for build


* nepic 01 — v1: core protocol visualization

  * napkin 0010 — node canvas + state machine
    * what: 5 nodes on a canvas, each running the Raft state machine
    * nodes as circles with state labels (follower/candidate/leader)
    * color-coded: follower=gray, candidate=yellow, leader=green
    * election timeout per node — visual countdown ring around each node
    * when timeout fires: node becomes candidate, requests votes
    * vote messages as animated arrows between nodes
    * majority reached → leader announced, heartbeats begin
    * heartbeat messages as subtle pulses from leader to followers
    * the state machine must be correct — not a toy, actual Raft election logic
      * terms, votedFor, random election timeouts, split vote handling
    * controls
      * speed slider: 0.25x to 4x (slow motion to fast forward)
      * pause/play
      * step mode: advance one message at a time
    * info panel: current term, each node's state, vote counts

  * napkin 0020 — log replication
    * what: leader accepts entries, replicates to followers
    * client request button: "propose entry" → leader gets new log entry
    * leader's log shown as a horizontal bar of colored blocks
    * each follower has matching log bar — entries appear as replication succeeds
    * AppendEntries messages as animated arrows carrying entry blocks
    * commit line: vertical marker showing last committed index
    * entry committed when majority has it — commit line advances, entries darken
    * log conflicts: if a follower has stale entries, leader overwrites them
      * visual: conflicting entries flash red, get replaced
    * consistency check visible: prevLogIndex/prevLogTerm match shown
    * info panel: log state per node, commit index, match index

  * napkin 0030 — network partitions + chaos controls
    * what: drag-to-partition interface, node kill/restart
    * partition tool: draw a line across the canvas to split nodes into groups
      * messages that cross the partition disappear (with a visual poof)
      * minority partition loses leader, starts election, can't get majority
      * majority partition elects new leader, keeps going
    * heal partition: remove the line, watch logs reconcile
    * kill node: click a node → it goes dark, stops responding
    * restart node: click dead node → comes back as follower with old state
    * scenario presets
      * "clean election" — all nodes start, watch first leader emerge
      * "leader dies" — auto-kills leader after 5 seconds
      * "split brain" — partitions into 2+3, both sides try to elect
      * "log conflict" — creates divergent logs, then heals partition
    * event log: scrolling text panel showing every message, election, commit


* nepic 02 — v2: depth + scenarios

  * napkin 0040 — membership changes
    * what: add/remove nodes from the cluster at runtime
    * joint consensus: the two-phase approach Raft uses for safety
    * add node button: new node appears, leader sends snapshot + log
    * remove node button: node dims, cluster adjusts
    * visual: "old config" and "new config" shown during transition
    * the tricky bit: leader might not be in new config — must step down
    * safety invariant: at no point do two leaders exist (visualize why)

  * napkin 0050 — scenario editor + playback
    * what: script a sequence of events, play them back
    * timeline editor: horizontal track with event markers
      * events: partition, heal, kill, restart, propose entry, wait
    * drag events onto timeline, adjust timing
    * play/pause/scrub through the scenario
    * save/load scenarios as JSON
    * share via URL (encode scenario in hash)
    * built-in scenario library: "the classics"
      * figure 6 from the Raft paper
      * leader completeness proof walkthrough
      * the tricky election edge case (pre-vote)

  * napkin 0060 — annotations + teaching mode
    * what: overlays that explain what's happening
    * teaching mode toggle: enables annotations
    * when election starts: callout explaining why, what the timeout means
    * when log replicates: callout showing the consistency guarantee
    * when partition heals: callout explaining log reconciliation
    * clickable annotations → expand to Raft paper excerpt
    * quiz mode: "what happens next?" — pause, ask user to predict, reveal
    * annotations are non-intrusive — float near the action, fade after reading
