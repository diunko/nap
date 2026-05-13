# Research: What Changes, Breaks, or Disappears When a Coda Document is Copied

## Table of Contents
1. [The Two Copy Pipelines](#two-copy-pipelines)
2. [Fork Document Workflow (Full Copy)](#fork-document-workflow)
3. [The Scrub Step](#scrub-step)
4. [CopyVisitor - What Gets Serialized](#copy-visitor)
5. [PasteWriter / IdRemapper - ID Remapping](#paste-writer-id-remapper)
6. [Things That Get New IDs](#new-ids)
7. [Things That Are Deliberately Removed](#deliberately-removed)
8. [External Connections and Packs](#external-connections)
9. [Automations](#automations)
10. [Cross-Doc References](#cross-doc)
11. [Blob Handling](#blobs)
12. [Ephemeral/Runtime State Not Serialized](#ephemeral-state)
13. [String-Embedded References - The Gap](#string-embedded-references)
14. [Formula Rewriting](#formula-rewriting)
15. [Structured Value Remapping](#structured-value-remapping)
16. [IdentityIdRemapper vs IdRemapper](#identity-vs-id-remapper)
17. [Edge Cases and Surprising Findings](#edge-cases)

---

## Two Copy Pipelines [VERIFIED]

There are TWO distinct document copy pipelines in Coda. This is the most important architectural fact.

### Pipeline 1: ForkDocument (the "real" copy)

**File:** `modules/server/workflows/fork_document.ts`
**Line:** 131

This is the main document copy workflow. It's a multi-step server-side workflow with three tasks:

1. `forkDocument` (ASYNC) - copies blobs, automation rules, pack trials
2. `scrubCopiedDocument` (CPU_INTENSIVE) - loads the model and cleans it up
3. `flipToOnline` (ASYNC) - marks the doc as available

**Key insight:** ForkDocument does NOT use CopyVisitor/PasteWriter for the copy itself. It copies the raw ops/snapshot from the source doc and then SCRUBS the result. The new doc starts with the SAME IDs as the source doc (since it's a raw data copy), then the scrub step modifies specific things.

```typescript
// modules/server/workflows/fork_document.ts, lines 131-205
export async function forkDocument(
  services: LocalServices,
  params: ExecutingWorkflowParams<WorkflowName.ForkDocument>,
): Promise<WorkflowTaskExecutionDefinition<WorkflowName.ForkDocument>> {
  const {docBulkStorage, mentionsStorage, runtimeConfigManager} = services;
  const {context, docId, opVersion, sourceDocId} = params;
  // ...
  const [{nextMarker}] = await promise.allIncludingErrors([
    docBulkStorage.copyBlobsToNewDoc(sourceDocId, docId, initialBlobCopyCutoffMinutes),
    _copyDocumentStorage(services, params, sourceDocInfo, docInfo),
    mentionsStorage.updateDocumentLastProcessedOpVersion(docId, opVersion),
    _copyAutomationsStorage(services, params),
  ]);
```

### Pipeline 2: CopyDocToExistingDoc (copy-paste into existing doc)

**File:** `modules/server/workflows/copy_doc_to_existing_doc.ts`
**Line:** 94-139

This pipeline DOES use CopyVisitor + PasteWriter. It serializes the source doc through CopyVisitor, then deserializes it into the target doc using PasteWriter. This is the path that remaps IDs.

```typescript
// modules/server/workflows/copy_doc_to_existing_doc.ts, lines 94-107
function getCopyInfoForDocument({
  docModel,
  rowsToInclude,
}: {
  docModel: DocumentInterface;
  rowsToInclude: RowsToInclude;
}): CopyInfo {
  const copyVisitor = new CopyVisitor(docModel, {
    isCut: false,
    rowsToInclude,
  });
  copyVisitor.copyDocument(docModel);
  return copyVisitor.getCopyInfo();
}
```

**CRITICAL DIFFERENCE:** In ForkDocument, IDs are preserved (same document structure, new docId). In CopyDocToExistingDoc, IDs are remapped through the IdRemapper.

---

## Fork Document Workflow [VERIFIED]

**File:** `modules/server/workflows/fork_document.ts`

### Task 1: forkDocument (lines 131-205)

Four parallel operations:
1. **Copy blobs** (S3 directory copy) - `docBulkStorage.copyBlobsToNewDoc(sourceDocId, docId, initialBlobCopyCutoffMinutes)` (line 169)
2. **Copy document storage** - copies ops, tags, etc. (line 172)
3. **Update mentions storage** - sets the last processed op version (line 175)
4. **Copy automations storage** - copies periodic rules (line 178)

**Blob copy details (line 169):**
```typescript
docBulkStorage.copyBlobsToNewDoc(sourceDocId, docId, initialBlobCopyCutoffMinutes)
```

**File:** `modules/server/doc-bulk-storage/document_bulk_storage.ts`, line 1143
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
```

This is a raw S3 directory copy. Blob IDs are preserved since the fork keeps the same model IDs.

**Excessive blobs handling (lines 207-242):** If the blob copy exceeds the time cutoff, the workflow creates a `copyExcessiveBlobs` task to continue copying where it left off (using `nextMarker` pagination).

### Copy Document Storage (lines 485-534)

```typescript
async function _copyDocumentStorage(
  services: LocalServices,
  params: ExecutingWorkflowParams<WorkflowName.ForkDocument>,
  sourceDocInfo: DocumentInfo,
  newDocInfo: DocumentInfo,
): Promise<void> {
  const {docStorage, runtimeConfigManager} = services;
  const {docId, opVersion, schemaVersion, sourceDocId} = params;
  // ...
  await forkDocumentHelpers.copyDocTags(services, params, sourceDocInfo);
  // Grab the request op from the source doc
  const op = await docStorage.getOperation(sourceDocId, schemaVersion, opVersion, sourceDocInfo.tailOpsShard);
  // Note the latest op info
  await runWithBackoff(
    () => docStorage.updateDocumentLatestOpInfo(/*...*/),
    // ...
  );
}
```

Note: It does NOT copy the entire op log — it copies the snapshot at a point-in-time and references that specific opVersion.

### Copy Automations Storage (lines 536-542)

```typescript
async function _copyAutomationsStorage(
  {automationsStorage}: LocalServices,
  {docId, opVersion, sourceDocId}: ExecutingWorkflowParams<WorkflowName.ForkDocument>,
): Promise<void> {
  await automationsStorage.updateDocumentLastProcessedOpVersion(docId, opVersion);
  await automationsStorage.copyDocumentRules(sourceDocId, docId, opVersion);
}
```

**The SQL for CopyDocumentRules (line 252 of automations_storage_postgres.ts):**
```sql
INSERT INTO automations.periodic_rules(
  doc_id, rule_id, rule_type,
  enabled_at_op_version, when_definition,
  modification_timestamp, next_eligible_timestamp,
  creation_timestamp, workflow_name)
SELECT $2::automations.object_id, periodic_rules.rule_id, periodic_rules.rule_type,
  periodic_rules.enabled_at_op_version, periodic_rules.when_definition,
  periodic_rules.modification_timestamp, periodic_rules.next_eligible_timestamp,
  periodic_rules.creation_timestamp, periodic_rules.workflow_name
FROM automations.periodic_rules
WHERE periodic_rules.doc_id = $1::automations.object_id AND
  periodic_rules.enabled_at_op_version <= $3::numeric(12, 3) AND
  periodic_rules.rule_type != 'SYNC_TABLE_V3_REFRESH'
ON CONFLICT DO NOTHING;
```

**Key finding:** Automation rules keep the SAME rule_id in the copy. They're not remapped. The `doc_id` is changed to the new doc. SYNC_TABLE_V3_REFRESH rules are excluded.

---

## The Scrub Step [VERIFIED]

**File:** `modules/server/workflows/fork_document.ts`, lines 244-448
**Function:** `scrubCopiedDocument`

This is the heart of "what gets cleaned up during copy." The scrub step:

1. Loads the forked document's model from the source doc's snapshot
2. Applies any pending ops
3. Runs a series of cleanup operations
4. Adds a GC (garbage collect) op to prevent undo from recovering scrubbed data
5. Takes a fresh snapshot

### Complete list of scrub operations (in order):

**1. Register cross-doc tables (line 320)**
```typescript
await forkDocumentHelpers.registerAllCrossDocTablesOnDocument(services, document, params.userId, sourceDocId);
```

**2. Copy external connections / packs (lines 327-337)**
```typescript
await forkDocumentHelpers.copyExternalConnections(
  services, params, docInfo.workspaceId, document,
  HandleForkDocumentContext.ForkDoc,
  { onlyCopyPackIds, removedPackIds },
);
```

**3. Re-enable graph invalidation (lines 340-342)**
```typescript
document.session.resolver.shouldExplicitlyPreventGraphInvalidation = false;
document.resume();
```

**4. Clear page authors (lines 344-347)** — conditional on `deletePageAuthors` param
```typescript
// fork_document.ts, lines 544-549
function _clearAuthorsFromDocument(document: DocumentInterface): void {
  const pageIds = document.pagesManager.getFlattenedPages().map(page => page.id);
  for (const pageId of pageIds) {
    document.pagesManager.changeAuthors(pageId, undefined);
  }
}
```

**5. Clear external form data (lines 349-350)**
```typescript
// fork_document.ts, lines 563-571
function _clearExternalFormData(document: DocumentInterface): void {
  for (const grid of document.getCanvasGrids()) {
    for (const metadata of grid.itemLayoutCatalog.getMetadataForAllItemLayouts()) {
      if (metadata.externalFormConfig) {
        grid.itemLayoutCatalog.clearExternalForm(metadata.id);
      }
    }
  }
}
```

**6. Delete comments (lines 352-354)** — conditional on `deleteComments` param
```typescript
// fork_document.ts, lines 550-561
function _deleteCommentsFromDoc(document: DocumentInterface): void {
  const commentsGrid = document.session.resolver.typedGetters.tryGetCommentsGrid();
  const commentsThreadsGrid = document.session.resolver.typedGetters.tryGetCommentThreadsGrid();
  if (commentsGrid) { commentsGrid.truncate(); }
  if (commentsThreadsGrid) { commentsThreadsGrid.truncate(); }
}
```

**7. Reset locking (lines 357-358)**
```typescript
// fork_document.ts, lines 595-604
function _resetLocking(document: DocumentInterface): void {
  if (
    compareStandardFeatureSetId(
      document.workspaceBillingInfo.featureSetId,
      getMinimumFeatureSetRequiredForFeature(CodaFeature.DocumentLocking),
    ) < 0
  ) {
    document.protectionManager.removeAllProtection();
  }
}
```
**Key nuance:** Locking is only removed if the workspace doesn't have the Document Locking feature. If they do, locking is PRESERVED.

**8. Clear shared pages (lines 360-361)**
```typescript
// fork_document.ts, lines 573-582
function _clearSharedPages(document: DocumentInterface): void {
  if (!document.supportedFeatures.supportsSubdocSharing) {
    return;
  }
  for (const page of document.pagesManager.toArray()) {
    if (page.partialDocId) {
      document.pagesManager.setPartialDocId(ensureExists(page.pageId), null);
    }
  }
}
```

**9. Fix authed sync pages (lines 363-364)**
```typescript
// fork_document.ts, lines 584-593
function _fixAuthedSyncPages(document: DocumentInterface): void {
  for (const page of document.pagesManager.toArray()) {
    if (page.pageType === PageType.SingleObjectCanvas && page.canvas) {
      const embedValue = getEmbedFromSingleEmbedCanvas(page.canvas.slate);
      if (isAuthedSyncPage(embedValue)) {
        updateEmbedInSingleEmbedCanvas(page.canvas.slate, rewriteAuthedEmbedValueToSourceAccess(embedValue));
      }
    }
  }
}
```
Authed sync pages (pages with `authedPartialDoc: true`) are rewritten to "source access" mode.

**10. Scrub people table (lines 366-367)**
```typescript
// fork_document.ts, lines 606-638
async function _scrubPeopleTable(
  services: LocalServices,
  document: DocumentInterface,
  docInfo: DocumentInfo,
): Promise<void> {
  const {runtimeConfigManager} = services;
  const {id: docId, folderId} = docInfo;
  const {peopleGridManager} = document;
  const {peopleTableStatesToTransitionToNowMissing} = runtimeConfigManager.getConfig().ForkDocumentWorkflowSetting;

  const writerUserIds = await getWriterUserIds({ docId, folderId, services });
  peopleGridManager.clearUnreferencedPeopleRows(writerUserIds);

  // Perform transition for ManuallyAdded(NoAccess) users to NowMissing. The original motivating
  // purpose here is to eliminate fictional characters from templates -> copies within people
  // selection drop downs.
  if (!peopleTableStatesToTransitionToNowMissing.length) { return; }
  const peopleRefs = peopleGridManager.getPeopleRowReferences({withState: peopleTableStatesToTransitionToNowMissing});
  if (!peopleRefs.length) { return; }
  const rowIds = peopleRefs.map(ref => ref.identifier);
  peopleGridManager.removeManuallyAddedUsers(rowIds);
}
```
**Key insight:** Unreferenced people rows are cleared. ManuallyAdded users with NoAccess state are transitioned to NowMissing — this eliminates fictional/template characters from the people picker.

**11. Clear publishLandingDoc flag (lines 369-372)**
```typescript
if (document.publishLandingDoc) {
  document.setPublishLandingDoc(false);
}
```

**12. Clear copyPasteMetadata (lines 374-377)**
```typescript
if (document.copyPasteMetadata) {
  document.setCopyPasteMetadata(undefined);
}
```

**13. Handle assignment notebook clone (lines 379-383)**
```typescript
if (isAssignmentClone) {
  document.setAssignmentNotebookMode(AssignmentNotebookMode.Active);
}
```

**14. Remove V3 sync tables (lines 385-386)**
```typescript
// fork_document.ts, lines 640-646
function removeV3SyncTables(document: DocumentInterface): void {
  for (const grid of document.getCanvasGrids()) {
    if (isSyncTableGrid(grid) && grid.isExternallyBackedGrid) {
      ensureExists(grid.getParent() as CanvasInterface).removeObject(grid.id);
    }
  }
}
```
V3 (externally-backed) sync tables are REMOVED entirely from the copy.

**15. Remove DB-backed tables (lines 388-389)**
```typescript
// fork_document.ts, lines 648-654
function removeDbBackedTables(document: DocumentInterface): void {
  for (const grid of document.getCanvasGrids()) {
    if (isDbBackedTableGrid(grid)) {
      ensureExists(grid.getParent() as CanvasInterface).removeObject(grid.id);
    }
  }
}
```
Database-backed tables are also REMOVED entirely.

**16. Add GC op (lines 391-424)**

After all scrub operations, a Garbage Collect op is persisted. This prevents undo from recovering any of the scrubbed data.

**17. Flush ops and take snapshot (lines 426-436)**

---

## CopyVisitor - What Gets Serialized [VERIFIED]

**File:** `modules/common/model-serialization/copy_visitor.ts`

The CopyVisitor walks the document model and produces a `CopyInfo` object. This is the serialization format used by CopyDocToExistingDoc.

### CopyInfo structure (from serialization.ts, line 410):
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
  rootId: string;
  nodesInfo: {[id: string]: NodeCopyInfo};
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

### What CopyVisitor explicitly does NOT visit (TODO comments at line 259):
```typescript
// TODO(jason): Add missing Information
// - Visit protectionManager
// - Visit messageTemplateManager
// - Visit holidayGridsManager
// - What else is global document level?
```

This is a known gap in the copy pipeline. Protection settings, message templates (at the doc level), and holiday grids are not fully visited.

### What CopyVisitor skips:
1. **Ephemeral grids** (line 304, 1317) — unless `_includeEphemeralGrids` is set
2. **Ephemeral system rows** (line 895) — `ids.isEphemeralSystemRowId(row.id)` causes skip
3. **Oversized row data** (line 912) — cells larger than `MAX_ROW_DATA_SIZE` are set to null (except Slate values)
4. **Invalid automation rules** (line 435) — `!automationsGridManager.isRuleStructureValid(rule.id)` causes skip

### What CopyVisitor captures for each grid:
- Column definitions (name, format, formula, description, properties, pack info)
- Row data (raw cell values including calculated values)
- View definitions (filters, sorts, groups, column ordering/widths)
- Conditional formats
- Protection mode
- Table locking settings
- Sync table source info (for sync tables)
- Item layout info

### Blob handling in CopyVisitor (lines 648-684):
```typescript
private _visitBlobInfos(blobIds: string[]): void {
  const {blobManager} = this._document;
  for (const blobId of blobIds) {
    if (this._blobsInfo[blobId]) { continue; }
    const blobInfo = blobManager.blobsGridManager.getBlobInfo(blobId);
    if (!blobInfo) { continue; }
    const {name, size, mimeType, height, width, error, description} = blobInfo;
    const sourceUri = blobManager.getUrlForBlob(blobId);
    const canWeCopyBlob =
      sourceUri && (blobInfo.status === BlobStatus.INGESTED || blobInfo.status === BlobStatus.PREINGESTION);
    const blobStatus = canWeCopyBlob ? BlobStatus.PREINGESTION : BlobStatus.FAILED;
    this._blobsInfo[blobId] = {
      blobId, name, mimeType,
      status: blobStatus,
      description: this._buildBlobDescriptionInfoForCopy(description),
      size, height, width, sourceUri, error,
    };
  }
}
```
**Key insight:** Blobs that haven't been ingested yet OR have no source URI are marked as FAILED. This means if a blob is still uploading when copy happens, it will be lost.

---

## PasteWriter / IdRemapper - ID Remapping [VERIFIED]

**File:** `modules/common/model-serialization/paste_writer.ts` (4133 lines)
**File:** `modules/common/model-serialization/private/id_remapper_v2.ts` (1382 lines)

### IdRemapper: What gets new IDs

The IdRemapper determines which objects get new IDs based on the paste context:

**Cross-doc paste (line 125-126 of id_remapper_v2.ts):**
```typescript
if (this._isCrossDocPaste) {
  // Cross doc paste should always use DuplicateData so force it.
  linkedOverrideBehavior = PasteLinkingBehavior.DuplicateData;
}
```

**Objects that get new IDs (from _processCopyInfoNodes, line 417):**
- Canvas blobs — always get new IDs (unless recently deleted in same doc)
- Controls — always get new IDs (unless recently deleted in same doc)
- Pages — canvasId is remapped: `ids.generateNewIdOfSameType(copyInfoNode.canvasId)`
- Grids/Tables — based on linking behavior (DuplicateData always creates new)

**Objects that keep IDs in cross-doc (from getMappedCollaborativeObjectId, line 232):**
```typescript
getMappedCollaborativeObjectId(objectId: string): string {
  if (
    !this._remappedCollaborativeObjectIds[objectId] &&
    ids.isGridId(objectId) &&
    !ids.isSyncTableSourceGridId(objectId)
  ) {
    if (ids.isSelectListGridId(objectId)) {
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

**Sync tables that keep their ID:**
```typescript
// id_remapper_v2.ts, lines 963-969
const useSameId =
  (gridType === GridType.Sync &&
    !isLive &&
    !isExternallyBackedGridNeedingDowngrade &&
    gridInfo.syncTableCopyInfo &&
    this._isSyncTableSupported(originalGridOrTableId, gridInfo.syncTableCopyInfo)) ||
  isBaseGridThatNeedsToBeLinked ||
  isRecentlyDeletedGridOrTable ||
  this._shouldSkipRemapping(originalGridOrTableId);
```

### Row ID remapping:
```typescript
getMappedRowId(originalGridId: string, rowId: string): string {
  return this._remappedRowIds[originalGridId]?.[rowId] ?? rowId;
}
```
Row IDs are generally NOT remapped unless there's a specific remapping entry. This means rows keep their IDs across copy in most cases.

### Blob ID remapping (cross-doc only, lines 477-493):
```typescript
for (const blobInfo of Object.values(this._copyInfo.blobsInfo)) {
  const {sourceUri} = blobInfo;
  if (!sourceUri) { continue; }
  // We only remap blobIds if there is an existing blob that matches with a different id
  const existingBlobRow = findExistingBlobRow(sourceUri, blobsGridManager, blobInfo.blobId);
  if (existingBlobRow && existingBlobRow.id !== blobInfo.blobId) {
    this._remapRowId(BLOBS_GRID_ID, blobInfo.blobId, existingBlobRow.id);
  }
}
```
Blob IDs are remapped only if the same blob (by sourceUri match) already exists in the target doc with a different ID.

### Page ID remapping:
```typescript
getMappedPageId(pageId: string): string {
  if (!this._remappedPageIds[pageId]) {
    this._remappedPageIds[pageId] = ids.generateNewIdOfSameType(pageId);
  }
  return this._remappedPageIds[pageId];
}
```
Pages always get new IDs (lazy allocation).

### View ID remapping:
Views get new IDs when the grid is being duplicated. In DuplicateData mode, views of grids that are being converted from tables to grids get their primary view promoted to DEFAULT_VIEW_ID.

### Slate node ID remapping (lines 268-274):
```typescript
getMappedSlateNodeId(id: string): string | undefined {
  // Only remap and store the ids for "interesting" nodeIds
  if (this._copyInfo.codaObjectReferenceInfo?.remappedSlateNodeIds.includes(id) && !this._remappedSlateNodeIds[id]) {
    this._remappedSlateNodeIds[id] = ids.generateNewIdOfSameType(id);
  }
  return this._remappedSlateNodeIds[id]; // potentially undefined
}
```
Only "interesting" slate node IDs (those referenced by canvas @line_ref) are remapped. Others keep their IDs.

---

## Things That Get New IDs [VERIFIED]

### In ForkDocument (fork_document.ts):
- The document itself gets a new docId (assigned before the workflow starts)
- **NOTHING ELSE gets new IDs** — the fork is a raw data copy with the same internal IDs

### In CopyDocToExistingDoc:
- **Pages** — always get new IDs
- **Canvas IDs** — always get new IDs (remapped when pages are remapped)
- **Grids** — get new IDs in DuplicateData mode (always for cross-doc)
- **View Containers (tables)** — get new IDs or are converted to grids
- **Controls** — always get new IDs
- **Canvas Blobs** — always get new IDs
- **Select list grids** — derived from parent grid ID remapping
- **"Interesting" Slate node IDs** — only those referenced by canvas @line refs
- **Views** — get new IDs when their parent grid is duplicated
- **Item layout row IDs** — remapped when grid is different

### What does NOT get new IDs in CopyDocToExistingDoc:
- **Row IDs** — kept as-is (unless specifically remapped, e.g., people rows in cross-env paste)
- **Column IDs** — kept as-is
- **Blob IDs** — kept as-is (unless matching existing blob with different ID)
- **Most slate node IDs** — only "interesting" ones are remapped
- **Automation rule IDs** — remapped via getMappedCollaborativeObjectId

---

## Things That Are Deliberately Removed [VERIFIED]

### Removed in ForkDocument scrub (fork_document.ts):

| Item | Conditional? | Details |
|------|-------------|---------|
| Page authors | Yes (`deletePageAuthors` param) | All page authors set to undefined |
| External form data | No | `clearExternalForm` on all item layouts |
| Comments | Yes (`deleteComments` param) | Both comments and comment threads grids truncated |
| Locking/protection | Conditional | Only removed if workspace lacks DocumentLocking feature |
| Shared pages | No | `partialDocId` set to null for all pages |
| Authed sync pages | No | Rewritten from authed to source access |
| Unreferenced people | No | People rows not referenced by any data cleared |
| ManuallyAdded(NoAccess) people | Configurable | Transitioned to NowMissing (runtime config) |
| Publish landing doc flag | No | Set to false |
| Copy/paste metadata | No | Set to undefined |
| V3 sync tables | No | Externally-backed sync table grids REMOVED from canvas |
| DB-backed tables | No | Database-backed table grids REMOVED from canvas |

### Removed in CopyDocToExistingDoc (via PasteWriter):
Most of the above removals happen differently — through the CopyVisitor not visiting certain things, or the PasteWriter filtering them out. The key difference is that CopyDocToExistingDoc handles things through serialization/deserialization rather than in-place mutation.

---

## External Connections and Packs [VERIFIED]

**File:** `modules/server/packs/external_connection_manager.ts`, line 3123
**File:** `modules/server/workflows/private/helpers/fork_document_helpers.ts`, line 176

### handleForkDocument (external_connection_manager.ts, line 3123):

```typescript
async handleForkDocument(
  sourceDocId: string,
  destDocId: string,
  newOwnerId: number,
  workspaceId: string,
  destDocument: DocumentInterface,
  context: HandleForkDocumentContext,
  {onlyCopyPackIds, removedPackIds}: HandleForkDocumentOptions = {},
): Promise<DocPackMetadata[]> {
  // 1. Copy all doc packs in DB
  const copiedPackIds = new Set(
    await this._storage.copyDocumentPacksToDoc(sourceDocId, destDocId, {
      onlyCopyPackIds, removedPackIds,
    }),
  );
  // 2. Copy ecosystem doc pack trials
  await this._services.ecosystemStorage.copyEcosystemDocPackTrialsToDoc(sourceDocId, destDocId, onlyCopyPackIds);
  // 3. Clone connection proxies
  const allAffectedProxies = await this._storage.cloneConnectionProxiesForForkedDoc(
    sourceDocId, destDocId, SYSTEM_WRITER_USER_ID,
    { onlyCopyPackIds },
  );
  // 4. Reinstall doc packs (re-key permissions)
  await this._reinstallDocumentPacksOnCopy(sourceDocId, destDocId, newOwnerId, workspaceId, destDocument, {
    onlyCopyPackIds,
  });
  // 5. Update release channels
  const docPacksToUpdate = await this._updateReleaseChannelForDocPacksOnCopy(destDocId, newOwnerId, {
    document: destDocument, onlyCopyPackIds,
  });
  // 6. Relink shared connections
  // ...
```

**What happens to packs during copy:**
1. Doc-pack associations are copied to the new doc
2. Pack trial state is copied
3. Connection proxies are CLONED (new proxy IDs)
4. Packs are "reinstalled" — which re-keys their effective permission ID
5. Release channels may be updated (if copier doesn't have edit rights to the Pack, it falls back to Live channel; if no Live version, pack becomes Unavailable)
6. Shared connections are relinked if the owner still has access

**What can break:**
- If the copier doesn't have edit rights to a Pack, it may be downgraded to Live release channel
- If no Live version exists, the pack becomes **Unavailable** (disabled)
- Connection proxies get new IDs, but the grid references are updated
- Shared connections that the copier doesn't own may be disconnected
- Enterprise controls may restrict pack availability across organizations

### Release channel downgrade (lines 3093-3121):
```typescript
private async _updateReleaseChannelForDocPackOnCopy(
  docPack: DocPackMetadata,
  newDocId: string,
  newOwnerId: number,
): Promise<DocPackMetadata | undefined> {
  const {packId, packVersion} = docPack;
  const [pack, {canTest}] = await Promise.all([
    this._services.packStorageManager.getPack(packId),
    this._services.packStorageManager.getPackAccessCapabilities(docPack.packId, newOwnerId),
  ]);
  // If the copying user has edit rights to the Pack, then don't touch the release channel.
  if (canTest) { return; }
  if (pack.liveVersion) {
    const {targetPackVersion} = await this.updateDocPackReleaseChannel(newDocId, packId, {
      releaseChannel: PackReleaseChannel.Live,
    });
    if (packVersion !== targetPackVersion) {
      return docPack; // needs upgrade
    }
  } else {
    // No release available — disable the Pack
    await this.updateDocumentPack(newDocId, packId, {status: DocPackStatus.Unavailable, document});
  }
}
```

---

## Automations [VERIFIED]

**File:** `modules/server/automations-storage/automations_storage_postgres.ts`, line 252

### What gets copied:
- Periodic rules (sync table refresh rules) are copied via SQL INSERT...SELECT
- Rule IDs are preserved
- `enabled_at_op_version`, `when_definition`, timestamps are all preserved

### What does NOT get copied:
- **Rule execution history** — only the periodic_rules table is copied, not executions
- **V3 sync table refresh rules** — explicitly excluded: `rule_type != 'SYNC_TABLE_V3_REFRESH'`
- **Rules enabled after the copy opVersion** — `enabled_at_op_version <= $3` filter

### In CopyDocToExistingDoc pipeline:
Automations are handled through the CopyVisitor's `_visitAutomations` method which captures rule definitions (id, ifCondition, name, when, state, steps) into `AutomationCopyInfo`. The PasteWriter then recreates these rules with remapped IDs via `_insertAutomation` (paste_writer.ts line 3978).

---

## Cross-Doc References [VERIFIED]

**File:** `modules/server/workflows/private/helpers/fork_document_helpers.ts`, line 122

### registerAllCrossDocTablesOnDocument:
```typescript
export async function registerAllCrossDocTablesOnDocument(
  {crossDocSyncStorage}: {crossDocSyncStorage: CrossDocSyncStorage},
  document: DocumentInterface,
  userId: number,
  sourceDocId: string,
): Promise<void> {
  const crossDocTables = collectCrossDocTables(document);
  const addTableOptionsList: RegisterCrossTableOptions[] = [];
  for (const syncGridId of Object.keys(crossDocTables)) {
    const syncGrid = crossDocTables[syncGridId];
    const addTableOptions = getRegisterCrossDocTableOptions(
      document.id, syncGridId, syncGrid.ruleId, syncGrid.dynamicUrl,
      userId, syncGrid.crossDocMetadata,
    );
    if (addTableOptions) {
      addTableOptionsList.push(addTableOptions);
    }
  }
  if (addTableOptionsList.length > 0) {
    await crossDocSyncStorage.registerCrossDocTableMetadata(addTableOptionsList);
    // ...
    // Copy write mode from source doc
    const userConfigs = await crossDocSyncStorage.tryGetActiveSyncUserConfigs(sourceDocId, syncGridIds);
    // If the copying user owned the sync config, preserve the write mode
    // Otherwise, set to Personal
  }
}
```

**Key insight:** Cross-doc tables are re-registered with the new doc. If the copier was the original sync user, their write mode is preserved. Otherwise, it's set to `CrossDocTableWriteMode.Personal`. This means cross-doc connections are preserved but may have different permission levels.

---

## Blobs [VERIFIED]

### In ForkDocument:
**File:** `modules/server/doc-bulk-storage/document_bulk_storage.ts`, line 1143

Blobs are copied as a raw S3 directory copy. The source path is `{docId}/blobs/` and the destination is `{newDocId}/blobs/`. This is done with concurrency control and a time cutoff.

**Edge case - excessive blobs (fork_document.ts lines 183-193):**
```typescript
if (nextMarker) {
  return {
    nextTask: {
      name: 'copyExcessiveBlobs',
      classification: WorkflowTaskClassification.Async,
    },
    additionalParams: {nextBlobCopyMarker: nextMarker},
  };
}
```
If the blob copy exceeds the cutoff time, it creates a continuation task. This means large docs get a dedicated blob copy step.

**Race condition risk:** The blob copy and the scrub step happen in sequence. The scrub step could theoretically reference blobs that haven't finished copying. However, the fork workflow ensures blobs are copied BEFORE the scrub step runs.

### In CopyDocToExistingDoc:
Blobs are handled differently — they're tracked in the CopyInfo's `blobsInfo` and then inserted by the PasteWriter. The PasteWriter copies blobs via the blob manager.

**Blob status during copy (copy_visitor.ts, line 664-666):**
```typescript
const canWeCopyBlob =
  sourceUri && (blobInfo.status === BlobStatus.INGESTED || blobInfo.status === BlobStatus.PREINGESTION);
const blobStatus = canWeCopyBlob ? BlobStatus.PREINGESTION : BlobStatus.FAILED;
```
If a blob hasn't been ingested yet and has no source URI, it's marked as FAILED in the copy. This means **blobs that are still uploading will be lost**.

---

## Ephemeral/Runtime State Not Serialized [VERIFIED]

### Things that are NEVER serialized or copied:

1. **Undo/redo history** — The GC op in the scrub step (fork_document.ts line 423) explicitly prevents undo from recovering pre-copy state. The new doc starts with a clean undo stack.

2. **Cursor positions** — Not part of the document model. Cursors are per-session state.

3. **Selection state** — Per-session, not persisted.

4. **Active view state** — Per-user UI state, not part of the document model.

5. **Real-time collaboration state** — Session state. The new doc starts in INITIALIZING state.

6. **Ephemeral cell canvases** — Mentioned at line 951-952 of document_interface.ts:
   ```
   Accessing an ephemeralCellCanvas is a bit more complex than the average model object.
   This is because it is ephemeral and we intentionally do not always hold a reference to
   every possible cell canvas in memory since that...
   ```

7. **In-memory data / ephemeral grids** — CopyVisitor skips ephemeral grids (line 1317): `if (!this._includeEphemeralGrids && grid.isEphemeral) { return; }`

8. **Ephemeral system rows** — CopyVisitor skips them (line 895): `if (ids.isEphemeralSystemRowId(row.id)) { continue; }`

9. **Graph invalidation state** — Explicitly prevented during scrub (line 296): `document.session.resolver.shouldExplicitlyPreventGraphInvalidation = true;`

10. **Pack formula execution state** — Graph invalidation is prevented during scrub to avoid pack formula execution with wrong docId volatiles.

11. **Document connection state** — `transientDisconnect()` is a method on `DocumentConnectionInterface` (models-types line 95), indicating connection state is transient.

12. **Message template manager** — TODO in copy_visitor.ts line 261: `// - Visit messageTemplateManager` (known gap)

13. **Holiday grids manager** — TODO in copy_visitor.ts line 262: `// - Visit holidayGridsManager` (known gap)

14. **Protection manager** — TODO in copy_visitor.ts line 260: `// - Visit protectionManager` (known gap, though protection IS handled in scrub step)

---

## String-Embedded References - The Gap [VERIFIED]

This is the most critical finding for Apps. The copy pipeline handles references through typed structured values (Reference, CodaObjectReference, etc.) and formula parsing. But plain string values containing IDs are NOT remapped.

### What IS remapped:

1. **Typed references** (`ValueType.Reference`) — remapped via `_getRemappedReferenceValue` (paste_writer.ts line 3563)
2. **CodaObjectReferences** (`ValueType.CodaObjectReference`) — remapped via `_getRemappedCodaObjectReferenceValue` (line 3529)
3. **Slate values** (`ValueType.Slate`) — walked and all embedded objects remapped
4. **Object values** (`ValueType.Object`) with SlateTemplate — formula IDs remapped
5. **Formulas** — parsed via AST and references rewritten (via `rewriteIdsInFormula`)
6. **Structured builder nodes** (filter/sort definitions) — references rewritten via `getStructuredBuilderWithRewrittenReferences`

### What is NOT remapped:

1. **Plain string values** — If a column stores a gridId, pageId, or docId as a plain string (not as a typed Reference), the copy pipeline will NOT remap it. The `_remapAndWalkValue` method (paste_writer.ts line 4096) only processes structured values through `rewriteStructuredValue`, which filters for the `NESTED_STRUCTURED_VALUES_OF_INTEREST` set:
   ```typescript
   const NESTED_STRUCTURED_VALUES_OF_INTEREST = new Set([
     structuredValue.ValueType.Reference,
     structuredValue.ValueType.Slate,
     structuredValue.ValueType.CodaObjectReference,
     structuredValue.ValueType.Object,
   ]);
   ```
   String, Number, DateTime, Duration, Currency, etc. are all passed through as-is.

2. **URLs with embedded doc/page IDs** — If a cell contains a URL like `https://coda.io/d/_dABCD/_suXYZ`, the docId and sectionId in that URL are NOT remapped. The pipeline only handles `UrlReferenceValue` type values specifically.

3. **Grid properties stored as strings** — If any grid property contains an ID reference as a plain string, it won't be remapped. Grid properties are deep-cloned (`_.cloneDeep(grid.properties)`) but not walked for ID references.

4. **Column properties** — Copied as-is in the CopyVisitor (line 739-769). The `_getColumnProperties` method clones properties but doesn't remap IDs within them.

5. **View config values** — Deep-cloned but not walked for ID references: `const configValues = _.cloneDeep(view.getAllConfigValues())` (line 1207)

6. **Automation when/if conditions** — While formulas in automation steps ARE rewritten, the `when` grid ID is remapped by direct property mutation (paste_writer.ts line 3994): `when.grid.id = this._idRemapper.getMappedCollaborativeObjectId(when.grid.id);`. If there are other IDs embedded in when/if as strings, they'd be missed.

### The Apps Risk:

If Apps stores IDs as plain string values in cells, grid properties, or any other non-typed-reference field, those IDs will NOT be updated when a document is copied. This would result in broken references in the copied document.

The safe approach for Apps would be to use typed references (`ValueType.Reference` or `ValueType.CodaObjectReference`) for any inter-object references, as these are the only values the copy pipeline knows how to remap.

---

## Formula Rewriting [VERIFIED]

**File:** `modules/common/formula/rewrite_ids_in_formula.ts`

Formulas are rewritten by parsing them into an AST, walking the AST to find references, and rewriting those references:

```typescript
export function rewriteIdsInFormula(
  rawFormula: string,
  parserContext: ParserContextInterface,
  updateRefTokenCallback: (ref: ReferenceInterface) => string,
  refFilterCallback?: (ref: ReferenceInterface) => boolean,
  { unbindParentProjections, allowInvalidFormula }: {} = {},
): string {
  const contextClone = parserContext.clone();
  contextClone.setFlag(ParserFlag.ParsingForFormulaRewrite, true);
  let parseResult = parser.parse(rawFormula, contextClone);
  const visitor = new ChangeObjectIdsVisitor(parseResult, updateRefTokenCallback, refFilterCallback);
  if (!parseResult.ast && allowInvalidFormula) {
    return rawFormula; // If the formula is invalid and we allow it, return the original raw formula.
  }
  visitor.visitRoot(ensureExists(parseResult.ast));
  const changeObjectIdsResult = visitor.getResult();
  // ...
}
```

The PasteWriter's `_rewriteFormulaString` (line 3172) uses this to rewrite all formula strings. The reference rewriting callback (`_rewriteReferenceCallback`) handles:
- Grid/table/view references
- Column references
- Message template references
- Pack connection references
- Source grid column IDs

**Key insight:** Formulas that fail to parse are returned as-is (`allowInvalidFormula`). This means if a formula contains a syntax error, its references won't be remapped.

---

## Structured Value Remapping [VERIFIED]

**File:** `modules/common/model-serialization/paste_writer.ts`, line 4023

The `_remapStructuredValueOfInterest` method handles:

```typescript
private _remapStructuredValueOfInterest(value: NestedStructuredValuesOfInterest): NestedStructuredValuesOfInterest {
  switch (value.type) {
    case structuredValue.ValueType.CodaObjectReference:
      return this._getRemappedCodaObjectReferenceValue(value);
    case structuredValue.ValueType.Reference:
      return this._getRemappedReferenceValue(value);
    case structuredValue.ValueType.Slate:
      return this._getRemappedSlateValue(value);
    case structuredValue.ValueType.Object:
      if (structuredValue.isSlateTemplateObjectValue(value)) {
        return this._getRemappedSlateTemplateObjectValue(value);
      }
      return value;
    default:
      return value;
  }
}
```

### CodaObjectReference remapping includes:

**Canvas references (id_remapper_v2.ts, line 296-325):**
- nodeId is remapped if it was in `remappedSlateNodeIds`
- canvasId is remapped if it was in `canvasInSelection` or if there's a remapped nodeId

**Grid references (line 327-337):**
- If the grid was converted to a table (type change), a table reference is returned
- Otherwise the gridId is remapped

**Table references (line 338-352):**
- If the table was converted to a grid, a grid reference is returned
- Otherwise both tableId and gridId are remapped

**Comment references (line 353-362):**
- Cross-doc: converted to a URL reference pointing to the original doc's comment
- Same-doc: kept as-is

**Document references (line 3532-3543 of paste_writer.ts):**
```typescript
if (value.refType === ReferenceType.Document) {
  return value.objectId === this._document.id
    ? value
    : structuredValue.makeUrlReferenceValue(
        documentUrl.getUrlForDocument(value.objectId, {
          protocolAndHost: this._document.session.getProtocolAndHost(),
        }),
        this._maybeObfuscateValue(value.name),
      );
}
```
Cross-doc document references are converted to URL references.

---

## IdentityIdRemapper vs IdRemapper [VERIFIED]

**File:** `modules/common/model-serialization/private/id_remapper_v2.ts`, line 1353

The `IdentityIdRemapper` extends `IdRemapper` but overrides all mapping methods to return the original ID:

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
  override getMappedSlateNodeId(id: string): string | undefined {
    return id;
  }
  override getMappedRowId(_originalGridId: string, rowId: string): string {
    return rowId;
  }
  override getMappedObjectReferenceValue(value: CodaObjectReferenceValue): CodaObjectReferenceValue {
    return value;
  }
  override getObjectTypeChangeInfo(_objectId: string): NewTypeInfo | undefined {
    return;
  }
}
```

**When is it used?** (paste_writer.ts, line 420):
```typescript
this._initializedIdRemapper =
  (mode.type === PasteMode.FullDocumentPaste || this._shouldUseProgrammaticCellPaste()) && !this._isCrossEnvPaste()
    ? new IdentityIdRemapper(...)
    : new IdRemapper(...);
```

IdentityIdRemapper is used for `FullDocumentPaste` when NOT cross-environment. This is the CopyDocToExistingDoc path when pasting into a fresh doc — IDs are preserved.

**CRITICAL INSIGHT:** In the ForkDocument path, IDs are always preserved because it's a raw data copy. The IdentityIdRemapper is only used in the CopyDocToExistingDoc path when it should preserve IDs (FullDocumentPaste mode, same environment).

---

## Edge Cases and Surprising Findings [VERIFIED]

### 1. Externally-backed sync tables are REMOVED, not downgraded
(fork_document.ts, line 640-646)
V3 sync tables that are externally backed are completely removed from the document canvas, not converted to standard tables. This means any data visible through these tables disappears.

### 2. DB-backed tables are REMOVED entirely
(fork_document.ts, line 648-654)
Database-backed tables are removed from the copy. This is a clean break — the table and its data are gone.

### 3. Sync tables in CopyDocToExistingDoc may be downgraded to standard tables
(id_remapper_v2.ts, line 1037-1044)
If a sync table's pack is not active in the destination doc, it's converted to a standard grid:
```typescript
this._remappingInfo.objectsTypeChangeInfoMap[originalGridOrTableId] = {
  id: finalId,
  type: ObjectType.Grid,
  gridType: GridType.Standard,
  wasSyncTableGrid: true,
  wasTableOrView: false,
};
```

### 4. Locking preservation depends on billing
(fork_document.ts, line 595-604)
Locking is only preserved if the workspace has the DocumentLocking feature. This is a billing-dependent copy behavior.

### 5. People table scrub removes "fictional characters"
(fork_document.ts, line 627)
The comment in the code explicitly says the purpose is to "eliminate fictional characters from templates -> copies within people selection drop downs." Added 4/20/23 with a runtime config escape hatch.

### 6. Graph invalidation is temporarily disabled during scrub
(fork_document.ts, line 296)
`document.session.resolver.shouldExplicitlyPreventGraphInvalidation = true;`
This is because pack formulas that rely on document volatiles (like docId) would be invalidated and error out before packs are installed.

### 7. The scrub adds a GC op to prevent undo
(fork_document.ts, line 423)
`document.persistGarbageCollect();`
This ensures that undo in the new document can never recover the pre-scrub state (deleted comments, authors, etc.).

### 8. CopyVisitor has known gaps (TODOs)
(copy_visitor.ts, lines 259-262)
```typescript
// TODO(jason): Add missing Information
// - Visit protectionManager
// - Visit messageTemplateManager
// - Visit holidayGridsManager
// - What else is global document level?
```

### 9. Blob copy has a time cutoff
The blob copy in ForkDocument has a configurable time cutoff (`initialBlobCopyCutoffMinutes`). If it takes too long, remaining blobs are copied in a separate `copyExcessiveBlobs` task.

### 10. Connection proxies get new IDs in fork
(fork_document_helpers.ts, line 197)
`cloneConnectionProxiesForForkedDoc` creates new proxy IDs. The grid references are updated to point to the new proxies.

### 11. Pack connection references may be rewritten to placeholder
(paste_writer.ts, line 3154-3158)
If a connection doesn't allow non-owners to select it, the reference is replaced with a placeholder:
```typescript
if (connection?.allowNonOwnerToSelect === false) {
  ref = createSyntheticPackConnectionReference(ref.packId, '');
}
```

### 12. Oversized cell data is silently dropped
(copy_visitor.ts, line 912)
```typescript
value:
  !structuredValue.isSlateValue(cellData.value) && sizeof(cellData.value) > MAX_ROW_DATA_SIZE
    ? null
    : cellData.value,
```
Cell values larger than `MAX_ROW_DATA_SIZE` are silently set to null (except Slate values).

### 13. Cross-env paste remaps people rows
(paste_writer.ts, line 617-630)
When pasting across environments, people are looked up by loginId and remapped:
```typescript
for (const [userIdAsString, personInfo] of Object.entries(this._copyInfo.peopleInfo)) {
  const {loginId} = personInfo;
  if (!loginId) { continue; }
  const userId = Number(userIdAsString);
  const {user} = await apiClient.getOrCreateAssignee(loginId);
  this._userIdUpdates[ids.generatePeopleRowId(userId)] = ids.generatePeopleRowId(user.userId);
}
```

### 14. The slow copy notification
(fork_document.ts, line 463-479)
If the copy takes longer than `SlowCopyDocumentTimeMsec`, a mention/notification is sent to the user.

### 15. Cross-doc sync write mode defaults to Personal
(fork_document_helpers.ts, line 152-173)
When cross-doc tables are re-registered, if the copying user was NOT the original sync user, the write mode defaults to `CrossDocTableWriteMode.Personal` instead of preserving the original mode.

### 16. UrlReferenceValue is in the interest set but NOT remapped
(paste_writer.ts, lines 227-238)
`UrlReferenceValue` is listed in the `NestedStructuredValuesOfInterest` type but is NOT in the `NESTED_STRUCTURED_VALUES_OF_INTEREST` set used for filtering. This means URL references are not walked/remapped by the structured value rewriter. They're handled separately by the `_getRemappedCodaObjectReferenceValue` path when they're CodaObjectReferences, but plain URL strings inside structured values are not remapped.

---

## Summary: Complete List of What's Lost/Changed

### Definitely lost:
1. Undo/redo history
2. Comments (if `deleteComments` is true, which is the common case for templates)
3. Page authors (if `deletePageAuthors` is true)
4. V3 externally-backed sync tables (removed entirely)
5. DB-backed tables (removed entirely)
6. External form configurations
7. Shared page partialDocIds
8. Publish landing doc flag
9. Copy/paste metadata
10. Unreferenced people rows
11. Manually-added NoAccess users (become NowMissing)
12. Rule execution history
13. Cursor/selection/active view state
14. Real-time collaboration state

### Changed/degraded:
1. Authed sync pages -> source access mode
2. Pack release channels may be downgraded to Live or Unavailable
3. Connection proxies get new IDs
4. Pack connections may become placeholder if non-owner
5. Cross-doc sync write mode may default to Personal
6. Locking removed if workspace lacks feature
7. Sync tables may be downgraded to standard tables (if pack not available)

### Preserved but risky:
1. Plain string IDs in cell values (NOT remapped in CopyDocToExistingDoc)
2. IDs embedded in URLs within cell values (NOT remapped)
3. Grid/view config values containing IDs (NOT walked)
4. Invalid formulas (returned as-is without remapping)
5. Column properties containing IDs (NOT walked)
