# Testing Patterns from T3 Code

A catalog of testing techniques we use in T3 Code — what each one solves, how it works, and when to reach for it. Written for devs on other projects who want to steal the good parts.

## The architecture in 30 seconds

T3 Code is a web GUI for code agents (Codex, Claude Code). The server is Effect-TS with service layers, event sourcing (commands → decider → events → projector → reactor), SQLite persistence, and provider adapters that talk to external agent runtimes over JSON-RPC or SDK. The client is React + Zustand, connected via WebSocket. An Electron shell wraps both for the desktop app.

The testing challenge: lots of async boundaries, streaming events, layers that depend on other layers, native modules that crash under the wrong Node runtime, and two completely different provider backends that need to implement the same interface.

---

## 1. Fake the service boundary, not the internals

### The problem

Effect-TS layers depend on other layers. The orchestration engine needs an event store. The event store needs SQLite. SQLite needs a filesystem. If you test the engine, do you bring up the whole stack?

### The technique

Effect's `Layer.succeed(ServiceTag, fakeImpl)` lets you swap any service at its boundary. You write a plain object that satisfies the service interface, hand it to the layer system, and the code under test doesn't know the difference.

```typescript
// The real event store talks to SQLite.
// The test fake is a plain object with the same shape.
const flakyStore: OrchestrationEventStoreShape = {
  append(event) {
    // simulate a write failure on the third call
    if (appendCount++ === 2) return Effect.fail(new Error("append failed"));
    events.push(event);
    return Effect.succeed(event);
  },
  readFromSequence(seq) {
    return Stream.fromIterable(events.filter(e => e.sequence > seq));
  },
  readAll() {
    return Stream.fromIterable(events);
  },
};

// Wire it into the real orchestration engine
const testLayer = OrchestrationEngineLive.pipe(
  Layer.provide(Layer.succeed(OrchestrationEventStore, flakyStore)),
  Layer.provide(OrchestrationCommandReceiptRepositoryLive),
  Layer.provide(SqlitePersistenceMemory),
);
```

### What this is good for

The orchestration engine dispatches commands, persists events, and updates projections. The interesting bugs aren't "does SQLite work" — they're "what happens when the event store fails mid-append" or "does the engine recover after a partial write." By faking the store boundary, you can inject failures, delays, or weird ordering that would be impossible to trigger with a real database.

This pattern also keeps tests fast. The real SQLite layer needs native modules and disk I/O. The fake is pure memory, runs under any Node version, and finishes in milliseconds.

### When to reach for it

Any time you have a service layer that depends on infrastructure (database, filesystem, network) and you want to test the *logic* of the layer above it. The key insight: you're testing the wiring and error handling between layers, not the infrastructure itself.

---

## 2. Queue-based test harnesses for async protocols

### The problem

Provider adapters (Codex, Claude Code) emit event streams over time. A single user turn produces a sequence: `turn.started` → `content.delta` → `content.delta` → `item.completed` → `turn.completed`. The events arrive asynchronously. In production they come from a subprocess or SDK. In tests, you need to script exactly what events come back and in what order.

### The technique

Build an in-memory adapter that implements the full provider interface. It holds a map of sessions and a queue of pre-scripted responses. When `sendTurn` is called, it shifts the next response off the queue and emits each event into an unbounded Effect Queue. The test subscribes to the queue and collects exactly N events.

```typescript
// Before the turn: script what the provider will "say"
yield* harness.queueTurnResponse(threadId, {
  events: [
    { type: "turn.started", eventId: "e1", ... },
    { type: "content.delta", eventId: "e2", payload: { delta: "Hello" } },
    { type: "turn.completed", eventId: "e3", payload: { state: "completed" } },
  ],
});

// Run the turn and collect emitted events
const observed = yield* collectEventsDuring(
  provider.streamEvents,    // the canonical event stream
  3,                        // expect exactly 3 events
  provider.sendTurn({ threadId, input: "hello", attachments: [] }),
);

// Assert on the event sequence
assert.deepEqual(
  observed.map(e => e.type),
  ["turn.started", "content.delta", "turn.completed"],
);
```

The `collectEventsDuring` helper works by forking a fiber that drains the stream into a queue, running the action, then taking N items from the queue. If fewer than N events arrive, the test hangs (and times out) — which is exactly the failure mode you want to catch.

### What this is good for

The provider service sits between the orchestration layer and the actual agent runtime. It routes turns to the right adapter, fans out events, manages sessions. The bugs that matter here aren't "does Codex respond" — they're "what happens when two turns overlap," "does interrupt actually stop the event stream," "do approval responses get routed to the right session."

The harness also tracks every call: start count, interrupt calls per session, approval responses per session, rollback history. So you can assert not just on events but on the exact sequence of operations the provider service performed.

### When to reach for it

Any system that communicates with an external process over a streaming protocol — JSON-RPC, gRPC streams, WebSocket push, SSE. The pattern: pre-script responses, collect emitted events, assert on the sequence. Works especially well when the protocol has request-response pairs interleaved with server-initiated pushes.

---

## 3. In-memory persistence substitution

### The problem

The server uses `node:sqlite` for persistence — event store, projection snapshots, session state. But `node:sqlite` is a native module. Under Vitest's system Node (which may differ from the project's runtime), native modules can crash. You don't want your unit tests to require a specific Node version or touch disk.

### The technique

A single layer that swaps the SQLite filename to `:memory:` but still runs every migration. Same schema, same queries, same constraints — zero disk.

```typescript
// Production: SQLite on disk
const SqlitePersistenceLive = makeRuntimeSqliteLayer({
  filename: path.join(stateDir, "t3code.db"),
});

// Tests: SQLite in memory, same migrations
export const SqlitePersistenceMemory = Layer.provideMerge(
  setup,  // runs PRAGMA + full migration chain
  makeRuntimeSqliteLayer({ filename: ":memory:" }),
);
```

In test files, it's a one-liner:

```typescript
const testLayer = OrchestrationEngineLive.pipe(
  Layer.provide(OrchestrationEventStoreLive),  // real store implementation
  Layer.provide(SqlitePersistenceMemory),       // in-memory database
);
```

### What this is good for

The event store, projection snapshot queries, and session runtime repository all talk to SQLite through Effect's SQL client. The interesting bugs live in the queries — wrong JOIN conditions, missing indexes causing silent failures, migration ordering issues. In-memory SQLite catches all of these because it runs the real SQL against the real schema.

This also means you can test the persistence layer as a "small test" (Vitest, no native module headaches) rather than needing a medium test with a real database file. The full migration chain runs in ~5ms in memory.

### When to reach for it

Any project with a SQL database where you want to test query logic without disk I/O. The key constraint: your migrations must be deterministic and idempotent. If they are, the in-memory database is schema-identical to production and catches the same class of bugs.

---

## 4. Pure derivation functions as the test surface

### The problem

The web client receives a stream of orchestration events from the server and derives UI state: pending approvals, active plans, work log entries, session phase, timeline ordering. This derivation is where most of the edge cases live — approval lifecycle (requested → resolved, but what if the resolution arrives before the request?), activity ordering (sequence numbers vs timestamps vs IDs), phase detection (is the session "running" or "waiting for approval"?).

### The technique

Extract all state derivation into pure functions. No React hooks, no stores, no side effects. Just data in, data out. Test by constructing input objects and asserting on output shape.

```typescript
// Pure function: activities in, pending approvals out
export function derivePendingApprovals(
  activities: ReadonlyArray<OrchestrationThreadActivity>,
): PendingApproval[] {
  const openByRequestId = new Map<ApprovalRequestId, PendingApproval>();
  const ordered = [...activities].toSorted(compareActivitiesByOrder);

  for (const activity of ordered) {
    if (activity.kind === "approval.requested") {
      openByRequestId.set(requestId, { requestId, requestKind, createdAt });
    }
    if (activity.kind === "approval.resolved") {
      openByRequestId.delete(requestId);
    }
  }
  return [...openByRequestId.values()];
}
```

Testing is trivial — build an activity array, call the function, check the result:

```typescript
it("resolves approval when resolution arrives after request", () => {
  const result = derivePendingApprovals([
    { kind: "approval.requested", requestId: "r1", ... },
    { kind: "approval.resolved", requestId: "r1", ... },
  ]);
  expect(result).toEqual([]);
});

it("keeps approval pending when no resolution exists", () => {
  const result = derivePendingApprovals([
    { kind: "approval.requested", requestId: "r1", requestKind: "command", ... },
  ]);
  expect(result).toHaveLength(1);
  expect(result[0].requestKind).toBe("command");
});
```

The same pattern applies to `derivePhase()`, `deriveWorkLogEntries()`, `deriveActivePlanState()`, and the read model sync function that normalizes server state into the Zustand store.

### What this is good for

These functions are the cheapest tests you can write — pure functions, no setup, no teardown, sub-millisecond execution. But they guard the highest-density bug area: the translation layer between server events and what the user sees. A wrong phase detection means the UI shows "running" when the agent is waiting for approval. A wrong activity sort means approvals appear in the wrong order. These are the bugs users file.

### When to reach for it

Any time your UI derives complex state from server data. The pattern: extract the derivation into a pure function that lives outside React, test it directly with constructed inputs, import it into your component. The function becomes the contract between "what the server sends" and "what the user sees."

---

## 5. Fixture composition — real + fake layers mixed

### The problem

You want to test the provider service end-to-end: start a session, send a turn, observe events, check that the session directory tracks state correctly. But you don't want a real Codex process running. You need some layers to be real (the provider service, the session directory, the persistence) and one layer to be fake (the adapter).

### The technique

Build an integration fixture that wires real service layers together with a fake adapter, backed by in-memory persistence.

```typescript
const makeIntegrationFixture = Effect.gen(function* () {
  const harness = yield* makeTestProviderAdapterHarness();

  // Fake registry: routes "codex" to test harness, rejects everything else
  const registry: ProviderAdapterRegistryShape = {
    getByProvider: (provider) =>
      provider === "codex"
        ? Effect.succeed(harness.adapter)
        : Effect.fail(new ProviderUnsupportedError({ provider })),
    listProviders: () => Effect.succeed(["codex"]),
  };

  // Real session directory + real persistence, but in-memory SQLite
  const directoryLayer = ProviderSessionDirectoryLive.pipe(
    Layer.provide(ProviderSessionRuntimeRepositoryLive),
  );

  const shared = Layer.mergeAll(
    directoryLayer,
    Layer.succeed(ProviderAdapterRegistry, registry),
    AnalyticsService.layerTest,
  ).pipe(Layer.provide(SqlitePersistenceMemory));

  // Real provider service wired to the mixed layer stack
  const layer = makeProviderServiceLive().pipe(Layer.provide(shared));

  return { harness, layer };
});
```

Then in a test:

```typescript
it.effect("routes turn to correct adapter and emits events", () =>
  Effect.gen(function* () {
    const fixture = yield* makeIntegrationFixture;
    yield* Effect.gen(function* () {
      const provider = yield* ProviderService;
      const session = yield* provider.startSession({ ... });
      // ... queue response, send turn, assert events
    }).pipe(Effect.provide(fixture.layer));
  }),
);
```

### What this is good for

The integration bugs in T3 Code live *between* layers: the provider service calls the adapter registry, which resolves the adapter, which emits events, which the provider service fans out to its canonical stream. The session directory tracks which adapter owns which thread. The persistence layer stores session state for resume.

None of these bugs show up if you test each layer in isolation. They only appear when the real provider service talks to the real session directory through the real persistence layer — with only the external runtime faked out.

### When to reach for it

When your system has a service that orchestrates multiple subsystems. You want to test the orchestration logic with real internal wiring, but fake the external dependency that you can't (or don't want to) run in tests. The pattern: real layers for everything you own, fakes for everything you don't.

---

## 6. Property-based testing on event sourcing

### The problem

The decider is a pure function: given a command and the current state, it produces events. The projector is a pure function: given events and the current read model, it produces a new read model. The state space is huge — concurrent threads, interleaved turns, interrupts mid-stream, reverts, model switches. A human writing test cases will cover the obvious paths and miss the weird ones.

### The technique

Generate random sequences of valid commands. After each command, run the decider + projector. Assert that structural invariants hold at every step.

```typescript
// Conceptual — not yet implemented in T3 Code, but the architecture is ready for it

const commandGenerators = {
  "thread.create": fc.record({ ... }),
  "thread.send-turn": fc.record({ threadId: fc.constantFrom(...activeThreads), ... }),
  "thread.interrupt": fc.record({ threadId: fc.constantFrom(...activeThreads) }),
  "thread.revert": fc.record({ threadId: ..., numTurns: fc.nat() }),
};

fc.assert(
  fc.property(
    fc.array(fc.oneof(...Object.values(commandGenerators))),
    (commands) => {
      let model = createEmptyReadModel();
      for (const cmd of commands) {
        const events = decider(model, cmd);
        model = events.reduce((m, e) => projector(m, e), model);
      }
      // Invariants that must always hold:
      // - every thread has a valid project reference
      // - turn counts are monotonically increasing
      // - no thread has duplicate message IDs
      // - reverted threads have correct message count
      assertInvariants(model);
    },
  ),
);
```

The projector tests already chain events through state, which is the manual version of this:

```typescript
// Current approach: manually chain events through projector
const afterCreate = await Effect.runPromise(projectEvent(model, createEvent));
const afterTurn1 = await Effect.runPromise(projectEvent(afterCreate, turnEvent1));
const afterRevert = await Effect.runPromise(projectEvent(afterTurn1, revertEvent));

// Assert that revert pruned the right messages
expect(afterRevert.threads[0].messages).toHaveLength(2);
```

### What this is good for

Event sourcing with pure functions is the textbook case for property-based testing. The decider and projector have clear invariants (turn counts never go negative, reverted messages are pruned, session state transitions are valid). These invariants should hold regardless of the command sequence. Property testing finds the edge cases humans miss: double-interrupt on the same turn, revert immediately after thread creation, concurrent turns on threads in different projects.

### When to reach for it

Any system with pure state transitions and clear invariants. Event sourcing is the obvious case, but this also works for state machines, parsers, serialization round-trips, and any reduce-style accumulator. The prerequisite: you need to be able to articulate "what must always be true" independent of the specific input sequence.

---

## 7. Schema round-trip testing

### The problem

The contracts package defines types shared between server and client — WebSocket messages, provider runtime events, orchestration commands. These types are defined with Effect Schema, which provides runtime validation. If the server adds a field, renames an enum value, or widens a type, the client's decoder will reject the message at runtime. These breaks are silent until they hit production.

### The technique

For each schema, write a test that decodes a representative payload and asserts on the parsed result. This is a compile-time + runtime contract test.

```typescript
const decodeRuntimeEvent = Schema.decodeUnknownSync(ProviderRuntimeEvent);

it("decodes turn.plan.updated with step array", () => {
  const parsed = decodeRuntimeEvent({
    type: "turn.plan.updated",
    eventId: "event-1",
    provider: "codex",
    createdAt: "2026-02-28T00:00:00.000Z",
    threadId: "thread-1",
    turnId: "turn-1",
    payload: {
      explanation: "Implement schema updates",
      plan: [
        { step: "Define event union", status: "completed" },
        { step: "Wire adapter mapping", status: "inProgress" },
      ],
    },
  });

  expect(parsed.type).toBe("turn.plan.updated");
  expect(parsed.payload.plan).toHaveLength(2);
  expect(parsed.payload.plan[1]?.status).toBe("inProgress");
});
```

For schemas with validation constraints (not just shape), test the rejection path:

```typescript
it("rejects turn diff input when fromTurnCount > toTurnCount", () =>
  Effect.gen(function* () {
    const result = yield* Effect.exit(
      decodeTurnDiffInput({
        threadId: "thread-1",
        fromTurnCount: 3,   // invalid: from > to
        toTurnCount: 2,
      }),
    );
    assert.strictEqual(result._tag, "Failure");
  }),
);
```

### What this is good for

The WebSocket protocol has 29+ RPC methods. Provider runtime events have 15+ event types. Each has a specific payload shape. A schema change in `packages/contracts` can silently break the server or the client. These tests catch that at PR time, not in production.

The tests are also documentation — each test case is a concrete example of a valid payload. When a developer needs to know "what does a `turn.plan.updated` event look like?", the test file is the answer.

### When to reach for it

Any project with shared type definitions between systems (client/server, service/service). Especially when the types include runtime validation (Zod, Effect Schema, io-ts). The test cost is near zero — you're just writing JSON payloads — and the bug prevention is high.

---

## What's NOT here

**No UI tests.** Layout, styling, and visual behavior are tested manually. The cost of maintaining visual regression tests outweighs the bugs they'd catch at this stage.

**No full end-to-end tests.** No Playwright driving the real app with a real provider. This will come when the product stabilizes. Right now the architecture is still shifting — E2E tests would break on every refactor.

**No provider runtime tests.** The real Codex and Claude Code processes aren't tested in CI. The adapter interfaces are tested via harnesses. The actual provider binaries are integration-tested manually.

## The meta-pattern

Test at seams, not at units. The interesting bugs in T3 Code aren't inside functions — they're between layers. The provider service routing to the wrong adapter. The projector dropping a message during revert. The schema decoder rejecting a valid event because a field was renamed.

Every pattern in this catalog targets a specific seam. The test pyramid here isn't "lots of unit tests, some integration tests, few E2E tests." It's "test every boundary where data crosses a trust boundary, skip the interiors."
