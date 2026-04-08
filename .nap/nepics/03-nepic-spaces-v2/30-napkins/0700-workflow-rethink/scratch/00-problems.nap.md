* 0700 — workflow rethink: what's wrong with the current templates

* stale references
  * 30-structure.nap.md references nap.db (SQLite) — v3 has no database
  * 30-structure.nap.md references 40-board/ with symlinks — v3 uses marker files
  * 20-workflow.nap.md says "status lives in symlinks" — v3 uses .napkin.nap.json
  * architect.md says "move symlinks in 40-board/" — should be `nap3 set-status`
    * // yeah! 
    * // gives me thought / idea: what if nap3 --help actually is a very descriptive part of how workflow works?
    * // e.g. you read the workflow / manifesto / roles, run nap3 --help, and you just _get_ it how it works
      * // would be just embedded intuitive way how things fit together!
    * // it's almost there already, and if it's not at places that's ok
    * // maybe a good substitute for that would be a 
      * // nice, clear, engaging, Feynman-style (maybe partially), map of
      * // how nap3 cli commands map to the workflow
      * // so that it explains both the workflow and the commands used
      * // note: maybe some cli things will be popping out as confusing,
        * // but that'd be a great feedback on how to restructure cli
  * no mention of marker files (.agent.nap.json, .napkin.nap.json) anywhere

* roles don't know about each other
  * architect doesn't mention guardian, doesn't know about permission system
  * fs-eng doesn't know the guardian might approve/deny their tool calls
  * test-eng doesn't know about the small/medium testing pattern (model + fakes vs real Electron)
  * test-arch doesn't know about the model layer testing approach (fake filesystem, fake bridge)
  * guardian doesn't know what's normal for each role (fs-eng installs packages, architect doesn't write code)
  * nobody knows who else is on the team — each role file is an island
  * // i think it'd be enough if we have smth like "team composition" section somewhere
    * // with 1-liner explanation how roles fit the workflow
      * // second i think we already have, but i think it somehow misses "composition" big picture piece
        * // shouldn't be too big, I think even something small but clear would be enough
        * // and yeah, i put great deal for docs being compact and clear
          * // e.g. no need to overexplain what the role is in general, 
            * // focus more on how aspects of that role are different in our workflow
          * // haha, i'm realizing that these discussions and threads
            * // will be much longer than the end doc themselves!
            * // "sorry i didn't have a lot of time, that's why my letter is too long"
              * // who said/wrote that?

* workflow doc is flat and procedural
  * describes steps (1. napkin 2. spec 3. code 4. test) but not the shape of the team
  * doesn't explain: what happens when an agent needs permission? what happens when a session dies?
    * // permissions are kinda self-evident; when agent runs a tool permission workflow kicks off
    * // it kinda works automatically (which is real great!); 
      * // and that's why this whole thing works: it's largely intuitive from the point you've read about napkins
        * // and workflow description
        * // we need to make it feel even more so!
    * // just need a bit of context
      * // where it matters
        * // where is that?
  * doesn't explain: how the app works, what the sidebar shows, what the debug panel is for
    * // debug panel doesn't belong to the workflow and how agents work on codebase
    * // this is an example of how docs get bloated with irrelevant stuff;
      * // we should be very strict with warding off such stuff
  * doesn't explain: the human's role — when do they intervene, what do they see, how do they steer
    * // let's keep that as napkin focused; /napkin skill explains it all
      * // we assume all other agents being implicitly autonomous
        * // and that means they do their best effort and right judgement and keeping up good quality autonomous work
        * // we don't overstate this, so human can intervene just as easy as when interacting with just one CC
          * // but whole system being inspectable and transparent goes long long way to facilitate that
          * // so let's not overdo this; focus on agent and flows
          * // btw, this reminded me of new poke message structure, that it 
            * // formats pokes with origin (look it up)
      * // do you think that saying "human" is kinda dull? 
        * // def feels weird for me referring that way to myself
          * // what can we do about it? 
            * // i mean, not everyone working on nap project will have name Dima
            * // name is nice, buut maybe other ideas? 
              * // as in "architect Kai and human designed a system"
              * // some other ways to express that? to refer to me?
  * the pipeline is one section among many — should be the centerpiece

* no system overview
  * a new agent reads 4 files and has no idea how the app works
  * no mention of: model layer, bridge, snapshots, marker files as persistence
  * no mention of: nap3 CLI commands beyond start/done/nap
  * no mention of: the Electron app, the sidebar, the kanban, the terminal
  * no "here's how everything fits together in 30 seconds"
  * // i really like all of these!
  * // having this separate doc or idk in some form would be awesome!
    * // it's like being aware of git internals when using git
    * // you never code anything, but knowing how it works in principle 
      * // helps a lot with mental model and reasoning
  * // there can be some form that describes like a tutorial would describe git internals to establish understanding
    * // also can be optional that's read only when more complex interaction is needed
      * // like, 80% of time test-engs writing tests, running and debugging them, and run nap done, 
        * // and don't need to think about napkin being moved between statuses
        * // or about agent marker files

* role files are too generic
  * they describe what the role does but not HOW in THIS system
    * // roles probably are better to be roles
    * // and cli manual cli manual
    * // i don't think we need to mix them
    * // workflow and roles, yes
    * // roles describe kinda personality and mindset and voice and what they care about
      * // personality, it's the first thing the agent reads, (think: together with their name)
      * // and workflows are kinda built on top of that
      * // and cli are embedded into workflows? 
        * // or somehow else, should really think about composition
        * // and how big picture and details naturally form a narrative
        * // that's inspriting, ambitious, engaging, fun, and vivid
          * // that's the core hard challenge of storytelling!
  * no examples of actual commands they'll run
  * no examples of what their prompt.md looks like
  * no examples of what their response.md should contain
  * fs-eng doesn't know about the monorepo structure (packages/v2, packages/v3)
  * test-arch doesn't have examples of fixture patterns or journey test design

* the promise doc is good but disconnected
  * // it's kind of bland version of /napkin skill+manifesto
    * // not every agent needs full /napkin skill? many just do their thing
      * // and if it happens that certain thing needs a brainstorm with I and certain agent, 
      * // i just invoke /napkin at that point and we brainstorm
        * // many napkins came out of bumps that fs-eng or ta got into
          * // and follow-up brainstorm, and then passing back to architect
  * explains WHY well (context windows, quality, visibility)
  * but the WHY doesn't connect to the HOW in the other docs
  * feels like a manifesto you read once and forget
  * should be woven into the workflow, not a separate file
    * // let's think about storytelling, big picture, details, all of it
    * // i can't say "it should" or "it shouldn't" without it
    * // guess we need to keep our minds open and try different things

* what's missing entirely
  * guardian role doc — exists as a template prompt but not as a 40-roles/ file
  * the human's role — what they do, when they intervene, what signals to watch for
    * // idk? see above
  * successor/handoff flow — what happens when an architect runs out of context
    * // good call; i think we have part of it but maybe need more work to make it snappy and crystal clear
  * archived agents — what they are, how to adopt orphaned work
    * // i think we have some of that in "successor" flow (can't find CC session by uuid)
      * // can discuss, particular ideas for improvement?
  * the permission system — how it works, what the guardian does, how to escalate
  * nap3 CLI reference — not a man page, just "here are the commands you'll use"
    * // see my note above about cli+workflow; also about story and storytelling
  * project structure beyond .nap/ — where does the actual code live?
    * // sorry, what do you mean?
    * // we're focusing on bootstrapping any other project that would use napkin driven development
      * // and Nap.app
