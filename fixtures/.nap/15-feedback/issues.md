# issues

* gate-m2 occasionally drops orders during alignment window transitions
  * probably a race between the window check and the dispatch
  * see dispatch.ts isAlignmentOpen — modular arithmetic edge case at cycle boundary?
