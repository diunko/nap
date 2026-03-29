* sorting-theater — sorting algorithms on a 3D stage: mega napkin

* what this is
  * sorting algorithms visualized as physical blocks on a theater stage
  * each algorithm performs live: blocks slide, swap, compare — you see the logic
  * side-by-side race mode: pit quicksort against mergesort on the same data
  * the fun: sorting has never been this dramatic — add audience reactions

* why it's interesting
  * sorting is the first algorithm everyone learns — but few people see it
  * the difference between O(n log n) and O(n²) becomes visceral when you watch it
  * each algorithm has a personality: quicksort is bold, insertion sort is careful
  * race mode settles debates: "is quicksort really faster?" → just watch
  * the theater metaphor adds narrative: algorithms are performers, data is the challenge

* tech stack
  * React + TypeScript
  * Three.js for 3D rendering (blocks on a stage)
  * Web Audio API for sound effects (optional but delightful)
  * Vite for build


* nepic 01 — v1: core visualization

  * napkin 0010 — stage + block renderer
    * what: 3D stage with colored blocks that sorting algorithms manipulate
    * the stage
      * flat platform with subtle lighting (spotlight from above)
      * camera: fixed angle (slightly elevated, looking at blocks from front)
      * background: dark theater — blocks are the focus
      * stage dimensions adapt to array size
    * blocks
      * 3D rectangular bars (BoxGeometry)
      * height proportional to value
      * color: gradient from short (cool blue) to tall (hot red)
      * arranged left to right, evenly spaced
      * each block has a subtle number label on front face
    * array generation
      * random array: N elements, randomized
      * size slider: 10 → 200 elements
      * distribution presets
        * random: uniform random
        * nearly sorted: 90% sorted, few elements out of place
        * reversed: worst case for some algorithms
        * few unique: many duplicates (tests stability)
    * animation system
      * operations: compare (glow two blocks), swap (blocks slide to each other's position), insert (block moves to new position)
      * each operation takes a fixed duration (adjustable speed)
      * operations queue: algorithm produces steps, renderer plays them

  * napkin 0020 — algorithms + controls
    * what: implement 6+ sorting algorithms, all driving the same renderer
    * algorithms (each produces a sequence of compare/swap/insert operations)
      * bubble sort — the classic O(n²), satisfying wave pattern
      * insertion sort — builds sorted region left to right
      * selection sort — scans for minimum, places it
      * quicksort — partition drama, pivot highlighted
      * merge sort — divide and conquer, merge phase is visual
      * heap sort — heap construction is the interesting part
    * algorithm picker: dropdown or button bar
    * speed controls
      * slider: 1ms → 500ms per operation
      * pause/play
      * step: advance one operation
      * skip to end: instant result
    * stats display
      * comparisons count
      * swaps count
      * elapsed time (wall clock)
      * operation progress bar
    * color modes
      * by value: height-based gradient
      * by status: unsorted (gray), sorted (green), comparing (yellow), swapping (red)
    * sound toggle: each comparison plays a tone pitched to the block's value
      * creates a rising melody as the array sorts — iconic

  * napkin 0030 — race mode
    * what: two algorithms side by side on the same data
    * split stage: two platforms, same initial array, different algorithms
    * both run simultaneously at the same speed setting
    * winner announced when one finishes: "Quicksort wins by 47 operations!"
    * stats comparison panel
      * comparisons: alg A vs alg B
      * swaps: alg A vs alg B
      * time: alg A vs alg B
    * race controls
      * pick algorithm A and algorithm B
      * same array guaranteed (seeded random)
      * handicap mode: give O(n²) algorithm a head start
    * leaderboard: run the same race 10 times, show win/loss record
    * tournament mode: bracket of algorithms, single-elimination


* nepic 02 — v2: drama + education

  * napkin 0040 — audience reactions + theater elements
    * what: the theater metaphor taken further — curtains, applause, commentary
    * curtain call
      * stage curtains (red fabric, simple geometry or image) open before sort begins
      * close between races or algorithm changes
    * audience
      * row of simple emoji faces below the stage
      * reactions
        * gasp: when a big swap happens (distance > n/2)
        * yawn: during bubble sort's inner loop on large arrays
        * cheer: when sort completes
        * groan: when an O(n²) algorithm hits worst case
      * audience size scales with drama: more spectators for race mode
    * narrator text
      * floating text bubbles explaining what's happening
      * "Quicksort chose pivot: 42"
      * "Merge sort is merging subarrays [3,7] and [1,5]"
      * toggleable: off for clean view, on for education
    * confetti: particle burst when sort completes (Three.js particle system)

  * napkin 0050 — custom algorithm input
    * what: write your own sorting algorithm, watch it perform
    * code editor panel (Monaco or CodeMirror, minimal)
      * starter template: function receives array, must call compare() and swap()
      * compare(i, j) → returns -1/0/1, also triggers visual
      * swap(i, j) → swaps elements, triggers visual
    * example algorithms pre-loaded: cocktail sort, shell sort, radix sort
    * validation: detect infinite loops (operation count limit)
    * race your algorithm against built-in ones
    * share: encode algorithm in URL hash (compact)
    * the educational value: students write their own sort, immediately see behavior

  * napkin 0060 — algorithm analysis + visualization
    * what: go beyond watching — understand complexity visually
    * operation graph
      * line chart: x-axis = array size, y-axis = operations
      * run each algorithm on sizes 10, 20, 50, 100, 200
      * plot all algorithms on same chart — O(n²) curves visibly diverge
    * call stack visualization (for recursive algorithms)
      * quicksort: show the partition tree growing
      * merge sort: show the divide/merge tree
      * tree rendered beside the stage
    * memory usage visualization
      * blocks for auxiliary arrays (merge sort's temp arrays)
      * in-place algorithms show no extra blocks
      * memory bar: visual indicator of extra space used
    * best/worst/average cases
      * button: "show worst case" → generates adversarial input
      * button: "show best case" → generates ideal input
      * run same algorithm on both — difference is dramatic
    * complexity labels: O(n²), O(n log n) shown next to active algorithm
