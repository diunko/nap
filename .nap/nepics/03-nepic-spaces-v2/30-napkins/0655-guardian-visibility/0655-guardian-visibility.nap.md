* 0655 — guardian always visible across nepics

* the problem
  * guardian lives in first nepic (01-v1/20-architects/002-guardian/)
  * hooks fire from agents in ANY nepic
  * switching to nepic 02 or 03 → guardian disappears from sidebar
  * no way to see or talk to guardian when on a different nepic

* the fix: always load guardian from first nepic
  * after loading active nepic's architects, check first nepic's 20-architects/ for guardian
  * if found and not already in the list → append to architects[]
  * guardian shows under current nepic's architects in sidebar
  * one special case in model.loadFromFilesystem — ~10 lines

* what changes
  * model.ts loadFromFilesystem:
    * after loading architects from active nepic dir
    * if no guardian in current architects:
      * find first nepic from nepicList
      * read its 20-architects/ for role: "guardian"
      * append to architects array
  * everything else works automatically:
    * findAgentByRole('guardian') searches architects → finds it
    * startAgents handles it like any architect
    * sidebar renders it pinned with other architects
    * poke routing works

* what doesn't change
  * guardian marker stays in first nepic physically
  * guardian's nepicId field says "01-v1" even when viewed from nepic 03 — cosmetic, not functional
  * hook flow unchanged — hooks use agent UUID, not nepic
  * setup --guardian still creates in active nepic (which is first on init)
