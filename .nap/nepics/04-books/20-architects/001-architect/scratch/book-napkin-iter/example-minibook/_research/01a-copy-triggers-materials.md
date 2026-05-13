# Copy Triggers Research Materials

Research for: Chapter on every user-facing and system trigger that copies content in Coda.

---

## TRIGGER 1: "Copy Doc" Button (Full Document Fork) [VERIFIED]

### User Action
User clicks "Copy this doc" from the doc menu, or visits a URL with `?copy=true`. This opens a dialog to choose destination folder, then creates a complete independent copy of the document (new docId, new op log, everything).

### Browser-Side Entry Point

**File:** `modules/browser/navigation/private/copy_document_helpers.ts`
**Line:** 48-123 (`doDocumentCopy`) and 125-176 (`copyCurrentDocument`)
**What it does:** Validates permissions, builds the title ("Copy of ..." or "My ..."), opens the CopyDocumentModal dialog.
**Why it's shaped this way:** Template copies use "My {title}" prefix while regular copies use "Copy of {title}". The function separates "copy current doc" from "copy another doc" because the latter needs to fetch permissions via network.

```typescript
export async function doDocumentCopy({
  docInitContext,
  permissions,
  folderInfo,
  isPublished,
  subtitle,
  title,
  preselectedFolderId,
  uncommittedLogFromPlayMode,
  onDocCopied,
  opVersion,
  confirmationStyle = CopyDocConfirmationStyle.ShowDialogAndOpenDoc,
  addToSnackbarQueue,
  openDialog,
}: { ... }) {
  if (!permissions.canCopy) {
    addToSnackbarQueue(new SnackbarDetails({title: CannotCopyMessage, icon: SnackbarIcon.Error}));
    onDocCopied?.resolve();
    return;
  }
  // ... opens the CopyDocumentModal
  await tryOpenCopyDocumentModal({ ... });
}
```

### Modal & Network Call

**File:** `modules/browser/helpers/workspace_helpers.ts`
**Line:** 64-179 (`tryOpenCopyDocumentModal`)
**What it does:** Opens the CopyDoc dialog (or bypasses it for non-interactive confirmations), calls the server endpoint.
**Key detail:** The actual server call is at line 288 via `BrowserDocumentApiClient.forDoc(docId).copyDocument(...)`.

```typescript
const response = await BrowserDocumentApiClient.forDoc(docId).copyDocument({
  title,
  folderId: selectedFolderId,
  opVersion,
  deletePageAuthors,
  deleteComments,
  isPublished,
});
```

After the response, if there are uncommitted play-mode ops, they're sent separately via `processPlayModeOps`.
Then the browser opens a new window/tab pointing to the newly created doc URL.

### Server Endpoint

**File:** `modules/server/frontend/private/actions/copy_document.ts`
**Line:** 51-187 (`copyDocument`)
**What it does:** Validates auth, enforces opVersion constraints, calls `launchForkDocumentWorkflow`, logs audit events, returns a redirect to the new doc URL.

```typescript
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

### launchForkDocumentWorkflow

**File:** `modules/server/document-lib/launch_fork_document_workflow.ts`
**Line:** 48-351
**What it does:** The core orchestrator for all "create a new doc from an existing doc" operations. Validates source doc, generates new docId, creates the doc record in DB with `availabilityState: Initializing`, then launches the `ForkDocument` workflow (or `SquashDocument` if squashHistory=true).
**Why it's shaped this way:** The doc record is created BEFORE the workflow runs, so the user sees "initializing" state immediately. The workflow itself is fire-and-forget -- if the workflow DB is down, the `fork_document_sweeper` picks it up later.

Key validations:
- Cannot fork child docs, DbBackedTableCollection, or DbBackedTable document types
- Cannot fork at opVersion before `minSnapshotOpVersion`
- Cannot fork in the middle of a transaction (checks `lastOp.data.transactionInfo`)
- Schema version minimum enforced via runtime config
- Cannot fork docs with calculations disabled (unless admin)
- Op copy range limit enforced (gap between latest snapshot and target opVersion)
- Time-based snapshot lag check

```typescript
// After creating the document, attempt to launch the fork
void _launchForkDocumentWorkflow(services, forkDocumentParams, forkDocumentOptions);
return {newDocId: docId};
```

The `void` fire-and-forget pattern is intentional -- the doc row already has all the info needed.

### ForkDocument Workflow

**File:** `modules/server/workflows/fork_document.ts`
**Line:** 131-205 (`forkDocument` task), 244-onwards (`scrubCopiedDocument` task)
**What it does:** A 3-task workflow:
1. `forkDocument` -- copies blobs, ops (via `_copyDocumentStorage`), automation info, in parallel
2. `scrubCopiedDocument` -- loads the model from source doc into the new docId, scrubs authors/comments, runs GC
3. `flipToOnline` -- sets availability state to Online

**CRITICAL INSIGHT:** This is an OP-LEVEL COPY. It copies the raw op log from the source doc into the new doc, then applies scrubbing ops on top. It does NOT use CopyVisitor/PasteWriter. The doc literally starts with the same op history as the source.

```typescript
// Task 1: forkDocument
const [{nextMarker}] = await promise.allIncludingErrors([
  docBulkStorage.copyBlobsToNewDoc(sourceDocId, docId, initialBlobCopyCutoffMinutes),
  _copyDocumentStorage(services, params, sourceDocInfo, docInfo),
  mentionsStorage.updateDocumentLastProcessedOpVersion(docId, opVersion),
  _copyAutomationsStorage(services, params),
]);
```

```typescript
// Task 2: scrubCopiedDocument -- loads model from SOURCE doc into NEW docId
await docManager.withModel({
  docId,           // The new doc
  loadFromDocInfo: sourceDocInfo,  // Load ops from source
  opVersion,
  callback: async document => {
    // Scrub authors, comments, etc.
    // Add GC op
  },
});
```

### Auto-Copy Document (URL-triggered)

**File:** `modules/server/frontend/private/actions/auto_copy_document.ts`
**Line:** 48-119 (`autoCopyDocument`)
**What it does:** Same as `copyDocument` but triggered by visiting `/<docId>/copy?loginToken=...`. Validates loginToken, calls the same `launchForkDocumentWorkflow`, redirects to the new doc.
**Used by:** URL-based copy links (e.g. "copy this doc" links shared externally).

---

## TRIGGER 2: "Duplicate Page" [VERIFIED]

### User Action
User right-clicks a page in the page list and selects "Duplicate", or uses title bar tab context menu.

### Browser-Side Entry Point

**File:** `modules/browser/page-list/private/duplicate_page_helpers.ts`
**Line:** 181-227 (`performDuplicatePage`)
**What it does:** The single shared entry point for page duplication. Calls `duplicatePage()` from utils, navigates to the new page.
**Pipeline:** CopyVisitor + PasteWriter (browser-side, purely local ops)
**IDs:** ALL REMAPPED -- every grid, page, row, column gets new IDs

```typescript
export function performDuplicatePage(
  {includeSubpages, linkingBehavior}: {includeSubpages?: boolean; linkingBehavior: PasteLinkingBehavior},
  {document, sourceRootPageId, addToSnackbarQueue, router, routeAddress}: PerformDuplicatePageOptions,
): void {
  const {pasteOptions, copyOptions} = _buildDuplicateOptions(document, linkingBehavior);
  const sourcePage = ensureExists(document.pagesManager.getById(sourceRootPageId));
  const rootPageOverrides = {parentId: sourcePage.parentId ?? undefined};

  const duplicatePageResults = duplicatePage(
    document,
    sourceRootPageId,
    {parentCursor: routeAddress ? subtableCursorHelper.getParentCursor(document, routeAddress) : null},
    {includeSubpages, pasteOptions, copyOptions},
    rootPageOverrides,
  );
  // ... navigate to new page
}
```

### Core duplicatePage() function

**File:** `modules/common/model-serialization/utils.ts`
**Line:** 150-201 (`duplicatePage`)
**What it does:** Creates a CopyVisitor, copies the page, creates a PasteWriter, pastes into the document as a new page.
**CRITICAL:** This is entirely browser-side. The ops generated by PasteWriter are uncommitted ops that get synced to server via the normal sync engine.

```typescript
export function duplicatePage(
  document: DocumentInterface,
  sourceRootPageId: string,
  undoOptions: UndoOptions,
  { includeSubpages, pasteOptions, copyOptions }: { ... },
  rootPageOverrides = {},
): {pageId: string; canvasId: string; remappedPageIds: ...} | null {
  const copyVisitor = new CopyVisitor(document, {
    isCut: false,
    rowsToInclude: copyOptions?.rowsToInclude,
  });
  copyVisitor.copyPage(rootPage, {includeSubpages});
  const rawCopyInfo = copyVisitor.getCopyInfo();

  const copyInfo = updateCopyInfoForOverrides(rawCopyInfo, rootPageOverrides);
  const pasteWriter = new PasteWriter(document, copyInfo, pasteOptions);
  pasteWriter.pasteIntoDocument({type: PasteMode.AppendPagesPaste, parentId, position}, undoOptions);
  const pasteResult = pasteWriter.getResults();
  return { pageId: firstInsertedPageId, canvasId: newPage.canvasId, remappedPageIds: pasteResult.idMaps.remappedPageIds };
}
```

### Dialog Decision

**File:** `modules/browser/page-list/private/duplicate_page_helpers.ts`
**Line:** 96-119 (`shouldShowDuplicateDialog`)
**What it does:** Determines if a confirmation dialog should appear before duplicating. Shows dialog when: page has subpages, or page has tables/views (non-DBT docs).

### PasteLinkingBehavior Options for Duplicate

**File:** `modules/browser/page-list/private/duplicate_page_helpers.ts`
**Line:** 156-175 (`_buildDuplicateOptions`)
**What it does:** When linking behavior is `CreateViews`, can optionally skip rows during copy (controlled by `DuplicatePageSkipRowsDuringCreateViews` config).

---

## TRIGGER 3: Copy-Paste (Canvas / Rich Text) [VERIFIED]

### User Action
User selects text/objects on a canvas page, presses Cmd+C, then Cmd+V (same doc or different doc).

### Copy Side -- Standard (native clipboard event)

**File:** `modules/browser/copy-helpers/copy_helpers.ts`
**Line:** 226-300 (`performCopyOrCut`)
**What it does:** Called from the native copy/cut event handler. Copies text, HTML, markdown, and CopyInfo (as JSON) to the clipboard.

**Four MIME types are set on the clipboard DataTransfer:**
1. `text/plain` -- plain text rendering
2. `text/markdown` -- markdown rendering  
3. `text/html` -- HTML rendering
4. `application/json+coda; type=oplog` (MimeType.KrOpLog) -- full CopyInfo JSON
5. `application/json+coda; type=cross-doc-ranges` (MimeType.KrCrossDocRangesData) -- cross-doc metadata

```typescript
clipboardData.setData(MimeType.PlainText, text);
clipboardData.setData(MimeType.Markdown, markdown);
clipboardData.setData(MimeType.HTML, html);

const copyInfo = copySlate({document, slate: copiedCodaSlate, containerInfo, isCut, selection: copiedRange});
clipboardData.setData(MimeType.KrOpLog, JSON.stringify(copyInfo));

const crossDocData = {
  html,
  metadata: { sourceDocId: document.id, sourceEnv: config.env },
};
clipboardData.setData(MimeType.KrCrossDocRangesData, JSON.stringify(crossDocData));
```

### Copy Side -- Synthetic (async Clipboard API)

**File:** `modules/browser/copy-helpers/copy_helpers.ts`
**Line:** 86-177 (`performCopyOrCutWithSyntheticClipboard`)
**What it does:** Used when the standard clipboard event is not available (e.g., copy from toolbar button). Uses the async Clipboard API + IndexedDB as a synthetic clipboard.

**Key mechanism:** A UUID `clipboardId` is generated. The CopyInfo JSON is stored in IndexedDB under that key. The clipboardId is embedded in the HTML as an HTML comment: `<!--coda-synthetic-clipboard=UUID-->`. On paste, the paste handler reads this tag from the HTML, looks up the CopyInfo from IndexedDB.

```typescript
const clipboardId = uuid.create();
const htmlWithClipboard = getHtmlWithClipboardIdTag(html, clipboardId);

const syntheticClipboardData = {
  id: clipboardId,
  content: JSON.stringify(copyInfo),
};

await Clipboard.copyWithSyntheticStorage(acceptedMimeTypesData, syntheticClipboardData);
```

### IDBClipboard (Synthetic Clipboard Storage)

**File:** `modules/browser-shared/storage/idb_clipboard.ts`
**Line:** 23-48
**What it does:** IndexedDB-backed clipboard that stores exactly one entry (`last_copy_data`), overwritten each copy.

```typescript
export class IDBClipboard extends EventEmitter<UntypedEventMap> {
  private readonly _idb: IDB;
  constructor() {
    super();
    this._idb = new IDB(IDBName, SCHEMA_VERSION, IDBSchema);
  }
  async add(key: string, value: string): Promise<void> {
    const valueToStore = {key, value, timestamp: Date.now()};
    await this._idb.execute([IDB.createSetRequest(IDBStoreName, ClipboardKey, valueToStore)]);
  }
  async get(key: string): Promise<string | undefined> {
    const [value] = await this._idb.execute([IDB.createGetRequest(IDBStoreName, ClipboardKey)]);
    return value?.key === key ? value.value : undefined;
  }
}
```

### Paste Side -- Rich Text / Canvas

**File:** `modules/browser/editor-slate/private/gesture-handlers/paste_handler.ts`
**Line:** 1+ (large file, the main paste_handler)
**What it does:** Handles the paste event on slate editors. Checks for CopyInfo first (from KrOpLog MIME type or IDBClipboard), then falls back to HTML parsing, then plain text.

The paste handler at line 56-57 imports:
```typescript
import {getClipboardIdFromTransferData} from '@kr-modules/browser/copy-helpers/copy_helpers';
import {attemptRichTextOpLogPaste} from '../../paste_helpers';
```

### attemptRichTextOpLogPaste

**File:** `modules/browser/editor-slate/paste_helpers.ts`
**Line:** 136-201 (`attemptRichTextOpLogPaste`)
**What it does:** The decision point for whether to use Coda's rich copy-paste or fall back to HTML/text. Tries synthetic clipboard (IDB) first, then falls back to KrOpLog MIME type.

```typescript
export async function attemptRichTextOpLogPaste({
  document, richTextPasteCallback, customPasteHandler, transferData, onError,
}: { ... }): Promise<{handled: boolean; showPasteWarning?: boolean}> {
  let copyInfo: CopyInfo | undefined;

  const syntheticClipboardId = getClipboardIdFromTransferData(transferData);
  if (syntheticClipboardId) {
    const idbClipboard = new IDBClipboard();
    const stringifiedCopyData = await idbClipboard.get(syntheticClipboardId);
    if (stringifiedCopyData) {
      copyInfo = JSON.parse(stringifiedCopyData) as CopyInfo;
    }
  }

  if (!copyInfo && !transferData?.types?.includes(MimeType.KrOpLog)) {
    return {handled: false};  // Fall back to HTML paste
  }
  // ... use CopyInfo for rich paste
}
```

### runCanvasOpLogCopyPasteFlow

**File:** `modules/browser/editor-slate/paste_helpers.ts`
**Line:** 207-244 (`runCanvasOpLogCopyPasteFlow`)
**What it does:** After CopyInfo is available, determines linking behavior and default paste options, then calls `dangerouslyAsyncPasteIntoCanvasWithPacks`.

```typescript
const linkingBehavior = getLinkingBehaviorForPaste(canvas.document, copyInfo);
const defaultPasteOptions = getDefaultPasteOptions({
  sourceDocId: copyInfo.docInfo.id,
  targetDocId: canvas.document.id,
  linkingBehavior,
  isGridRange: isGridRange(copyInfo),
});
await onApplyPasteOptions(defaultPasteOptions);
```

### Cross-Doc Detection

**File:** `modules/common/paste-utils/index.ts`
**Line:** 63-82 (`getDefaultPasteOptions`)
**What it does:** If `sourceDocId !== targetDocId`, defaults to `DuplicateData` (creates new tables). Same doc defaults to `CreateViews` (links to existing tables).

```typescript
if (sourceDocId !== targetDocId || isGridRange) {
  defaultOptions.linkingBehavior = PasteLinkingBehavior.DuplicateData;
}
```

### Cross-Tab/Cross-Doc Paste Mechanics

**CRITICAL INSIGHT:** Cross-doc paste between different browser tabs works because the `KrOpLog` MIME type and `KrCrossDocRangesData` are attached to the system clipboard. When you paste in doc B, the paste handler reads the CopyInfo JSON from the clipboard's `KrOpLog` MIME type. The CopyInfo contains `docInfo.id` (the source doc's ID), so the paste handler knows it's a cross-doc paste and defaults to `DuplicateData`.

The synthetic clipboard (IDB) does NOT work cross-tab because IndexedDB is per-origin but the IDB key is a random UUID embedded in the HTML comment. A different tab would need to parse the HTML to find the UUID, which it does -- `getClipboardIdFromTransferData` reads the UUID from the HTML comment in the clipboard. But IDB is shared within the same origin, so it DOES work cross-tab within the same Coda domain.

---

## TRIGGER 4: Grid Range Copy-Paste (Table Cells) [VERIFIED]

### User Action
User selects a range of cells in a table, presses Cmd+C, then pastes into another table or canvas.

### Copy Side

**File:** `modules/browser/table/view.tsx`
**Line:** 1172-1229 (`_onCopy` and `_generateOpDataForCopy`)
**What it does:** Copies selected grid values as HTML table + plain text (for external paste), and as KrOpLog CopyInfo (for internal paste).

```typescript
private _generateOpDataForCopy(clipboardData: DataTransfer | null, isCut: boolean) {
  const rows = this._getRowsInGridValuesForCurrentSelection();
  const columns = this.view.getVisibleColumns();
  const selection = this._getSelectionWithCollapsedSubitems();
  const {rowIds, colIds} = gridSelection.getRowAndColumnIdsInSelection(rows, columns, ensureExists(selection));

  const viewContainerOrGrid = this.grid.getViewContainerOrGrid(this.view.id);
  const copyInfo = copyGridRange(isCut, this.grid, viewId, rowIds, colIds, viewContainer);
  ensureExists(clipboardData).setData(MimeType.KrOpLog, JSON.stringify(copyInfo));
}
```

### copyGridRange

**File:** `modules/common/paste-utils/index.ts`
**Line:** 224-242
**What it does:** Creates a CopyVisitor with a `GridRangeRestriction`, copies just the selected range.

```typescript
export function copyGridRange(
  isCut: boolean, grid: GridInterface, viewId: string,
  rowIds: readonly string[], colIds: readonly string[],
  table?: ViewContainerInterface,
): CopyInfo {
  const gridRangeRestriction = { gridId: grid.id, viewId, tableId: table?.id, rowIds, colIds };
  const copyVisitor = new CopyVisitor(grid.document, {isCut});
  copyVisitor.copyGridSelection(grid, gridRangeRestriction);
  return copyVisitor.getCopyInfo();
}
```

### Paste Side for Grid Data

**File:** `modules/browser/helpers/data_transfer.ts`
**Line:** 27-57 (`getCodaOpLogCopyInfoIfValidForTarget`)
**What it does:** Reads CopyInfo from the clipboard's KrOpLog MIME type, validates schema version compatibility.
**Line:** 59-75 (`getCopiedCodaGridData`) -- Extracts grid data from CopyInfo using `PasteWriter.getGridDataFromCopyInfo`.
**Line:** 107-119 (`getTransferGridData`) -- Priority: CodaOpLog > HTML table > CSV text.

---

## TRIGGER 5: Template Creation / "Use as Template" [VERIFIED]

### templatizeDocument

**File:** `modules/browser-shared/templates/templatize_document_helpers.ts`
**Line:** 29-78
**What it does:** Calls `getBrowserApiClient(document).templatizeDocument(opts)` which creates a template listing. If `shouldMakeCopy` is true, it creates a copy of the doc as the template source.
**Pipeline:** This ultimately calls the server's templatize endpoint which may internally fork the document.

### Template Copy (Using a template)

When a user clicks "Use Template", it goes through the same `launchForkDocumentWorkflow` path as "Copy Doc" -- the template IS just a doc with a template listing. The copy mechanics are identical.

The title generation for templates is different:
```typescript
// copy_document_helpers.ts line 36-44
const useMyPrefix = docInitContext.bentosInitContext?.type === BentosInitContextType.Template && isPublished;
if (useMyPrefix) {
  const docTitleLower = `${originalDocTitle.charAt(0).toLocaleLowerCase()}${originalDocTitle.slice(1)}`;
  newDocTitle = `My ${docTitleLower}`;
} else {
  newDocTitle = `Copy of ${originalDocTitle}`;
}
```

---

## TRIGGER 6: API/MCP content_duplicate [VERIFIED]

### Overview

**File:** `modules/server/coda-agent/tools/features/document/content_duplicate.ts`
**Line:** 628-762 (the tool definition and execute handler)
**What it does:** Server-side tool for AI agents (MCP/Coda Agent) to duplicate content. Supports 4 distinct copy modes:

1. **CopyDocument to NEW doc** -- calls `handleForkDocument` -> `launchForkDocumentWorkflow` (same as "Copy Doc" button)
2. **CopyDocument to EXISTING doc** -- calls `handleDocToExistingDoc` -> `executeCopyDocToExistingDocWorkflow` -> `CopyDocToExistingDoc` workflow
3. **CopyPage to NEW doc** -- calls `handlePageToNewDoc` -> creates new doc, then `executeCopyPasteWorkflow` -> `CopyPastePagesV2` workflow
4. **CopyPage to EXISTING doc** -- calls `handleCopyPageToExistingDoc` -> `executeCopyPasteWorkflow` -> `CopyPastePagesV2` workflow

```typescript
async execute(context, payload) {
  if (copyType === ContentDuplicateCopyType.CopyPage) {
    if (destinationDocId) {
      result = await handleCopyPageToExistingDoc(context, sourceDocId, sourceDocInfo, destinationDocId, ...);
    } else {
      result = await handlePageToNewDoc(context, sourceDocId, sourceDocInfo, sourcePageId!, ...);
    }
  } else {
    if (destinationDocId) {
      result = await handleDocToExistingDoc(context, sourceDocId, sourceDocInfo, destinationDocId, ...);
    } else {
      result = await handleForkDocument(context, sourceDocId, sourceDocInfo, ...);
    }
  }
}
```

### Workflow Polling

**File:** `modules/server/coda-agent/tools/features/document/content_duplicate.ts`
**Line:** 103-131 (`waitForWorkflowCompletion`)
**What it does:** Polls the workflow storage every 500ms until the workflow reaches a terminal state. Times out based on `toolCallWorkflowTimeoutMillis` runtime config.

---

## TRIGGER 7: CopyPastePagesV2 Workflow (Server-Side Page Copy) [VERIFIED]

### When Triggered
- By content_duplicate tool (CopyPage mode)
- By any server-side "copy pages between docs" operation

**File:** `modules/server/workflows/copy_paste_pages_v2.ts`
**Line:** 87-115 (`copyPages` task)
**What it does:** Loads the source doc model, creates CopyInfo via `getCopyInfoForPage`, stores it in workflow object storage.

```typescript
export async function copyPages(services, params) {
  const {copyInfo, sourceDocTitle, sourceCanvasId} = await withUpToDateOnlineModel(
    services, sourceDocId, userId,
    async docModel => getCopyInfoForPage({docModel, sourcePageId, includeSubpages}),
  );
  await workflowObjectStorage.putObject<CopyPastePagesWorkflowObject>(
    [WorkflowObjectType.CopyPastePages, context.workflowExecutionId],
    {copyInfo, sourceDocTitle, sourceCanvasId},
  );
}
```

**Line:** 117-onwards (`generateOpsForPastedPages` task)
**What it does:** Loads the destination doc model, calls `performPaste` which uses PasteWriter to generate ops, flushes ops to workflow object storage.

### getCopyInfoForPage

**File:** `modules/server/workflows/private/helpers/copy_paste_pages_workflow_helpers.ts`
**Line:** 236-278
**What it does:** Creates CopyVisitor, copies one page (with optional subpages), returns CopyInfo.

```typescript
function getJustCopyInfoForPage({docModel, page, includeSubpages}) {
  const copyVisitor = new CopyVisitor(docModel, {isCut: false});
  copyVisitor.copyPage(page, {includeSubpages});
  return copyVisitor.getCopyInfo();
}
```

### _doPasteIntoDocument

**File:** `modules/server/workflows/private/helpers/copy_paste_pages_workflow_helpers.ts`
**Line:** 280-306
**What it does:** Creates PasteWriter with `DuplicateData` linking behavior (always creates new tables on server-side paste), pastes into document.

```typescript
async function _doPasteIntoDocument({targetPage, targetCanvas, copyInfo, rowsToIncludeSetting, pasteMode, ...}) {
  const pasteWriter = new PasteWriter(targetCanvas.document, copyInfo, {
    rowsToInclude: rowsToIncludeSetting,
    linkingBehavior: PasteLinkingBehavior.DuplicateData,
  });
  await pasteWriter.initializeForPaste();
  pasteWriter.pasteIntoDocument(buildPasteModeInfo(targetCanvas.document, pasteMode, targetPage, newPageInitialIndex));
  const {idMaps, insertedPageIds} = pasteWriter.getResults();
  return {idMaps, insertedPages, version: CopyPasteVersion.V4};
}
```

---

## TRIGGER 8: CopyDocToExistingDoc Workflow [VERIFIED]

### When Triggered
- By content_duplicate tool (CopyDocument to existing doc mode)
- Used when merging an entire document into an existing document

**File:** `modules/server/workflows/copy_doc_to_existing_doc.ts`
**Line:** 94-139 (`copyDocument` task), 141+ (`generateOpsForPastedDoc` task)
**What it does:** Similar to CopyPastePagesV2 but copies the ENTIRE document. Uses `CopyVisitor.copyDocument()` instead of `copyPage()`.

```typescript
function getCopyInfoForDocument({docModel, rowsToInclude}) {
  const copyVisitor = new CopyVisitor(docModel, {isCut: false, rowsToInclude});
  copyVisitor.copyDocument(docModel);
  return copyVisitor.getCopyInfo();
}
```

---

## TRIGGER 9: SquashDocument Workflow [VERIFIED]

### When Triggered
- When `launchForkDocumentWorkflow` is called with `squashHistory: true`
- This creates a copy with a squashed (compressed) op history

**File:** `modules/server/workflows/squash_document.ts`
**Line:** 116-onwards
**What it does:** Loads the source document model, creates CopyInfo via CopyVisitor.copyDocument(), then creates a FRESH op log by pasting the CopyInfo into an empty model using PasteWriter (via `pasteIntoDocument` from paste-utils).

```typescript
// squash_document.ts line 142-153
const {copyInfo} = await docManager.withModel({
  docId: sourceDocId,
  user,
  recalcType: RecalcType.Static,
  opVersion,
  callback: async document => {
    const copyVisitor = new CopyVisitor(document);
    // ... copy entire document
  },
});
```

**Key difference from ForkDocument:** ForkDocument copies the raw op log. SquashDocument creates a FRESH op log by copy+paste, effectively compressing the entire history into a single set of creation ops.

---

## TRIGGER 10: Internal Full Doc Copy (Debug Feature) [VERIFIED]

### When Triggered
- Developer clicks "Copy full doc" from the debug menu in the document navigation

**File:** `modules/browser/navigation/private/document_debug_buttons.tsx`
**Line:** 86-108

```typescript
async function copyDocument(document: DocumentInterface) {
  const copyVisitor = new CopyVisitor(document, {isCut: false});
  copyVisitor.copyDocument(document);
  const copyInfo = copyVisitor.getCopyInfo();

  const acceptedMimeTypesData: AcceptedMimeTypeClipboardData[] = [
    {type: MimeType.InternalFullDocCopyInfo, contents: JSON.stringify(copyInfo)},
    {type: MimeType.PlainText, contents: 'Synthetic Clipboard failed.'},
  ];
  await Clipboard.copyWithSyntheticStorage(acceptedMimeTypesData);
}

async function pasteDocument(document: DocumentInterface, copyInfo: CopyInfo) {
  if (document.pagesManager.length > 1) {
    log.warn('Pasting our Internal Full Doc Format into a doc with content is not allowed.');
    return;
  }
  const defaultPage = document.pagesManager.getDefaultPage();
  await pasteIntoDocument(document, copyInfo, {
    copyMode: {type: PasteMode.ReplaceCurrentPagePaste, pageId: defaultPage.id},
  });
}
```

Uses the special `web application/json+coda-internal-full-doc-copy` MIME type to avoid conflict with normal copy-paste. Can only paste into a single-page doc.

---

## THE CopyInfo DATA STRUCTURE [VERIFIED]

**File:** `modules/common/models-types/serialization.ts`
**Line:** 410-461

The central data structure for ALL copy operations (except raw op-log fork). It is a complete snapshot of everything needed to recreate content in a new location.

```typescript
export interface CopyInfo {
  docInfo: DocumentMetadata;      // Source doc metadata (id, schema version, env, copy paste version)
  isCut: boolean;
  shouldForceNewObjects?: boolean;
  shouldForceMessageTemplatesDeserialization?: boolean;
  rowCountsMap: {[id: string]: {allRows: number; visibleRows: number}};
  externallyBackedGridsInfo?: {[id: string]: ExternallyBackedGridCopyInfo};
  version: CopyPasteVersion.V4;
  sourceInfo: CodaCopySourceInfo;  // What was copied (document, page, text selection, grid selection)
  copyIdentifier?: string;         // UUID for dedup
  rootId: string;                  // The starting node of the copy tree
  nodesInfo: {[id: string]: NodeCopyInfo};  // Pages, Controls, TextSelections, CanvasBlobs, ViewOfGrid
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

### NodeCopyInfo union type

```typescript
export type NodeCopyInfo =
  | DocumentCopyInfo      // CopyNodeType.Document
  | PageCopyInfo          // CopyNodeType.Page -- includes canvasContent (slate blocks)
  | ControlCopyInfo       // CopyNodeType.Control
  | TextSelectionCopyInfo // CopyNodeType.TextSelection -- just a slate fragment
  | CanvasBlobCopyInfo    // CopyNodeType.CanvasBlob
  | ViewOfGridCopyInfo;   // CopyNodeType.ViewOfGrid -- table/view copy
```

### CopyPasteVersion

```typescript
export enum CopyPasteVersion {
  V2 = 2,
  // V3 was briefly used in a failed roll out.
  V4 = 4,
}
// Only V4 is currently supported
export const SUPPORTED_COPY_PASTE_VERSIONS_SET = new Set([CopyPasteVersion.V4]);
```

---

## THE CopyVisitor [VERIFIED]

**File:** `modules/common/model-serialization/copy_visitor.ts`
**Line:** 146-405 (class definition and main entry points)

**Four entry points:**
1. `copyDocument(document)` -- copies entire document (all pages, grids, automations)
2. `copyPage(page, {includeSubpages})` -- copies one page and optionally its descendants
3. `copyTextSelection(slate, containerInfo, selection)` -- copies selected text/objects from a slate editor
4. `copyGridSelection(grid, gridRangeRestriction)` -- copies selected cells from a grid

```typescript
export class CopyVisitor implements CopyVisitorInterface {
  constructor(document: DocumentInterface, {isCut = false, rowsToInclude = RowsToInclude.All} = {}) { ... }

  getCopyInfo(): CopyInfo { ... }  // Returns the accumulated copy data

  copyDocument(document: DocumentInterface): void { ... }
  copyPage(page: PageInterface, {includeSubpages}: {includeSubpages?: boolean}): void { ... }
  copyTextSelection(slate: CodaSlateInterface, containerInfo: ContainerInfo, selection?: SlateRange): void { ... }
  copyGridSelection(grid: GridInterface, gridRangeRestriction: GridRangeRestriction): void { ... }
}
```

### Source Info Types

Each entry point sets a different `sourceInfo`:
- `CodaCopySourceType.CopyDocument` -- for `copyDocument()`
- `CodaCopySourceType.CopyPage` -- for `copyPage()`
- `CodaCopySourceType.CopyTextSelection` -- for `copyTextSelection()`  
- `CodaCopySourceType.CopyGridSelection` -- for `copyGridSelection()`

---

## THE PasteWriter [VERIFIED]

**File:** `modules/common/model-serialization/paste_writer.ts`
**Line:** 1+ (very large file, ~2000+ lines)

Takes CopyInfo and materializes it into the target document by generating ops.

**Key methods:**
- `pasteIntoCodaSlate(slate, cursor, undoOptions, {canvas})` -- pastes into a canvas at a cursor position
- `pasteIntoDocument(copyModeInfo, undoOptions?)` -- pastes as new pages into a document
- `getResults()` -- returns paste results including ID maps, inserted page IDs, etc.
- `static getGridDataFromCopyInfo(copyInfo)` -- extracts raw grid data for table paste

---

## THE IdRemapper [VERIFIED]

**File:** `modules/common/model-serialization/private/id_remapper_v2.ts`
**Line:** 78-100 (class definition)

Decides which IDs get remapped (new IDs generated) vs which stay the same (references to existing objects).

```typescript
export class IdRemapper implements IdRemapperInterface {
  getMappedCollaborativeObjectId(objectId: string): string;
  getMappedSlateNodeId(id: string): string | undefined;
  getMappedPageId(pageId: string): string;
  getMappedObjectReferenceValue(value: CodaObjectReferenceValue): CodaObjectReferenceValue | UrlReferenceValue;
  getMappedViewId(originalGridId: string, viewId: string): string;
  getMappedRowId(originalGridId: string, rowId: string): string;
}
```

There is also `IdentityIdRemapper` which does NO remapping -- used for `FullDocumentPaste` mode where IDs are preserved.

---

## PasteMode enum [VERIFIED]

**File:** `modules/common/serialized-types/copy_paste.ts`
**Line:** 134-151

```typescript
export enum PasteMode {
  CanvasPaste = 'CanvasPaste',                     // Normal selection paste into canvas
  ProgrammaticCanvasCellOverwrite = 'ProgrammaticCanvasCellOverwrite',  // API/button cell updates
  AppendToCurrentPagePaste = 'AppendToCurrentPagePaste',  // Append first page content to current page
  ReplaceCurrentPagePaste = 'ReplaceCurrentPagePaste',    // Replace current page
  AppendPagesPaste = 'AppendPagesPaste',            // Add as sibling pages
  FullDocumentPaste = 'FullDocumentPaste',          // For forks, no ID remapping
}
```

---

## PasteLinkingBehavior [VERIFIED]

**File:** `modules/common/serialized-types/base.ts` (referenced throughout)

Three behaviors that determine what happens to tables during paste:
1. `DuplicateData` -- Creates entirely new tables with copied data (cross-doc default)
2. `DuplicateTables` -- Creates new tables but preserves relationships
3. `CreateViews` -- Creates views of existing tables (in-doc default for tables with multiple views)

**File:** `modules/common/model-serialization/utils.ts`
**Line:** 498-554 (`getV4LinkingBehaviorForPaste`)
Logic for automatically determining linking behavior based on what's being pasted.

---

## CLIPBOARD MIME TYPES [VERIFIED]

**File:** `modules/common/constants/index.ts`
**Line:** 103-112

```typescript
export enum MimeType {
  KrBoundFormulaText = 'application/json+coda; type=bound-formula-text',
  KrCrossDocRangesData = 'application/json+coda; type=cross-doc-ranges',
  KrGoogleDocs = 'application/x-vnd.google-docs-document-slice-clip+wrapped',
  KrOpLog = 'application/json+coda; type=oplog',
  KrUnboundFormulaText = 'application/json+coda; type=formula-text',
  InternalFullDocCopyInfo = 'web application/json+coda-internal-full-doc-copy',
}
```

### CrossDocPasteData

**File:** `modules/common/constants/index.ts`
**Line:** 222-230

```typescript
export interface CrossDocPasteMetadata {
  sourceDocId: string;
  sourceEnv: Environment;
}

export interface CrossDocPasteData {
  html: string;
  metadata: CrossDocPasteMetadata;
}
```

### CodaHTMLPasteMetadata

**File:** `modules/common/constants/index.ts`  
**Line:** 243+

Contains enum values for HTML data attributes used in copy-paste HTML rendering (e.g., `data-coda-blob-id`, `data-coda-column-id`, etc.).

### Synthetic Clipboard ID embedding

**File:** `modules/browser/copy-helpers/copy_helpers.ts`
**Line:** 45-60

```typescript
export function getHtmlWithClipboardIdTag(html: string, clipboardId: string) {
  return `<!--${CodaHTMLPasteMetadata.SyntheticClipboard}=${clipboardId}-->${html}`;
}

export function getClipboardIdFromTransferData(transferData: DataTransfer): string | undefined {
  if (transferData?.types?.includes(MimeType.HTML)) {
    const html = transferData.getData(MimeType.HTML);
    const identifierText = `${CodaHTMLPasteMetadata.SyntheticClipboard}=`;
    if (html.includes(identifierText)) {
      const startIndex = html.indexOf(identifierText) + identifierText.length;
      const endIndex = html.indexOf('-->', startIndex);
      return html.substring(startIndex, endIndex);
    }
  }
}
```

---

## CLIPBOARD MECHANICS SUMMARY

### Standard Copy (Cmd+C in canvas)
1. Native `copy` event fires
2. `performCopyOrCut` called in copy_helpers.ts
3. CopyVisitor creates CopyInfo from selected slate content
4. Four MIME types written to DataTransfer: PlainText, Markdown, HTML, KrOpLog, KrCrossDocRangesData
5. For cut: content is deleted from source

### Synthetic Copy (toolbar button, programmatic)
1. `performCopyOrCutWithSyntheticClipboard` called
2. CopyVisitor creates CopyInfo
3. UUID clipboardId generated
4. CopyInfo JSON stored in IndexedDB via IDBClipboard
5. clipboardId embedded in HTML as HTML comment
6. Async Clipboard API writes HTML + PlainText (browsers don't support custom MIME types well)

### Standard Paste
1. Native `paste` event fires
2. Paste handler checks for `syntheticClipboardId` in HTML comment
3. If found: reads CopyInfo from IDBClipboard
4. If not found: checks for `KrOpLog` MIME type in clipboard DataTransfer
5. If CopyInfo available: uses CopyVisitor+PasteWriter pipeline
6. If not: falls back to HTML parsing -> plain text

### Cross-Doc Paste (different doc, possibly different tab)
1. Same as Standard Paste
2. `sourceDocId !== targetDocId` detected from CopyInfo.docInfo.id
3. Default linking behavior switches to `DuplicateData` (new tables, not views)
4. Entirely client-side -- no server round-trip for the paste itself
5. Pack installation may happen asynchronously if the pasted content uses packs not in the target doc

### Cross-Environment Paste (different Coda environments)
- Detected by comparing `copyInfo.docInfo.env` with `config.env`
- Falls back to HTML parsing if copy-paste version is incompatible

---

## ADDITIONAL COPY TRIGGERS

### Cell Canvas Copy (noteSlateCopyInfosForCellModifications)

**File:** `modules/common/model-serialization/utils.ts`
**Line:** 302-344
**What it does:** When programmatically writing slate values to cell canvases (e.g., default values, button actions), if the slate contains collaborative objects, it creates CopyInfo for each cell and pastes through the copy-paste pipeline.

### pasteIntoCanvas (synchronous)

**File:** `modules/common/model-serialization/utils.ts`
**Line:** 384-396
**What it does:** The synchronous paste function. Takes CopyInfo and pastes into a canvas at a cursor position.

### dangerouslyAsyncPasteIntoCanvasWithPacks

**File:** `modules/common/paste-utils/index.ts`
Referenced at line 53-54 of paste_helpers.ts
**What it does:** Async version that also handles pack installation. Called "dangerous" because async operations during paste can conflict with user edits.

---

## PIPELINE SUMMARY TABLE

| Trigger | Pipeline | IDs Remapped? | Where Ops Go |
|---------|----------|---------------|--------------|
| Copy Doc button | Op-log copy (ForkDocument workflow) | No (same ops) | Server DB directly |
| Auto Copy Doc | Op-log copy (ForkDocument workflow) | No | Server DB directly |
| Duplicate Page | CopyVisitor + PasteWriter (browser) | Yes | Uncommitted ops -> sync engine |
| Canvas copy-paste (same doc) | CopyVisitor + PasteWriter (browser) | Depends on LinkingBehavior | Uncommitted ops -> sync engine |
| Canvas copy-paste (cross-doc) | CopyVisitor + PasteWriter (browser) | Yes (DuplicateData) | Uncommitted ops -> sync engine |
| Grid cell range copy-paste | CopyVisitor + PasteWriter (browser) | Depends on LinkingBehavior | Uncommitted ops -> sync engine |
| MCP content_duplicate (doc to new) | Op-log copy (ForkDocument workflow) | No | Server DB directly |
| MCP content_duplicate (page to existing) | CopyVisitor + PasteWriter (CopyPastePagesV2 workflow) | Yes | Server workflow -> processUncommittedOps |
| MCP content_duplicate (doc to existing) | CopyVisitor + PasteWriter (CopyDocToExistingDoc workflow) | Yes | Server workflow -> processUncommittedOps |
| SquashDocument | CopyVisitor + PasteWriter (server workflow) | No (FullDocumentPaste) | Server workflow -> snapshot |
| Internal Debug Copy/Paste | CopyVisitor + PasteWriter (browser) | Yes (ReplaceCurrentPage) | Uncommitted ops -> sync engine |
| Template creation | Server templatize endpoint (may fork) | Varies | Server |

---

## EDGE CASES AND SURPRISING FINDINGS

### 1. IDBClipboard only stores ONE entry
The synthetic clipboard in IndexedDB stores exactly one key (`last_copy_data`). Each new copy overwrites the previous one. So if you copy in Tab A, then copy in Tab B, then paste in Tab A, you get Tab B's content.

### 2. Firefox and Safari get degraded copy quality
`performCopyOrCutWithSyntheticClipboard` shows a "low fidelity" warning on Firefox and Safari because they don't support ClipboardItem API well. The synthetic clipboard writes CopyInfo to IDB but can only put HTML+PlainText on the system clipboard.

### 3. ForkDocument copies op log, not model state
This is the biggest architectural distinction. "Copy Doc" copies the raw operation history. "Duplicate Page" and server-side page copy use the CopyVisitor+PasteWriter pipeline which creates a CopyInfo snapshot of model state and then generates new ops.

### 4. Suggest Changes mode falls back to plain text paste
At line 174 of paste_helpers.ts: `if (document.isSuggestingChanges) { return {handled: false, showPasteWarning: true}; }` -- the rich copy-paste pipeline is disabled in suggest-changes mode.

### 5. shouldForceNewObjects flag
CopyInfo has a `shouldForceNewObjects` flag that forces all objects to be duplicated even if they exist in the target. Used for ephemeral rows and message templates where referencing existing IDs would be dangerous.

### 6. Transaction boundary check on fork
`launchForkDocumentWorkflow` checks if the target opVersion falls in the middle of a transaction (line 162-175). If so, it rejects the copy. This prevents forking at an inconsistent point.

### 7. Assignment Notebook special casing
AIEditor docs cannot be copied UNLESS it's an "Assignment Notebook clone" (`isAssignmentClone`). This is a Grammarly-specific feature for copying student assignments.

### 8. The "web" prefix in InternalFullDocCopyInfo
The MIME type `web application/json+coda-internal-full-doc-copy` uses the `web ` prefix because Chrome requires custom MIME types in the Clipboard API to start with "web " per the spec. But Firefox and Safari don't support this at all.
