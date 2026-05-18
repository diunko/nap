# test architecture — routing pipeline

8 test cases across 4 seams. Gate: routing works if shortest-queue + hold-on-full passes. Biggest risk: alignment window boundary — the modular arithmetic in isAlignmentOpen can produce off-by-one at cycle transitions.
