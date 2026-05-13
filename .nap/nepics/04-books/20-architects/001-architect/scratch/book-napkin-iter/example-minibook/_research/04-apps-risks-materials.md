# Research: Apps Module Risks When a Coda Document Is Copied

## Critical Context: Two Different Copy Paths [VERIFIED]

**Finding:** There are TWO distinct copy mechanisms in Coda, with radically different behavior for apps:

### Path A: ForkDocument (standard "Copy doc" button) [VERIFIED]

**File:** `modules/server/workflows/fork_document.ts`
**Line:** 131-205
**File:** `modules/server/frontend/private/actions/copy_document.ts` (line 31: imports `launchForkDocumentWorkflow`)

**How it works:** The fork loads the source doc's snapshot + ops verbatim into a NEW doc ID. All internal IDs (page IDs, grid IDs, column IDs, row IDs) remain IDENTICAL. Only the document-level ID changes (new doc ID, new S3 blob directory).

**Key evidence — no ID remapping:**
```typescript
// fork_document.ts line 275-288
// "This is a special usage of withModel that loads a model into the forked docId but does the load
// by loading the source doc"
await docManager.withModel({
    docId,                    // <-- NEW doc ID
    loadFromDocInfo: sourceDocInfo,  // <-- load ops FROM the source
    opVersion,
    // ...
});
```

**Blob copy is verbatim:** `copyBlobsToNewDoc` (line 169) calls S3 `copyDirectory` — it copies S3 objects from `blobs/{sourceDocId}/` to `blobs/{newDocId}/` without modification.

```typescript
// modules/server/doc-bulk-storage/document_bulk_storage.ts line 1143-1161
async copyBlobsToNewDoc(sourceDocId, newDocId, cutoffMinutes, {nextMarker} = {}): Promise<{nextMarker?: string}> {
    const {nextMarker: resultingNextMarker} = await this._s3.copyDirectory({
        bucket: this._bucket,
        src: this._getS3BlobPath(sourceDocId),
        dest: this._getS3BlobPath(newDocId),
        tagset: CrossRegionReplicationTagSet,
        concurrency: copyDirectoryOnForkConcurrency,
        cutoffMinutes,
        nextMarker,
    });
    return {nextMarker: resultingNextMarker};
}
```

**Impact for apps:** In a forked doc, ALL IDs are preserved. Grid IDs, column IDs, row IDs, page IDs, blob IDs — all the same. The generated app code with hardcoded `'grid-abc123'` will STILL WORK because `grid-abc123` exists in the forked doc with the same columns and rows. The [Apps] hidden page, its grids named `grid-app-${pageId}`, the blob references — all preserved.

### Path B: CopyDocToExistingDoc (cross-doc copy, agent content_duplicate) [VERIFIED]

**File:** `modules/server/workflows/copy_doc_to_existing_doc.ts`
**Line:** 94-107

**How it works:** Uses CopyVisitor to serialize the entire doc, then PasteWriter + IdRemapper to paste into a different existing doc with ALL IDs remapped.

```typescript
// copy_doc_to_existing_doc.ts line 100-107
function getCopyInfoForDocument({docModel, rowsToInclude}): CopyInfo {
    const copyVisitor = new CopyVisitor(docModel, {isCut: false, rowsToInclude});
    copyVisitor.copyDocument(docModel);
    return copyVisitor.getCopyInfo();
}
```

**Impact for apps:** Every internal ID changes. The generated app code's hardcoded IDs will ALL break. The grid name `grid-app-${oldPageId}` is preserved in the copy but the page ID changes, so GridCodeStore will create a new grid for the new page ID and the old grid is orphaned.

**When is this path used?** The Coda Agent's `content_duplicate` tool and cross-doc operations:
**File:** `modules/server/coda-agent/tools/features/document/content_duplicate.ts`


## Risk 1: Hardcoded IDs in Generated App Code [VERIFIED]

### System Prompt Guidance [VERIFIED]

**File:** `modules/browser/apps/agent/system_prompt.ts`
**Line:** 1-171

The system prompt tells the agent to use `CodaSDK.tables.list()` to discover tables and their column schemas. The SDK types include both `id` and `name`:

```typescript
// system_prompt.ts lines 78-79
//  - `SdkTable`: `{ id: string, name: string, columns: SdkColumn[] }`
//  - `SdkColumn`: `{ id: string, name: string, format: { type: string, isArray: boolean, ... } }`
```

The prompt does NOT instruct the agent to prefer names over IDs. The SDK API itself takes `tableId` as the parameter:

```typescript
// system_prompt.ts lines 62-63
//  - `CodaSDK.tables.getRows(tableId, options?)` -> `SdkRow[]`
//  - `CodaSDK.tables.addRow(tableId, values)` -> `SdkRow` — add a row, returns created row with generated ID
```

And row values are keyed by **column ID**, not column name:

```typescript
// system_prompt.ts line 83
//  - `SdkRow`: `{ id: string, values: Record<string, CellValue> }`
```

**The agent is therefore guided to use IDs everywhere.** The generated App.tsx typically contains:
- `CodaSDK.tables.getRows('grid-xxxxx')` — table ID as string literal
- `row.values['c-yyyyy']` — column ID as string literal
- `CodaSDK.tables.addRow('grid-xxxxx', {'c-yyyyy': value})` — both table and column IDs

### Agent Tools Return IDs [VERIFIED]

**File:** `modules/browser/apps/agent/agent_tools.ts`
**Line:** 394-421 (ListTables tool)

The ListTables tool calls `dataStore.listTables()` which returns `SdkTable[]` containing `id`, `name`, and `columns` with their `id` and `name`. The agent sees both — but the code it writes must USE IDs because the SDK API requires them.

```typescript
// agent_tools.ts line 401-418
async execute(_input) {
    try {
        const tables = await dataStore.listTables();
        return JSON.stringify(tables, null, 2);
    } catch (err) {
        return `Error listing tables: ${err instanceof Error ? err.message : String(err)}`;
    }
},
```

### DocDataStore Returns IDs [VERIFIED]

**File:** `modules/browser/apps/host/doc/data_store.ts`
**Line:** 246-256

```typescript
private _toSdkTable(grid: GridInterface): SdkTable {
    const columns: SdkColumn[] = [];
    for (const col of grid.columns) {
        columns.push({
            id: col.id,
            name: col.name,
            format: toColumnFormat(col, this._document),
        });
    }
    return {id: grid.id, name: grid.name, columns};
}
```

The table ID is the grid's actual ID (e.g., `grid-abc123`). Column IDs are the actual column IDs (e.g., `c-xxx`).

### SDK Contract [VERIFIED]

**File:** `modules/browser/apps/contracts/sdk.ts`
**Line:** 32-53

```typescript
export interface SdkColumn {
    id: string;
    name: string;
    format: PublicApiColumnFormat;
}

export interface SdkTable {
    id: string;
    name: string;
    columns: SdkColumn[];
}

export interface SdkRow {
    id: string;
    values: Record<string, SdkCellValue>;  // <-- keyed by column ID
}
```

### Risk Assessment

**ForkDocument path: SAFE.** All IDs preserved. The generated code works as-is.

**CopyDocToExistingDoc path: DEFINITELY BREAKS.** All IDs change. Every `getRows('grid-xxx')` call fails with "Table not found". Every `row.values['c-yyy']` returns `undefined`. The app is completely non-functional.

**Practical severity:** Currently moderate. The standard user "Copy doc" uses ForkDocument. CopyDocToExistingDoc is only triggered by the Coda Agent's content_duplicate tool and specific cross-doc workflows. But if the copy-to-existing-doc path becomes more common, this becomes critical.

**No name-based fallback exists.** The SDK accepts ONLY IDs, not names. Even if the agent wrote code using table names, the runtime would reject it.


## Risk 2: GridCodeStore Persistence [VERIFIED]

### Grid Naming Convention [VERIFIED]

**File:** `modules/browser/apps/host/doc/grid_code_store.ts`
**Line:** 278-306

The grid name is `grid-app-${appPageId}`:

```typescript
function _ensureAppGrid(document: DocumentInterface, appPageId: string): GridInterface {
    // 1. Find or create the [Apps] hidden page
    let appsCanvas = _findAppsPageCanvas(document);
    if (!appsCanvas) {
        const {canvasId} = document.addCanvasPage({name: APPS_PAGE_NAME, isHidden: true});
        appsCanvas = document.session.resolver.typedGetters.getPageCanvas(canvasId);
    }

    // 2. Find or create the per-app grid on the [Apps] canvas
    const gridName = `grid-app-${appPageId}`;
    let grid = _findGridByName(appsCanvas, gridName);
    if (!grid) {
        const endRange = createCollapsedRangeAtEndOfDocument(appsCanvas.slate.root);
        const gridId = appsCanvas.addGrid({
            at: endRange,
            name: gridName,
            columns: [
                {name: 'Type', id: COL_TYPE},
                {name: 'BlobRef', id: COL_BLOB_REF},
                {name: 'Timestamp', id: COL_TIMESTAMP},
                {name: 'Version', id: COL_VERSION},
            ],
        });
        grid = document.session.resolver.typedGetters.getGrid(gridId);
    }

    return grid;
}
```

### Grid Lookup Is By Name [VERIFIED]

**File:** `modules/browser/apps/host/doc/grid_code_store.ts`
**Line:** 320-327

```typescript
function _findGridByName(canvas: PageCanvasInterface, name: string): GridInterface | undefined {
    for (const grid of canvas.getGrids()) {
        if (grid.name === name) {
            return grid;
        }
    }
    return undefined;
}
```

### [Apps] Page Lookup Is By Name [VERIFIED]

**File:** `modules/browser/apps/host/doc/grid_code_store.ts`
**Line:** 309-317

```typescript
const APPS_PAGE_NAME = '[Apps]';

function _findAppsPageCanvas(document: DocumentInterface): PageCanvasInterface | undefined {
    const allPages = document.pagesManager.getFlattenedPages({skipHidden: false});
    for (const page of allPages) {
        if (page.name === APPS_PAGE_NAME) {
            return page.canvas ?? undefined;
        }
    }
    return undefined;
}
```

### AppHost Creation [VERIFIED]

**File:** `modules/browser/apps/ui/page_container.tsx`
**Line:** 129-142

```typescript
function AppPageContainerImpl({canvas}: AppPageContainerProps): React.JSX.Element | null {
    const page = canvas.page;
    const document = page?.document;
    const pageId = page?.id;        // <-- this is the NEW page ID after copy
    // ...
    const codeStore = GridCodeStore.create(document, pageId);  // looks for grid-app-${NEW_pageId}
```

### Risk Assessment

**ForkDocument path: SAFE.** Page IDs are preserved, so `grid-app-${pageId}` matches. The [Apps] page is preserved with the same name. The blob references in the grid rows point to blob IDs that exist in the new doc (copied by `copyBlobsToNewDoc`).

**CopyDocToExistingDoc path: DEFINITELY BREAKS.** The page ID is remapped to a new value. GridCodeStore looks for `grid-app-${newPageId}` but the copied grid is still named `grid-app-${oldPageId}`. Result: GridCodeStore creates a brand new empty grid. All saved code, version history, and conversation history are orphaned in the old-named grid.

### Blob References Survive Fork [VERIFIED]

**File:** `modules/browser/apps/host/doc/grid_code_store.ts`
**Line:** 77-78

```typescript
async saveCode(memfs: MemFileSystem): Promise<void> {
    const blobId = this._ingestMemfs(memfs);
    const blobRef = makeBlobRowReferenceValue(blobId);
```

Blob references use `makeBlobRowReferenceValue` which creates a `ReferenceValue` with `objectId: BLOBS_GRID_ID`. During fork, blob IDs are preserved and blobs are copied. During CopyDocToExistingDoc, blob IDs are only remapped if an existing blob with the same sourceUri already exists in the target doc (id_remapper_v2.ts line 479-492). Since app blobs are new (generated code, not user uploads), they won't match existing blobs — so new blob IDs are generated and the blob content is copied via the paste workflow.


## Risk 3: Conversation History Contamination [VERIFIED]

### History Storage [VERIFIED]

**File:** `modules/browser/apps/host/doc/grid_code_store.ts`
**Line:** 109-141

History is stored as a blob containing `JSON.stringify(messages)` where messages is `MessageParam[]`.

```typescript
async loadHistory(): Promise<MessageParam[]> {
    this._scanRows();
    if (!this._historyRowId) { return []; }
    const blobId = this._getBlobIdFromRow(this._historyRowId);
    if (!blobId) { return []; }
    return (await this._fetchAndParseHistory(blobId)) ?? [];
}

async saveHistory(messages: MessageParam[]): Promise<void> {
    const blobId = this._ingestHistory(messages);
    const blobRef = makeBlobRowReferenceValue(blobId);
    // upsert history pointer row...
}
```

### History Contains Tool Results with IDs [VERIFIED]

**File:** `modules/browser/apps/agent/agent.ts`
**Line:** 90-105

The agent loop appends tool results to the messages array. When the agent calls `ListTables`, the result is the full JSON dump of `SdkTable[]` including IDs:

```typescript
// agent.ts line 90-99
if (stopReason === 'tool_use') {
    messages.push({role: 'assistant', content: message.content});
    const toolResults = await this._executeToolCalls(message.content, signal);
    messages.push({role: 'user', content: toolResults});
    // loop continues...
}
```

The tool results contain:
- `ListTables` results: `[{id: "grid-xxx", name: "Tasks", columns: [{id: "c-yyy", name: "Status", ...}]}, ...]`
- `GetTableRows` results: `[{id: "i-zzz", values: {"c-yyy": "done"}}, ...]`
- `AddRow` results: `Row added: {id: "i-aaa", values: {...}}`

These are all persisted in the history blob.

### History Restored on Init [VERIFIED]

**File:** `modules/browser/apps/host/app_host.ts`
**Line:** 438-483

```typescript
private async _hydrateFromCodeStore(codeStore: CodeStore, memfs: MemFileSystem, log: Log): Promise<void> {
    const [hydratedFs, restoredHistory] = await Promise.all([
        codeStore.loadCode().catch(...),
        codeStore.loadHistory().catch(...),
    ]);
    // ...
    if (restoredHistory.length > 0) {
        this._emitState({messages: restoredHistory});
    }
}
```

### Agent Run Sends Full History [VERIFIED]

**File:** `modules/browser/apps/host/app_host.ts`
**Line:** 279-310

```typescript
send(text: string): void {
    const currentMessages = this._state.get().messages;  // includes restored history
    const newMessages: MessageParam[] = [...currentMessages, {role: 'user', content: text}];
    // ...
    void agent.run(newMessages);  // full history sent to LLM
}
```

### Risk Assessment

**ForkDocument path: SAFE.** IDs in history match current IDs since they're all preserved.

**CopyDocToExistingDoc path: CONFUSED BUT PARTIALLY MITIGATED.** The history is stored as an opaque blob. The blob content is copied verbatim (blob content is never inspected/modified during copy). So the restored history contains old IDs. When the user sends a new message, the agent sees:
- Old tool results in history: `ListTables -> [{id: "grid-OLD", name: "Tasks", ...}]`
- New tool results if it calls ListTables again: `[{id: "grid-NEW", name: "Tasks", ...}]`

The conflicting IDs would confuse the LLM — it might reference old IDs from history context, which would fail at runtime. However, **Risk 2 shows GridCodeStore won't even find the history** in the CopyDocToExistingDoc path (because the grid name doesn't match), so history would actually be LOST, not contaminated. The agent would start fresh with no history — which is actually safer than having stale history.


## Risk 4: MemFileSystem Code as Opaque Blob [VERIFIED]

### Pack/Unpack Mechanism [VERIFIED]

**File:** `modules/browser/apps/host/doc/mem_file_system.ts`
**Line:** 128-149

```typescript
pack(): string {
    const files = Object.fromEntries(this._files);
    return JSON.stringify({files});
}

static hydrate(data: string): MemFileSystem {
    const fs = new MemFileSystem();
    const parsed: unknown = JSON.parse(data);
    // ...
    const files = (parsed as {files: Record<string, string>}).files;
    for (const [path, content] of Object.entries(files)) {
        fs._files.set(_normalizePath(path), String(content));
    }
    return fs;
}
```

The pack format is: `{"files": {"src/App.tsx": "import React from 'react';\n...\nCodaSDK.tables.getRows('grid-xxx')...", ...}}`

This is stored as a blob via:

```typescript
// grid_code_store.ts line 225-231
private _ingestMemfs(memfs: MemFileSystem): string {
    const json = memfs.pack();
    const file = new File([json], 'app-source.txt', {type: 'text/plain'});
    const blobInfo = this._document.blobManager.ingestFile(file, 'app-source');
    void this._document.blobManager.startSync();
    return blobInfo.blobId;
}
```

### Blob Content Is Opaque Text [VERIFIED]

The blob is a `text/plain` file containing JSON. No part of the copy pipeline (fork or CopyVisitor/PasteWriter) inspects or rewrites blob content. The blobs are stored in S3 and copied byte-for-byte.

- Fork path: `copyBlobsToNewDoc` does S3 `copyDirectory` — raw file copy.
- CopyVisitor path: Blobs are referenced via `BlobCopyInfo` which contains the `blobId` and `sourceUri`. The actual blob bytes are fetched and re-uploaded to the destination doc as-is.

### What's Inside the Blob [VERIFIED]

The packed JSON contains the full source code of the app. Example:
```json
{"files":{"src/App.tsx":"import React from 'react';\nconst { Table, Card } = antd;\n\nfunction App() {\n  const [rows, setRows] = React.useState([]);\n  React.useEffect(() => {\n    CodaSDK.tables.getRows('grid-abc123').then(setRows);\n  }, []);\n  return <Table dataSource={rows.map(r => ({key: r.id, name: r.values['c-def456']}))} />;\n}\n\nwindow.App = App;"}}
```

The string literals `'grid-abc123'` and `'c-def456'` are embedded in the source code text. No automated system rewrites these.

### Risk Assessment

**ForkDocument path: SAFE.** IDs preserved, code works.

**CopyDocToExistingDoc path: DEFINITELY BREAKS.** The blob content contains string literals with old IDs. Even if GridCodeStore could find the blob (which it can't — see Risk 2), the code inside would reference old IDs that no longer exist in the target doc.


## Risk 5: Ephemeral State (MemStateStore) [VERIFIED]

### MemStateStore Is Purely In-Memory [VERIFIED]

**File:** `modules/browser/apps/host/doc/mem_state_store.ts`
**Line:** 1-31

```typescript
/**
 * MemStateStore — minimal StateStore backed by an in-memory Map.
 *
 * Accepts everything, no validation, no persistence. State survives iframe
 * reload (host holds it) but dies on page navigation.
 *
 * This is the foundation PR implementation. Future: GridStateStore adds
 * schema validation and persistence to the app grid.
 */
export class MemStateStore implements StateStore {
    private readonly _state = new Map<string, unknown>();
    get(key: string): unknown { return this._state.get(key); }
    set(key: string, value: unknown): void { this._state.set(key, value); }
    // ...
}
```

### AppHost Creates Fresh MemStateStore on Init [VERIFIED]

**File:** `modules/browser/apps/host/app_host.ts`
**Line:** 132-139

```typescript
constructor(config: AppHostConfig) {
    this._config = config;
    this._codeStore = config.codeStore;
    this.log = new Log(config.logOptions);
    this.errorCollector = new ErrorCollector(this.log);
    this.memfs = new MemFileSystem();
    this._stateStore = new MemStateStore();  // <-- fresh empty state on every construct
    // ...
}
```

### Risk Assessment

**Both paths: NO RISK from copy.** State is already lost on every page navigation. A copy cannot make this worse. The comment in `mem_state_store.ts` explicitly acknowledges: "State survives iframe reload (host holds it) but dies on page navigation."

**Caveat:** This IS a general limitation of the apps module, but it's orthogonal to the copy risk. The system prompt tells the agent to use CodaSDK tables for persistent data, not `useState` or `useCodaState`. If the app follows this guidance, there's no data loss.


## Risk 6: The [Apps] Hidden Page Itself [VERIFIED]

### CopyVisitor Copies Hidden Pages [VERIFIED]

**File:** `modules/common/model-serialization/copy_visitor.ts`
**Line:** 251-287

`copyDocument()` calls `getTopLevelPages()` which returns ALL pages, including hidden ones:

```typescript
copyDocument(document: DocumentInterface): void {
    const topLevelPages = document.pagesManager.getTopLevelPages();
    // ...
    for (const page of topLevelPages) {
        this._visitPage(page, {includeSubpages: true});
    }
}
```

**File:** `modules/common/models-document/pages_manager.ts`
**Line:** 400-417

`getTopLevelPages()` returns all pages with no parent — it does NOT filter by `isHidden`:

```typescript
getTopLevelPages(activePageId?: string): PageInterface[] {
    // ...
    const topLevelPages = this.toArray().filter(page => !page.parentId);
    return topLevelPages;
}
```

### CopyVisitor Preserves isHidden [VERIFIED]

**File:** `modules/common/model-serialization/copy_visitor.ts`
**Line:** 474, 518

The `_visitPage` method includes `isHidden` in `PageCopyInfo`:

```typescript
const pageInfo: PageCopyInfo = {
    type: CopyNodeType.Page,
    id,
    canvasId,
    name,
    // ...
    isHidden,        // <-- preserved
    pageType,
    // ...
};
```

### PasteWriter Recreates Hidden Pages [VERIFIED]

**File:** `modules/common/model-serialization/paste_writer.ts`
**Line:** 1427-1454

```typescript
const isHidden = isDefined(pageVisibilityOverride) ? !pageVisibilityOverride : pageInfo.isHidden;
// ...
({pageId} = this._document.addCanvasPage({
    ...pageInfo,
    // ...
    isHidden,   // <-- preserved from source
}));
```

### ForkDocument Preserves Everything [VERIFIED]

In the fork path, the entire model is loaded verbatim. The [Apps] page, its hidden status, its grids, all rows, all blob references — everything is preserved exactly.

### Risk Assessment

**ForkDocument path: SAFE.** The [Apps] page exists with same name, same grids, same content.

**CopyDocToExistingDoc path: PARTIALLY BREAKS.** The [Apps] page IS copied with `isHidden: true` and name `[Apps]`. The grids on it are also copied (with new IDs). But:
1. The grid names contain OLD page IDs: `grid-app-${oldPageId}`
2. GridCodeStore.create(document, newPageId) looks for `grid-app-${newPageId}` — won't find it
3. So it creates a NEW [Apps] page (since `_findAppsPageCanvas` finds the existing [Apps] page by name, BUT creates a new grid on it). Wait — actually `_findAppsPageCanvas` WILL find the [Apps] page (it searches by name `[Apps]`), and then `_findGridByName` will NOT find `grid-app-${newPageId}` — so it creates a new grid on the existing [Apps] canvas. Result: the [Apps] page ends up with both old-named and new-named grids.

**Edge case:** If the user had multiple app pages, the [Apps] page would have multiple `grid-app-${oldPageId}` grids — all orphaned after CopyDocToExistingDoc. Each app page in the new doc creates its own new grid. The old grids waste space but don't cause functional issues beyond losing the saved code.


## Summary: Risk Matrix

| Risk | ForkDocument (standard copy) | CopyDocToExistingDoc (cross-doc) |
|------|-----|------|
| 1. Hardcoded IDs in code | SAFE (IDs preserved) | BREAKS (all IDs change, code references old IDs) |
| 2. GridCodeStore persistence | SAFE (page IDs preserved, grid names match) | BREAKS (grid name has old pageId, new code store is empty) |
| 3. Conversation history | SAFE (IDs match) | LOST (GridCodeStore can't find history grid, starts fresh) |
| 4. MemFS code blob | SAFE (blob copied verbatim, IDs preserved) | BREAKS (blob content has old IDs, but also unreachable due to Risk 2) |
| 5. Ephemeral state | NO RISK (already ephemeral) | NO RISK (already ephemeral) |
| 6. Hidden [Apps] page | SAFE (entire model preserved) | PARTIALLY BREAKS (page copied, grids orphaned, new grid created empty) |

### Key Insight

**The standard "Copy doc" button is safe because ForkDocument preserves all internal IDs.** The risks only materialize in the CopyDocToExistingDoc path, which is currently limited to the Coda Agent's content_duplicate tool and specific cross-doc workflows.

However, this safety is **fragile and undocumented.** If anyone adds a new copy pathway or changes ForkDocument to remap IDs, apps would break silently. The fundamental vulnerability is that app code stores IDs as opaque string literals that no automated system can find or rewrite.


## Additional Finding: DocDataStore Exposes Apps Internal Grids [VERIFIED]

**File:** `modules/browser/apps/host/doc/data_store.ts`
**Line:** 68-71

```typescript
async listTables(): Promise<SdkTable[]> {
    const grids = this._document.getCanvasGrids();
    return grids.map(grid => this._toSdkTable(grid));
}
```

`getCanvasGrids()` returns ALL canvas grids, including those on hidden pages. This means the [Apps] page's `grid-app-${pageId}` grids (with columns Type, BlobRef, Timestamp, Version) show up in `CodaSDK.tables.list()` results. The agent could theoretically read/write to these internal grids.

**Impact:** This is a data leak/integrity risk, not a copy risk. The agent might accidentally use these internal grids as data tables, or worse, corrupt the code store. Not directly related to copy but worth noting.


## Additional Finding: AppHostRegistry Keys By PageId [VERIFIED]

**File:** `modules/browser/apps/host/app_host_registry.ts`
**Line:** 20-55

```typescript
export class AppHostRegistry {
    private readonly _hosts = new Map<string, AppHost>();
    // ...
    getOrCreate(pageId: string, config: AppHostConfig): AppHost {
        let host = this._hosts.get(pageId);
        if (!host) {
            const newHost = new AppHost(config);
            host = newHost;
            this._hosts.set(pageId, newHost);
            void newHost.init();
        }
        this._activeHost.set(host);
        return host;
    }
}
```

The registry is a module-level singleton keyed by pageId. Since each browser tab has its own module singleton, and the copied doc opens in a new tab, there's no conflict between the original and copied doc's AppHost instances.


## Additional Finding: Agent Model Defaults [VERIFIED]

**File:** `modules/browser/apps/agent/agent.ts`
**Line:** 42

```typescript
this._model = options.model ?? 'claude-sonnet-4-5-20250929';
```

The agent uses Claude Sonnet 4.5 by default. This is relevant because the model's ability to handle conflicting IDs in history (Risk 3) depends on its context window and reasoning capabilities.
