# build report — routing pipeline

Built 4 modules, ~350 lines total. Key decision: validation is sync and stateless — runs inline in the routing path, no async validation step. This keeps the routing fast but means we can't do database-backed crust rules (that's a v2 thing).
