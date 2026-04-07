* 0640 — update templates for v3

* problem
  * templates in src/templates/ still reference v2 concepts
  * symlinks, 40-board/, old status workflow, nap instead of nap3
  * new projects get bootstrapped with stale docs

* what to update in 00-org/

  * 20-workflow.nap.md
    * remove: symlink status transitions, 40-board/ directories, mv commands
    * replace: status via `nap3 set-status <slug> <phase>`
    * replace: `nap` → `nap3` throughout
    * add: two flows (feature pipeline + bug fix flow)
    * add: .stories.md as standard artifact
    * add: TE role clarification (implements ALL TA test cases)
    * reference: our updated .nap/00-org/20-workflow.nap.md has the correct version

  * 30-structure.nap.md
    * remove: 40-board/ from directory layout
    * remove: "status lives in symlinks"
    * add: .napkin.nap.json marker files for status
    * add: .agent.nap.json marker files for agent identity
    * add: ui-state.json
    * replace: .journeys.md → .stories.md
    * reference: our updated .nap/00-org/30-structure.nap.md

  * 40-roles/architect.md
    * remove: "move symlinks in 40-board/"
    * replace: `nap3 set-status` for status changes
    * replace: `nap3 create napkin/agent` for entity creation

  * other role files
    * replace: `nap` → `nap3` in any CLI references

* what to update in nepic/

  * architect prompt template
    * should reference nap3 commands
    * should mention marker files, not SQLite

* what NOT to change
  * skills/ templates — napkin and napkin-format skills are CLI-independent
  * seed mega-napkins in projects/ — those describe user projects, not NAP internals
