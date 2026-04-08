* guardian visibility — user stories

* story 1: guardian visible on second nepic
  * i'm on nepic 02, working with my architect
  * guardian was set up on nepic 01 via nap3 setup --guardian
  * sidebar shows: 001-architect (nepic 02's), 002-guardian (from nepic 01)
  * guardian's purple dot is visible, i can click into it

* story 2: permission request on nepic 02 reaches guardian
  * agent on nepic 02 triggers a permission request
  * hook fires → model looks up guardian → finds it (loaded from nepic 01)
  * guardian gets poked, judges, resolves
  * works identically to being on nepic 01

* story 3: switch back to nepic 01
  * guardian still there — it's in its home nepic
  * no duplication, no ghost entries
