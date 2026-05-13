# Research: ID Universe and Document Copy Behavior

## Overview of Findings

This research covers every object type in Coda that has a generated ID, its prefix/format, how it is generated, and crucially how it behaves during document copy (the IdRemapper system). The copy system has two paths: `IdentityIdRemapper` (preserves all IDs, used for full-document paste within same environment) and `IdRemapper` (generates new IDs, used for cross-doc paste and most other paste scenarios).

---

## Core ID Generation Infrastructure [VERIFIED]

### `generateObjectId` — The Random ID Generator

**File:** `modules/js-core/utils/ids.ts`
**Line:** 54

**What it does:** Generates a 10-character base64-encoded random string, optionally prefixed with a type prefix and hyphen.

**How it works:** Uses three random 32-bit integers from `Math.random()`, extracting 6-bit chunks to index into `Base64Chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_='`. Produces exactly 10 characters.

**Why 10 characters:** Balances collision avoidance against readability. The comment cites a StackOverflow answer.

**ID_PART_LENGTH constant:** 10 (line 43). Used everywhere to parse IDs.

**Example output:** `grid-aB3dE_fGh=` (prefix `grid`, hyphen, 10 random base64 chars)

```typescript
export function generateObjectId(prefix?: string | void | null): string {
  const id = generateIdFromRandom(Math.random, prefix);
  return id;
}

function generateIdFromRandom(rng: () => number, prefix?: string | void | null): string {
  const d0 = (rng() * 0xffffffff) | 0;
  const d1 = (rng() * 0xffffffff) | 0;
  const d2 = (rng() * 0xffffffff) | 0;

  const id =
    Base64Chars[(d0 >> 6) & 0x3f] +
    Base64Chars[(d0 >> 12) & 0x3f] +
    Base64Chars[(d0 >> 18) & 0x3f] +
    Base64Chars[(d0 >> 24) & 0x3f] +
    Base64Chars[(d1 >> 6) & 0x3f] +
    Base64Chars[(d1 >> 12) & 0x3f] +
    Base64Chars[(d1 >> 18) & 0x3f] +
    Base64Chars[(d1 >> 24) & 0x3f] +
    Base64Chars[(d2 >> 6) & 0x3f] +
    Base64Chars[(d2 >> 12) & 0x3f];

  if (prefix) {
    return `${prefix}-${id}`.trim();
  }
  return id;
}
```

### `generateSeededObjectId` — Deterministic ID Generator

**File:** `modules/js-core/utils/ids.ts`
**Line:** 63

**What it does:** Same format as random IDs, but deterministic from a seed string. Same seed always produces the same ID. Uses `seedrandom` library.

**Used by:** Canvas line IDs (seeded), row IDs (seeded), op IDs (seeded).

### `generateNewIdOfSameType` — Copy-Aware ID Regeneration

**File:** `modules/common/ids/ids.ts`
**Line:** 296

**What it does:** Takes an existing ID, extracts its prefix, and generates a new random ID with the same prefix. This is the workhorse function used by the IdRemapper to create new IDs during copy.

**Special case:** Rule grid IDs (prefix `grid-auto`) are handled specially since they have a multi-token prefix.

```typescript
export function generateNewIdOfSameType(existingId: string): string {
  const idParts = existingId.split('-');
  ensure(idParts.length > 1);
  let prefix = idParts[0];
  if (existingId.startsWith(RuleGridIdPrefix)) {
    prefix = RuleGridIdPrefix;
    if (existingId.includes(PackRefreshRuleIdContent)) {
      prefix = `${prefix}-${PackRefreshRuleIdContent}`;
    }
  }
  return ids.generateObjectId(prefix);
}
```

---

## ObjectIdPrefixes Enum — The Prefix Registry [VERIFIED]

**File:** `modules/common/ids/constants.ts`
**Line:** 1-60

This is the complete list of all object type prefixes. Key design notes embedded in comments:

```typescript
export enum ObjectIdPrefixes {
  Automation = 'auto',
  BillingAccount = 'ba',
  BillingGroup = 'bg',
  Blob = 'bl',
  BrainTenant = 'bt',
  Canvas = 'canvas',
  CanvasBlob = 'ci',         // Note: Renamed from CanvasImage. Should probably be renamed to 'bi' in an upgrade
  CanvasLine = 'cl',          // Should probably be renamed to 'el' in an upgrade
  CanvasViewPlaceholder = 'cvp',
  ChatMessage = 'chtmsg',
  ChatConversation = 'chtconvo',
  ChatFunctionCall = 'chtfn',
  Column = 'c',
  ConditionalFormat = 'cf',
  Control = 'ctrl',
  Comment = 'cm',
  CommentThread = 'r',
  CustomBrain = 'cb',
  CustomBrainSlackAssignment = 'cbsa',
  DefaultView = 'default',    // Not a real prefix, but needed for validation
  DeprecatedCsvColumn = 'csv-column',  // TODO: remove once affected docs upgraded
  EcosystemSellerAccount = 'esa',
  EditorCallout = 'eca',
  EditorCodeBlock = 'ecb',
  EditorColumn = 'ec',
  EditorColumnGroup = 'ecg',
  EditorDividerLine = 'edl',
  EditorFormula = 'f',        // Should probably be renamed to 'ef' in an upgrade
  EditorObject = 'ed',        // Old ranges editor, will be gone soon
  EditorStructuredValue = 'esv',
  EditorViewPlaceholder = 'evp',
  Expression = 'expr',
  Folder = 'fl',
  GoLink = 'go',
  Grid = 'grid',
  Group = 'grp',
  IdentityProvider = 'idp',
  PackConfiguration = 'pc',
  Organization = 'org',
  RichTextObject = 'rv',
  Row = 'i',
  SamlConfig = 'saml',
  Page = 'section',            // Note (Adam) fix the value to 'page' in an upgrade
  FilterLink = 'flk',
  ViewContainer = 'table',     // TODO(evanbrooks): rename in an upgrade
  View = 'v',
  Workspace = 'ws',
}
```

**Design insight:** Multiple prefixes have TODO comments about renaming. The codebase has accumulated historical naming debt -- `Page` is `'section'`, `ViewContainer` is `'table'`, `EditorFormula` is `'f'`, `Row` is `'i'`. These stick because changing them requires a data migration (upgrade).

---

## Per-Object-Type Analysis

### 1. Documents (docId) [VERIFIED]

**File:** `modules/common/ids/ids.ts`, line 111
**File:** `modules/server/document-lib/launch_fork_document_workflow.ts`, line 301-305

**Prefix:** None (or optional prefix from docIdPrefixAllowlist)
**Format:** 10 random base64 chars, optionally `{prefix}-{10chars}`
**Generator:** `generateDocumentId({prefix})` -- calls `ids.generateObjectId(prefix)`

```typescript
export function generateDocumentId({prefix}: {prefix?: string} = {}): string {
  return ids.generateObjectId(prefix);
}
```

**On copy:** A completely new docId is generated server-side in `launchForkDocumentWorkflow`:

```typescript
const docId =
  newDocId ??
  ids.generateDocumentId({
    prefix: docIdPrefix && config.docIdPrefixAllowlist.includes(docIdPrefix) ? docIdPrefix : undefined,
  });
```

**Special case:** The copy flow is a "fork document" workflow. The new doc gets a new ID, new ownership, and the entire oplog/snapshot is replicated. The document-level copy does NOT go through the CopyVisitor/PasteWriter pipeline at all for the doc ID itself -- that's server-side document creation. The CopyVisitor/PasteWriter handles the _content_ inside the doc.

### 2. Pages (pageId) [VERIFIED]

**File:** `modules/common/ids/ids.ts`, line 194
**Prefix:** `section` (historical name for page)
**Format:** `section-{10chars}`
**Generator:** `generatePageId()`

**On copy (IdRemapper):** Pages are ALWAYS remapped to new IDs.

**File:** `modules/common/model-serialization/private/id_remapper_v2.ts`, line 256-260

```typescript
getMappedPageId(pageId: string): string {
  if (!this._remappedPageIds[pageId]) {
    this._remappedPageIds[pageId] = ids.generateNewIdOfSameType(pageId);
  }
  return this._remappedPageIds[pageId];
}
```

**Special cases:**
- `remapPageForExisting`: When pasting into an existing page (ReplaceCurrentPagePaste, AppendToCurrentPagePaste), the source page ID maps to the existing page's ID.
- `IdentityIdRemapper`: Overrides to return the same pageId (used for FullDocumentPaste within same env).

**File:** `modules/common/model-serialization/paste_writer.ts`, line 1397-1458 (insertNewPage)

The paste writer uses `_idRemapper.getMappedPageId(pageInfo.id)` for the new page ID and `_idRemapper.getMappedCollaborativeObjectId(pageInfo.canvasId)` for the new canvas ID.

### 3. Canvases (canvasId) [VERIFIED]

**File:** `modules/common/ids/ids.ts`, line 157
**Prefix:** `canvas`
**Format:** `canvas-{10chars}`
**Generator:** `generateCanvasId()`

**Relationship to Pages:** Pages and canvases have a 1:1 relationship. The canvasId can be DERIVED from the pageId:

**File:** `modules/common/ids/ids.ts`, line 311-313

```typescript
export function derivePageIdFromCanvasId(canvasId: string): string {
  return canvasId.replace(ObjectIdPrefixes.Canvas, ObjectIdPrefixes.Page);
}
```

So `canvas-aB3dE_fGh=` has a corresponding page `section-aB3dE_fGh=`. Same random part, different prefix.

**On copy:** Canvas IDs are remapped as collaborative object IDs in `_processCopyInfoNodes`:

**File:** `modules/common/model-serialization/private/id_remapper_v2.ts`, line 448-452

```typescript
} else if (copyInfoNode.type === CopyNodeType.Page && !this._shouldSkipRemapping(copyInfoNode.id)) {
  this._remappedCollaborativeObjectIds[copyInfoNode.canvasId] = ids.generateNewIdOfSameType(
    copyInfoNode.canvasId,
  );
}
```

**Special cases:**
- When pasting into an existing canvas, the first page's canvas maps to `_rootExistingPageCanvasId` (line 469-471).
- Ephemeral cell canvas IDs have a completely different format: `{gridId}::{rowId}::{columnId}` (line 669-680).

### 4. Grids/Tables (gridId) [VERIFIED]

**File:** `modules/common/ids/ids.ts`, line 180
**Prefix:** `grid`
**Format:** `grid-{10chars}`
**Generator:** `generateGridId()`

**On copy:** This is the most complex remapping logic in the entire system. The IdRemapper has ~500 lines of logic just for grid remapping in `_visitViewsOfGrid` and `_remapViewInfo`.

**File:** `modules/common/model-serialization/private/id_remapper_v2.ts`, line 926-1066

Key behaviors:
1. **Same-doc, linking mode:** Grid keeps same ID, gets converted to a ViewContainer (table) with a new view.
2. **Cross-doc paste:** Always DuplicateData mode. Generates new grid ID via `ids.generateNewIdOfSameType()`.
3. **Sync tables:** Keep same ID if the pack is active and the sync table doesn't already exist.
4. **Recently deleted objects:** Keep same ID to enable "restore on paste" behavior.
5. **Grid selections pasted into canvas:** Always generate a new grid ID.

```typescript
// Line 973-978:
if (useSameId) {
  finalId = canonicalCollabObjectId;
} else if (isExternallyBackedGridNeedingDowngrade) {
  finalId = ids.generateGridId();
} else {
  finalId = ids.generateNewIdOfSameType(canonicalCollabObjectId);
```

**getMappedCollaborativeObjectId (line 232-254):** Falls back to generating a new ID on-the-fly for grids that weren't pre-mapped during construction, but only for cross-doc paste.

### 5. ViewContainers (tableId) [VERIFIED]

**File:** `modules/common/ids/ids.ts`, line 202
**Prefix:** `table`
**Format:** `table-{10chars}`
**Generator:** `generateViewContainerId()`

**On copy:** ViewContainers are remapped as collaborative objects, same as grids. The IdRemapper can convert between grid and table types during copy (type change info).

**Special derived IDs:**
- `generateViewContainerIdForGrid(baseGridId)`: Creates `table-{gridId}-view-container` (line 574-576)

### 6. Columns (columnId) [VERIFIED]

**File:** `modules/common/ids/ids.ts`, line 163
**Prefix:** `c`
**Format:** `c-{10chars}`
**Generator:** `generateColumnId()`

**On copy:** Columns are **NOT remapped**. Column IDs are preserved across copy.

**File:** `modules/common/model-serialization/paste_writer.ts`, line 1575-1588

```typescript
private _getAddColumnParamsFromColumnCopyInfo(
  gridId: string,
  columnCopyInfo: ColumnCopyInfo,
): Pick<AddColumnParams, 'id' | 'name' | 'formatConfig' | 'width' | 'formula'> {
  const {id, valueFormatConfig: formatConfig, userFormula: formula, name, width} = columnCopyInfo;
  return {
    id,  // <-- Column ID passed through unchanged
    formatConfig: this._rewriteValueFormatConfig(gridId, formatConfig),
    formula: this._rewriteFormulaString(formula, {objectId: gridId, fieldId: id}),
    name: this._maybeObfuscateName(name),
    width,
  };
}
```

**Why:** Columns are children of grids. Since the grid gets a new ID, columns within that grid are uniquely identified by `(gridId, columnId)`. No collision possible.

**System columns:** Have suffix-based IDs derived from their base column: `{baseColumnId}-system-{suffix}` (line 318-330). These are also preserved.

**DeprecatedCsvColumn:** Prefix `csv-column` (line 29 of constants) -- a historical artifact from CSV imports.

### 7. Rows (rowId) [VERIFIED]

**File:** `modules/common/ids/ids.ts`, line 195
**Prefix:** `i`
**Format:** `i-{10chars}`
**Generator:** `generateRowId()`

**On copy:** Rows are tracked per-grid in `_remappedRowIds: {[gridId: string]: IdMap}`.

**File:** `modules/common/model-serialization/private/id_remapper_v2.ts`, line 280-282

```typescript
getMappedRowId(originalGridId: string, rowId: string): string {
  return this._remappedRowIds[originalGridId]?.[rowId] ?? rowId;
}
```

Rows are NOT pre-remapped by the IdRemapper constructor. Instead, new row IDs are generated on-the-fly during paste by the `bulkAddRows` call:

**File:** `modules/common/model-serialization/paste_writer.ts`, line 3038-3042

```typescript
grid.bulkAddRows(rowsData, {
  applyDefaultValues: false,
  rowIdGenerator: (_rowData, index) =>
    this._idRemapper.getMappedRowId(originalGridId, rowIdsForRowsData[index]),
  shouldDisableCellCanvasPaste: true,
  dangerouslyDeleteOversizeRows: true,
});
```

Since `getMappedRowId` returns the original ID when no remap exists, rows keep their original IDs unless explicitly remapped. This means rows effectively get new IDs only when the grid bulkAddRows generates them internally, OR when specific remapping is set up for:
- Item layout rows (line 839)
- Message template rows (line 865-882)
- Blob rows during cross-doc paste (line 479-492)
- People rows during cross-env paste (line 497-499)

**Special row IDs (fixed/derived):**
- `FormPinnedRowId`: `i-form-pinned-row` (line 37)
- `DefaultValueRowId`: `i-default-value-row` (line 38)
- `EphemeralMessageTemplateRowId`: `i-ephemeral-message-template-{10chars}` (line 39)
- People rows: `i-{userId}` where userId is a number (line 618-620)
- Sync table rows: `i-{64char sha256 hash}` (line 294)
- Shortcuts rows: `i-shortcuts-{userId}` (line 818-820)

### 8. Views (viewId) [VERIFIED]

**File:** `modules/common/ids/ids.ts`, line 203
**Prefix:** `v`
**Format:** `v-{10chars}`
**Generator:** `generateViewId()`

**DEFAULT_VIEW_ID:** The string literal `'default'` (NOT a generated ID).

**File:** `modules/common/constants/index.ts`, line 1192

```typescript
export const DEFAULT_VIEW_ID = 'default';
```

**On copy:** Views are remapped per-grid in `_viewIdMap: {[gridId: string]: IdMap}`.

**File:** `modules/common/model-serialization/private/id_remapper_v2.ts`, line 276-278

```typescript
getMappedViewId(originalGridId: string, viewId: string): string {
  return this._viewIdMap[originalGridId]?.[viewId] ?? viewId;
}
```

Key scenarios:
1. When a grid becomes a table: default view gets a new viewId (`generateViewId()`), and additional views also get new IDs.
2. When a table view becomes a new grid: primary view gets promoted to `DEFAULT_VIEW_ID`.
3. Same-doc linking (CreateViews mode): Views get new IDs since they're new views of the existing grid.

**Sync filter views:** Have a special derived format: `v-{gridIdSuffix}-sync-filters-{childDocId}-{random}` (line 205-208).

### 9. Blobs (blobId) [VERIFIED]

**File:** `modules/common/ids/ids.ts`, line 155
**Prefix:** `bl`
**Format:** `bl-{10chars}`
**Generator:** `generateBlobId()`

**On copy:** Blob IDs are generally NOT remapped. The blob system uses the original blobId to reference the blob row in the BLOBS_GRID_ID (`Global-Blobs`) grid.

**File:** `modules/common/model-serialization/private/id_remapper_v2.ts`, line 477-492

```typescript
// Remap blobs if required
const {blobsGridManager} = this._document.blobManager;
for (const blobInfo of Object.values(this._copyInfo.blobsInfo)) {
  const {sourceUri} = blobInfo;
  if (!sourceUri) {
    continue;
  }
  // We only remap blobIds if there is an existing blob that matches with a different id
  const existingBlobRow = findExistingBlobRow(sourceUri, blobsGridManager, blobInfo.blobId);
  if (existingBlobRow && existingBlobRow.id !== blobInfo.blobId) {
    this._remapRowId(BLOBS_GRID_ID, blobInfo.blobId, existingBlobRow.id);
  }
}
```

Only remapped when a blob with the same `sourceUri` already exists in the target doc with a different ID. On insert, `_insertBlob` skips if blob already exists (line 3865).

**CanvasBlobs:** Prefix `ci` (was CanvasImage). Generated by `generateCanvasBlobId()`. These ARE remapped during copy as collaborative objects (line 446).

### 10. Controls [VERIFIED]

**File:** `modules/common/ids/ids.ts`, line 166
**Prefix:** `ctrl`
**Format:** `ctrl-{10chars}`
**Generator:** `generateControlId()`

**On copy:** Controls are remapped as collaborative objects in `_processCopyInfoNodes`:

**File:** `modules/common/model-serialization/private/id_remapper_v2.ts`, line 419-447

```typescript
if (
  (copyInfoNode.type === CopyNodeType.CanvasBlob || copyInfoNode.type === CopyNodeType.Control) &&
  !this._shouldSkipRemapping(copyInfoNode.id)
) {
  // ...
  if (isRecentlyDeletedObject) {
    this._remappedCollaborativeObjectIds[copyInfoNode.id] = copyInfoNode.id;
  } else {
    this._remappedCollaborativeObjectIds[copyInfoNode.id] = ids.generateNewIdOfSameType(copyInfoNode.id);
  }
}
```

Controls have associated value columns, default value columns, and a select list grid. The control's value formula is rewritten with the new ID.

**Special:** Select list grids for controls use `{controlId}-select-list-{ControlGridColumnIds.Value}` format (line 524-529).

### 11. Automations/Rules [VERIFIED]

**File:** `modules/common/ids/ids.ts`, line 33 (RuleGridIdPrefix), line 197 (generateRuleGridId)
**Prefix:** `grid-auto` (compound prefix)
**Format:** `grid-auto-{10chars}`
**Generator:** `generateRuleGridId()`

**On copy:** Rule IDs are remapped as collaborative objects via `getMappedCollaborativeObjectId`.

**File:** `modules/common/model-serialization/paste_writer.ts`, line 3978-4017

```typescript
private _insertAutomation(ruleCopyInfo: AutomationCopyInfo, parentGrid?: GridInterface): void {
  const automationsGridManager = this._document.automationsGridManager;
  const {id, ifCondition, name, state, steps = [], when} = ruleCopyInfo;
  const mappedRuleId = this._idRemapper.getMappedCollaborativeObjectId(id);
  const ruleId = automationsGridManager.addRule({
    id: mappedRuleId,
    parent: parentGrid,
    name: this._maybeObfuscateName(name),
    addInitialStep: false,
  });
```

**Related derived IDs:**
- `SyncTableAutomationRuleIdPrefix`: `grid-auto-sync-table-rule-grid-sync` (line 373)
- `SyncTableUpdateAutomationRuleIdPrefix`: `grid-auto-sync-table-update-rule-` (line 441)
- `PeopleColumnSubscriptionRuleIdPrefix`: `grid-auto-column-subscribe-` (line 467)
- `AssistantColumnRuleIdPrefix`: `grid-auto-assistant-column-rule-` (line 396)
- `PackRefreshRuleGridIdPrefix`: `grid-auto-pack-refresh-` (line 286)

**Sync table automation IDs:** These are deterministic -- derived from the sync table grid ID. E.g., `grid-auto-sync-table-rule-grid-sync-1054-Tasks`. These are kept when the sync table is kept.

### 12. Formulas (formula references) [VERIFIED]

**File:** `modules/common/formula/rewrite_ids_in_formula.ts`, line 10

**What happens:** Formula strings are REWRITTEN during paste. The `rewriteIdsInFormula` function parses the formula AST, visits all reference nodes, and calls a callback to update object IDs.

```typescript
export function rewriteIdsInFormula(
  rawFormula: string,
  parserContext: ParserContextInterface,
  updateRefTokenCallback: (ref: ReferenceInterface) => string,
  refFilterCallback?: (ref: ReferenceInterface) => boolean,
  { unbindParentProjections, allowInvalidFormula } = {},
): string {
```

**File:** `modules/common/model-serialization/paste_writer.ts`, line 3083-3170 (`_rewriteReference`)

The reference rewriter handles:
- Grid references: Updates objectId to mapped value
- Table references: Updates objectId, sourceObjectId, and viewId
- Pack connection references: May be rewritten to placeholder if connection not transferable
- Message template references: Row IDs are remapped

```typescript
private _rewriteReference(ref: ReferenceInterface): string {
  const objectId = ref.objectId;
  const typeChangeInfo = this._idRemapper.getObjectTypeChangeInfo(objectId);
  const mappedId = this._idRemapper.getMappedCollaborativeObjectId(objectId);
  // ... complex type change and remapping logic
}
```

**EditorFormula IDs:**
- **File:** `modules/common/ids/ids.ts`, line 173
- **Prefix:** `f`
- **Format:** `f-{10chars}`
- **Generator:** `generateEditorFormulaId()`
- **On copy:** Remapped as collaborative objects (they are inline slate objects). The paste writer handles them in `_getRemappedSlateTemplateObjectValue` (line 3490-3493).

### 13. People Grid / User References [VERIFIED]

**System Grid:** `PEOPLE_GRID_ID = 'Global-Document-People'`

**File:** `modules/common/serialized-types/grid.ts`, line 22

**People Row IDs:** Format `i-{userId}` where userId is a number.

**File:** `modules/common/ids/ids.ts`, line 618-620

```typescript
export function generatePeopleRowId(userId: number): string {
  return `${ObjectIdPrefixes.Row}-${ensureExists(userId, 'Missing userId')}`;
}
```

**On copy (same environment):** People references are NOT remapped. The PEOPLE_GRID_ID itself is never remapped (stays `Global-Document-People`). Person info is upserted into the target doc's people grid with the same userId.

**On copy (cross-environment):** People rows ARE remapped. The `_remapPeopleRows` method calls `getOrCreateAssignee` API to find/create the user in the target environment, then remaps the row ID.

**File:** `modules/common/model-serialization/paste_writer.ts`, line 617-631

```typescript
private async _remapPeopleRows(): Promise<void> {
  const apiClient = getApiClient(this._document);
  for (const [userIdAsString, personInfo] of Object.entries(this._copyInfo.peopleInfo)) {
    const {loginId} = personInfo;
    if (!loginId) {
      continue;
    }
    const userId = Number(userIdAsString);
    const {user} = await apiClient.getOrCreateAssignee(loginId);
    this._userIdUpdates[ids.generatePeopleRowId(userId)] = ids.generatePeopleRowId(user.userId);
  }
}
```

**Person insertion (line 3883-3908):** When inserting a person reference, the person is upserted with `PeopleGridStateValues.NowMissing` state -- they appear in the doc but NOT in dropdown menus until they interact with the doc.

### 14. Cross-Doc References [VERIFIED]

**CrossDocPackId:** `1054`

**File:** `modules/common/constants/index.ts`, line 1840

Cross-doc tables are sync tables with pack ID 1054. Their grid IDs follow sync table format: `grid-sync-1054-{tableName}`.

**On copy:** Cross-doc automation rules are identified by `isCrossDocAutomationRuleId` which checks for the CrossDocPackId in the sync table grid ID (line 383-389).

Cross-doc references in formulas are rewritten along with all other references via `_rewriteReference`. The pack connection may be rewritten to a placeholder if the connection isn't transferable.

### 15. Pack Connections [VERIFIED]

Pack connections are managed through the ExternalConnections grid. Connection IDs are referenced in formulas.

**On copy:** Pack connection references may be rewritten to placeholder IDs:

**File:** `modules/common/model-serialization/paste_writer.ts`, line 3152-3160

```typescript
if (isPackConnectionReference(ref)) {
  const connectionId = ref.objectId as PackConnectionOrProxyId;
  const connection = this._document.externalConnectionsGridManager.tryGetConnectionById(connectionId);
  if (connection?.allowNonOwnerToSelect === false) {
    ref = createSyntheticPackConnectionReference(ref.packId, '');
  }
}
```

Packs are installed into the target document via `initializeForPaste() -> _insertPacks()` (line 607-608).

### 16. Slate Node IDs [VERIFIED]

Every line in a Slate document has an ID. These are generated with various prefixes (CanvasLine `cl`, EditorCallout `eca`, EditorCodeBlock `ecb`, etc.).

**On copy:** Slate node IDs are remapped via `getMappedSlateNodeId`:

**File:** `modules/common/model-serialization/private/id_remapper_v2.ts`, line 268-274

```typescript
getMappedSlateNodeId(id: string): string | undefined {
  if (this._copyInfo.codaObjectReferenceInfo?.remappedSlateNodeIds.includes(id) && !this._remappedSlateNodeIds[id]) {
    this._remappedSlateNodeIds[id] = ids.generateNewIdOfSameType(id);
  }
  return this._remappedSlateNodeIds[id];
}
```

Only "interesting" node IDs (those referenced by canvas @line_ref links) are explicitly remapped. All other slate node IDs get new IDs during paste via:

**File:** `modules/common/model-serialization/paste_writer.ts`, line 3370-3373

```typescript
private _remapSlateNodeId(nodeId: string): string {
  const updatedNodeId = this._idRemapper.getMappedSlateNodeId(nodeId);
  return updatedNodeId ?? ids.generateNewIdOfSameType(nodeId);
}
```

### 17. Comment Threads [VERIFIED]

**Prefix:** `r`
**Format:** `r-{10chars}`
**Generator:** `generateCommentThreadId()`

**On copy:** Comments are **STRIPPED** during paste. The rewriteSlateFragment option `stripCommentThreads` is set to `true` for all paste modes except cut-and-paste:

**File:** `modules/common/model-serialization/paste_writer.ts`, line 3733

```typescript
stripCommentThreads: !this._shouldHandleAsCutAndPaste,
```

`_shouldHandleAsCutAndPaste` is only true when `this._copyInfo.isCut && this._copyInfo.docInfo.id === this._document.id` (line 388).

For cross-doc paste of `ReferenceType.Comment` values, they're converted to URL references pointing back to the original doc (IdRemapper line 354-363).

### 18. Conditional Formats [VERIFIED]

**Prefix:** `cf`
**Format:** `cf-{10chars}`
**Generator:** `generateConditionalFormatId()`

**On copy:** Conditional formats are serialized as part of ViewCopyInfo and GridCopyInfo. They are NOT individually remapped by ID. Instead, they're re-created with new IDs when `grid.addFormat()` or `grid.addFormatStructure()` is called during paste. The formulas within conditional formats are rewritten.

**File:** `modules/common/model-serialization/paste_writer.ts`, line 2644-2661

```typescript
for (const [index, format] of conditionalFormatsToInsert.entries()) {
  if (format.structure) {
    const updatedFormatStructure = this._walkAndRewriteStructuredBuilder(format.structure, {
      objectId: grid.id,
    });
    grid.addFormatStructure(remappedViewId, index, updatedFormatStructure, this._undoOptions);
  } else {
    grid.addFormat(remappedViewId, index, {
      condition: this._rewriteFormulaString(format.condition, {objectId: grid.id}),
      formatStyles: format.styles,
      scope: format.scope,
    }, this._undoOptions);
  }
}
```

### 19. Select List Grids [VERIFIED]

**Format:** `{parentGridId}-select-list-{columnId}`
**Not a standalone ID** -- derived from parent grid ID and column ID.

**On copy:** Select list grid IDs are remapped to match the new parent grid ID:

**File:** `modules/common/model-serialization/private/id_remapper_v2.ts`, line 244-248

```typescript
if (ids.isSelectListGridId(objectId)) {
  const {gridId, columnId} = ids.getBaseGridAndColumnIdFromSelectListGridId(objectId);
  const remappedGridId = this.getMappedCollaborativeObjectId(gridId);
  this._remappedCollaborativeObjectIds[objectId] = ids.generateSelectListGridId(remappedGridId, columnId);
}
```

Select list row options are also remapped:

**File:** `modules/common/model-serialization/paste_writer.ts`, line 2787-2800

```typescript
if (selectListGridInfo) {
  const selectListGrid = selectListHelper.getOrCreateSelectListGrid(this._document.session.resolver, column);
  const originalSelectListGridId = selectListGridInfo.selectListGridId;
  for (const {rowId, name} of selectListGridInfo.options) {
    const remappedRowId = this._idRemapper.getMappedRowId(originalSelectListGridId, rowId);
    if (selectListGrid.hydratedRows.tryGetById(remappedRowId, {includeDeleted: true})) {
      continue;
    }
    selectListHelper.addOption(selectListGrid, {
      name: this._maybeObfuscateValue(name),
      rowId: remappedRowId,
    });
  }
}
```

### 20. Sync Table Grid IDs [VERIFIED]

**Format:** `grid-sync-{packId}-{tableName}` (deterministic, NOT random)
**Example:** `grid-sync-1054-Tasks`

**File:** `modules/common/ids/ids.ts`, line 368-371

```typescript
export function generateSyncTableId({packId, name, dynamicUrl}: Identity): string {
  ensure(packId, `Missing a pack id for sync table ${name}. Is dynamic? ${Boolean(dynamicUrl)}`);
  return `${SyncTableGridIdPrefix}-${packId}-${name}${dynamicUrl ? `-dynamic-${computeSha256(dynamicUrl)}` : ''}`;
}
```

**On copy:** Sync tables keep their ID if:
1. The pack is active in the target doc
2. The sync table definition exists
3. The grid doesn't already exist in live state

Otherwise, they're converted to standard grids with new IDs.

**Source grid:** `grid-source-sync-{packId}-{tableName}` (line 35)

**Legacy sync table IDs with spaces:** Some old sync tables have spaces in names (line 7-15 of js-core/utils/ids.ts). These are handled by special validation logic.

```typescript
export const LegacySyncTableIds: readonly string[] = Object.freeze([
  'grid-sync-1013-Pull Request',
  'grid-sync-1021-Doc Analytics',
  // ... more
]);
```

### 21. Message Templates [VERIFIED]

**System Grid:** `MESSAGE_TEMPLATES_GRID_ID = 'Global-Message-Templates'`

Message template rows use regular row IDs (`i-{10chars}`).

**On copy:** Message template row IDs are remapped in `_visitMessageTemplate`:

**File:** `modules/common/model-serialization/private/id_remapper_v2.ts`, line 865-882

```typescript
private _visitMessageTemplate(messageTemplate: MessageTemplateCopyInfo) {
  const messageTemplateGrid = this._document.messageTemplatesManager.grid;
  const gridId = messageTemplateGrid.id;
  const rowId = messageTemplate.rowId;
  const alreadyRemapped = Boolean(this._remappedRowIds[gridId]?.[rowId]);
  if (alreadyRemapped) {
    return;
  }
  const rowExistsDeleted = messageTemplateGrid.hydratedRows.existsDeleted(rowId);
  if (!rowExistsDeleted || !this._copyInfo.isCut) {
    this._remapRowId(gridId, rowId, ids.generateNewIdOfSameType(rowId));
  }
}
```

Formula references to message template rows are rewritten in `_rewriteReference` (line 3162-3167).

### 22. Item Layouts [VERIFIED]

Item layout IDs are row IDs in an item layout catalog grid. The default layout has a fixed ID.

**On copy:** Non-default item layout IDs are remapped:

**File:** `modules/common/model-serialization/private/id_remapper_v2.ts`, line 829-849

```typescript
private _processAndRemapItemLayouts() {
  for (const [gridId, itemLayoutInfo] of Object.entries(this._copyInfo.itemLayoutInfo)) {
    // ...
    if (!isDefaultItemLayoutId(itemLayoutId)) {
      this._remapRowId(itemLayoutCatalogGridId, itemLayoutId, ids.generateNewIdOfSameType(itemLayoutId));
    }
    for (const [subtableId, subtableViews] of Object.entries(itemLayoutInfo[itemLayoutId].subtableViews)) {
      for (const viewId of Object.keys(subtableViews)) {
        this._remapViewId(subtableId, viewId, ids.generateViewId());
      }
    }
  }
}
```

### 23. Op IDs [VERIFIED]

**File:** `modules/common/ids/ids.ts`, line 188
**Prefix:** `op`
**Format:** `op-{10chars}` (random) or `op-{suffix}` (fixed, max 128 chars)
**Generators:** `generateOpId()`, `generateFixedOpId(suffix)`, `generateSeededOpId(seed)`

Op IDs are NOT part of the copy/paste system. They are generated fresh for each operation.

### 24. Other Notable ID Types

**EditorColumn:** `ec-{10chars}` -- Canvas column layout IDs. Remapped as slate nodes.
**EditorColumnGroup:** `ecg-{10chars}` -- Canvas column group IDs. Remapped as slate nodes.
**EditorDividerLine:** `edl-{10chars}` -- Divider line IDs. Remapped as slate nodes.
**EditorCallout:** `eca-{10chars}` -- Callout block IDs. Remapped as slate nodes.
**EditorCodeBlock:** `ecb-{10chars}` -- Code block IDs. Remapped as slate nodes.
**EditorViewPlaceholder:** `evp-{10chars}` -- View placeholder IDs in slate.
**EditorStructuredValue:** `esv-{10chars}` -- Structured value wrapper IDs.

All of these are slate node types and get new IDs during paste via the `_remapSlateNodeId` function.

**ShadowColumn:** `c-system-shadow-{v5uuid}` -- Deterministic from formula content.
**IndexId:** `idx-{v5uuid}` -- Deterministic from column, match mode, and source value.
**AggregateRowId:** `agg-row-{gridId}-{viewInstanceId}` -- Derived.
**BrainSearchRecord:** `brain-{10chars}` -- For brain search results.
**DbtId:** `grid-dbt-{10chars}` -- For database-backed tables.

---

## The IdRemapper Class Architecture [VERIFIED]

**File:** `modules/common/model-serialization/private/id_remapper_v2.ts`
**Line:** 78

### Separate ID Maps

The IdRemapper maintains FIVE separate ID maps:

```typescript
private _remappedCollaborativeObjectIds: IdMap = {};  // grids, tables, canvases, controls, canvas blobs, editor formulas
private _remappedPageIds: IdMap = {};                   // pages
private _remappedBlobIds: IdMap = {};                   // blob rows in BLOBS_GRID
private _remappedSlateNodeIds: IdMap = {};              // slate line/block IDs
private _remappedRowIds: {[gridId: string]: IdMap} = {}; // rows, keyed by grid
private _viewIdMap: {[gridId: string]: IdMap} = {};      // views, keyed by grid
```

### What Gets Remapped (Summary)

| Object Type | Remapped? | Where in IdRemapper | Notes |
|---|---|---|---|
| Document ID | N/A | Server-side | New ID created during fork workflow |
| Page ID | YES | `_remappedPageIds` | Always new ID unless pasting into existing page |
| Canvas ID | YES | `_remappedCollaborativeObjectIds` | New ID, same random part derivation as page |
| Grid ID | COMPLEX | `_remappedCollaborativeObjectIds` | Depends on linking behavior, sync table status, etc. |
| ViewContainer ID | YES | `_remappedCollaborativeObjectIds` | May convert between grid/table types |
| Column ID | NO | Not remapped | Preserved across copy |
| Row ID | CONDITIONAL | `_remappedRowIds` | Preserved by default; remapped for message templates, item layouts, people (cross-env), blobs (cross-doc with collision) |
| View ID | YES | `_viewIdMap` | New IDs for non-linked views |
| Blob ID | CONDITIONAL | Via `_remappedRowIds[BLOBS_GRID_ID]` | Only remapped when collision with existing blob |
| Control ID | YES | `_remappedCollaborativeObjectIds` | New ID unless restoring recently deleted |
| Automation Rule ID | YES | `_remappedCollaborativeObjectIds` | Except sync table rules that keep same sync table |
| Comment Thread | STRIPPED | N/A | Removed on copy (not cut) |
| Slate Node ID | YES | `_remappedSlateNodeIds` + on-the-fly | All get new IDs during paste |
| Conditional Format | NEW | N/A | Re-created with new IDs via grid.addFormat() |
| Formula refs | REWRITTEN | Via `rewriteIdsInFormula` | AST-level ID replacement |
| Pack Connection | CONDITIONAL | Via formula rewrite | May be replaced with placeholder |
| Select List Grid | DERIVED | `_remappedCollaborativeObjectIds` | Derived from remapped parent grid ID |
| People Row | CONDITIONAL | `_remappedRowIds[PEOPLE_GRID_ID]` | Only for cross-env paste |

### IdentityIdRemapper [VERIFIED]

**File:** `modules/common/model-serialization/private/id_remapper_v2.ts`
**Line:** 1353

A subclass of IdRemapper that overrides ALL mapping methods to return the original ID unchanged. Used for `FullDocumentPaste` within the same environment -- the fork workflow handles the actual copy at the storage layer, so all IDs are preserved.

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

**When is it used:** Line 419-422 of paste_writer.ts:

```typescript
this._initializedIdRemapper =
  (mode.type === PasteMode.FullDocumentPaste || this._shouldUseProgrammaticCellPaste()) && !this._isCrossEnvPaste()
    ? new IdentityIdRemapper(this._copyInfo, this._options, this._document, mode, idsToSkipRemapping)
    : new IdRemapper(this._copyInfo, this._options, this._document, mode, idsToSkipRemapping);
```

---

## Global System Grids [VERIFIED]

**File:** `modules/common/serialized-types/grid.ts`, lines 7-44

System grids have fixed string IDs (NOT generated):

```typescript
export const GLOBAL_SYSTEM_GRID_ID_PREFIX = 'Global-';
export const AUTOMATIONS_GRID_ID = 'Global-Automations';
export const BLOBS_GRID_ID = 'Global-Blobs';
export const COMMENTS_GRID_ID = 'Global-Comments';
export const COMMENT_THREADS_GRID_ID = 'Global-Comment-Threads';
export const EXTERNAL_CONNECTIONS_GRID_ID = 'Global-External-Connections';
export const HOLIDAYS_GRID_ID = 'Global-Holidays';
export const OBJECT_ACL_GRID_ID = 'Global-Object-Acls';
export const OBJECTS_GRID_ID = 'Global-Objects';
export const PEOPLE_GRID_ID = 'Global-Document-People';
export const PACKS_GRID_ID = 'Global-Packs';
export const PACK_SYNC_REFS_GRID_ID = 'Global-Pack-Sync-Refs';
export const PROTECTION_GRID_ID = 'Global-Protections';
export const NOTIFY_GRID_ID = 'Global-Notify';
export const PAGES_GRID_ID = 'Global-Sections';     // Should be 'Global-Pages'
export const PAGE_SHORTCUTS_GRID_ID = 'Global-Section-Shortcuts';
export const SUBSCRIPTIONS_GRID_ID = 'Global-Subscriptions';
export const MESSAGE_TEMPLATES_GRID_ID = 'Global-Message-Templates';
export const CHAT_MESSAGES_GRID_ID = 'Global-Chat-Messages';
```

These are NEVER remapped. They're the same in every document. The IdRemapper's `getMappedCollaborativeObjectId` returns the original ID when no mapping exists (`?? objectId`).

---

## The "Fixed ID" Detection [VERIFIED]

**File:** `modules/common/ids/ids.ts`, line 652-666

IDs that are deterministically generated (not random) need special handling to prevent collisions with purged data:

```typescript
export function isFixedId(id: string): boolean {
  return [
    isAssistantColumnRuleId,
    isColumnSubscriptionRule,
    isObjectAclRowId,
    isPackRefreshRuleGridId,
    isSelectListGridId,
    isShortcutsRowId,
    isSyncTableId,
    isSyncTableSourceGridId,
    isSyncTableAutomationRuleId,
    isSyncTableUpdateAutomationRuleId,
    isSystemColumnId,
  ].some(isId => isId(id));
}
```

---

## The CopyVisitor — What Gets Collected [VERIFIED]

**File:** `modules/common/model-serialization/copy_visitor.ts`

The CopyVisitor collects six categories of data:

1. **nodesInfo:** Document, Page, Control, TextSelection, CanvasBlob, ViewOfGrid nodes
2. **automationsInfo:** Automation rules with their steps and formulas
3. **peopleInfo:** Person data (name, email, avatar)
4. **blobsInfo:** Blob metadata and source URIs
5. **gridsInfo:** Grid structure (columns, rows, properties)
6. **itemLayoutInfo:** Item layout definitions per grid
7. **packsInfo:** Pack connection and configuration data
8. **codaObjectReferenceInfo:** Canvas reference tracking for slate node remapping

**Entry points:**
- `copyDocument(document)` -- Full document copy
- `copyPage(page)` -- Single page copy
- `copyGrid(grid)` -- Single grid copy
- `copyTable(viewContainer)` -- Single table copy
- `copyControl(control)` -- Single control copy
- `copyTextSelection(slate, containerInfo, selection)` -- Text selection copy
- `copyGridSelection(grid, gridRangeRestriction)` -- Grid cell selection copy

---

## The Two-Path Copy Architecture [VERIFIED]

### Path 1: Server-Side Fork (Document Copy)

**File:** `modules/server/document-lib/launch_fork_document_workflow.ts`

When a user clicks "Copy Doc":
1. Server generates new docId
2. Server launches ForkDocument workflow
3. Workflow copies oplog/snapshots at storage layer
4. ALL IDs inside the forked doc are PRESERVED (same grids, same pages, same rows)
5. The new doc is an exact clone with a new docId

The CopyVisitor/PasteWriter is NOT used for the document-level fork. It IS used when the fork needs squashHistory (rebuild from snapshot via copy/paste).

### Path 2: Client-Side Copy/Paste

When a user copies content within or between docs:
1. CopyVisitor walks the source content, collecting `CopyInfo`
2. `CopyInfo` is serialized (potentially to clipboard)
3. PasteWriter receives `CopyInfo` and target document
4. PasteWriter creates IdRemapper (or IdentityIdRemapper for same-doc full paste)
5. IdRemapper pre-computes all ID mappings
6. PasteWriter applies changes using mapped IDs, rewriting formulas

**FullDocumentPaste + same env:** Uses IdentityIdRemapper (preserves all IDs)
**FullDocumentPaste + cross env:** Uses IdRemapper (new IDs, people remapped)
**All other paste modes:** Uses IdRemapper (new IDs for most objects)

---

## Surprising Findings and Edge Cases

### 1. Column IDs are NOT remapped
Columns keep their original IDs across copy. This works because columns are scoped to their parent grid, and the grid gets a new ID. However, this means two copies of the same grid in the same doc will have columns with the same IDs.

### 2. The Page prefix is 'section'
Due to historical naming, page IDs start with `section-`. The comment at line 52 of constants.ts says "fix the value to 'page' in an upgrade" -- but it hasn't happened.

### 3. Row IDs default to unchanged
The `getMappedRowId` returns the original ID when no explicit remap exists. This means rows generally keep their IDs unless explicitly remapped for specific cases (message templates, item layouts, cross-env people).

### 4. Comments are stripped on copy
Comments (threads, inline annotations) are removed during paste. Only cut-and-paste within the same document preserves comments.

### 5. Sync table IDs are deterministic and can collide
Since sync table grid IDs are derived from pack ID and table name, copying a sync table to a doc that already has one with the same pack/name requires purging the existing one first.

### 6. The "restore recently deleted" optimization
When you cut an object and paste it back in the same doc, the IdRemapper detects the deleted object and maps the copy to the same ID, effectively restoring it rather than creating a duplicate.

### 7. People references get "NowMissing" state
When people are inserted during cross-doc paste, they get `PeopleGridStateValues.NowMissing` -- visible but not in dropdowns. This prevents phantom users from cluttering the people picker.

### 8. Formula rewriting is AST-based
Formula references are NOT remapped with string replacement. The formula is fully parsed into an AST, references are visited, IDs are updated, and the formula is re-serialized. This is more robust but slower.

### 9. Cross-environment paste remaps user IDs via API
When pasting between environments (e.g., staging -> production), the system calls `getOrCreateAssignee` for each user reference, which either finds the user in the target environment by email or creates a new one.

### 10. `isObjectId` only recognizes 6 types
The `isObjectId` function (line 688-697 of ids.ts) only checks: Grid, Canvas, ViewContainer, Control, EditorFormula, CanvasBlob. Pages and Rows are NOT considered "object IDs" by this function.
