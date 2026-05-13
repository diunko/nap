# Chapter 1: The Copy Pipeline

## Why You're Here

You need to understand what happens when a Coda document is copied. Not just "it makes a copy" -- the actual mechanics: which code runs, what decisions it makes, and what the new document looks like when it comes out the other side. If you're on the Apps team, this matters because everything that lives inside a doc -- tables, automations, packs, and yes, apps -- goes through this pipeline. If you don't understand the pipeline, you can't reason about what happens to your stuff on copy.

There are three copy paths, each making a fundamentally different tradeoff. We'll walk through all of them, starting with the one that matters most.

---

## The Two Fundamental Strategies

Every copy operation faces the same question: **what happens to object IDs?**

A Coda document is a graph of collaborative objects -- grids, pages, canvases, controls -- each with a unique ID. Formulas reference these IDs. Views point at them. Automations trigger on them. When you copy a document, you have two choices:

1. **Preserve IDs.** The new document gets the exact same grid IDs, page IDs, and canvas IDs as the source. This is safe because the copy is a separate document -- there's no collision risk. The huge advantage: formulas don't need rewriting. The huge constraint: you can only use this when creating a *new* document.

2. **Remap IDs.** Every object gets a fresh random ID. An `IdRemapper` tracks old-to-new mappings. Every formula must be parsed, its references rewritten, and the formula re-serialized. This is slower and more complex, but it's the only option when pasting content into an *existing* document (where IDs might collide).

This single distinction -- preserve vs. remap -- drives the entire architecture:

```
                    ┌─────────────────────────────────┐
                    │        Copy a Document           │
                    └──────────────┬──────────────────┘
                                   │
                    ┌──────────────┴──────────────┐
                    │                             │
              New document?                Into existing doc?
                    │                             │
                    ▼                             ▼
            ForkDocument                CopyDocToExistingDoc
          (preserve IDs)                  (remap IDs)
          IdentityIdRemapper               IdRemapper
          No formula rewrite          Full formula rewrite
          3-task workflow             3-task workflow
```

There's a third path -- `SquashDocument` -- that creates a new document but *also* remaps IDs and regenerates the op log from scratch. It's used for "squash history" and obfuscation. We'll cover it at the end.

---

## ForkDocument: The Main Copy Path

When a user clicks "Copy doc," here's what happens.

### Entry: The HTTP Handler

**`copyDocument()`:** [copy_document.ts:51](/modules/server/frontend/private/actions/copy_document.ts#L51)

The request is `POST /copy/:docId`. The handler validates auth, extracts parameters, and makes a single call:

```typescript
const {newDocId} = await launchForkDocumentWorkflow(services, docId, realUser, {
  opVersion,             // Fork at this version (or latest)
  newDocTitle,
  folderId,
  workspaceId,
  deletePageAuthors,     // Scrub author info from pages
  deleteComments,        // Truncate comments grids
  isAssignmentClone,     // Special handling for Coda EDU
  // ...
});
```

The response contains the new doc ID immediately. The client gets redirected to a document that doesn't have any content yet -- it's in `INITIALIZING` state. The actual copying happens asynchronously.

### Validation and Shell Creation

**`launchForkDocumentWorkflow()`:** [launch_fork_document_workflow.ts:48](/modules/server/document-lib/launch_fork_document_workflow.ts#L48)

This function does a gauntlet of validation before touching anything:

1. **Copy permission check** -- if you're not the owner and `docCopyState === Off`, denied.
2. **Doc type check** -- child docs and DB-backed tables can't be copied.
3. **Op version resolution** -- default to latest, but you can fork at a historical point.
4. **Transaction boundary check** -- if forking at a historical point, refuse if it's mid-transaction (you'd get a half-written state).
5. **Schema version check** -- blocks forks below `MinimumAllowedForkDocumentSchemaVersion`.
6. **Op log staleness checks** -- two separate checks prevent copying docs whose snapshots are dangerously stale (too many ops since last snapshot, or too much time elapsed).

If everything passes, it creates the new document shell:

```typescript
const docCreationOptions: GeneralizedDocCreatorCreateOptions = {
  applyNewDocOps: false,                                    // Empty -- no ops yet
  availabilityState: DocumentAvailabilityState.Initializing, // Not visible to users
  sourceDocId,
  sourceDocOpVersion: squashHistory ? 0 : sourceDocOpVersion,
  sourceDocOpTimestamp: lastOp.timestamp,
};
```

Then it fires and forgets the workflow. If the workflow service is down, a sweeper process (`fork_document_sweeper`) periodically scans for docs stuck in `Initializing` state and relaunches their workflows. Belt and suspenders.

### The Three-Task Workflow

**`forkDocument` workflow:** [fork_document.ts:131](/modules/server/workflows/fork_document.ts#L131)

The workflow has three sequential tasks. Think of them as: **copy the bytes**, **clean up the model**, **go live**.

```
  Task 1: forkDocument          Task 2: scrubCopiedDocument       Task 3: flipToOnline
 ┌────────────────────┐        ┌──────────────────────────┐      ┌───────────────────┐
 │  Copy blobs (S3)   │        │  Load source model into  │      │  INITIALIZING      │
 │  Copy op pointer   │───────▶│  forked doc context      │─────▶│       ↓            │
 │  Copy automations  │        │  Scrub & GC              │      │    ONLINE          │
 │  Copy mentions     │        │  Flush ops + snapshot    │      └───────────────────┘
 └────────────────────┘        └──────────────────────────┘
```

#### Task 1: Copy the Bytes

Four things happen in parallel:

```typescript
const [{nextMarker}] = await promise.allIncludingErrors([
  docBulkStorage.copyBlobsToNewDoc(sourceDocId, docId, initialBlobCopyCutoffMinutes),
  _copyDocumentStorage(services, params, sourceDocInfo, docInfo),
  mentionsStorage.updateDocumentLastProcessedOpVersion(docId, opVersion),
  _copyAutomationsStorage(services, params),
]);
```

The blob copy is an S3 directory copy -- it doesn't read individual blobs, it copies the entire `{bucket}/{prefix}/{docId}/` tree to a new path. If the doc has thousands of images and the copy doesn't finish within `initialBlobCopyCutoffMinutes`, the workflow enters a `copyExcessiveBlobs` loop that continues from a marker until done.

**`copyBlobsToNewDoc()`:** [document_bulk_storage.ts:1143](/modules/server/doc-bulk-storage/document_bulk_storage.ts#L1143)

```typescript
async copyBlobsToNewDoc(sourceDocId, newDocId, cutoffMinutes) {
  const {nextMarker: resultingNextMarker} = await this._s3.copyDirectory({
    bucket: this._bucket,
    src: this._getS3BlobPath(sourceDocId),   // {prefix}/{sourceDocId}/
    dest: this._getS3BlobPath(newDocId),     // {prefix}/{newDocId}/
    tagset: CrossRegionReplicationTagSet,
    concurrency: copyDirectoryOnForkConcurrency,
    cutoffMinutes,
    nextMarker,
  });
  return {nextMarker: resultingNextMarker};
}
```

Notice: blob IDs are preserved verbatim. The fork workflow doesn't remap blob IDs -- it copies the S3 objects under the new doc's path with the same keys.

#### Task 2: Scrub the Model

This is the most important and most subtle task.

**`scrubCopiedDocument` task:** [fork_document.ts:244](/modules/server/workflows/fork_document.ts#L244)

The trick is in how the model gets loaded. Look at this carefully:

```typescript
await docManager.withModel({
  docId,                         // The FORKED doc's ID
  loadFromDocInfo: sourceDocInfo, // But load data from the SOURCE doc
  opVersion,                     // At the fork point
  precalcCallback: document => {
    // Prevent graph invalidation -- packs aren't installed yet,
    // and pack formulas that depend on docId would fail
    document.session.resolver.shouldExplicitlyPreventGraphInvalidation = true;
  },
  callback: async document => {
    // ... scrub operations happen here
  },
});
```

This is a "special usage of withModel" (their words, not mine). The document model thinks it belongs to the forked doc, but it loaded its data from the source doc. Any ops it generates go into the forked doc's op log. This is how ForkDocument avoids the CopyVisitor/PasteWriter pipeline entirely -- it takes the source model wholesale and cleans it up in place.

Inside the callback, the scrub sequence runs. Each step generates ops against the forked doc:

| Scrub step | What it does | Why |
|---|---|---|
| `_clearAuthorsFromDocument` | Removes page author attribution | Privacy -- copier shouldn't inherit authorship |
| `_clearExternalFormData` | Clears form configs from canvas grids | External form integrations don't transfer |
| `_deleteCommentsFromDoc` | Truncates comments and comment-threads grids | Comments are doc-specific conversations |
| `_resetLocking` | Removes document protection | Target workspace may not support locking |
| `_clearSharedPages` | Nullifies `partialDocId` on all pages | Breaks subdoc sharing links |
| `_fixAuthedSyncPages` | Rewrites authed sync pages to source access | Auth tokens don't transfer |
| `_scrubPeopleTable` | Removes unreferenced people rows | Template "fictional characters" shouldn't appear in dropdowns |
| `removeV3SyncTables` | Removes externally-backed sync tables | Their data connections don't transfer |
| `removeDbBackedTables` | Removes DB-backed tables | Their storage doesn't transfer |

After all scrubbing, a critical step: the **garbage collect op**.

```typescript
const [existingGcOp] = await docStorage.getLogWithPredicates(
  docId, document.schemaVersion, opVersion, 1,
  { opTypes: [OperationType.GARBAGE_COLLECT] },
);
if (!existingGcOp) {
  // Add GC op -- makes all scrubbed data permanently unrecoverable
}
```

The GC op is the wall. Everything that was deleted during scrubbing -- comments, authors, sync table data -- cannot be resurrected through undo or version history. The idempotency check (`existingGcOp`) protects against the task being rerun after a failure.

Finally: flush ops, take a snapshot, and set the `blockOpVersion` (the earliest point the new doc's version history can show).

#### Task 3: Go Live

**`flipToOnline` task:** [fork_document.ts:450](/modules/server/workflows/fork_document.ts#L450)

Transitions the document from `Initializing` to `Online`. If the whole process took too long, it creates a notification for the user ("Your copy is ready").

---

## CopyDocToExistingDoc: The Remap Path

When you need to paste document content into an *existing* document, you can't preserve IDs -- the target doc might already have objects with those IDs. This path goes through the full serialization pipeline.

**Workflow:** [copy_doc_to_existing_doc.ts:84](/modules/server/workflows/copy_doc_to_existing_doc.ts#L84)

```
  Source Doc                    Intermediate                      Target Doc
 ┌──────────┐                 ┌────────────┐                   ┌──────────────┐
 │  Model   │─── CopyVisitor ──▶ CopyInfo ──▶ PasteWriter ──▶│  New ops      │
 │  (grids, │    (serialize)  │  (flat IR)  │   (IdRemapper)  │  (remapped    │
 │  pages,  │                 │             │   (formulas)    │   IDs, new    │
 │  formulas)│                └────────────┘                   │   formulas)   │
 └──────────┘                                                  └──────────────┘
```

Three tasks:

1. **copyDocument** -- load the source doc model, run `CopyVisitor.copyDocument()`, serialize to `CopyInfo`, store in workflow object storage.
2. **generateOpsForPastedDoc** -- load the target doc model, create a `PasteWriter` with `PasteLinkingBehavior.DuplicateData`, paste the `CopyInfo`, generating ops.
3. **processUncommittedOps** -- apply the generated ops to the target doc.

Let's walk through the three key components.

### CopyVisitor: Serializing the Model

**`CopyVisitor` class:** [copy_visitor.ts:146](/modules/common/model-serialization/copy_visitor.ts#L146)

CopyVisitor walks a document model and produces a `CopyInfo` -- a flat, serializable snapshot of everything in the document. Think of it as `JSON.stringify` for a Coda document, but structured for pasting.

The walk order for `copyDocument()`:

```typescript
copyDocument(document: DocumentInterface): void {
  // 1. Document properties (name, settings)
  // 2. Automation rules and their pack dependencies
  // 3. Core grids (the hidden infrastructure grids)
  // 4. Top-level pages, depth-first with subpages
}
```

Each page visit (`_visitPage`) captures the page's metadata, walks its Slate canvas content looking for embedded objects, and recurses into child pages:

```typescript
private _visitPage(page, {includeSubpages}) {
  const canvasContent = getSanitizedFragmentForRange(canvas.slate);
  // ... capture page metadata into PageCopyInfo ...

  this._walkSlateFragment(canvasContent);  // Find embedded grids, controls, blobs

  for (const childPage of childPages) {
    this._visitPage(childPage, {includeSubpages});
  }
}
```

When `_walkSlateFragment` encounters an embedded table, it calls `_visitGridData`, which collects columns, rows, and all cell values. When it encounters an inline formula value, it walks that too.

### CopyInfo: The Intermediate Representation

**`CopyInfo` interface:** [serialization.ts:410](/modules/common/models-types/serialization.ts#L410)

```typescript
export interface CopyInfo {
  rootId: string;                              // Where to start pasting
  nodesInfo: {[id: string]: NodeCopyInfo};     // Pages, grids, controls, text selections
  gridsInfo: {[id: string]: GridCopyInfo};     // Column definitions, row data, cell values
  blobsInfo: {[id: string]: BlobCopyInfo};     // Image/file metadata (not the blob bytes)
  automationsInfo: {[id: string]: AutomationCopyInfo};
  packsInfo: PacksCopyInfo;
  peopleInfo: {[id: number]: PersonCopyInfo};
  // ... more dictionaries
}
```

This is a flat dictionary-of-dictionaries. Not a tree. The `rootId` tells PasteWriter where to start, and nodes reference each other by ID. The same `CopyInfo` format is used for full-doc copy, page duplication, and clipboard copy-paste within the editor. It's the universal interchange format for document content.

### IdRemapper: The Decision Engine

**`IdRemapper` class:** [id_remapper_v2.ts:78](/modules/common/model-serialization/private/id_remapper_v2.ts#L78)

IdRemapper answers the question: "what ID does this object get in the target document?" The answer depends on context.

For a full-doc copy into a new document (`FullDocumentPaste` mode), the answer is **IdentityIdRemapper** -- every ID maps to itself:

**`IdentityIdRemapper` class:** [id_remapper_v2.ts:1353](/modules/common/model-serialization/private/id_remapper_v2.ts#L1353)

```typescript
export class IdentityIdRemapper extends IdRemapper {
  override getMappedCollaborativeObjectId(objectId: string): string {
    return objectId;  // Same ID, always
  }
  override getMappedPageId(pageId: string): string {
    return pageId;    // Same ID, always
  }
  // ... all methods return the input unchanged
}
```

For cross-doc paste or page duplication, the real `IdRemapper` kicks in. It generates fresh random IDs:

```typescript
// From modules/common/ids/ids.ts:296
export function generateNewIdOfSameType(existingId: string): string {
  const idParts = existingId.split('-');
  let prefix = idParts[0];  // Preserves the type prefix (e.g., "grid-", "page-")
  return ids.generateObjectId(prefix);  // New random UUID with same prefix
}
```

One subtlety: select-list grid IDs are *derived* from their parent grid IDs, so they get special handling -- the remapper reconstructs the select-list ID from the already-remapped parent grid ID.

The choice between IdentityIdRemapper and IdRemapper is made in **`_setupIdRemapper()`:** [paste_writer.ts:413](/modules/common/model-serialization/paste_writer.ts#L413):

```typescript
this._initializedIdRemapper =
  (mode.type === PasteMode.FullDocumentPaste || ...) && !this._isCrossEnvPaste()
    ? new IdentityIdRemapper(...)  // Preserve IDs
    : new IdRemapper(...);         // Remap IDs
```

Cross-doc paste always forces `DuplicateData` behavior -- you can never "link" to a grid in a different document.

### PasteWriter: Generating Ops

**`PasteWriter` class:** [paste_writer.ts:307](/modules/common/model-serialization/paste_writer.ts#L307)

PasteWriter reads a `CopyInfo`, consults the `IdRemapper` for every ID, and generates operations that materialize the copy in the target document. It follows the tree structure: document -> pages -> canvases -> embedded objects.

```typescript
pasteIntoDocument(copyMode, undoOptions?) {
  const error = this._setupIdRemapper({type: PasteTargetType.Document, copyMode}, copyMode);
  if (error) return;

  this._document.uncommittedOperationCreator.withOperationSource(this._copyOpSourceInfo, () =>
    this._deserializeRootNodeInDocument(),
  );
}
```

The `_deserializeRootNodeInDocument` method dispatches on the root node type:

```typescript
private _deserializeRootNodeInDocument() {
  const rootNode = this._copyInfo.nodesInfo[this._copyInfo.rootId];
  switch (rootNode.type) {
    case CopyNodeType.Document:
      this._insertDocument(rootNode);   // Full doc -> insert all pages
      break;
    case CopyNodeType.Page:
      this._insertPageNode(rootNode);   // Single page -> insert page + children
      break;
    // ... other node types
  }
}
```

For a document insert, it sets document properties, then inserts each page, which inserts each canvas, which inserts each embedded grid/control.

---

## Formula Rewriting

When IDs change, every formula that references those IDs must be rewritten. This happens in two phases.

### Phase 1: Unbinding (during Copy)

**`FormulaCopyVisitor`:** [formula_copy_visitor.ts](/modules/common/formula/formula_copy_visitor.ts)

During the copy phase, `FormulaCopyVisitor` walks formula ASTs and "unbinds" references -- converting internal ID-based references to their human-readable fully-qualified names:

```typescript
// Before: [grid-abc123].Column1 (internal reference by ID)
// After:  [My Table].Column1    (human-readable name)
```

This makes formulas portable. One exception: **row and cell references are NOT unbound** -- they point at specific rows by ID and can't be meaningfully re-bound by name.

### Phase 2: Rebinding (during Paste)

**`_rewriteFormulaString()`:** [paste_writer.ts:3172](/modules/common/model-serialization/paste_writer.ts#L3172)

During paste, PasteWriter parses each formula, walks its AST with `ChangeObjectIdsVisitor`, and rewrites every reference using the IdRemapper:

```typescript
private _rewriteFormulaString<T>(initialFormula: T, {objectId, fieldId}): T {
  const parserContext = new ParserContext(this._document.session.resolver, {objectId, fieldId, ...});
  const rewrittenFormula = rewriteIdsInFormula(
    initialFormula,
    parserContext,
    this._rewriteReferenceCallback,  // Consults IdRemapper for each reference
  );
  return rewrittenFormula;
}
```

The **`rewriteIdsInFormula()`** function ([rewrite_ids_in_formula.ts:10](/modules/common/formula/rewrite_ids_in_formula.ts#L10)) does the mechanical work: parse into AST, visit every reference token, call the callback to get the new reference text, serialize back to a formula string.

The callback (**`_rewriteReference`** at [paste_writer.ts:3083](/modules/common/model-serialization/paste_writer.ts#L3083)) handles several cases:
- Simple ID swap (same object type, just a new ID)
- Type changes (grid became a table-view, or vice versa)
- Unbinding references to objects that don't exist in the target

For the ForkDocument path with IdentityIdRemapper, all of this is a no-op -- the IDs don't change, so formulas don't need rewriting. This is a major performance win for large documents with thousands of formulas.

---

## Page-Level Duplication

When a user duplicates a single page (not an entire doc), it takes a different path.

**`duplicatePage()`:** [utils.ts:150](/modules/common/model-serialization/utils.ts#L150)

```typescript
export function duplicatePage(document, sourceRootPageId, undoOptions, options) {
  // 1. CopyVisitor serializes just this page (+ optional subpages)
  const copyVisitor = new CopyVisitor(document, {isCut: false, rowsToInclude: ...});
  copyVisitor.copyPage(rootPage, {includeSubpages});
  const copyInfo = copyVisitor.getCopyInfo();

  // 2. PasteWriter with REAL IdRemapper (not Identity)
  const pasteWriter = new PasteWriter(document, copyInfo, pasteOptions);
  pasteWriter.pasteIntoDocument({type: PasteMode.AppendPagesPaste, parentId, position}, undoOptions);

  // 3. Return the new page's ID and the full ID mapping
  return {pageId, canvasId, remappedPageIds: pasteResult.idMaps.remappedPageIds};
}
```

Key differences from full-doc copy:

| | ForkDocument | duplicatePage |
|---|---|---|
| **Runs where** | Server (async workflow) | Client (synchronous) |
| **ID strategy** | IdentityIdRemapper (preserve) | IdRemapper (remap) |
| **Formula rewrite** | No | Yes |
| **Scrubbing** | Full (authors, comments, sync tables...) | None |
| **Entry point** | `copyVisitor.copyDocument()` | `copyVisitor.copyPage()` |
| **Paste mode** | `FullDocumentPaste` | `AppendPagesPaste` |

Page duplication *must* remap IDs because the copy lives in the same document as the source. Two pages can't have grids with the same ID.

---

## SquashDocument: The Third Path

**`squashDocument` workflow:** [squash_document.ts:116](/modules/server/workflows/squash_document.ts#L116)

When `launchForkDocumentWorkflow` is called with `squashHistory: true`, it launches `SquashDocument` instead of `ForkDocument`. This path:

1. Loads the source doc model
2. Runs `CopyVisitor.copyDocument()` to serialize it into a `CopyInfo`
3. Creates a `PasteWriter` with `IdentityIdRemapper` (same IDs, since it's a new doc)
4. Generates a completely fresh op log from the `CopyInfo`

The result: a new document with identical content and identical IDs, but *no history*. The op log starts from scratch. This is used for "squash history" (cleaning up bloated op logs) and for obfuscation (the PasteWriter can optionally replace all string values with random text).

The key difference from ForkDocument: ForkDocument copies the op log verbatim and scrubs the model. SquashDocument regenerates the op log from the model. ForkDocument is faster (no serialization/deserialization). SquashDocument produces a cleaner result (no historical baggage).

---

## Key Takeaways

1. **ForkDocument is a model transplant, not a serialization.** It loads the source doc's model into the new doc's context and generates ops by scrubbing it in place. No CopyVisitor, no PasteWriter, no formula rewriting. This is why it's fast.

2. **IdentityIdRemapper is the performance trick.** By preserving all object IDs in the fork, the system avoids parsing and rewriting every formula in the document. For a doc with 10,000 formulas, this is the difference between seconds and minutes.

3. **CopyInfo is the universal interchange format.** The same flat-dictionary IR is used for full-doc copy, page duplication, clipboard paste, and history squashing. Understand CopyInfo and you understand the shape of all copy operations.

4. **The scrub step is where copy-sensitive features live.** If your feature stores data that shouldn't survive a copy (auth tokens, external connections, user-specific state), you need a scrub step. Look at the sequence in `scrubCopiedDocument` -- that's where you'd add cleanup for Apps.

5. **The GC op is the wall.** After scrubbing, a garbage-collect operation ensures that all removed data is permanently unrecoverable through undo or version history. Without it, a user could "undo" the scrub and recover deleted comments or auth tokens.

6. **Page duplication is the only synchronous path.** It runs entirely in the browser, uses the real IdRemapper (not Identity), and has no scrubbing. If your feature needs to survive page duplication, the IdRemapper's handling of your object type is what matters.

7. **Cross-doc paste always forces DuplicateData.** You can never create a linked view pointing at a grid in a different document. Cross-doc always means full duplication with remapped IDs.
