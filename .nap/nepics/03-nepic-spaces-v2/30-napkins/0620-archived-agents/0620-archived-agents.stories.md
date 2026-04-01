* archived agents — user stories

* story 1: import a manual-workflow project
  * i have a project where agents ran with manual nap workflow
  * agent dirs exist with prompt.md + response.md, no .agent.nap.json
  * i run: nap3 import-agents .nap/nepics/01-v1
  * markers created for each agent dir found
  * i open the app
  * sidebar shows all agents as archived (hollow gray dots)
  * i can see which napkins had which agents

* story 2: click archived agent → successor
  * i see an archived agent in the sidebar
  * i click it
  * terminal area shows: "session expired — invoke a successor?"
  * i click yes
  * fresh Claude spawns, reads the original prompt + response
  * Claude says something like "I've read the original work, how can I help?"
  * i ask: "why did you structure the database this way?"
  * Claude answers from context of prompt.md + response.md + codebase

* story 3: successor becomes regular agent
  * after invoking successor, the agent dot changes from archived to running
  * i can interact normally — ask questions, give instructions
  * when done, i type in their terminal or they call nap done
  * agent status becomes done, just like any other agent
  * next app restart: agent resumes normally (has valid UUID now)

* story 4: resume fails on expired session
  * app restarts, tries to resume an agent
  * claude --resume <uuid> fails: "No conversation found"
  * the agent's terminal shows the successor prompt instead of empty black
  * same flow as clicking an archived agent — i choose to invoke successor or not
  * i don't have to do anything special — the app handles it

* story 5: mixed project — some agents alive, some archived
  * project has 10 agents across 3 napkins
  * 6 agents resume normally (sessions alive)
  * 2 agents fail to resume (sessions expired) → successor prompt shown
  * 2 agents imported as archived → hollow dots, click to invoke
  * sidebar shows the mix: running dots, done dots, archived dots
  * i can work with live agents AND invoke successors on dead ones

* story 6: successor has enough context
  * the generated prompt gives the successor:
    * what was asked (prompt.md)
    * what was delivered (response.md)
    * the feature vision (napkin .nap.md)
    * their role (role file)
  * the successor explores the code on their own
  * they can answer follow-up questions about the work
  * they can fix bugs in code they didn't write
  * they feel like a maintainer who read the handoff docs
