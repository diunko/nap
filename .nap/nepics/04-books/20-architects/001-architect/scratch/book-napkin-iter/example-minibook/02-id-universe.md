# Chapter 2: The ID Universe

## Why This Matters

Every object in a Coda document has an ID. When you copy a document, the system must decide -- for every single ID -- whether to generate a fresh one or preserve the original. Get this wrong and you get collisions (two objects fighting over the same ID), dangling references (a formula pointing at an ID that doesn't exist), or ghost objects (duplicates that should have been unified).

This chapter is your field guide. First: how IDs are generated. Then: a reference table of every object type and its copy behavior. Finally: the mechanics of remapping -- how the system actually rewrites thousands of IDs in a single paste operation.

---

## How IDs Are Generated

Every generated ID in Coda has the same anatomy: an optional type prefix, a hyphen, and 10 random base64 characters.

**`generateObjectId()`:** [ids.ts:54](/modules/js-core/utils/ids.ts#L54) -- the universal ID factory:

```typescript
function generateIdFromRandom(rng: () => number, prefix?: string | void | null): string {
  const d0 = (rng() * 0xffffffff) | 0;
  const d1 = (rng() * 0xffffffff) | 0;
  const d2 = (rng() * 0xffffffff) | 0;

  // Extract 6-bit chunks -> index into Base64Chars (A-Z, a-z, 0-9, -, _, =)
  const id =
    Base64Chars[(d0 >> 6) & 0x3f] +
    Base64Chars[(d0 >> 12) & 0x3f] +
    // ... 8 more chars from d0, d1, d2

  if (prefix) {
    return `${prefix}-${id}`.trim();  // e.g., "grid-aB3dE_fGh="
  }
  return id;
}
```

Three random 32-bit integers yield 10 base64 characters. That gives roughly 60 bits of entropy -- enough that collisions are astronomically unlikely within a single document, but short enough to be human-scannable in debug logs.

Two variants exist:

- **`generateSeededObjectId(seed)`** ([ids.ts:63](/modules/js-core/utils/ids.ts#L63)) -- deterministic. Same seed always produces the same ID. Used for sync table grid IDs, shadow columns, and other cases where the ID must be reproducible.
- **`generateNewIdOfSameType(existingId)`** ([ids.ts:296](/modules/common/ids/ids.ts#L296)) -- the copy workhorse. Splits the existing ID on `-`, extracts the prefix, generates a new random ID with that prefix. This is what `IdRemapper` calls to create fresh IDs during paste.

---

## The Prefix Registry

**`ObjectIdPrefixes`:** [constants.ts:1](/modules/common/ids/constants.ts#L1)

Every object type has a string prefix that gets baked into its IDs. Here they are, grouped by domain:

| Prefix | Enum Name | Example ID | Notes |
|--------|-----------|------------|-------|
| _(none)_ | _(Document)_ | `aB3dE_fGh=` | Docs have no prefix by default |
| `section` | `Page` | `section-aB3dE_fGh=` | Should be `page` -- historical debt |
| `canvas` | `Canvas` | `canvas-aB3dE_fGh=` | 1:1 with pages |
| `grid` | `Grid` | `grid-aB3dE_fGh=` | Base data tables |
| `table` | `ViewContainer` | `table-aB3dE_fGh=` | Should be renamed -- historical debt |
| `v` | `View` | `v-aB3dE_fGh=` | Or the literal `default` |
| `c` | `Column` | `c-aB3dE_fGh=` | |
| `i` | `Row` | `i-aB3dE_fGh=` | Or deterministic like `i-12345` (people) |
| `ctrl` | `Control` | `ctrl-aB3dE_fGh=` | Sliders, buttons, etc. |
| `auto` | `Automation` | `auto-aB3dE_fGh=` | Rule grid prefix is `grid-auto` |
| `bl` | `Blob` | `bl-aB3dE_fGh=` | Uploaded files/images |
| `ci` | `CanvasBlob` | `ci-aB3dE_fGh=` | Was `CanvasImage` -- more debt |
| `cl` | `CanvasLine` | `cl-aB3dE_fGh=` | Slate line IDs |
| `f` | `EditorFormula` | `f-aB3dE_fGh=` | Inline formula objects |
| `cf` | `ConditionalFormat` | `cf-aB3dE_fGh=` | |
| `r` | `CommentThread` | `r-aB3dE_fGh=` | |
| `cm` | `Comment` | `cm-aB3dE_fGh=` | |
| `eca` | `EditorCallout` | `eca-aB3dE_fGh=` | Slate block types |
| `ecb` | `EditorCodeBlock` | `ecb-aB3dE_fGh=` | |
| `ec` | `EditorColumn` | `ec-aB3dE_fGh=` | Canvas column layout |
| `ecg` | `EditorColumnGroup` | `ecg-aB3dE_fGh=` | |
| `edl` | `EditorDividerLine` | `edl-aB3dE_fGh=` | |
| `evp` | `EditorViewPlaceholder` | `evp-aB3dE_fGh=` | |
| `esv` | `EditorStructuredValue` | `esv-aB3dE_fGh=` | |
| `rv` | `RichTextObject` | `rv-aB3dE_fGh=` | |
| `op` | _(Op ID)_ | `op-aB3dE_fGh=` | Not part of copy system |
| `fl` | `Folder` | `fl-aB3dE_fGh=` | Workspace folders |
| `pc` | `PackConfiguration` | `pc-aB3dE_fGh=` | |
| `expr` | `Expression` | `expr-aB3dE_fGh=` | |

There are also workspace-level prefixes (`ws`, `org`, `ba`, `bg`, `bt`, `idp`, `saml`, `go`, `grp`) that never appear inside a document's content and are irrelevant to copy.

The naming debt is real: `Page` is `'section'`, `ViewContainer` is `'table'`, `CanvasBlob` is `'ci'` (was `CanvasImage`). Each TODO comment says "fix in an upgrade" -- but changing a prefix requires migrating every stored ID in every document, so the debt compounds.

---

## The ID Inventory: What Happens on Copy

This is the core reference. For each object type: whether the ID is remapped when copying a document (fork) vs. cross-doc paste, and where the logic lives.

### Remapping Behavior by Object Type

| Object Type | Prefix | Fork (same env) | Cross-doc paste | Where remapped |
|---|---|---|---|---|
| **Document** | _(none)_ | New ID (server) | N/A | Server-side fork workflow |
| **Page** | `section` | Preserved | New ID | `_remappedPageIds` |
| **Canvas** | `canvas` | Preserved | New ID | `_remappedCollaborativeObjectIds` |
| **Grid** | `grid` | Preserved | Complex (see below) | `_remappedCollaborativeObjectIds` |
| **ViewContainer** | `table` | Preserved | New ID | `_remappedCollaborativeObjectIds` |
| **View** | `v` / `default` | Preserved | New ID | `_viewIdMap[gridId]` |
| **Column** | `c` | Preserved | **Preserved** | Not remapped |
| **Row** | `i` | Preserved | Preserved (usually) | `_remappedRowIds[gridId]` |
| **Control** | `ctrl` | Preserved | New ID | `_remappedCollaborativeObjectIds` |
| **Automation** | `grid-auto` | Preserved | New ID | `_remappedCollaborativeObjectIds` |
| **Blob** | `bl` | Preserved | Preserved (unless collision) | `_remappedRowIds[BLOBS_GRID_ID]` |
| **CanvasBlob** | `ci` | Preserved | New ID | `_remappedCollaborativeObjectIds` |
| **EditorFormula** | `f` | Preserved | New ID | `_remappedCollaborativeObjectIds` |
| **Slate nodes** | `cl`, `eca`, etc. | Preserved | New ID | `_remappedSlateNodeIds` + on-the-fly |
| **Comment threads** | `r` | Preserved | **Stripped** | Removed entirely |
| **Conditional formats** | `cf` | Preserved | Re-created with new IDs | `grid.addFormat()` |
| **Select list grids** | _(derived)_ | Preserved | Derived from new parent grid | Computed from remapped grid ID |
| **People rows** | `i-{userId}` | Preserved | Preserved (same env) / Remapped (cross-env) | `_remappedRowIds[PEOPLE_GRID_ID]` |
| **Sync table grids** | `grid-sync-*` | Preserved | Kept if pack active, else new ID | Special logic in `_visitViewsOfGrid` |
| **Pack connections** | _(in formulas)_ | Preserved | May become placeholder | Formula rewrite |
| **Op IDs** | `op` | N/A | N/A | Generated fresh per operation |

**"Fork (same env)"** means `FullDocumentPaste` with `IdentityIdRemapper` -- the server forks the oplog and all IDs inside are preserved verbatim.

**"Cross-doc paste"** means the content goes through `CopyVisitor` -> `IdRemapper` -> `PasteWriter`, where most IDs are regenerated.

---

## System IDs That Are Never Remapped

**Global system grid IDs:** [grid.ts:7](/modules/common/serialized-types/grid.ts#L7)

Every Coda document has a set of hidden infrastructure grids with fixed string IDs. These are identical in every document and are never touched by the remapper:

```
Global-Sections          (the pages grid -- yes, "Sections")
Global-Document-People   (the people grid)
Global-Blobs             (uploaded files)
Global-Automations       (automation rules)
Global-Comments          (comment content)
Global-Comment-Threads   (comment thread metadata)
Global-External-Connections  (pack connections)
Global-Objects           (object registry)
Global-Object-Acls       (permissions)
Global-Protections       (page/table locks)
Global-Packs             (installed packs)
Global-Pack-Sync-Refs    (sync table refs)
Global-Subscriptions     (notification subscriptions)
Global-Message-Templates (button/automation message templates)
Global-Notify            (notification queue)
Global-Holidays          (holiday calendar)
Global-Section-Shortcuts (page shortcuts per user)
Global-Chat-Messages     (chat message content)
```

The `IdRemapper.getMappedCollaborativeObjectId()` returns the original ID when no mapping exists, so these pass through unchanged. They don't need remapping because they're structural -- every document has exactly the same set, with the same IDs.

The **`DEFAULT_VIEW_ID`** ([index.ts:1192](/modules/common/constants/index.ts#L1192)) is the literal string `'default'` -- also never remapped. Every base grid has exactly one default view with this ID.

---

## The Remapping Machinery

### IdRemapper vs. IdentityIdRemapper

The system has two remappers, and the choice between them is the single most important branching decision in the entire paste flow.

**`IdRemapper`:** [id_remapper_v2.ts:78](/modules/common/model-serialization/private/id_remapper_v2.ts#L78) -- the real remapper. Maintains five separate ID maps:

```typescript
private _remappedCollaborativeObjectIds: IdMap = {};  // grids, tables, canvases, controls, blobs, formulas
private _remappedPageIds: IdMap = {};                   // pages
private _remappedBlobIds: IdMap = {};                   // blob rows
private _remappedSlateNodeIds: IdMap = {};              // slate line/block IDs
private _remappedRowIds: {[gridId: string]: IdMap} = {}; // rows, keyed by source grid
private _viewIdMap: {[gridId: string]: IdMap} = {};      // views, keyed by source grid
```

Why five maps instead of one? Because the same 10-char random part could theoretically appear under different prefixes, and because rows and views are scoped to their parent grid -- you need `(gridId, rowId)` to uniquely identify a row across the copy operation.

**`IdentityIdRemapper`:** [id_remapper_v2.ts:1353](/modules/common/model-serialization/private/id_remapper_v2.ts#L1353) -- the no-op remapper. Every method returns its input unchanged:

```typescript
export class IdentityIdRemapper extends IdRemapper {
  override getMappedCollaborativeObjectId(objectId: string): string {
    return objectId;          // no remapping
  }
  override getMappedPageId(pageId: string): string {
    return pageId;            // no remapping
  }
  override getMappedRowId(_originalGridId: string, rowId: string): string {
    return rowId;             // no remapping
  }
  // ... same for views, slate nodes, object references, type change info
}
```

**The selection logic** ([paste_writer.ts:419](/modules/common/model-serialization/paste_writer.ts#L419)):

```typescript
this._initializedIdRemapper =
  (mode.type === PasteMode.FullDocumentPaste || this._shouldUseProgrammaticCellPaste())
    && !this._isCrossEnvPaste()
    ? new IdentityIdRemapper(...)   // preserve all IDs
    : new IdRemapper(...);          // generate new IDs
```

Translation: if you're pasting a full document into the same environment (the normal "Copy Doc" flow), use `IdentityIdRemapper`. The server-side fork already created a clean document shell -- all internal IDs can stay the same because they live in a new document with a new docId. There's no collision risk.

Everything else -- cross-doc paste, cross-env paste, partial paste -- uses the real `IdRemapper`.

### The Surprising Cases

**Columns are NOT remapped.** This surprises people, but it makes sense: columns are always children of a grid, and grids always get new IDs on cross-doc paste. The tuple `(gridId, columnId)` is unique even if two grids have a column with the same `columnId`. The paste writer passes the column ID through unchanged ([paste_writer.ts:1575](/modules/common/model-serialization/paste_writer.ts#L1575)):

```typescript
return {
  id,             // column ID passed through unchanged
  formatConfig: this._rewriteValueFormatConfig(gridId, formatConfig),
  formula: this._rewriteFormulaString(formula, {objectId: gridId, fieldId: id}),
  // ...
};
```

**Rows default to unchanged.** `getMappedRowId()` ([id_remapper_v2.ts:280](/modules/common/model-serialization/private/id_remapper_v2.ts#L280)) returns the original row ID when no explicit remap exists. New row IDs are only explicitly set up for a few special cases: item layouts, message templates, blob rows (on collision), and people rows (on cross-env paste). For normal data rows, the `bulkAddRows` call during paste generates IDs internally.

**Comments are stripped, not remapped.** On any paste except cut-and-paste within the same document, comment threads are simply removed ([paste_writer.ts:3733](/modules/common/model-serialization/paste_writer.ts#L3733)). This prevents orphaned comment threads from accumulating in copied documents.

**Grids have the most complex remapping logic in the system.** The `_visitViewsOfGrid` method ([id_remapper_v2.ts:926](/modules/common/model-serialization/private/id_remapper_v2.ts#L926)) spans ~140 lines and handles: same-doc linking (keep ID, create views), cross-doc duplication (new ID), sync table preservation (keep ID if pack is active), recently-deleted restoration (keep ID to enable undo), and grid-selection-pasted-into-canvas (always new ID).

---

## How Typed References Are Remapped

Not all values that contain IDs look the same to the copy system. The critical distinction: **typed references** (cells with `ValueType.Reference`) are recognized and rewritten. **Plain string values** that happen to contain an ID are not.

When a cell has type `ValueType.Reference`, the paste writer knows it contains an object reference and runs it through `_rewriteReference()` ([paste_writer.ts:3083](/modules/common/model-serialization/paste_writer.ts#L3083)), which resolves the mapped ID:

```typescript
private _rewriteReference(ref: ReferenceInterface): string {
  const objectId = ref.objectId;
  const typeChangeInfo = this._idRemapper.getObjectTypeChangeInfo(objectId);
  const mappedId = this._idRemapper.getMappedCollaborativeObjectId(objectId);
  // ... handles grid->table type changes, view remapping, pack connection rewrites
}
```

But if someone stores an object ID in a plain text column? The copy system has no way to know it's a reference. It's just a string. It won't be remapped. This is why the type system matters -- it's not just for display formatting, it's for copy correctness.

---

## Formula ID Rewriting via AST Traversal

Formulas are the hardest part of ID remapping. A formula like `[Grid-1].Filter(CurrentValue.[Column-A] > 10)` contains references to `Grid-1` and `Column-A`. When `Grid-1` gets a new ID, every formula that mentions it must be updated.

The system does NOT use string replacement (which would be fragile and error-prone). Instead, **`rewriteIdsInFormula()`** ([rewrite_ids_in_formula.ts:10](/modules/common/formula/rewrite_ids_in_formula.ts#L10)) fully parses the formula into an AST, walks every reference node, and calls a callback to update each ID:

```typescript
export function rewriteIdsInFormula(
  rawFormula: string,
  parserContext: ParserContextInterface,
  updateRefTokenCallback: (ref: ReferenceInterface) => string,  // the remapping callback
  refFilterCallback?: (ref: ReferenceInterface) => boolean,
  { unbindParentProjections, allowInvalidFormula } = {},
): string {
```

The paste writer's `_rewriteReference` method serves as the callback. For each reference node in the AST, it:

1. Looks up the mapped collaborative object ID
2. Checks for type changes (grid becoming a table, or vice versa)
3. Remaps the view ID if present
4. Handles pack connection references (may replace with placeholder if the connection isn't transferable)
5. Remaps message template row IDs

This AST-based approach means formula rewriting is correct even for deeply nested expressions, computed references, and edge cases where an ID substring might appear in a string literal.

---

## Deterministic IDs and the Collision Problem

Most IDs are random and collision-free. But some IDs are deterministic -- derived from their content or context:

**`isFixedId()`:** [ids.ts:652](/modules/common/ids/ids.ts#L652) identifies these:

```typescript
export function isFixedId(id: string): boolean {
  return [
    isAssistantColumnRuleId,     // grid-auto-assistant-column-rule-{columnId}
    isColumnSubscriptionRule,     // grid-auto-column-subscribe-{columnId}
    isObjectAclRowId,
    isPackRefreshRuleGridId,     // grid-auto-pack-refresh-{packId}
    isSelectListGridId,          // {gridId}-select-list-{columnId}
    isShortcutsRowId,            // i-shortcuts-{userId}
    isSyncTableId,               // grid-sync-{packId}-{tableName}
    isSyncTableSourceGridId,     // grid-source-sync-{packId}-{tableName}
    isSyncTableAutomationRuleId, // grid-auto-sync-table-rule-grid-sync-{packId}-{tableName}
    isSyncTableUpdateAutomationRuleId,
    isSystemColumnId,            // {baseColumnId}-system-{suffix}
  ].some(isId => isId(id));
}
```

Deterministic IDs can collide. If you copy a sync table for "Tasks" from Pack 1054 into a document that already has one, both would want the ID `grid-sync-1054-Tasks`. The copy system handles this: if the sync table already exists in live state, the copy is downgraded to a standard grid with a new random ID.

Select list grid IDs are derived too (`{gridId}-select-list-{columnId}`), but they can't collide because they incorporate the parent grid ID, which is itself remapped.

---

## `isObjectId` -- A Narrow Definition

One subtlety worth calling out: the **`isObjectId()`** function ([ids.ts:688](/modules/common/ids/ids.ts#L688)) only recognizes six types:

```typescript
export function isObjectId(id: string): boolean {
  return (
    isGridId(id) || isCanvasId(id) || isViewContainerId(id) ||
    isControlId(id) || isEditorFormulaId(id) || isCanvasBlobId(id)
  );
}
```

Pages and rows are NOT "object IDs" by this definition. This matters because `isObjectId` gates certain code paths -- if you're debugging why a page reference isn't being handled by some generic "process all objects" loop, this is likely why.

---

## Key Takeaways

1. **IDs are prefix + 10 random base64 chars.** The prefix is the type tag. The random part provides collision resistance. Together they're human-readable in logs.

2. **The fork path preserves all IDs.** `IdentityIdRemapper` is the no-op. When you "Copy Doc" within the same environment, the server creates a new document shell and all internal IDs are cloned verbatim. No remapping needed.

3. **Cross-doc paste remaps almost everything -- except columns and most rows.** Columns survive because they're scoped to their (remapped) parent grid. Rows survive by default; only specific categories (people, message templates, item layouts) get explicit remaps.

4. **System grids have fixed string IDs that are identical across all documents.** `Global-Sections`, `Global-Document-People`, etc. These are infrastructure. They pass through the remapper untouched.

5. **Formula rewriting is AST-based, not string-based.** Every formula is fully parsed, every reference node is visited, and every ID is resolved through the remapper. This is slower but correct.

6. **Comments are stripped on copy.** Not remapped, not preserved -- removed entirely. Only cut-and-paste within the same document keeps comments.

7. **Typed references are remapped; plain strings are not.** If an ID lives in a `ValueType.Reference` cell, the copy system knows to rewrite it. If it's in a plain text field, it's invisible to the remapper. Design your schema accordingly.

8. **The naming debt is real and load-bearing.** Pages are `section-*`, view containers are `table-*`, canvas blobs are `ci-*`. Every TODO comment says "fix in an upgrade." These prefixes are baked into stored data across every document, so renaming requires a migration. Don't be confused by them -- just know the mapping.
