# Chapter 4: Apps-Specific Risks

## The Question

You have an app page. A user copies the document. Does the app work in the copy?

The answer depends on *which* copy path fired. Chapter 2 established that Coda has two: ForkDocument (the standard "Copy doc" button) and CopyDocToExistingDoc (cross-doc paste, the agent's `content_duplicate` tool). For most Coda features the distinction is a subtlety. For apps, it is the difference between "everything works" and "everything is broken."

This chapter maps every apps-specific artifact to both copy paths, assigns a severity, and proposes mitigations. If you need to make a decision about copy support for apps, this is the reference.

## The Summary Table

Read this first. Detailed analysis of each risk follows.

| # | Risk | Fork (Copy Doc) | Cross-Doc Copy | Severity | Mitigation Difficulty |
|---|------|-----------------|----------------|----------|----------------------|
| 1 | Hardcoded IDs in generated code | SAFE | BREAKS | **Critical** | Hard |
| 2 | GridCodeStore grid naming | SAFE | BREAKS | **Critical** | Medium |
| 3 | Blob content opacity | SAFE | BREAKS (but masked by #2) | High | Hard |
| 4 | Conversation history | SAFE | LOST (masked by #2) | Low | None needed |
| 5 | Ephemeral state (MemStateStore) | NO RISK | NO RISK | None | N/A |
| 6 | Hidden [Apps] page | SAFE | SAFE (page survives, grids orphaned) | Low | Easy |

**The punchline:** Fork is safe across the board. Cross-doc copy breaks apps completely. The two critical risks (#1 and #2) are independent failure modes that each alone would be fatal. The remaining risks are either masked by #2 (the code store is unreachable, so the broken code never loads) or irrelevant.

---

## Risk 1: Hardcoded IDs in Generated Code

This is the fundamental problem. It is not a bug; it is a structural consequence of how the agent, the SDK, and the copy pipeline interact.

### How IDs get baked into source code

The agent discovers tables by calling `CodaSDK.tables.list()`. The **`listTables()`** method ([data_store.ts:68](/modules/browser/apps/host/doc/data_store.ts#L68)) returns `SdkTable[]` containing both `id` and `name` for every table and column:

```typescript
// data_store.ts line 246-253
private _toSdkTable(grid: GridInterface): SdkTable {
    const columns: SdkColumn[] = [];
    for (const col of grid.columns) {
        columns.push({
            id: col.id,       // e.g. "c-AbCdEf"
            name: col.name,   // e.g. "Status"
            format: toColumnFormat(col, this._document),
        });
    }
    return {id: grid.id, name: grid.name, columns};  // grid.id = "grid-XyZ123"
}
```

But the SDK's data methods accept only IDs. **`_getGrid()`** ([data_store.ts:237](/modules/browser/apps/host/doc/data_store.ts#L237)) does a strict ID lookup with no name fallback:

```typescript
private _getGrid(tableId: string): GridInterface {
    const grids = this._document.getCanvasGrids();
    const grid = grids.find(g => g.id === tableId);  // ID match only
    if (!grid) {
        throw new Error(`Table not found: ${tableId}`);
    }
    return grid;
}
```

And the system prompt ([system_prompt.ts:59-63](/modules/browser/apps/agent/system_prompt.ts#L59)) documents the API with `tableId` parameters:

```
- CodaSDK.tables.getRows(tableId, options?) -> SdkRow[]
- CodaSDK.tables.addRow(tableId, values) -> SdkRow
```

Row values are keyed by column ID ([system_prompt.ts:83](/modules/browser/apps/agent/system_prompt.ts#L83)):

```
- SdkRow: { id: string, values: Record<string, CellValue> }
```

The prompt does not instruct the agent to prefer names over IDs. The SDK does not accept names. So the agent writes code like this:

```tsx
// Typical agent-generated App.tsx
function App() {
  const [rows, setRows] = React.useState([]);
  React.useEffect(() => {
    CodaSDK.tables.getRows('grid-XyZ123').then(setRows);  // table ID as string literal
  }, []);
  return (
    <Table dataSource={rows.map(r => ({
      key: r.id,
      name: r.values['c-AbCdEf'],     // column ID as string literal
      status: r.values['c-GhIjKl'],   // another column ID
    }))} />
  );
}
```

These IDs are baked into the source code as string literals. The source code is packed into a JSON blob and stored in S3. No part of the copy pipeline inspects blob content.

### Fork: safe

ForkDocument copies the raw snapshot. All internal IDs -- grid IDs, column IDs, row IDs -- are preserved verbatim. The string literal `'grid-XyZ123'` in the generated code still resolves because `grid-XyZ123` exists in the forked doc with the same columns.

### Cross-doc copy: breaks

CopyDocToExistingDoc runs every grid through `IdRemapper.getMappedCollaborativeObjectId()` ([id_remapper_v2.ts:232](/modules/common/model-serialization/private/id_remapper_v2.ts#L232)), which generates a new ID for every grid in cross-doc mode:

```typescript
} else if (this._isCrossDocPaste) {
    this._remappedCollaborativeObjectIds[objectId] = ids.generateNewIdOfSameType(objectId);
}
```

So `grid-XyZ123` becomes `grid-NewAbc`. But the generated source code still says `getRows('grid-XyZ123')`. That call throws `"Table not found: grid-XyZ123"`. The app is dead.

**An important nuance about column IDs:** Column IDs are actually *not* remapped in cross-doc copy -- `getMappedCollaborativeObjectId()` only remaps grid-type IDs. So the `row.values['c-AbCdEf']` references would survive *if* the table could be found. But since the table lookup fails first, this is academic.

### Severity: Critical

Every app that reads or writes data (which is every useful app) will break on cross-doc copy. There is no partial failure mode -- the first SDK call throws and the app renders nothing.

---

## Risk 2: GridCodeStore Grid Naming

Even if the hardcoded-ID problem didn't exist, the app's saved code would be unreachable after cross-doc copy. This is an independent failure mode.

### How GridCodeStore finds its data

Each app page stores its source code, version history, and conversation history in a dedicated grid on the hidden `[Apps]` page. The **`_ensureAppGrid()`** function ([grid_code_store.ts:278](/modules/browser/apps/host/doc/grid_code_store.ts#L278)) constructs the grid name from the page ID:

```typescript
function _ensureAppGrid(document: DocumentInterface, appPageId: string): GridInterface {
    let appsCanvas = _findAppsPageCanvas(document);    // finds [Apps] page by name
    if (!appsCanvas) { /* create it */ }

    const gridName = `grid-app-${appPageId}`;          // page ID embedded in name
    let grid = _findGridByName(appsCanvas, gridName);  // name-based lookup
    if (!grid) { /* create a new empty grid */ }
    return grid;
}
```

And `_findGridByName()` ([grid_code_store.ts:320](/modules/browser/apps/host/doc/grid_code_store.ts#L320)) is a simple string match:

```typescript
function _findGridByName(canvas: PageCanvasInterface, name: string): GridInterface | undefined {
    for (const grid of canvas.getGrids()) {
        if (grid.name === name) { return grid; }
    }
    return undefined;
}
```

The caller is **`AppPageContainerImpl`** ([page_container.tsx:129](/modules/browser/apps/ui/page_container.tsx#L129)):

```typescript
const pageId = page?.id;   // the NEW page ID after copy
const codeStore = GridCodeStore.create(document, pageId);  // looks for grid-app-${NEW_pageId}
```

### Fork: safe

Page IDs are preserved. `grid-app-${pageId}` matches. The [Apps] page, its grids, and all blob references are intact.

### Cross-doc copy: breaks

Page IDs are always remapped in CopyDocToExistingDoc ([id_remapper_v2.ts:256](/modules/common/model-serialization/private/id_remapper_v2.ts#L256)):

```typescript
getMappedPageId(pageId: string): string {
    if (!this._remappedPageIds[pageId]) {
        this._remappedPageIds[pageId] = ids.generateNewIdOfSameType(pageId);
    }
    return this._remappedPageIds[pageId];
}
```

The old page ID `p-OldId` becomes `p-NewId`. The copied grid on the [Apps] page is still named `grid-app-p-OldId`. But `GridCodeStore.create(document, 'p-NewId')` looks for `grid-app-p-NewId`, finds nothing, and creates a fresh empty grid.

Result: the app page opens with a blank code store. All saved source code, version history, and conversation history are stranded in the orphaned `grid-app-p-OldId` grid.

### The orphan accumulation problem

If a document has three app pages, the [Apps] page after cross-doc copy will have six grids: three orphaned (old names) and three fresh-created (new names). The orphans waste space but cause no functional harm. They are invisible to users (the [Apps] page is hidden) and invisible to the code store (it only finds grids matching the current page ID pattern).

### Severity: Critical

This is fatal independently of Risk #1. Even if we fixed hardcoded IDs in the source code, the source code itself would not be found after cross-doc copy.

---

## Risk 3: Blob Content Opacity

The generated app source lives inside a blob. Here is the chain:

1. The agent writes `src/App.tsx` into a `MemFileSystem`
2. `MemFileSystem.pack()` ([mem_file_system.ts:128](/modules/browser/apps/host/doc/mem_file_system.ts#L128)) serializes it to JSON: `{"files":{"src/App.tsx":"import React...\nCodaSDK.tables.getRows('grid-XyZ123')...\n"}}`
3. `GridCodeStore._ingestMemfs()` ([grid_code_store.ts:225](/modules/browser/apps/host/doc/grid_code_store.ts#L225)) stores that JSON as a `text/plain` blob via `blobManager.ingestFile()`
4. The blob is uploaded to S3

During fork, `copyBlobsToNewDoc()` ([document_bulk_storage.ts:1143](/modules/server/doc-bulk-storage/document_bulk_storage.ts#L1143)) does a raw S3 directory copy. During cross-doc copy, blobs are fetched and re-uploaded as-is. Neither path inspects or rewrites blob content.

The string `'grid-XyZ123'` inside the packed JSON is invisible to the copy pipeline. It is not a typed reference, not a formula, not a structured value -- it is bytes in a file. The copy pipeline has no mechanism to find it, let alone rewrite it.

### Fork: safe

Blob content does not need rewriting because all IDs are preserved.

### Cross-doc copy: breaks, but masked

The blob content would be broken (old IDs as string literals), but this risk is masked by Risk #2: the grid that holds the blob reference is orphaned, so the blob is never loaded. The app starts fresh.

### Severity: High (in isolation), Low (in practice)

If Risk #2 were fixed but Risk #3 were not, the app would load its old source code -- which references IDs that no longer exist. Both risks need to be solved together for cross-doc copy to work.

---

## Risk 4: Conversation History

The agent's conversation history is stored as a blob containing `JSON.stringify(messages)`, managed through **`saveHistory()`** and **`loadHistory()`** ([grid_code_store.ts:109](/modules/browser/apps/host/doc/grid_code_store.ts#L109)):

```typescript
async loadHistory(): Promise<MessageParam[]> {
    this._scanRows();
    if (!this._historyRowId) { return []; }
    const blobId = this._getBlobIdFromRow(this._historyRowId);
    if (!blobId) { return []; }
    return (await this._fetchAndParseHistory(blobId)) ?? [];
}
```

The history `MessageParam[]` array contains the full transcript including tool results. When the agent called `ListTables`, the result was `[{id: "grid-OldId", name: "Tasks", columns: [...]}]`. When it called `GetTableRows`, the result was `[{id: "i-row123", values: {"c-AbCdEf": "done"}}]`. All of these IDs are embedded in the conversation text.

On the next `send()` call ([app_host.ts:279](/modules/browser/apps/host/app_host.ts#L279)), the entire history is sent to the LLM:

```typescript
send(text: string): void {
    const currentMessages = this._state.get().messages;  // includes restored history
    const newMessages: MessageParam[] = [...currentMessages, {role: 'user', content: text}];
    void agent.run(newMessages);  // full history sent to Claude
}
```

If the history survived cross-doc copy, the LLM would see conflicting IDs: old IDs from historical tool results, new IDs from fresh `ListTables` calls. This would be deeply confusing to the model.

### Fork: safe

IDs in history match current IDs.

### Cross-doc copy: lost (which is actually fine)

Because of Risk #2, the history grid is orphaned. `loadHistory()` returns `[]`. The agent starts with a clean slate. This is actually the *better* outcome -- stale history with wrong IDs would be worse than no history.

### Severity: Low

Not a problem in practice. If Risk #2 were fixed, this would need to be addressed too (either by discarding history on copy, or by rewriting IDs in the conversation blob). But starting fresh is a reasonable behavior for a copied document.

---

## Risk 5: Ephemeral State (MemStateStore)

**`MemStateStore`** ([mem_state_store.ts:1](/modules/browser/apps/host/doc/mem_state_store.ts#L1)) is an in-memory `Map<string, unknown>`. It dies on page navigation. It is not persisted to blobs, grids, or anywhere else.

```typescript
export class MemStateStore implements StateStore {
    private readonly _state = new Map<string, unknown>();
    get(key: string): unknown { return this._state.get(key); }
    set(key: string, value: unknown): void { this._state.set(key, value); }
}
```

**`AppHost`** creates a fresh `MemStateStore` on every construction ([app_host.ts:132](/modules/browser/apps/host/app_host.ts#L132)):

```typescript
this._stateStore = new MemStateStore();  // fresh empty state on every construct
```

### Both copy paths: no risk

State is already ephemeral. Copy cannot make it worse. The system prompt instructs the agent to use `CodaSDK.tables` for persistent data. If the app follows that guidance, there is nothing to lose.

This is not a copy risk. It is a general limitation of the current apps runtime, and it is orthogonal to document copying.

---

## Risk 6: The Hidden [Apps] Page

The `[Apps]` page is a hidden page that holds all the per-app grids (code, history, versions). Does it survive copy?

### CopyVisitor visits hidden pages

**`copyDocument()`** ([copy_visitor.ts:251](/modules/common/model-serialization/copy_visitor.ts#L251)) iterates `getTopLevelPages()`, which returns ALL pages including hidden ones ([pages_manager.ts:400](/modules/common/models-document/pages_manager.ts#L400)):

```typescript
const topLevelPages = this.toArray().filter(page => !page.parentId);  // no isHidden filter
```

The `_visitPage` method preserves `isHidden` in the `PageCopyInfo` ([copy_visitor.ts:474](/modules/common/model-serialization/copy_visitor.ts#L474)), and PasteWriter recreates the page with `isHidden: true` ([paste_writer.ts:1427](/modules/common/model-serialization/paste_writer.ts#L1427)).

### Fork: safe

The entire model is loaded verbatim. The [Apps] page, its grids, and all rows survive.

### Cross-doc copy: the page survives, but grids are orphaned

The [Apps] page is copied with the correct name and hidden flag. Its grids are also copied (with new grid IDs). But the grid *names* still contain old page IDs: `grid-app-p-OldId`. Since `_findAppsPageCanvas()` finds the [Apps] page by name ([grid_code_store.ts:309](/modules/browser/apps/host/doc/grid_code_store.ts#L309)), the page is found. But `_findGridByName()` looks for `grid-app-p-NewId` and misses, creating new empty grids on the existing [Apps] canvas.

After cross-doc copy of a document with N app pages, the [Apps] canvas has 2N grids: N orphaned (old names) and N fresh (new names).

### Severity: Low

The [Apps] page itself is fine. The orphaned grids are the same problem described in Risk #2 -- they are a consequence, not an independent failure mode.

---

## Bonus Finding: DocDataStore Exposes Internal Grids

**`listTables()`** ([data_store.ts:68](/modules/browser/apps/host/doc/data_store.ts#L68)) returns ALL canvas grids, including those on hidden pages:

```typescript
async listTables(): Promise<SdkTable[]> {
    const grids = this._document.getCanvasGrids();  // includes [Apps] page grids
    return grids.map(grid => this._toSdkTable(grid));
}
```

This means the agent sees the internal `grid-app-${pageId}` grids (with columns Type, BlobRef, Timestamp, Version) in its `ListTables` results. The agent could accidentally use these as data tables, or worse, corrupt the code store by writing to them.

This is not a copy risk, but it is worth noting because it means the agent's tool results -- which get baked into conversation history and potentially into generated code -- include IDs of internal infrastructure grids.

---

## Mitigations

Four strategies, ordered from most practical to most ambitious.

### 1. System prompt guidance: prefer names over IDs

**Difficulty: Easy. Effectiveness: Partial.**

Add to the system prompt:

```
When writing code that references tables or columns, ALWAYS resolve by name at
runtime rather than hardcoding IDs. IDs may change if the document is copied.

Pattern:
  const tables = await CodaSDK.tables.list();
  const tasks = tables.find(t => t.name === 'Tasks');
  const statusCol = tasks.columns.find(c => c.name === 'Status');
  const rows = await CodaSDK.tables.getRows(tasks.id);
  rows.map(r => r.values[statusCol.id]);
```

This does not fix the SDK -- `getRows` still requires an ID. But it changes the generated code from hardcoded `'grid-XyZ123'` to a runtime lookup by name. If the table name is preserved across copy (it is), the lookup succeeds even when the ID changes.

**Limitation:** This only works if the agent follows the guidance. LLMs are probabilistic; some fraction of generated code will still hardcode IDs, especially for simple apps where the agent decides the indirection is unnecessary. And column access via `row.values[columnId]` requires knowing the column ID at runtime, which means the agent must also look up columns by name.

**Limitation 2:** Table and column names are not unique. If a document has two tables named "Tasks", name-based lookup is ambiguous. The current system has no solution for this.

### 2. SDK-level name resolution

**Difficulty: Medium. Effectiveness: High.**

Add name-based overloads to the SDK so the agent never needs to think about IDs:

```typescript
// Current: ID only
CodaSDK.tables.getRows(tableId: string, options?)

// Proposed: ID or name
CodaSDK.tables.getRows(tableIdOrName: string, options?)
```

The **`_getGrid()`** implementation would change from:

```typescript
// Current
const grid = grids.find(g => g.id === tableId);
```

To:

```typescript
// Proposed
const grid = grids.find(g => g.id === tableIdOrName || g.name === tableIdOrName);
```

Combined with system prompt guidance to use names, this makes the generated code copy-safe by default. The ID path still works for backwards compatibility.

**Limitation:** Same ambiguity problem with duplicate names. Could be mitigated by throwing on ambiguous name matches and requiring the agent to disambiguate.

### 3. Post-copy repair: detect and regenerate

**Difficulty: Medium. Effectiveness: Complete (for GridCodeStore).**

When an app page opens and GridCodeStore finds no matching grid, instead of creating a blank grid, search for orphaned grids whose names contain old page IDs and offer to repair:

```
Detect: grid-app-{oldPageId} exists on [Apps] canvas, but grid-app-{newPageId} does not
Action: Rename grid-app-{oldPageId} to grid-app-{newPageId}
```

This fixes Risk #2 completely. The code store, history, and blob references all become reachable again.

But the loaded source code still contains hardcoded old IDs (Risk #1 and #3). So two sub-strategies:

**3a. Offer to re-run the agent.** Detect that the loaded code references IDs that do not exist in the current document. Surface a prompt: "This app was copied from another document. Its code references tables that have changed. Would you like the agent to update the code?" Then re-run the agent with the existing code and conversation history, asking it to update all ID references.

**3b. Mechanical ID rewriting in blob content.** Parse the packed JSON, find string literals matching ID patterns (`grid-*`, `c-*`, `i-*`), and rewrite them using the ID remapping table from the copy operation. This is fragile -- it requires the copy pipeline to expose its remapping table to the apps module, and regex-based rewriting in source code is inherently risky. But it would be fully automatic.

### 4. Store code in a copy-aware format

**Difficulty: Hard. Effectiveness: Complete.**

Instead of storing raw source code as an opaque blob, store it in a format that separates the code from its data bindings:

```json
{
  "files": {"src/App.tsx": "...CodaSDK.tables.getRows(TABLES.tasks)..."},
  "bindings": {
    "TABLES.tasks": {"type": "grid", "id": "grid-XyZ123", "name": "Tasks"},
    "COLUMNS.tasks.status": {"type": "column", "id": "c-AbCdEf", "name": "Status"}
  }
}
```

The bindings could use typed references (`ValueType.Reference`) stored in grid cells rather than blob content, making them visible to the copy pipeline's ID remapping. The generated code would use symbolic names that resolve at runtime through the bindings.

This is the most robust solution but requires significant changes to the agent, the code store, the runtime bundler, and the SDK. It is an architectural change, not a patch.

---

## Recommended Approach

For immediate safety: **Mitigations 1 + 3 (partial).**

1. Update the system prompt to strongly prefer name-based lookups. This makes new apps copy-safer.
2. Add orphan grid detection to GridCodeStore so the code store is recovered after cross-doc copy.
3. When stale IDs are detected in recovered code, prompt the user to re-run the agent.

For medium-term robustness: **Mitigation 2.**

Add name-based resolution to the SDK. This eliminates the ID-hardcoding problem at the API level and makes the system prompt guidance enforceable by the runtime.

Mitigation 4 is the correct long-term architecture but is not justified until apps are a more mature feature with a larger surface area of copy-related issues.

---

## Key Takeaways

- **Fork is safe. Cross-doc copy is fatal.** The standard "Copy doc" button uses ForkDocument, which preserves all internal IDs. Apps work. CopyDocToExistingDoc remaps IDs, which breaks apps in two independent ways (hardcoded IDs in code + grid name mismatch in code store). Both must be fixed.

- **The root cause is structural, not incidental.** The agent generates code with string-literal IDs because the SDK requires IDs and the system prompt does not discourage it. The code is stored as an opaque blob that the copy pipeline cannot inspect. The code store names grids using page IDs that get remapped. These are not bugs -- they are design decisions that assumed copy-safety was not a requirement.

- **Blob opacity is the hard constraint.** The copy pipeline rewrites typed references, formulas, and structured values. It does not rewrite bytes inside blobs. Any solution that stores IDs as plain text in blobs will have this problem. The only way to make blob content copy-aware is to either not put IDs in it (mitigation 1/2), or extract the IDs into a copy-visible format (mitigation 4).

- **Conversation history loss is a feature, not a bug.** On cross-doc copy, the history is unreachable (orphaned grid) and would contain stale IDs anyway. Starting the agent fresh is the correct behavior. Do not try to preserve history across copy.

- **The orphan grid problem is easy to fix and high-leverage.** Renaming `grid-app-{oldPageId}` to `grid-app-{newPageId}` after copy recovers the code store, the history, and the blob references in one operation. This does not fix the hardcoded IDs in the code, but it makes the code *loadable*, which is a prerequisite for any repair strategy.

- **The safety of fork is fragile and undocumented.** If anyone changes ForkDocument to remap IDs, or introduces a new copy path that does remapping, apps will break silently. The apps module has no tests for copy behavior and no explicit contract with the copy pipeline. This should be documented and tested.
