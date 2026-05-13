# Chapter 1a: Copy Triggers & Flows

## Why You're Here

You've read Chapter 1. You understand the two pipelines: ForkDocument (op-log copy, IDs preserved) and CopyVisitor/PasteWriter (serialization through CopyInfo, IDs remapped). Now the question is: **when does each one fire?**

There are at least ten distinct user actions, API calls, and system operations that copy content in Coda. Some hit the fork path. Some hit the CopyVisitor path. Some start in the browser, some on the server, some span both. If you're building features that need to survive copying -- and if you're on the Apps team, you are -- you need to know exactly which pipeline your feature passes through for every trigger.

This chapter is a map. Chapter 1 was the terrain.

---

## The Complete Trigger Inventory

Every copy operation in Coda, in one table. Reference this when you need to know "what happens when X?"

| Trigger | Where | Pipeline | IDs Remapped? | Ops Land In |
|---|---|---|---|---|
| **Copy Doc** button | Server (async workflow) | ForkDocument (op-log copy) | No -- same op history | New doc DB directly |
| **Auto Copy Doc** (URL `?copy=true`) | Server (async workflow) | ForkDocument (op-log copy) | No | New doc DB directly |
| **Use Template** (copy to new doc) | Server (async workflow) | ForkDocument (op-log copy) | No | New doc DB directly |
| **Insert In-Doc Template** (into existing doc) | Browser (async fetch + paste) | CopyVisitor + PasteWriter | **Yes** (`DuplicateData`) | Uncommitted ops -> sync engine |
| **Duplicate Page** | Browser (synchronous) | CopyVisitor + PasteWriter | Yes -- all new IDs | Uncommitted ops -> sync engine |
| **Canvas copy-paste** (same doc) | Browser (sync/async) | CopyVisitor + PasteWriter | Depends on `PasteLinkingBehavior` | Uncommitted ops -> sync engine |
| **Canvas copy-paste** (cross-doc) | Browser (sync/async) | CopyVisitor + PasteWriter | Yes (`DuplicateData`) | Uncommitted ops -> sync engine |
| **Grid cell range** copy-paste | Browser (sync/async) | CopyVisitor + PasteWriter | Yes (`DuplicateData` default) | Uncommitted ops -> sync engine |
| **MCP `content_duplicate`** (doc -> new doc) | Server (async workflow) | ForkDocument (op-log copy) | No | New doc DB directly |
| **MCP `content_duplicate`** (page -> existing doc) | Server (async workflow) | CopyPastePagesV2 (CopyVisitor + PasteWriter) | Yes | Server workflow -> processUncommittedOps |
| **MCP `content_duplicate`** (doc -> existing doc) | Server (async workflow) | CopyDocToExistingDoc (CopyVisitor + PasteWriter) | Yes | Server workflow -> processUncommittedOps |
| **SquashDocument** | Server (async workflow) | CopyVisitor + PasteWriter with IdentityIdRemapper | No (new doc, safe) | Fresh op log in new doc |
| **Internal debug copy** | Browser (manual) | CopyVisitor + PasteWriter | Yes | Uncommitted ops -> sync engine |

**Note on "Insert In-Doc Template":** When a doc is published as a template, its content is pre-serialized to CopyInfo via `copyTemplateDocumentContent()` ([paste-utils/index.ts:202](/modules/common/paste-utils/index.ts#L202)) and stored as a blob. When a user inserts that template into their existing doc, `_pasteHandler()` ([op_log_examples.ts:115](/modules/browser/atomic-template-helpers/op_log_examples.ts#L115)) fetches the CopyInfo and runs PasteWriter with `PasteLinkingBehavior.DuplicateData` ([op_log_examples.ts:157](/modules/browser/atomic-template-helpers/op_log_examples.ts#L157)). All IDs are remapped. This is a user-facing action that triggers the remap path — Apps would break if an app page were inserted this way.

The mental model that makes this table predictable: **fork = new container, IDs are safe. Everything else = content entering an existing container, IDs must remap.** There are no exceptions. Even SquashDocument, which creates a new document via CopyVisitor, uses IdentityIdRemapper because the target is an empty new doc.

**The critical observation for Apps:** Every user-facing "copy a whole doc" action — Copy Doc, Use Template (to new doc), auto-copy URL — hits the **fork path**. IDs are preserved. But there is one user-facing remap path that matters: **inserting an in-doc template into an existing doc**. This goes through PasteWriter with `DuplicateData` — all IDs remapped. If an app page is published as a template and someone inserts it into their doc, the generated code would have stale IDs. The other remap triggers (duplicate page, cross-doc paste, MCP content_duplicate) also apply. For Apps, **standard doc copy is safe by accident, not by design** — the safety depends entirely on which workflow the copy button happens to call.

---

## End-to-End Sequences

### Flow 1: "Copy Doc" (ForkDocument)

The most common copy. User clicks "Copy this doc," gets a full independent clone.

```
 Browser                            Server                              Async Workflow
 ───────                            ──────                              ──────────────
    │                                  │                                     │
    │  POST /copy/:docId               │                                     │
    │  {title, folderId, opVersion}    │                                     │
    │─────────────────────────────────>│                                     │
    │                                  │                                     │
    │                                  │ Validate (perms, doc type,          │
    │                                  │   tx boundaries, schema ver)        │
    │                                  │                                     │
    │                                  │ Create doc shell                    │
    │                                  │   (availabilityState: Initializing) │
    │                                  │                                     │
    │                                  │ Fire-and-forget workflow ──────────>│
    │                                  │                                     │
    │  302 Redirect to new doc URL     │                                     │
    │<─────────────────────────────────│                                     │
    │                                  │                          Task 1: Copy bytes
    │  Open new doc (shows             │                          (blobs, ops, automations)
    │    "Initializing...")            │                                     │
    │                                  │                          Task 2: Scrub model
    │                                  │                          (authors, comments, sync tables)
    │                                  │                          + GC op (wall)
    │                                  │                                     │
    │                                  │                          Task 3: Flip to ONLINE
    │                                  │                                     │
    │  Doc loads with full content     │                                     │
```

Key entry points in the code:

- **`doDocumentCopy()`:** [copy_document_helpers.ts:48](/modules/browser/navigation/private/copy_document_helpers.ts#L48) -- browser-side, validates permissions, opens modal
- **`copyDocument()` handler:** [copy_document.ts:51](/modules/server/frontend/private/actions/copy_document.ts#L51) -- server HTTP handler, calls `launchForkDocumentWorkflow`
- **`launchForkDocumentWorkflow()`:** [launch_fork_document_workflow.ts:48](/modules/server/document-lib/launch_fork_document_workflow.ts#L48) -- validation gauntlet, creates doc shell, launches workflow
- **`forkDocument` workflow:** [fork_document.ts:131](/modules/server/workflows/fork_document.ts#L131) -- the three-task pipeline

The redirect happens *before* the workflow finishes. The user sees an "Initializing" state. If the workflow service is down, a `fork_document_sweeper` picks up orphaned docs and relaunches their workflows. Belt and suspenders.

Template creation ("Use as template") uses this **exact same path**. Both `copyDocument()` and `autoCopyDocument()` call `launchForkDocumentWorkflow` — verified at [auto_copy_document.ts:80](/modules/server/frontend/private/actions/auto_copy_document.ts#L80). The only difference is the title prefix:

```typescript
// copy_document_helpers.ts:36-44
const useMyPrefix = docInitContext.bentosInitContext?.type === BentosInitContextType.Template && isPublished;
if (useMyPrefix) {
  newDocTitle = `My ${docTitleLower}`;  // Template copies
} else {
  newDocTitle = `Copy of ${originalDocTitle}`;  // Regular copies
}
```

This means an app page published as a template will work perfectly when someone copies it — all grid IDs, column IDs, row IDs, blob IDs are preserved in the fork.

### Flow 2: "Duplicate Page" (Browser-Side CopyVisitor/PasteWriter)

User right-clicks a page, selects "Duplicate." Entirely browser-side, synchronous.

```
 Browser (same tab, same doc)
 ─────────────────────────────
    │
    │ performDuplicatePage()
    │   ├── Build copy/paste options (PasteLinkingBehavior)
    │   ├── CopyVisitor.copyPage(sourcePage, {includeSubpages})
    │   │     └── Walks page + canvas + embedded grids
    │   │     └── Returns CopyInfo (serialized snapshot)
    │   │
    │   ├── PasteWriter(document, copyInfo, pasteOptions)
    │   │     ├── IdRemapper generates fresh IDs for everything
    │   │     ├── Rewrites all formulas with new IDs
    │   │     └── pasteIntoDocument({type: AppendPagesPaste, parentId, position})
    │   │           └── Generates uncommitted ops
    │   │
    │   └── Navigate to new page
    │
    │ Ops flow through normal sync engine to server
```

- **`performDuplicatePage()`:** [duplicate_page_helpers.ts:181](/modules/browser/page-list/private/duplicate_page_helpers.ts#L181) -- shared entry point, calls `duplicatePage()`, navigates to result
- **`duplicatePage()`:** [utils.ts:150](/modules/common/model-serialization/utils.ts#L150) -- the core: CopyVisitor -> CopyInfo -> PasteWriter -> ops
- **`shouldShowDuplicateDialog()`:** [duplicate_page_helpers.ts:96](/modules/browser/page-list/private/duplicate_page_helpers.ts#L96) -- shows confirmation when page has subpages or tables

Before duplicating, the system may ask the user about linking behavior. **`_buildDuplicateOptions()`** ([duplicate_page_helpers.ts:156](/modules/browser/page-list/private/duplicate_page_helpers.ts#L156)) determines this: when `PasteLinkingBehavior` is `CreateViews`, views of existing tables are created rather than full table copies. When it's `DuplicateData`, everything is cloned fresh.

### Flow 3: Cross-Doc Copy-Paste (Clipboard)

User copies content in Doc A, pastes in Doc B (possibly a different browser tab). This is the most complex flow because it spans the system clipboard, IndexedDB, and MIME type negotiation.

```
 Tab A (Source Doc)                     System Clipboard              Tab B (Target Doc)
 ──────────────────                     ────────────────              ──────────────────
    │                                        │                            │
    │ Cmd+C fires native copy event          │                            │
    │                                        │                            │
    │ performCopyOrCut():                    │                            │
    │   CopyVisitor.copyTextSelection()      │                            │
    │   -> CopyInfo                          │                            │
    │                                        │                            │
    │ Set 5 MIME types on DataTransfer: ────>│                            │
    │   1. text/plain                        │                            │
    │   2. text/markdown                     │                            │
    │   3. text/html                         │                            │
    │   4. KrOpLog (CopyInfo JSON)           │                            │
    │   5. KrCrossDocRangesData              │                            │
    │       {sourceDocId, sourceEnv}         │                            │
    │                                        │                            │
    │                                        │     Cmd+V fires paste ────>│
    │                                        │                            │
    │                                        │<── Read KrOpLog MIME type  │
    │                                        │                            │
    │                                        │    Parse CopyInfo JSON     │
    │                                        │    sourceDocId != targetId │
    │                                        │    -> DuplicateData mode   │
    │                                        │                            │
    │                                        │    PasteWriter(targetDoc,  │
    │                                        │      copyInfo,             │
    │                                        │      {DuplicateData})      │
    │                                        │    -> All IDs remapped     │
    │                                        │    -> Formulas rewritten   │
    │                                        │    -> Uncommitted ops      │
```

The cross-doc detection is beautifully simple. **`getDefaultPasteOptions()`** ([paste-utils/index.ts:63](/modules/common/paste-utils/index.ts#L63)):

```typescript
if (sourceDocId !== targetDocId || isGridRange) {
  defaultOptions.linkingBehavior = PasteLinkingBehavior.DuplicateData;
}
```

Source doc ID comes from the CopyInfo's `docInfo.id` field. If they don't match, it's cross-doc. No server round-trip, no special API -- just comparing two strings.

In-doc copy-paste uses the exact same pipeline but defaults to `CreateViews` (links to existing tables rather than duplicating them).

### Flow 4: MCP `content_duplicate` (Server-Side)

The API/MCP tool for AI agents. This one is interesting because it dispatches to *four different sub-flows* depending on two booleans: "page or doc?" and "new doc or existing doc?"

```
 content_duplicate tool
 ──────────────────────
    │
    ├── CopyPage + no destinationDocId
    │     └── handlePageToNewDoc()
    │           ├── Create new empty doc
    │           └── CopyPastePagesV2 workflow (CopyVisitor + PasteWriter)
    │
    ├── CopyPage + destinationDocId
    │     └── handleCopyPageToExistingDoc()
    │           └── CopyPastePagesV2 workflow (CopyVisitor + PasteWriter)
    │
    ├── CopyDocument + no destinationDocId
    │     └── handleForkDocument()
    │           └── launchForkDocumentWorkflow (op-log copy, same as "Copy Doc" button)
    │
    └── CopyDocument + destinationDocId
          └── handleDocToExistingDoc()
                └── CopyDocToExistingDoc workflow (CopyVisitor + PasteWriter)
```

- **`content_duplicate` tool:** [content_duplicate.ts:628](/modules/server/coda-agent/tools/features/document/content_duplicate.ts#L628) -- the dispatch logic
- **`waitForWorkflowCompletion()`:** [content_duplicate.ts:103](/modules/server/coda-agent/tools/features/document/content_duplicate.ts#L103) -- polls every 500ms until terminal state

The CopyPastePagesV2 workflow is the server-side equivalent of browser-side page duplication. It runs CopyVisitor + PasteWriter on the server:

- **`copyPages` task:** [copy_paste_pages_v2.ts:87](/modules/server/workflows/copy_paste_pages_v2.ts#L87) -- loads source model, creates CopyInfo, stores in workflow object storage
- **`generateOpsForPastedPages` task:** [copy_paste_pages_v2.ts:117](/modules/server/workflows/copy_paste_pages_v2.ts#L117) -- loads target model, PasteWriter generates ops

Server-side paste *always* uses `PasteLinkingBehavior.DuplicateData` -- there's no "create views" option when pasting between docs via the API. This is the safe default.

---

## The Clipboard Mechanics

This is the part that confuses people. Let me untangle it.

### CopyInfo: The Universal Interchange Format

Every copy operation (except raw op-log fork) produces a **`CopyInfo`** ([serialization.ts:410](/modules/common/models-types/serialization.ts#L410)). It's a flat dictionary-of-dictionaries that captures everything about the copied content:

```typescript
interface CopyInfo {
  docInfo: DocumentMetadata;           // Source doc ID, schema version, env
  sourceInfo: CodaCopySourceInfo;      // What was copied (doc, page, text, grid range)
  rootId: string;                      // Entry point of the copy tree
  nodesInfo: {[id: string]: NodeCopyInfo};   // Pages, controls, text, blobs, views
  gridsInfo: {[id: string]: GridCopyInfo};   // Column definitions + row data + cell values
  automationsInfo: {[id: string]: AutomationCopyInfo};
  packsInfo: PacksCopyInfo;
  blobsInfo: {[id: string]: BlobCopyInfo};
  isCut: boolean;
  version: CopyPasteVersion.V4;       // Only V4 is supported
  // ... more dictionaries
}
```

CopyInfo is produced by CopyVisitor (which has four entry points corresponding to four source types) and consumed by PasteWriter. The same format is used for clipboard, page duplication, server-side workflows, and squash. This is the single most important data structure in the copy system.

### How Content Gets ON the Clipboard

There are two copy paths, and the difference matters for cross-tab behavior.

**Standard copy** (Cmd+C triggers a native clipboard event). **`performCopyOrCut()`** ([copy_helpers.ts:226](/modules/browser/copy-helpers/copy_helpers.ts#L226)) sets five MIME types on the `DataTransfer` object:

```typescript
clipboardData.setData(MimeType.PlainText, text);       // For external apps
clipboardData.setData(MimeType.Markdown, markdown);     // For markdown-aware apps
clipboardData.setData(MimeType.HTML, html);             // For rich-text apps
clipboardData.setData(MimeType.KrOpLog, JSON.stringify(copyInfo));  // Full CopyInfo -- Coda internal
clipboardData.setData(MimeType.KrCrossDocRangesData, JSON.stringify({
  html,
  metadata: { sourceDocId: document.id, sourceEnv: config.env },
}));  // Cross-doc metadata
```

All five travel on the system clipboard. Any tab, any window can read them.

**Synthetic copy** (toolbar button, programmatic copy -- no native clipboard event). **`performCopyOrCutWithSyntheticClipboard()`** ([copy_helpers.ts:86](/modules/browser/copy-helpers/copy_helpers.ts#L86)) can't set custom MIME types on the async Clipboard API (browsers restrict this). Instead:

1. Generate a UUID `clipboardId`
2. Store the CopyInfo JSON in IndexedDB via **`IDBClipboard`** ([idb_clipboard.ts:23](/modules/browser-shared/storage/idb_clipboard.ts#L23))
3. Embed the `clipboardId` in the HTML as an HTML comment: `<!--coda-synthetic-clipboard=UUID-->`
4. Write HTML + PlainText to the system clipboard via the async API

```typescript
const clipboardId = uuid.create();
const htmlWithClipboard = getHtmlWithClipboardIdTag(html, clipboardId);
// IDB stores: {key: clipboardId, value: JSON.stringify(copyInfo)}
await Clipboard.copyWithSyntheticStorage(acceptedMimeTypesData, syntheticClipboardData);
```

IDBClipboard stores exactly one entry (`last_copy_data`). Each new copy overwrites the previous one. If you copy in Tab A, then copy in Tab B, then paste in Tab A -- you get Tab B's content.

### How Paste Finds the CopyInfo

The paste handler has a priority cascade. **`attemptRichTextOpLogPaste()`** ([paste_helpers.ts:136](/modules/browser/editor-slate/paste_helpers.ts#L136)):

```
 Paste event fires
    │
    ├── 1. Check HTML for synthetic clipboard UUID
    │     └── If found: read CopyInfo from IDBClipboard by UUID
    │         (works cross-tab within same origin!)
    │
    ├── 2. Check DataTransfer for KrOpLog MIME type
    │     └── If found: parse CopyInfo JSON directly
    │         (works cross-tab, any window)
    │
    └── 3. Neither found
          └── Fall back to HTML parsing, then plain text
              (this is what happens pasting from external apps)
```

```typescript
// Step 1: Try synthetic clipboard
const syntheticClipboardId = getClipboardIdFromTransferData(transferData);
if (syntheticClipboardId) {
  const idbClipboard = new IDBClipboard();
  const stringifiedCopyData = await idbClipboard.get(syntheticClipboardId);
  if (stringifiedCopyData) {
    copyInfo = JSON.parse(stringifiedCopyData);
  }
}

// Step 2: Try native MIME type
if (!copyInfo && !transferData?.types?.includes(MimeType.KrOpLog)) {
  return {handled: false};  // Fall back to HTML/text
}
```

The synthetic clipboard extraction (**`getClipboardIdFromTransferData()`** at [copy_helpers.ts:50](/modules/browser/copy-helpers/copy_helpers.ts#L50)) reads the UUID from the HTML comment. Since IDB is shared across tabs within the same origin, this works cross-tab -- the paste tab reads the UUID from the clipboard HTML, looks up the CopyInfo in IDB.

### The Paste Decision Tree

Once CopyInfo is available, **`runCanvasOpLogCopyPasteFlow()`** ([paste_helpers.ts:207](/modules/browser/editor-slate/paste_helpers.ts#L207)) determines how to paste:

```
 CopyInfo available
    │
    ├── sourceDocId == targetDocId?
    │     ├── Yes: PasteLinkingBehavior = CreateViews (link to existing tables)
    │     └── No:  PasteLinkingBehavior = DuplicateData (clone everything)
    │
    ├── isGridRange?
    │     └── Yes: Force DuplicateData (always clone cell ranges)
    │
    ├── Suggesting changes mode?
    │     └── Yes: Bail out, fall back to plain text paste
    │            (rich paste disabled in suggest-changes mode)
    │
    └── PasteWriter runs with resolved options
          ├── IdRemapper generates new IDs (or Identity for FullDocumentPaste)
          ├── Formulas rewritten
          └── Ops generated
```

**`PasteMode`** ([copy_paste.ts:134](/modules/common/serialized-types/copy_paste.ts#L134)) controls *where* the content lands:

| PasteMode | When Used |
|---|---|
| `CanvasPaste` | Normal selection paste into a canvas at a cursor position |
| `AppendPagesPaste` | Duplicate page, server-side page copy -- adds as sibling pages |
| `ReplaceCurrentPagePaste` | Internal debug copy -- replaces current page content |
| `AppendToCurrentPagePaste` | Appends first page's content to current page |
| `FullDocumentPaste` | SquashDocument -- no ID remapping, full doc replacement |
| `ProgrammaticCanvasCellOverwrite` | Button actions, default values -- overwrites cell canvas |

**`PasteLinkingBehavior`** controls *what happens to tables*:

| Behavior | What Happens | When |
|---|---|---|
| `DuplicateData` | New tables with copied data | Cross-doc paste, grid range paste |
| `CreateViews` | Views of existing tables | Same-doc paste (default) |
| `DuplicateTables` | New tables preserving relationships | Rare, specific use cases |

### Grid Range Copy-Paste

Copying table cells has its own entry point. **`_generateOpDataForCopy()`** in the table view ([view.tsx:1172](/modules/browser/table/view.tsx#L1172)) captures the selected cell range, and **`copyGridRange()`** ([paste-utils/index.ts:224](/modules/common/paste-utils/index.ts#L224)) creates a CopyVisitor with a `GridRangeRestriction` that limits the copy to just the selected rows and columns:

```typescript
const gridRangeRestriction = { gridId: grid.id, viewId, tableId: table?.id, rowIds, colIds };
const copyVisitor = new CopyVisitor(grid.document, {isCut});
copyVisitor.copyGridSelection(grid, gridRangeRestriction);
return copyVisitor.getCopyInfo();
```

On the paste side, **`getTransferGridData()`** ([data_transfer.ts:107](/modules/browser/helpers/data_transfer.ts#L107)) tries CodaOpLog first, then HTML table, then CSV text -- a graceful cascade from rich internal format to lowest-common-denominator external format.

---

## Edge Cases Worth Knowing

**Suggest Changes mode kills rich paste.** At [paste_helpers.ts:174](/modules/browser/editor-slate/paste_helpers.ts#L174), if the document is in suggest-changes mode, the CopyVisitor/PasteWriter pipeline is bypassed entirely. You get plain text. This is because tracked changes can't represent the complex ops that PasteWriter generates.

**Cross-environment paste degrades to HTML.** If `copyInfo.docInfo.env` doesn't match `config.env` (e.g., pasting between staging and production), the paste falls back to HTML parsing. Cross-env copy-paste versions may be incompatible.

**Transaction boundaries block forks.** `launchForkDocumentWorkflow` checks if the requested opVersion falls mid-transaction. If so, the fork is rejected -- you'd get a half-committed state. This is validated at [launch_fork_document_workflow.ts:162](/modules/server/document-lib/launch_fork_document_workflow.ts#L162).

**IDBClipboard is last-write-wins.** It stores exactly one entry. Copy in Tab A, copy in Tab B, paste in Tab A -- you get Tab B's content. The UUID in the HTML comment is how the paste handler knows *which* copy it's looking for, but IDB only holds one.

**Firefox and Safari get degraded clipboard quality.** The synthetic clipboard path (toolbar button copies) shows a "low fidelity" warning on these browsers because they don't fully support `ClipboardItem` with custom MIME types. You get HTML + PlainText but no KrOpLog on the system clipboard -- IDB is the only source of CopyInfo.

---

## Key Takeaways

1. **The trigger table is the map.** Print it, bookmark it. When someone asks "what happens when I copy X?", the answer is always: which trigger, which pipeline, are IDs remapped, and where do ops land.

2. **Fork = new container. Everything else = remap.** If you're creating a brand-new document, IDs are preserved (op-log copy or IdentityIdRemapper). If content enters an existing document, IDs must be remapped. This rule has zero exceptions.

3. **CopyInfo is the single interchange format.** Whether the copy originates from a keyboard shortcut, a page right-click menu, a server-side API call, or a system maintenance workflow, it all flows through the same `CopyInfo` structure. If your feature's data isn't captured in CopyInfo, it won't survive copy.

4. **The clipboard uses a two-tier fallback.** Standard copy puts CopyInfo directly on the system clipboard as a custom MIME type. Synthetic copy (toolbar, programmatic) stores it in IDB and embeds a lookup key in the HTML. The paste handler tries IDB first, then the MIME type, then falls back to HTML parsing.

5. **Cross-doc detection is just a string comparison.** `sourceDocId !== targetDocId` in the CopyInfo. That's it. No server call, no handshake. This simplicity is what makes cross-tab paste work seamlessly.

6. **Server-side paste always duplicates.** The CopyPastePagesV2 and CopyDocToExistingDoc workflows hardcode `PasteLinkingBehavior.DuplicateData`. There's no "create views" option from the API -- that's a browser-only UX affordance.

7. **Four CopyVisitor entry points, four source types.** `copyDocument()`, `copyPage()`, `copyTextSelection()`, `copyGridSelection()` -- each sets a different `CodaCopySourceType` on the CopyInfo, which downstream logic uses to decide paste behavior.
