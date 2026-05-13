# Document Copy Pipeline — Research Materials

This file contains exhaustive raw research for the doc-copy pipeline chapter. Every finding includes exact file paths, line numbers (verified by reading the actual file), and code snippets the writer can use directly.

---

## Table of Contents

1. [HTTP Entry Point: copy_document.ts](#1-http-entry-point)
2. [launchForkDocumentWorkflow — Creating the New Doc Shell](#2-launch-fork-document-workflow)
3. [forkDocument Workflow — The 3-Task Pipeline](#3-fork-document-workflow)
4. [CopyVisitor — Serializing the Source Doc Model](#4-copy-visitor)
5. [CopyInfo — The Intermediate Representation](#5-copy-info)
6. [IdRemapper — Generating New IDs](#6-id-remapper)
7. [PasteWriter — Materializing the Copy as Operations](#7-paste-writer)
8. [Formula Rewriting](#8-formula-rewriting)
9. [Blob Copying](#9-blob-copying)
10. [scrubCopiedDocument — Post-Copy Cleanup](#10-scrub-copied-document)
11. [Page-Level Duplication vs Full-Doc Copy](#11-page-level-duplication)
12. [CopyDocToExistingDoc — The "Paste Into Existing" Path](#12-copy-doc-to-existing-doc)
13. [SquashDocument — The "Squash History" Path](#13-squash-document)
14. [Data Flow Summary](#14-data-flow-summary)

---

## 1. HTTP Entry Point [VERIFIED]

**File:** `modules/server/frontend/private/actions/copy_document.ts`
**Route registration:** `modules/server/frontend/private/routers/authenticated.ts`, line 330-335

The HTTP request that fires when a user clicks "Copy doc" is:

```
POST /copy/:docId
```

It goes through `authDocRead(AuthorizationType.Copy, ...)` and a `createDocRateLimit` middleware before reaching the `copyDocument` handler.

**Route registration code (line 330-335):**

```typescript
// Copy an existing document.
router.post(
  '/copy/:docId',
  authDocRead(AuthorizationType.Copy, {auditActionName: AuditActionName.CopyDoc}),
  createDocRateLimit,
  copyDocument(services),
);
```

**Request body type — CopyDocumentParams (line 410 of `modules/common/server-api/types/documents.ts`):**

```typescript
export interface CopyDocumentParams {
  title?: string;
  folderId?: string;
  workspaceId?: string;
  opVersion?: number;
  deletePageAuthors?: boolean;
  deleteComments?: boolean;
  tour?: TourId;
  launchDialog?: LaunchDialog;
  launchDialogParams?: LaunchDialogParams;
  pageId?: string;
  isPublished?: boolean;
  isAssignmentClone?: boolean;
}
```

**Handler logic (copy_document.ts, lines 51-187):**

The handler:
1. Asserts the request is authenticated and has doc-read access (lines 53-54)
2. Extracts params from request body (lines 58-71)
3. Validates `opVersion` against `minSnapshotOpVersion` — blocks forks before the earliest allowed view point (lines 98-101)
4. Requires canEdit for historical copies (opVersion specified) (lines 103-105)
5. Calls `launchForkDocumentWorkflow()` — the real work (line 108-119)
6. Logs events (lines 121-149)
7. Constructs the redirect URL to the new doc and responds with JSON or HTML redirect (lines 151-186)

**Key code — the core call (lines 108-119):**

```typescript
const newDocTitle = title || undefined;
const {newDocId} = await launchForkDocumentWorkflow(services, docId, realUser, {
  opVersion,
  newDocTitle,
  folderId,
  workspaceId,
  deletePageAuthors,
  deleteComments,
  isAssignmentClone: Boolean(isAssignmentClone),
  applicationKind: request.applicationKind,
  userContext: getAuditUserContext(request),
  request,
});
```

**Why it's shaped this way:** The copy endpoint is synchronous from the client's perspective — it returns the new doc ID immediately. The actual data copying is kicked off as an async workflow. The client gets redirected to the new doc, which starts in `INITIALIZING` state.

---

## 2. launchForkDocumentWorkflow [VERIFIED]

**File:** `modules/server/document-lib/launch_fork_document_workflow.ts`
**Line:** 48 (function definition)

This function does the heavy validation and creates the new document shell before launching the async workflow.

**Signature (lines 48-107):**

```typescript
export async function launchForkDocumentWorkflow(
  services: { ... },
  sourceDocId: string,
  user: UserSnapshot,
  { newDocTitle, newDocId, opVersion, obfuscate, squashHistory, folderId, workspaceId,
    expirationDays, docIdPrefix, tag, documentType, templateEntrypoints,
    deletePageAuthors, deleteComments, isAdminWorkflow, applicationKind,
    isAssignmentClone, userContext, request }: { ... },
): Promise<{newDocId: string}>
```

**Step-by-step (summarized from lines 108-351):**

1. **Get source doc info** (line 110): `docStorage.getDocumentInfo(sourceDocId)`
2. **Check copy permissions** (lines 113-132): If user is not the owner and `docCopyState === DocCopyState.Off`, deny. Audit the denial.
3. **Block unsupported doc types** (lines 134-139): Child docs, DB-backed tables cannot be copied.
4. **Resolve opVersion** (line 141): `opVersion || ensureExists(sourceDocInfo.latestOpVersion)`
5. **Validate min snapshot** (lines 144-148): Ensures fork point is not before `minSnapshotOpVersion`.
6. **Get the fork-point operation** (lines 150-158): Fetches the actual op at the requested version. Verifies it exists.
7. **Transaction boundary check** (lines 162-175): If forking at a historical point (not doc tail), verifies it's not mid-transaction.
8. **Schema version check** (lines 192-194): Prevents forks below `MinimumAllowedForkDocumentSchemaVersion`.
9. **Calc-disabled check** (lines 196-216): Blocks fork if source is calc-disabled (configurable).
10. **Op log gap checks** (lines 233-282): Two checks to prevent copying docs with stale snapshots:
    - **Op-count gap**: `sourceDocOpVersion - latestSnapshotOpVersion > opVersionRangeLimit`
    - **Time gap**: First op after snapshot is > `SnapshotDelayThresholdSeconds` old
11. **Create the new document** (lines 284-343): Generates a new docId, then calls `docCreator.createDocument()` with `availabilityState: DocumentAvailabilityState.Initializing`. The doc is created with `forkDocumentParams` embedded in it.
12. **Opportunistically launch the workflow** (line 348): Fires and forgets `_launchForkDocumentWorkflow()`. If the workflows DB is down, the `fork_document_sweeper` will pick it up later.

**Key design decision — doc ID (lines 301-305):**

```typescript
const docId =
  newDocId ??
  ids.generateDocumentId({
    prefix: docIdPrefix && config.docIdPrefixAllowlist.includes(docIdPrefix) ? docIdPrefix : undefined,
  });
```

Doc IDs are generated with an optional prefix from an allowlist.

**Key design decision — Initializing state (line 321):**

```typescript
const docCreationOptions: GeneralizedDocCreatorCreateOptions = {
  applyNewDocOps: false,
  availabilityState: DocumentAvailabilityState.Initializing,
  // ...
  sourceDocId,
  sourceDocOpVersion: squashHistory ? 0 : sourceDocOpVersion,
  sourceDocOpTimestamp: lastOp.timestamp,
};
```

The new doc is created in `Initializing` state. No ops are applied. The fork workflow will load the source doc's model, scrub it, and flush ops into the new doc. The doc isn't marked online until all that completes.

**Key design decision — squashHistory path (lines 384-405):**

```typescript
if (squashHistory) {
  return workflowStorage.createWorkflowExecutionOrGetExistingWfeIdAndState(WorkflowName.SquashDocument, params, ...);
}
return workflowStorage.createWorkflowExecutionOrGetExistingWfeIdAndState(WorkflowName.ForkDocument, params, ...);
```

There are TWO workflow paths: `ForkDocument` (default) and `SquashDocument` (when `squashHistory` is true). ForkDocument copies the op log directly. SquashDocument regenerates ops from scratch using CopyVisitor + PasteWriter.

---

## 3. forkDocument Workflow — The 3-Task Pipeline [VERIFIED]

**File:** `modules/server/workflows/fork_document.ts`

The workflow has 3 sequential tasks (with an optional intermediate task for large blobs):

### Task 1: forkDocument (lines 131-205)

Classification: `Async` (runs while doc is in INITIALIZING state)

Does these in parallel (lines 168-181):
1. **Copy blobs** (`docBulkStorage.copyBlobsToNewDoc`) — S3 directory copy
2. **Copy document storage** (`_copyDocumentStorage`) — copies op log pointer, doc tags
3. **Update mentions storage** — sets `lastProcessedOpVersion`
4. **Copy automations storage** — copies automation rules

If blob copy has more work (`nextMarker` returned), goes to `copyExcessiveBlobs` task first.

**Key code (lines 168-181):**

```typescript
const [{nextMarker}] = await promise.allIncludingErrors([
  docBulkStorage.copyBlobsToNewDoc(sourceDocId, docId, initialBlobCopyCutoffMinutes).finally(() => {
    diagnostics.recordEvent('done copying blobs');
  }),
  _copyDocumentStorage(services, params, sourceDocInfo, docInfo).finally(() => {
    diagnostics.recordEvent('done copying doc storage');
  }),
  mentionsStorage.updateDocumentLastProcessedOpVersion(docId, opVersion).finally(() => {
    diagnostics.recordEvent('done updating mentions with last op version');
  }),
  _copyAutomationsStorage(services, params).finally(() => {
    diagnostics.recordEvent('done copying automations');
  }),
]);
```

### Task 1b: copyExcessiveBlobs (lines 207-242)

Only runs if the initial blob copy didn't finish within the cutoff. Keeps calling `copyBlobsToNewDoc` with a `nextMarker` until done. Self-loops.

### Task 2: scrubCopiedDocument (lines 244-448)

Classification: `CpuIntensive` (loads the doc model)

This is the most important task. It:

1. **Loads the source doc model into the forked doc's context** (lines 278-288):
   ```typescript
   await docManager.withModel({
     docId,                    // forked doc ID
     loadFromDocInfo: sourceDocInfo,  // BUT loads from source doc
     opVersion,
     precalcCallback: document => {
       document.session.resolver.shouldExplicitlyPreventGraphInvalidation = true;
     },
   ```
   This is a "special usage of withModel" — it loads the source doc's model but addresses it as the forked doc.

2. **Applies forward ops** (line 314): `docManager.iterativelyApplyLog(document, docInfo.tailOpsShard)` — catches up any ops added in previous execution attempts.

3. **Registers cross-doc tables** (line 320)

4. **Copies packs/external connections** (lines 327-337)

5. **Re-enables graph invalidation** (lines 340-342)

6. **Scrubs the document** — a sequence of cleanup operations:
   - `_clearAuthorsFromDocument` (line 347) — removes page authors if requested
   - `_clearExternalFormData` (line 349)
   - `_deleteCommentsFromDoc` (line 353) — truncates comments grids
   - `_resetLocking` (line 358) — removes protection if workspace doesn't support it
   - `_clearSharedPages` (line 361) — nullifies partialDocIds
   - `_fixAuthedSyncPages` (line 364) — rewrites authed sync pages to source access
   - `_scrubPeopleTable` (line 367) — removes unreferenced people, transitions fictional characters
   - Clears publish landing doc, copy/paste metadata
   - `removeV3SyncTables` (line 386)
   - `removeDbBackedTables` (line 389)

7. **Garbage collect** (lines 398-424): Adds a GC op to prevent any of the scrubbed data from being revived through undo/version history.

8. **Flush ops and snapshot** (lines 427-436)

9. **Update block op version** (lines 440-444): Sets the min viewable point for the new doc.

### Task 3: flipToOnline (lines 450-483)

Classification: `Async`

Transitions the doc from `Initializing` to `Online`. If the copy took too long (`SlowCopyDocumentTimeMsec`), creates a notification mention for the user.

---

## 4. CopyVisitor — Serializing the Source Doc Model [VERIFIED]

**File:** `modules/common/model-serialization/copy_visitor.ts`
**Line:** 146 (class definition)

CopyVisitor is a tree-walking visitor that serializes a document model into a `CopyInfo` intermediate representation. It has multiple entry points:

```typescript
export class CopyVisitor implements CopyVisitorInterface {
  copyDocument(document: DocumentInterface): void;
  copyPage(page: PageInterface, options?: {includeSubpages?: boolean}): void;
  copyGrid(grid: GridInterface): void;
  copyTable(table: ViewContainerInterface): void;
  copyControl(control: ControlGridInterface): void;
  copyTextSelection(slate: CodaSlateInterface, containerInfo: ContainerInfo, selection?: SlateRange): void;
  copyGridSelection(grid: GridInterface, gridRangeRestriction: GridRangeRestriction): void;
}
```

### Constructor (lines 178-187)

```typescript
constructor(
  document: DocumentInterface,
  {isCut = false, rowsToInclude = RowsToInclude.All}: CopyVisitorOptions = {},
) {
  this._errors = [];
  this._document = document;
  this._isCut = isCut;
  this._rowsToInclude = rowsToInclude;
  this._codaObjectReferenceInfo = {canvasInSelection: [], remappedSlateNodeIds: []};
}
```

### copyDocument entry point (lines 251-287)

For a full doc copy, this is what gets called:

```typescript
copyDocument(document: DocumentInterface): void {
  this._rootId = document.id;
  this._sourceInfo = {type: CodaCopySourceType.CopyDocument, id: document.id};

  const topLevelPages = document.pagesManager.getTopLevelPages();
  const coreGrids = document.getDeprecatedCoreGrids();
  const automationRules = document.automationsGridManager.fetchRules({includeNonDocumentRules: false});
  const {ruleIds, packIds} = this._visitAutomations(automationRules, document.automationsGridManager);

  const docInfo: DocumentCopyInfo = {
    type: CopyNodeType.Document,
    id: document.id,
    name: document.name,
    properties: _.cloneDeep(document.properties),
    pageIds: topLevelPages.map(p => p.id),
    ruleIds,
    packIds,
    coreGridIds: coreGrids.map(g => g.id),
  };
  this._pushNodeCopyInfo(document.id, docInfo);

  for (const coreGrid of coreGrids) {
    const viewContainer = ensureExists(coreGrid.getViewContainer());
    this._visitViewsOfGrid(coreGrid, coreGrid, viewContainer.getViews());
  }

  for (const page of topLevelPages) {
    this._visitPage(page, {includeSubpages: true});
  }
}
```

**Walking order:** Document properties → Core grids → Pages (depth-first with subpages)

### _visitPage (lines 461-538)

Visits a page, its canvas content, blobs, and child pages.

```typescript
private _visitPage(page: PageInterface, {includeSubpages, removeParent}) {
  // Collect page metadata
  const canvasContent = getSanitizedFragmentForRange(canvas.slate);
  
  const pageInfo: PageCopyInfo = {
    type: CopyNodeType.Page,
    id, canvasId, name, authors, icon, subtitle, parentId, image,
    metadata, isHidden, pageType, pageTypeSpecificMetadata,
    singlePageEmbedValue, childrenIds, canvasContent,
  };
  this._pushNodeCopyInfo(id, pageInfo);

  this._pushContext({parentId: canvasId});
  this._walkSlateFragment(canvasContent);  // <-- walks embedded objects
  this._popContext();

  for (const childPage of childPages) {
    this._visitPage(childPage, {includeSubpages});
  }
}
```

### _walkSlateFragment (lines 540-574)

Walks Slate content, finding embedded collaborative objects (grids, controls, canvas blobs) and structured values:

```typescript
private _walkSlateFragment(fragment: SlateContentBlockElement[]) {
  // Save all slate nodeIds for later canvas @line_ref remapping
  for (const node of fragment) {
    if ('id' in node) {
      this._copiedSlateNodeIds.add(node.id);
    }
  }

  const objectNodes = slateApi.filterNodesInFragment(fragment, slateApi.nodeIsObject);
  for (const [objectNode] of objectNodes) {
    switch (objectNode.type) {
      case SlateElementType.MagicBlock:
      case SlateElementType.InlineCollaborativeObject:
      case SlateElementType.Table:
        this._walkCorrectObjectType(objectNode.id);  // recurse into grids/controls
        break;
      case SlateElementType.InlineStructuredValue:
        this._saveCanvasReferenceInfo(objectNode);
        this._walkValue(objectNode.value);
        break;
    }
  }
}
```

### _visitGridData (lines 967-1031)

Collects grid data: columns, rows, row values. This is where the actual data lives:

```typescript
private _visitGridData(grid: GridInterface, gridRangeRestriction?) {
  const rows = this._getRowsCopyInfo(grid, gridRangeRestriction);
  const columns = this._getColumnsCopyInfo(grid, gridRangeRestriction);
  
  const baseGridInfo: BaseGridCopyInfo = {
    type: CopyNodeType.Grid,
    id: grid.id,
    isCoreGrid: grid.isDeprecatedCoreGrid,
    name: grid.name,
    identifyingColumnId,
    columns, rows, visibleRowIds: [],
    packIds,
    conditionalFormats, protectionMode, tableLockingSettings,
  };
  
  this._walkGridValuesFromRowCopyInfo(grid.id, rows);
}
```

### _visitBlobInfos (lines 648-684)

Collects blob metadata (not the actual blob data — that's in S3):

```typescript
this._blobsInfo[blobId] = {
  blobId, name, mimeType,
  status: blobStatus, // BlobStatus.PREINGESTION
  description, size, height, width,
  sourceUri,  // URL used to copy the blob later
  error,
};
```

### getCopyInfo — the final output (lines 189-220)

```typescript
getCopyInfo(): CopyInfo {
  this._updateRemappedSlateNodeIds();
  // Push visible RowId list onto gridInfos
  for (const gridId of Object.keys(this._gridsInfo)) {
    inPlaceAppendToArray(this._gridsInfo[gridId].visibleRowIds, ensureExists(this._rowIdsAddedMap[gridId]));
  }

  return {
    version: CopyPasteVersion.V4,
    copyIdentifier: uuid.create(),
    errors: this._errors,
    isCut: this._isCut,
    shouldForceNewObjects: this._shouldForceNewObjects,
    rootId: ensureExists(this._rootId),
    nodesInfo: this._nodesInfo,
    objectsInfo: this._objectsInfo,
    rowCountsMap: this._rowCountsMap,
    automationsInfo: this._automationsInfo,
    blobsInfo: this._blobsInfo,
    externallyBackedGridsInfo: this._externallyBackedGridsInfo,
    peopleInfo: this._peopleInfo,
    packsInfo: this._packsInfo,
    gridsInfo: this._gridsInfo,
    docInfo: getDocumentMetadata(this._document, CopyPasteVersion.V4),
    sourceInfo: ensureExists(this._sourceInfo),
    codaObjectReferenceInfo: this._codaObjectReferenceInfo,
    itemLayoutInfo: this._itemLayoutInfo,
  };
}
```

---

## 5. CopyInfo — The Intermediate Representation [VERIFIED]

**File:** `modules/common/models-types/serialization.ts`
**Line:** 410

CopyInfo is the central data structure — the serialized representation of a document (or part of one) that can be pasted elsewhere.

```typescript
export interface CopyInfo {
  docInfo: DocumentMetadata;
  isCut: boolean;
  shouldForceNewObjects?: boolean;
  shouldForceMessageTemplatesDeserialization?: boolean;
  rowCountsMap: {[id: string]: {allRows: number; visibleRows: number}};
  externallyBackedGridsInfo?: {[id: string]: ExternallyBackedGridCopyInfo};
  version: CopyPasteVersion.V4;
  sourceInfo: CodaCopySourceInfo;
  copyIdentifier?: string;

  rootId: string;                              // Entry point of the paste tree
  nodesInfo: {[id: string]: NodeCopyInfo};     // All nodes (pages, grids, controls, text selections)
  objectsInfo: {[id: string]: ObjectTypeDescriptor};
  errors: CopyError[];

  automationsInfo: {[id: string]: AutomationCopyInfo};
  packsInfo: PacksCopyInfo;
  peopleInfo: {[id: number]: PersonCopyInfo};
  blobsInfo: {[id: string]: BlobCopyInfo};
  gridsInfo: {[id: string]: GridCopyInfo};
  itemLayoutInfo: {[gridId: string]: {[itemLayoutId: string]: ItemLayoutCopyInfo}};
  codaObjectReferenceInfo: CodaObjectReferenceInfo;
}
```

**Why it's shaped this way:** CopyInfo is a flat dictionary of nodes (`nodesInfo`) plus separate dictionaries for non-tree data (grids, blobs, people, packs, automations). The `rootId` tells the PasteWriter where to start. This is the same format used for both full-doc copy AND clipboard copy-paste within the editor.

**Node types (CopyNodeType enum):**
- `Document` — top level, contains pageIds and coreGridIds
- `Page` — page metadata + canvas content (Slate fragment)
- `ViewOfGrid` — grid/table embed in a canvas
- `Control` — formula control
- `CanvasBlob` — image/file embed
- `TextSelection` — partial text from a canvas

---

## 6. IdRemapper — Generating New IDs [VERIFIED]

**File:** `modules/common/model-serialization/private/id_remapper_v2.ts`
**Line:** 78 (class definition)

IdRemapper is responsible for deciding what happens to every object ID during paste: does it get a new ID? Does it map to an existing object? Does it change type?

### IdMap type (from `modules/common/model-serialization/private/types.ts`, line 35):

```typescript
export interface IdMap {
  [oldId: string]: string;
}
```

### Key interfaces (from `modules/common/model-serialization/types.ts`, lines 45-51):

```typescript
export interface IdMaps {
  remappedCollaborativeObjectIds: Readonly<IdMap>;
  remappedPageIds: Readonly<IdMap>;
  remappedBlobIds: Readonly<IdMap>;
  remappedSlateNodeIds: Readonly<IdMap>;
  viewIdMap: Readonly<{[gridId: string]: IdMap}>;
}
```

### Constructor — where all the decisions happen (lines 108-182):

```typescript
constructor(
  copyInfo: CopyInfo,
  options: PasteOptionsV4,
  document: DocumentInterface,
  copyModeInfo: CopyModeInfo,
  idsToSkipRemapping?: Set<string>,
) {
  this._isCrossDocPaste = this._document.id !== this._copyInfo.docInfo.id;

  // Cross doc paste → always DuplicateData
  if (this._isCrossDocPaste) {
    linkedOverrideBehavior = PasteLinkingBehavior.DuplicateData;
  }

  // 3 processing phases:
  this._populateTopLevelObjectIdsForRowCellOpHandling();
  this._processCopyInfoNodes();       // Remap controls, blobs, pages, blobs (cross-doc)
  this._processAndRemapViewsOfGrids(); // The big one — decides grid→table or grid→view
  this._processAndRemapItemLayouts();
  
  this._remappingInfo.supportedPasteBehaviors = this._getSupportedPasteBehaviors();
}
```

### ID generation — is it deterministic? NO [VERIFIED]

IDs are generated using `ids.generateNewIdOfSameType()` which calls `ids.generateObjectId(prefix)`:

```typescript
// From modules/common/ids/ids.ts, line 296
export function generateNewIdOfSameType(existingId: string): string {
  const idParts = existingId.split('-');
  ensure(idParts.length > 1);
  let prefix = idParts[0];
  // Special case for rule grid ids
  if (existingId.startsWith(RuleGridIdPrefix)) {
    prefix = RuleGridIdPrefix;
    // ...
  }
  return ids.generateObjectId(prefix);
}
```

`generateObjectId` creates random UUIDs with a type prefix. Not deterministic — each copy gets fresh random IDs.

### getMappedCollaborativeObjectId — lazy remapping for unknown IDs (lines 232-254):

```typescript
getMappedCollaborativeObjectId(objectId: string): string {
  if (
    !this._remappedCollaborativeObjectIds[objectId] &&
    ids.isGridId(objectId) &&
    !ids.isSyncTableSourceGridId(objectId)
  ) {
    if (ids.isSelectListGridId(objectId)) {
      // Derive select list grid ID from parent
      const {gridId, columnId} = ids.getBaseGridAndColumnIdFromSelectListGridId(objectId);
      const remappedGridId = this.getMappedCollaborativeObjectId(gridId);
      this._remappedCollaborativeObjectIds[objectId] = ids.generateSelectListGridId(remappedGridId, columnId);
    } else if (this._isCrossDocPaste) {
      this._remappedCollaborativeObjectIds[objectId] = ids.generateNewIdOfSameType(objectId);
    }
  }
  return this._remappedCollaborativeObjectIds[objectId] ?? objectId;
}
```

**Key insight:** IDs that weren't pre-mapped in the constructor get mapped lazily on first access. For same-doc paste, unmapped IDs pass through unchanged. For cross-doc paste, they get new random IDs.

### IdentityIdRemapper (line 1353):

For `FullDocumentPaste` mode (used by the fork workflow), an `IdentityIdRemapper` is used — it passes all IDs through unchanged:

```typescript
export class IdentityIdRemapper extends IdRemapper {
  override getMappedCollaborativeObjectId(objectId: string): string {
    return objectId;
  }
  override getMappedViewId(_originalGridId: string, viewId: string): string {
    return viewId;
  }
  override getMappedPageId(pageId: string): string {
    return pageId;
  }
  // ...
}
```

**This is a critical design insight:** In the ForkDocument workflow (full doc copy), the PasteWriter uses IdentityIdRemapper. IDs don't change. The new doc gets the SAME object IDs as the source. This works because the new doc is a completely separate document — there's no risk of collision.

### Linking behavior decisions (lines 594-607):

```typescript
switch (this._options.linkingBehavior) {
  case PasteLinkingBehavior.CreateViews:
    return topLevelViewsOfGrids;  // Only paste views, link to existing grids
  case PasteLinkingBehavior.DuplicateTables:
  case PasteLinkingBehavior.DuplicateData:
    return this._getViewsToInsertForDuplicateBehavior(...);
}
```

Three paste linking behaviors:
- `CreateViews` — pasted grids become linked views of existing tables
- `DuplicateTables` — base grids are duplicated, but views link
- `DuplicateData` — everything gets duplicated (used for cross-doc paste and full-doc copy)

---

## 7. PasteWriter — Materializing the Copy as Operations [VERIFIED]

**File:** `modules/common/model-serialization/paste_writer.ts`
**Line:** 307 (class definition)

PasteWriter takes a `CopyInfo` and produces document operations that materialize the copy.

### Constructor (lines 370-399):

```typescript
constructor(
  document: DocumentInterface,
  copyInfo: CopyInfo,
  options: PasteOptionsV4,
  onError?: (err: string) => void,
) {
  this._document = document;
  this._copyInfo = copyInfo;
  this._options = this._getPasteOptionsFromCopyInfo(options, copyInfo);
  this._copyOpSourceInfo = getCopySource({
    sourceDocId: copyInfo.docInfo.id,
    copySourceType: CopySourceType.Ops,
  });
  this._shouldHandleAsCutAndPaste = this._copyInfo.isCut && this._copyInfo.docInfo.id === this._document.id;
  // Pre-bind callbacks for performance
  this._rewriteReferenceCallback = this._rewriteReference.bind(this);
  // ... more callback bindings
}
```

### pasteIntoDocument (lines 640-651):

```typescript
pasteIntoDocument(copyMode: CopyIntoDocModeInfo, undoOptions?: UndoOptions) {
  if (undoOptions) {
    this._undoOptions = undoOptions;
  }
  const error = this._setupIdRemapper({type: PasteTargetType.Document, copyMode}, copyMode);
  if (error) {
    return;
  }
  this._document.uncommittedOperationCreator.withOperationSource(this._copyOpSourceInfo, () =>
    this._deserializeRootNodeInDocument(),
  );
}
```

### _setupIdRemapper (lines 413-519):

This is where the choice between `IdRemapper` and `IdentityIdRemapper` is made:

```typescript
private _setupIdRemapper(targetInfo, mode, idsToSkipRemapping?) {
  this._initializedIdRemapper =
    (mode.type === PasteMode.FullDocumentPaste || this._shouldUseProgrammaticCellPaste()) && !this._isCrossEnvPaste()
      ? new IdentityIdRemapper(this._copyInfo, this._options, this._document, mode, idsToSkipRemapping)
      : new IdRemapper(this._copyInfo, this._options, this._document, mode, idsToSkipRemapping);
  // ... grid limit checks
}
```

### _deserializeRootNodeInDocument (lines 653-676):

```typescript
private _deserializeRootNodeInDocument() {
  this._ensureInitialized();
  const rootNode = this._copyInfo.nodesInfo[this._copyInfo.rootId];
  switch (rootNode.type) {
    case CopyNodeType.Document:
      this._insertDocument(rootNode);
      break;
    case CopyNodeType.Page:
      this._insertPageNode(rootNode);
      break;
    // ...
  }
  this._insertReadyToInsertObjects();
}
```

### _insertDocument (lines 1369-1388):

```typescript
private _insertDocument(docInfo: DocumentCopyInfo) {
  const {ruleIds, properties, pageIds} = docInfo;

  if (this._copyModeInfo?.type === PasteMode.FullDocumentPaste) {
    for (const [propertyKey, propertyValue] of Object.entries(properties)) {
      this._document.setProperty(propertyKey, propertyValue);
    }
  }

  for (const pageId of pageIds) {
    const pageInfo = ensureExists(this._copyInfo.nodesInfo[pageId]);
    assertCondition(pageInfo.type === CopyNodeType.Page);
    this._insertPageNode(pageInfo);
  }

  this._insertValidAutomationsWithIds(ruleIds);
}
```

### _insertPageNode (lines 1534-1573):

```typescript
private _insertPageNode(pageInfo: PageCopyInfo) {
  const canvasId = this._handlePageDataForPasteMode(isFirstPage, pageInfo);
  const canvas = this._document.session.resolver.typedGetters.getCanvas(canvasId);

  if (pageType === PageType.SingleObjectCanvas && singlePageEmbedValue) {
    this._writeSinglePageEmbedValue(canvas, singlePageEmbedValue);
  } else {
    this._maybeWithContext(context, () =>
      this._insertSlateFragment(pageInfo.canvasContent, canvas.slate, canvas.getCursorAtEnd()),
    );
  }

  for (const nodeId of pageInfo.childrenIds ?? []) {
    const childInfo = ensureExists(this._copyInfo.nodesInfo[nodeId]);
    this._insertPageNode(childInfo);
  }
}
```

### getResults (lines 574-589):

```typescript
getResults(): PasteResultInfoV4 {
  return {
    version: CopyPasteVersion.V4,
    idMaps: this._idRemapper.idMaps,
    remappingInfo: this._idRemapper.remappingInfo,
    handleAsCutAndPaste: false,
    insertedPageIds: this._insertedPageIds,
    insertedAutomationIds: this._insertedAutomationIds,
    insertedGridIds: this._insertedGridIds,
    insertedTableIds: this._insertedTableIds,
    insertedControlIds: this._insertedControlIds,
    uninstallablePacks: this._uninstallablePacks,
    packMissingConnectionInfos: this._packMissingConnectionInfos,
    hasRejectedRichTexts: this._hasRejectedRichTexts,
  };
}
```

### Obfuscation support (lines 537-572):

The PasteWriter supports optional obfuscation (used by squash-history workflow to anonymize doc content):

```typescript
private _obfuscateStringValue(value: string): string {
  let obfuscatedString = this._memoizedObfuscation[value];
  if (!obfuscatedString) {
    obfuscatedString = getRandomString(value.length);
    if (value.length < MAX_MEMOIZE_OBFUSCATION_LENGTH) {
      this._memoizedObfuscation[value] = obfuscatedString;
    }
  }
  return obfuscatedString;
}
```

---

## 8. Formula Rewriting [VERIFIED]

### _rewriteFormulaString (paste_writer.ts, lines 3172-3200):

```typescript
private _rewriteFormulaString<T>(initialFormula: T, {objectId, fieldId}): T {
  if (typeof initialFormula !== 'string' || initialFormula === '') {
    return initialFormula;
  }

  const parserContext = new ParserContext(this._document.session.resolver, {
    objectId, fieldId,
    supportedFeatures: this._document.supportedFeatures,
    context: this._document.context,
    runtimeConfig: this._document.session.runtimeConfig,
  });
  const rewrittenFormula = rewriteIdsInFormula(
    initialFormula,
    parserContext,
    this._rewriteReferenceCallback,
    undefined,
    { unbindParentProjections: true },
  );
  return rewrittenFormula as unknown as T;
}
```

### rewriteIdsInFormula (modules/common/formula/rewrite_ids_in_formula.ts, lines 10-39):

```typescript
export function rewriteIdsInFormula(
  rawFormula: string,
  parserContext: ParserContextInterface,
  updateRefTokenCallback: (ref: ReferenceInterface) => string,
  refFilterCallback?: (ref: ReferenceInterface) => boolean,
  { unbindParentProjections, allowInvalidFormula } = {},
): string {
  const contextClone = parserContext.clone();
  contextClone.setFlag(ParserFlag.ParsingForFormulaRewrite, true);

  let parseResult = parser.parse(rawFormula, contextClone);
  const visitor = new ChangeObjectIdsVisitor(parseResult, updateRefTokenCallback, refFilterCallback);
  visitor.visitRoot(ensureExists(parseResult.ast));
  const changeObjectIdsResult = visitor.getResult();

  if (!unbindParentProjections) {
    return changeObjectIdsResult;
  }

  parseResult = parser.parse(changeObjectIdsResult, contextClone);
  const unbindVisitor = new UnbindParentProjectionsVisitor(parseResult);
  unbindVisitor.visitRoot(ensureExists(parseResult.ast));
  return unbindVisitor.getResult();
}
```

**How it works:**
1. Parse the formula into an AST
2. Walk the AST with `ChangeObjectIdsVisitor` — for every reference token, call `updateRefTokenCallback` to get the new reference text
3. Optionally unbind parent projections (a second AST pass)

### ChangeObjectIdsVisitor (modules/common/formula/private/ast/change_object_ids_visitor.ts, lines 13-57):

```typescript
export class ChangeObjectIdsVisitor extends RewriteVisitor {
  handleLiteralToken(token: LiteralToken): void {
    switch (token.type) {
      case TokenTypes.REFERENCE:
      case TokenTypes.ATREF: {
        if (
          token.ref &&
          (token.type !== TokenTypes.REFERENCE || token.normalized) &&
          this._refFilterCallback(ensureExists(token.ref))
        ) {
          this._pushTokenWithOverrideText(token, this._updateRefTokenCallback(ensureExists(token.ref).clone()));
          break;
        }
        this._pushToken(token);
        break;
      }
      // ... other token types pass through
    }
  }
}
```

### _rewriteReference — the callback (paste_writer.ts, lines 3083-3170):

This is where the PasteWriter maps old object IDs to new ones in formula references:

```typescript
private _rewriteReference(ref: ReferenceInterface): string {
  const objectId = ref.objectId;
  const typeChangeInfo = this._idRemapper.getObjectTypeChangeInfo(objectId);
  const mappedId = this._idRemapper.getMappedCollaborativeObjectId(objectId);

  if (this._shouldUnbindRef(ref)) {
    return getEscapedName(ref.fieldName);
  }

  if (typeChangeInfo) {
    // Object changed types (grid→table or table→grid)
    if (typeChangeInfo.type === ObjectType.ViewContainer) {
      if (refType.isGridRef(ref)) {
        ref = new TableReference(ref.fieldName, typeChangeInfo.id, mappedId, typeChangeInfo.viewId);
      }
    } else if (!refType.isTableRef(ref)) {
      ref = ref.clone();
      ref.objectId = typeChangeInfo.id;
    } else {
      ref = new GridReference(ref.fieldName, typeChangeInfo.id);
    }
  } else {
    // Same type — just update IDs
    if (ref.objectId !== mappedId) {
      ref.objectId = mappedId;
    }
    if (refType.isTableRef(ref)) {
      ref.sourceObjectId = this._idRemapper.getMappedCollaborativeObjectId(oldSourceGridId);
      ref.viewId = this._idRemapper.getMappedViewId(oldSourceGridId, oldViewId);
    }
  }
  return ref.asNormalizedFormula({includeName: true});
}
```

### FormulaCopyVisitor (modules/common/formula/formula_copy_visitor.ts):

This is a different visitor used during the COPY phase (not paste). It walks the AST and unbinds references to their text form so they can be re-bound on paste:

```typescript
export class FormulaCopyVisitor extends RewriteVisitor {
  handleLiteralToken(token: LiteralToken): void {
    switch (token.type) {
      case TokenTypes.REFERENCE: {
        if (token.normalized && token.ref &&
            (!refType.isRowRef(token.ref) || refType.isVariableRowRef(token.ref)) &&
            !refType.isCellRef(token.ref)) {
          // Unbind to fully qualified name
          const text = fullyQualified
            ? token.ref.getFullyQualifiedName(this.resolver, this._context)
            : getEscapedName(token.ref.getCurrentName(this.resolver));
          this._pushTokenWithOverrideText(token, text);
        }
        break;
      }
    }
  }
}
```

**Note:** Row and cell references are NOT unbound — they are "picked specifically and not easy to re-bind."

---

## 9. Blob Copying [VERIFIED]

**File:** `modules/server/doc-bulk-storage/document_bulk_storage.ts`
**Line:** 1143

Blob copying is a direct S3 directory copy:

```typescript
async copyBlobsToNewDoc(
  sourceDocId: string,
  newDocId: string,
  cutoffMinutes: number,
  {nextMarker}: {nextMarker?: string} = {},
): Promise<{nextMarker?: string}> {
  const {copyDirectoryOnForkConcurrency} = this._runtimeConfigManager.getConfig().DocBulkStorageSetting;
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

**Key facts:**
- Uses S3 `copyDirectory` — copies entire blob directory from source to dest
- Has a `cutoffMinutes` parameter — if blobs are too many, returns a `nextMarker` for continuation
- Initial copy gets `initialBlobCopyCutoffMinutes`, continuation gets `dedicatedBlobCopyCutoffMinutes`
- Concurrency is configurable via runtime config
- Cross-region replication tags are applied

**Why it's a directory copy:** Blobs are stored at `{bucket}/{topLevelKey}/{docId}/{blobId}`. The directory copy approach is efficient for docs with many blobs.

**Blob metadata is handled separately:** The CopyVisitor collects blob metadata (`_blobsInfo`), and the PasteWriter's IdRemapper handles remapping blob IDs for cross-doc paste. But for the fork workflow (same IDs), blobs just need their S3 objects copied.

---

## 10. scrubCopiedDocument — Post-Copy Cleanup [VERIFIED]

**File:** `modules/server/workflows/fork_document.ts`
**Lines:** 244-448

This is Task 2 of the fork workflow. After the source doc's model is loaded into the new doc's context, several cleanup operations run:

### _clearAuthorsFromDocument (line 544):

```typescript
function _clearAuthorsFromDocument(document: DocumentInterface): void {
  const pageIds = document.pagesManager.getFlattenedPages().map(page => page.id);
  for (const pageId of pageIds) {
    document.pagesManager.changeAuthors(pageId, undefined);
  }
}
```

### _deleteCommentsFromDoc (line 550):

```typescript
function _deleteCommentsFromDoc(document: DocumentInterface): void {
  const commentsGrid = document.session.resolver.typedGetters.tryGetCommentsGrid();
  const commentsThreadsGrid = document.session.resolver.typedGetters.tryGetCommentThreadsGrid();
  if (commentsGrid) commentsGrid.truncate();
  if (commentsThreadsGrid) commentsThreadsGrid.truncate();
}
```

### _clearExternalFormData (line 563):

Clears external form configs from all canvas grids' item layout catalogs.

### _clearSharedPages (line 573):

Nullifies `partialDocId` on all pages — breaks subdoc sharing links.

### _fixAuthedSyncPages (line 584):

Rewrites authed sync pages from authed access to source access.

### _resetLocking (line 595):

Removes all protection if the workspace doesn't support the `DocumentLocking` feature.

### _scrubPeopleTable (line 606):

```typescript
async function _scrubPeopleTable(services, document, docInfo): Promise<void> {
  const writerUserIds = await getWriterUserIds({docId, folderId, services});
  peopleGridManager.clearUnreferencedPeopleRows(writerUserIds);

  // Transition ManuallyAdded(NoAccess) users to NowMissing
  // Purpose: eliminate fictional characters from templates
  const peopleRefs = peopleGridManager.getPeopleRowReferences({withState: peopleTableStatesToTransitionToNowMissing});
  if (peopleRefs.length) {
    peopleGridManager.removeManuallyAddedUsers(rowIds);
  }
}
```

### removeV3SyncTables (line 640):

```typescript
function removeV3SyncTables(document: DocumentInterface): void {
  for (const grid of document.getCanvasGrids()) {
    if (isSyncTableGrid(grid) && grid.isExternallyBackedGrid) {
      ensureExists(grid.getParent() as CanvasInterface).removeObject(grid.id);
    }
  }
}
```

### removeDbBackedTables (line 648):

```typescript
function removeDbBackedTables(document: DocumentInterface): void {
  for (const grid of document.getCanvasGrids()) {
    if (isDbBackedTableGrid(grid)) {
      ensureExists(grid.getParent() as CanvasInterface).removeObject(grid.id);
    }
  }
}
```

### GC op (lines 392-424):

After all scrubbing:
1. Flush any uncommitted ops
2. Add a `GARBAGE_COLLECT` operation to ensure all scrubbed data is permanently removed and cannot be revived through version history

### Flush and snapshot (lines 427-436):

After GC:
1. Update page infos in the database
2. Flush ops (with `preventBroadcastOps: true` since doc isn't online yet)
3. Take a snapshot

### Block op version (lines 440-444):

```typescript
await docStorage.updateDocumentBlockOpVersion(
  document.id,
  document.currentVersion,
  operation.getNextCollaborativeVersion(document.currentVersion),
);
```

This sets the earliest visible point in version history for the new doc.

---

## 11. Page-Level Duplication vs Full-Doc Copy [VERIFIED]

**File:** `modules/common/model-serialization/utils.ts`
**Line:** 150

The `duplicatePage()` function handles page-level duplication:

```typescript
export function duplicatePage(
  document: DocumentInterface,
  sourceRootPageId: string,
  undoOptions: UndoOptions,
  { includeSubpages, pasteOptions, copyOptions }: { ... },
  rootPageOverrides = {},
): {pageId: string; canvasId: string; remappedPageIds: Readonly<{[oldId: string]: string}>} | null {
  const rootPage = ensureExists(pagesManager.getById(sourceRootPageId));
  
  // Step 1: Copy
  const copyVisitor = new CopyVisitor(document, { isCut: false, rowsToInclude: copyOptions?.rowsToInclude });
  copyVisitor.copyPage(rootPage, {includeSubpages});
  const rawCopyInfo = copyVisitor.getCopyInfo();

  // Step 2: Optionally override root page properties
  const copyInfo = updateCopyInfoForOverrides(rawCopyInfo, rootPageOverrides);
  
  // Step 3: Paste
  const pasteWriter = new PasteWriter(document, copyInfo, pasteOptions);
  pasteWriter.pasteIntoDocument({type: PasteMode.AppendPagesPaste, parentId, position}, undoOptions);
  
  const pasteResult = pasteWriter.getResults();
  return {
    pageId: firstInsertedPageId,
    canvasId: newPage.canvasId,
    remappedPageIds: pasteResult.idMaps.remappedPageIds,
  };
}
```

**Key differences from full-doc copy:**

1. **Entry point**: `copyVisitor.copyPage()` instead of `copyVisitor.copyDocument()`
2. **Source info**: `CodaCopySourceType.CopyPage` instead of `CopyDocument`
3. **ID remapping**: Uses full `IdRemapper` (not `IdentityIdRemapper`) because pages are pasted back into the same doc
4. **Paste mode**: `PasteMode.AppendPagesPaste` — inserts as siblings after the source page
5. **No scrubbing**: No author clearing, comment deletion, etc.
6. **Synchronous**: Happens entirely in the browser — no workflow

---

## 12. CopyDocToExistingDoc — The "Paste Into Existing" Path [VERIFIED]

**File:** `modules/server/workflows/copy_doc_to_existing_doc.ts`

This is a different workflow used when copying a doc's content into an existing doc (not creating a new one).

### Task 1: copyDocument (lines 109-139)

Loads the source doc model and creates a CopyInfo:

```typescript
const copyInfo = await withUpToDateOnlineModel(
  services, sourceDocId, userId,
  async docModel => getCopyInfoForDocument({docModel, rowsToInclude: rowsToIncludeSetting}),
);
// Store in workflow object storage
await workflowObjectStorage.putObject<CopyDocToExistingDocWorkflowObject>(
  [WorkflowObjectType.CopyDocToExistingDoc, context.workflowExecutionId],
  {copyInfo},
);
```

### getCopyInfoForDocument (lines 94-107):

```typescript
function getCopyInfoForDocument({docModel, rowsToInclude}): CopyInfo {
  const copyVisitor = new CopyVisitor(docModel, { isCut: false, rowsToInclude });
  copyVisitor.copyDocument(docModel);
  return copyVisitor.getCopyInfo();
}
```

### Task 2: generateOpsForPastedDoc (lines 141-254)

Loads the target doc, installs packs, pastes content, and saves generated ops:

```typescript
const pasteResult = await pasteIntoDocument({
  docModel,
  copyInfo,
  rowsToIncludeSetting,
  pasteMode,
});
```

Where `pasteIntoDocument` (from `copy_paste_pages_workflow_helpers.ts`, line 308) creates a PasteWriter with `PasteLinkingBehavior.DuplicateData`:

```typescript
async function _doPasteIntoDocument({targetPage, targetCanvas, copyInfo, ...}) {
  const pasteWriter = new PasteWriter(targetCanvas.document, copyInfo, {
    rowsToInclude: rowsToIncludeSetting,
    linkingBehavior: PasteLinkingBehavior.DuplicateData,
  });
  await pasteWriter.initializeForPaste();
  pasteWriter.pasteIntoDocument(buildPasteModeInfo(...));
  const {idMaps, insertedPageIds: insertedPages} = pasteWriter.getResults();
  return {idMaps, insertedPages, version: CopyPasteVersion.V4};
}
```

### Task 3: processUncommittedOps (lines 256-281)

Applies the generated ops to the target doc using the workflow object storage.

---

## 13. SquashDocument — The "Squash History" Path [VERIFIED]

**File:** `modules/server/workflows/squash_document.ts`
**Line:** 116

When `squashHistory` is true, the `SquashDocument` workflow is used instead of `ForkDocument`. This is the path that uses CopyVisitor + PasteWriter instead of loading/scrubbing the source model.

### squashDocument task (lines 116-169):

```typescript
const {copyInfo} = await docManager.withModel({
  docId: sourceDocId,
  user,
  schemaVersion,
  recalcType: RecalcType.Static,
  opVersion,
  callback: async document => {
    const copyVisitor = new CopyVisitor(document);
    copyVisitor.copyDocument(document);
    return {copyInfo: copyVisitor.getCopyInfo()};
  },
});
```

### generateSquashedOps task (lines 171+):

```typescript
await pasteIntoDocument(document, copyInfo, {
  obfuscate,
  preserveNamesDuringObfuscate: runtimeConfig.PreserveNamesDuringObfuscate.enabled,
});
```

Where `pasteIntoDocument` is from `modules/common/paste-utils/index.ts`:

```typescript
export async function pasteIntoDocument(
  document: DocumentInterface,
  copyInfo: CopyInfo,
  { copyMode = {type: PasteMode.FullDocumentPaste}, obfuscate, preserveNamesDuringObfuscate } = {},
): Promise<void> {
  const pasteWriter = new PasteWriter(document, copyInfo, {
    rowsToInclude: RowsToInclude.All,
    linkingBehavior: PasteLinkingBehavior.DuplicateData,
    obfuscate,
    preserveNamesDuringObfuscate,
  });
  await pasteWriter.initializeForPaste();
  pasteWriter.pasteIntoDocument(copyMode);
}
```

**Key difference from ForkDocument:** SquashDocument generates a completely fresh op log. The new doc starts with only the ops generated by the paste — no history. ForkDocument keeps the original op log (which is why it loads the model from sourceDocInfo and applies it to the forked doc).

---

## 14. Data Flow Summary

### Full Doc Copy (ForkDocument) — The Main Path

```
User clicks "Copy doc"
        │
        ▼
POST /copy/:docId
        │
        ▼
copyDocument() handler
  ├── Validates auth, opVersion, permissions
  └── Calls launchForkDocumentWorkflow()
        │
        ▼
launchForkDocumentWorkflow()
  ├── Validates: schema version, calc state, op lag, transaction boundaries
  ├── Generates new docId
  ├── docCreator.createDocument() — creates empty doc in INITIALIZING state
  └── Fires-and-forgets: workflowStorage.createWorkflowExecution(ForkDocument)
        │
        ▼
[Workflow Task 1: forkDocument]
  ├── IN PARALLEL:
  │   ├── copyBlobsToNewDoc() — S3 directory copy
  │   ├── _copyDocumentStorage() — op pointer, tags
  │   ├── updateDocumentLastProcessedOpVersion()
  │   └── copyDocumentRules()
  └── If blobs incomplete → copyExcessiveBlobs (loops)
        │
        ▼
[Workflow Task 2: scrubCopiedDocument]
  ├── Load source doc model via docManager.withModel({loadFromDocInfo: sourceDocInfo})
  ├── Apply forward any ops from previous execution attempts
  ├── Register cross-doc tables
  ├── Copy external connections (packs)
  ├── Scrub:
  │   ├── Clear authors (if deletePageAuthors)
  │   ├── Clear external form data
  │   ├── Delete comments (if deleteComments)
  │   ├── Reset locking
  │   ├── Clear shared pages
  │   ├── Fix authed sync pages
  │   ├── Scrub people table
  │   ├── Clear publish metadata
  │   ├── Remove V3 sync tables
  │   └── Remove DB-backed tables
  ├── GC op (makes scrubbed data unrecoverable)
  ├── Flush ops + snapshot
  └── Update block op version
        │
        ▼
[Workflow Task 3: flipToOnline]
  ├── Transition INITIALIZING → ONLINE
  ├── Broadcast availability
  └── If slow copy → create user notification
```

### Full Doc Copy (SquashDocument) — The "Fresh Start" Path

```
Same entry → launchForkDocumentWorkflow(squashHistory: true)
        │
        ▼
[squashDocument task]
  Load source model → CopyVisitor.copyDocument() → CopyInfo
        │
        ▼
[generateSquashedOps task]
  PasteWriter(IdentityIdRemapper) → pasteIntoDocument(FullDocumentPaste)
  → Generates fresh ops from CopyInfo
  → Flush to workflow object storage
        │
        ▼
[processUncommittedOps task]
  Apply generated ops → Snapshot → flipToOnline
```

### Page Duplication (Client-Side)

```
duplicatePage()
  ├── CopyVisitor.copyPage(rootPage, {includeSubpages})
  ├── getCopyInfo() → CopyInfo
  ├── PasteWriter(IdRemapper) — generates new IDs
  ├── pasteIntoDocument(AppendPagesPaste)
  └── Returns {pageId, canvasId, remappedPageIds}
```

---

## Surprising Findings and Edge Cases

### 1. ForkDocument keeps the SAME object IDs [VERIFIED]

The fork workflow uses `IdentityIdRemapper` — all grid IDs, page IDs, canvas IDs are identical in the copy. This is safe because the new doc is completely separate. This is a key performance optimization — no formula rewriting needed.

### 2. Fork loads the SOURCE model into the FORKED doc context (fork_document.ts, line 278)

```typescript
await docManager.withModel({
  docId,                        // forked doc ID
  loadFromDocInfo: sourceDocInfo,  // load from source
  opVersion,
});
```

This is called a "special usage of withModel." The model thinks it's in the forked doc, but it loaded data from the source.

### 3. Graph invalidation is explicitly prevented during pack installation (fork_document.ts, line 296)

```typescript
precalcCallback: document => {
  document.session.resolver.shouldExplicitlyPreventGraphInvalidation = true;
},
```

Pack formulas that depend on doc volatiles (like `docId`) would fail because packs aren't installed yet.

### 4. The "dangerous" async paste (paste-utils/index.ts, line 269)

```typescript
// WARNING: This function is marked as dangerous because it is async and occurs during
// the copy/paste flow. Any async functions that occur interleaved with copy/paste can
// cause massive headaches because the client can undo / generate new ops during the flow.
```

### 5. Blob copy uses cutoff minutes, not item count

Large docs with thousands of blobs get their blob copy split across multiple workflow tasks. The split is time-based (cutoff minutes), not count-based.

### 6. Cross-doc paste forces DuplicateData behavior (id_remapper_v2.ts, line 125)

```typescript
if (this._isCrossDocPaste) {
  linkedOverrideBehavior = PasteLinkingBehavior.DuplicateData;
}
```

You can never "link" to a grid in a different document — cross-doc always creates copies.

### 7. People table scrubbing removes "fictional characters from templates" (fork_document.ts, line 627)

```typescript
// Perform transition for ManuallyAdded(NoAccess) users to NowMissing.  The original motivating
// purpose here is to eliminate fictional characters from templates -> copies within people
// selection drop downs.
```

### 8. Select list grid IDs are derived from parent grid IDs (id_remapper_v2.ts, lines 246-249)

```typescript
if (ids.isSelectListGridId(objectId)) {
  const {gridId, columnId} = ids.getBaseGridAndColumnIdFromSelectListGridId(objectId);
  const remappedGridId = this.getMappedCollaborativeObjectId(gridId);
  this._remappedCollaborativeObjectIds[objectId] = ids.generateSelectListGridId(remappedGridId, columnId);
}
```

### 9. Row/cell references are NOT rewritten by FormulaCopyVisitor

```typescript
// Note we do not unbind row & cell references because they are picked specifically
// and not easy to re-bind.
```

### 10. The fork workflow has an explicit idempotency check for the GC op (fork_document.ts, lines 398-410)

```typescript
const [existingGcOp] = await docStorage.getLogWithPredicates(
  docId, document.schemaVersion, opVersion, 1,
  { opTypes: [OperationType.GARBAGE_COLLECT] },
  docInfo.tailOpsShard,
  { endpointType: PostgresDatabaseEndpointType.Writer },
);
if (!existingGcOp) {
  // Only add GC op if not already present
}
```

This protects against the case where the scrub task is rerun after a failure.

### 11. The fork_document_sweeper is the safety net

The workflow launch is fire-and-forget. If it fails, a sweeper process picks up docs stuck in `Initializing` state and relaunches their fork workflows.

---

## File Index

| File | Key Contents |
|------|-------------|
| `modules/server/frontend/private/actions/copy_document.ts` | HTTP handler, request body parsing |
| `modules/server/frontend/private/routers/authenticated.ts:330` | Route registration (`POST /copy/:docId`) |
| `modules/common/server-api/types/documents.ts:410` | `CopyDocumentParams` interface |
| `modules/server/document-lib/launch_fork_document_workflow.ts:48` | Validation, doc creation, workflow launch |
| `modules/server/workflows/fork_document.ts:131` | forkDocument task (blob copy, storage copy) |
| `modules/server/workflows/fork_document.ts:244` | scrubCopiedDocument task (model load, cleanup, GC) |
| `modules/server/workflows/fork_document.ts:450` | flipToOnline task |
| `modules/common/model-serialization/copy_visitor.ts:146` | CopyVisitor class (serialization) |
| `modules/common/models-types/serialization.ts:410` | CopyInfo interface |
| `modules/common/model-serialization/private/id_remapper_v2.ts:78` | IdRemapper class (ID generation/mapping) |
| `modules/common/model-serialization/private/id_remapper_v2.ts:1353` | IdentityIdRemapper (pass-through) |
| `modules/common/model-serialization/paste_writer.ts:307` | PasteWriter class (materialization) |
| `modules/common/model-serialization/utils.ts:150` | `duplicatePage()` function |
| `modules/common/paste-utils/index.ts:245` | `pasteIntoDocument()` helper |
| `modules/common/formula/rewrite_ids_in_formula.ts:10` | `rewriteIdsInFormula()` |
| `modules/common/formula/private/ast/change_object_ids_visitor.ts:13` | ChangeObjectIdsVisitor |
| `modules/common/formula/formula_copy_visitor.ts:15` | FormulaCopyVisitor |
| `modules/server/doc-bulk-storage/document_bulk_storage.ts:1143` | `copyBlobsToNewDoc()` (S3 copy) |
| `modules/server/workflows/copy_doc_to_existing_doc.ts:84` | CopyDocToExistingDoc workflow |
| `modules/server/workflows/squash_document.ts:116` | SquashDocument workflow |
| `modules/server/workflows/private/helpers/fork_document_helpers.ts:60` | flipToOnlineReturningDocInfo, copyExternalConnections |
| `modules/server/workflows/private/helpers/copy_paste_pages_workflow_helpers.ts:280` | _doPasteIntoDocument helper |
| `modules/common/model-serialization/private/types.ts:35` | IdMap, NewTypeInfo types |
| `modules/common/model-serialization/types.ts:45` | IdMaps, RemappingInfo, CopyVisitorInterface |
| `modules/common/ids/ids.ts:296` | `generateNewIdOfSameType()` |
