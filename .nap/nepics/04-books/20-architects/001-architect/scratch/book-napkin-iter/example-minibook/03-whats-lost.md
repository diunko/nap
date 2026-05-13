# Chapter 3: What's Lost on Copy

You've copied a Coda document. It looks identical. But it isn't. Whole categories of data have been surgically removed, external connections have been degraded, and -- most dangerously for Apps -- certain ID references are sitting in the copied doc pointing at objects that no longer exist under those IDs. This chapter maps the damage.

We'll work from most visible to most insidious: things intentionally removed, things that were never there to begin with, things that degrade silently, and finally the string-embedded reference gap that makes copy fundamentally unsafe for any system that stores IDs as plain strings.

---

## The Scrub Step: 14 Categories of Intentional Removal

After ForkDocument copies the raw snapshot, the **`scrubCopiedDocument()`** function ([fork_document.ts:244](/modules/server/workflows/fork_document.ts#L244)) loads the model and runs a gauntlet of cleanup operations. Each one removes or resets a specific category of data.

Here's the complete scrub sequence, in execution order:

```
                        Raw snapshot copy
                              |
                    scrubCopiedDocument()
                              |
     +------------------------+-------------------------+
     |                        |                         |
  Register             Copy external              Re-enable graph
  cross-doc tables     connections/packs          invalidation
     |                        |                         |
     +------------------------+-------------------------+
                              |
     1. Clear page authors (conditional)
     2. Clear external form data
     3. Delete comments (conditional)
     4. Reset locking (billing-dependent)
     5. Clear shared pages (partialDocIds)
     6. Fix authed sync pages -> source access
     7. Scrub people table
     8. Clear publishLandingDoc flag
     9. Clear copyPasteMetadata
    10. Handle assignment notebook clone
    11. Remove V3 sync tables
    12. Remove DB-backed tables
                              |
                     persistGarbageCollect()   <-- prevents undo from recovering scrubbed data
                              |
                      Take fresh snapshot
```

Let's walk through the ones that matter most.

### Entire table types are deleted, not downgraded

**`removeV3SyncTables()`:** [fork_document.ts:640](/modules/server/workflows/fork_document.ts#L640)

```typescript
function removeV3SyncTables(document: DocumentInterface): void {
  for (const grid of document.getCanvasGrids()) {
    if (isSyncTableGrid(grid) && grid.isExternallyBackedGrid) {
      ensureExists(grid.getParent() as CanvasInterface).removeObject(grid.id);
    }
  }
}
```

**`removeDbBackedTables()`:** [fork_document.ts:648](/modules/server/workflows/fork_document.ts#L648)

```typescript
function removeDbBackedTables(document: DocumentInterface): void {
  for (const grid of document.getCanvasGrids()) {
    if (isDbBackedTableGrid(grid)) {
      ensureExists(grid.getParent() as CanvasInterface).removeObject(grid.id);
    }
  }
}
```

These are not downgrades. The grid and every row in it are gone from the canvas. If another table had a Lookup column pointing at a V3 sync table, that column now references nothing. DB-backed tables get the same treatment.

### Shared page links are severed

**`_clearSharedPages()`:** [fork_document.ts:573](/modules/server/workflows/fork_document.ts#L573)

Every page's `partialDocId` (the ID that enables subdocument sharing links) is set to `null`. The copied document gets no shared page URLs -- those links belonged to the source document's identity.

### External form configurations are wiped

**`_clearExternalFormData()`:** [fork_document.ts:563](/modules/server/workflows/fork_document.ts#L563)

Every item layout's `externalFormConfig` is cleared. If the source doc had a form embedded in an external site, the copy doesn't inherit that binding.

### People table gets scrubbed of phantoms

**`_scrubPeopleTable()`:** [fork_document.ts:606](/modules/server/workflows/fork_document.ts#L606)

Two things happen here. First, any people rows not referenced by actual data are removed (`clearUnreferencedPeopleRows`). Second, ManuallyAdded users with NoAccess status are transitioned to NowMissing. The code comment is refreshingly honest about why: *"to eliminate fictional characters from templates -> copies within people selection drop downs."* Template docs often have placeholder people; you don't want them polluting the People picker in the copy.

### Locking depends on your wallet

**`_resetLocking()`:** [fork_document.ts:595](/modules/server/workflows/fork_document.ts#L595)

```typescript
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

If the destination workspace has the DocumentLocking feature, locking is preserved. If not, all protection is stripped. This is billing-dependent copy behavior -- the same document copied to two different workspaces yields different results.

### The GC op seals the deal

After all scrub operations, a garbage collect op is persisted ([fork_document.ts:423](/modules/server/workflows/fork_document.ts#L423)). This is the kill switch for undo: it ensures the new document's undo history cannot reach back past the scrub and recover deleted comments, cleared authors, or removed sync tables.

### Complete removal list

| Removed | Conditional? | Notes |
|---------|-------------|-------|
| V3 sync tables (externally-backed) | No | Removed from canvas entirely |
| DB-backed tables | No | Removed from canvas entirely |
| External form configs | No | All item layouts cleared |
| Shared page `partialDocId`s | No | Set to null |
| Authed sync pages | No | Rewritten to source-access mode |
| Publish landing doc flag | No | Set to false |
| Copy/paste metadata | No | Set to undefined |
| Unreferenced people rows | No | Cleared from people table |
| ManuallyAdded(NoAccess) people | Configurable | Transitioned to NowMissing |
| Page authors | Yes (`deletePageAuthors`) | Common for template copies |
| Comments + threads | Yes (`deleteComments`) | Both grids truncated |
| Locking/protection | Conditional | Only if workspace lacks billing feature |
| V3 sync table refresh rules | No | Excluded from automation copy SQL |
| Rule execution history | No | Only periodic_rules table is copied |

---

## Ephemeral State: Never There to Begin With

Some things aren't "lost" on copy because they were never serialized in the first place. The copied document starts clean:

- **Undo/redo history** -- The GC op in scrub explicitly prevents undo from reaching pre-copy state. The new doc has an empty undo stack.
- **Cursor positions and selection** -- Per-session state, not part of the document model.
- **Active view state** -- Which view a user is looking at is per-user UI state.
- **Real-time collaboration state** -- The new doc starts in INITIALIZING state. No active sessions.
- **Ephemeral grids** -- CopyVisitor skips them ([copy_visitor.ts:1317](/modules/common/model-serialization/copy_visitor.ts#L1317)): `if (!this._includeEphemeralGrids && grid.isEphemeral) { return; }`
- **Ephemeral system rows** -- Skipped at [copy_visitor.ts:895](/modules/common/model-serialization/copy_visitor.ts#L895): `if (ids.isEphemeralSystemRowId(row.id)) { continue; }`
- **Graph invalidation state** -- Explicitly suppressed during scrub to prevent pack formulas from executing with wrong-docId volatiles.
- **Pack formula execution state** -- Formulas don't execute during copy; they'll recalculate when the doc is opened.

None of these are surprising. But they matter for Apps if any app-level state was riding on ephemeral grids or system rows.

---

## External Connections: Graceful Degradation (Mostly)

Packs don't simply copy. They go through a multi-step reinstallation process in **`handleForkDocument()`** ([external_connection_manager.ts:3123](/modules/server/packs/external_connection_manager.ts#L3123)):

```
Source doc packs
       |
  1. Copy doc-pack associations to new doc
  2. Copy pack trial state
  3. Clone connection proxies (NEW proxy IDs)
  4. Reinstall packs (re-key effective permission ID)
  5. Update release channels
  6. Relink shared connections
       |
Destination doc packs (maybe degraded)
```

The degradation cascade works like this:

**Release channel downgrade** ([external_connection_manager.ts:3093](/modules/server/packs/external_connection_manager.ts#L3093)): If the person copying the doc has edit rights to the Pack, nothing changes. If they don't, the pack is downgraded to the Live release channel. If no Live version exists, the pack becomes `Unavailable` -- effectively disabled.

**Connection proxy replacement**: Connection proxies get new IDs via `cloneConnectionProxiesForForkedDoc`. Grid references are updated to point at the new proxies, so this is mostly transparent. But if any code stores a proxy ID as a plain string... (we'll get to that).

**Non-owner connection blanking** ([paste_writer.ts:3154](/modules/common/model-serialization/paste_writer.ts#L3154)): If a connection's `allowNonOwnerToSelect` is false, the reference is replaced with a synthetic placeholder:
```typescript
if (connection?.allowNonOwnerToSelect === false) {
  ref = createSyntheticPackConnectionReference(ref.packId, '');
}
```

**OAuth tokens**: Not copied. The new doc owner must re-authenticate. This is by design -- OAuth tokens are per-user credentials that should never be cloned.

**Enterprise controls**: Pack availability can differ across organizations. A pack that was available in the source workspace may be restricted in the destination workspace, causing it to become Unavailable.

---

## Automations: Copied with Caveats

**`_copyAutomationsStorage()`** ([fork_document.ts:536](/modules/server/workflows/fork_document.ts#L536)) copies automation rules via a SQL INSERT...SELECT:

```sql
INSERT INTO automations.periodic_rules(
  doc_id, rule_id, rule_type, enabled_at_op_version, when_definition, ...)
SELECT $2::automations.object_id, periodic_rules.rule_id, ...
FROM automations.periodic_rules
WHERE periodic_rules.doc_id = $1::automations.object_id
  AND periodic_rules.enabled_at_op_version <= $3::numeric(12, 3)
  AND periodic_rules.rule_type != 'SYNC_TABLE_V3_REFRESH'
ON CONFLICT DO NOTHING;
```

Three things to note:

1. **Rule IDs are preserved** -- the same `rule_id` exists in both the source and copied doc (with different `doc_id`s). This means rule IDs are not globally unique across documents.
2. **V3 sync table refresh rules are excluded** -- `rule_type != 'SYNC_TABLE_V3_REFRESH'`. Since V3 sync tables are removed from the copy, their refresh rules would be orphaned.
3. **Only rules enabled before the copy point** -- `enabled_at_op_version <= $3` filters out rules that were enabled after the snapshot being copied.

Rule execution history is not copied. The automation starts fresh in the new doc.

For the CopyDocToExistingDoc pipeline, automations go through CopyVisitor serialization and PasteWriter deserialization with ID remapping. The `when` grid reference is remapped by direct property mutation ([paste_writer.ts:3994](/modules/common/model-serialization/paste_writer.ts#L3994)), but only the top-level grid ID -- any IDs embedded deeper in the when/if condition structure as strings would be missed.

---

## The String-Embedded Reference Gap

This is the section that matters most for Apps. Read it carefully.

The copy pipeline remaps IDs through typed structured values. It knows how to handle:

- **`ValueType.Reference`** -- remapped via `_getRemappedReferenceValue`
- **`ValueType.CodaObjectReference`** -- remapped via `_getRemappedCodaObjectReferenceValue`
- **`ValueType.Slate`** -- walked recursively, all embedded objects remapped
- **`ValueType.Object`** with SlateTemplate -- formula IDs remapped
- **Formulas** -- parsed into AST, references rewritten via `rewriteIdsInFormula`

The set of value types the pipeline walks is defined explicitly in **`NESTED_STRUCTURED_VALUES_OF_INTEREST`** ([paste_writer.ts:233](/modules/common/model-serialization/paste_writer.ts#L233)):

```typescript
const NESTED_STRUCTURED_VALUES_OF_INTEREST = new Set([
  structuredValue.ValueType.Reference,
  structuredValue.ValueType.Slate,
  structuredValue.ValueType.CodaObjectReference,
  structuredValue.ValueType.Object,
]);
```

Everything else -- `String`, `Number`, `DateTime`, `Duration`, `Currency`, `Boolean` -- passes through untouched. The pipeline does not look inside these values. It cannot, because it has no way to know whether the string `"grid-abc123"` is an ID reference or the name of someone's pet.

### What falls through the cracks

1. **Plain string cell values containing IDs.** If a column stores a gridId, pageId, or canvasId as a plain `ValueType.String`, the copy pipeline will never remap it. In ForkDocument this doesn't matter (IDs are preserved). In CopyDocToExistingDoc, those strings become dangling references.

2. **URLs with embedded doc/page IDs.** A cell containing `https://coda.io/d/_dABCD/_suXYZ` will keep those exact IDs after copy. The `docId` and `sectionId` in the URL now point at the *source* document.

3. **Grid properties stored as strings.** Grid properties are deep-cloned (`_.cloneDeep(grid.properties)`) but not walked for ID references.

4. **Column properties.** Copied as-is in **`_getColumnProperties()`** ([copy_visitor.ts:739](/modules/common/model-serialization/copy_visitor.ts#L739)). Properties are cloned, not remapped.

5. **View config values.** Deep-cloned but never walked: `const configValues = _.cloneDeep(view.getAllConfigValues())`.

6. **Invalid formulas.** If a formula has a syntax error, `rewriteIdsInFormula` returns it unchanged ([rewrite_ids_in_formula.ts](/modules/common/formula/rewrite_ids_in_formula.ts)): `if (!parseResult.ast && allowInvalidFormula) { return rawFormula; }`. Any IDs inside that formula keep their original values.

7. **Oversized cell data.** Cells larger than `MAX_ROW_DATA_SIZE` are silently set to `null` ([copy_visitor.ts:912](/modules/common/model-serialization/copy_visitor.ts#L912)), except for Slate values. If a large cell contained important ID references, they're gone.

### Why this is THE risk for Apps

If Apps stores any of the following as plain strings in cell values, grid properties, or column properties, those references will break on CopyDocToExistingDoc:

- Grid IDs referencing other tables in the doc
- Page IDs referencing specific pages
- Canvas IDs referencing specific canvases
- View IDs referencing specific views
- Row IDs (if the target pipeline remaps them)
- Any internal object ID that the copy pipeline would normally remap if it were in a typed reference

The safe pattern: use `ValueType.Reference` or `ValueType.CodaObjectReference` for any inter-object reference. These are the only value types the copy pipeline knows how to remap.

For ForkDocument specifically, this isn't a problem -- IDs are preserved because it's a raw snapshot copy. But if the Apps feature ever needs to support CopyDocToExistingDoc (or if users paste apps-containing content into another doc), string-embedded IDs will silently break.

---

## Known TODOs in CopyVisitor

The CopyVisitor has an honest TODO comment at [copy_visitor.ts:259](/modules/common/model-serialization/copy_visitor.ts#L259):

```typescript
// TODO(jason): Add missing Information
// - Visit protectionManager
// - Visit messageTemplateManager
// - Visit holidayGridsManager
// - What else is global document level?
```

Three document-level managers are not visited during the CopyVisitor serialization path:

- **protectionManager** -- Protection IS handled in the ForkDocument scrub step (billing-dependent removal). But in the CopyDocToExistingDoc path, protection settings on pages and objects may not be fully transferred.
- **messageTemplateManager** -- Message templates at the document level are not serialized. Any automation or feature relying on doc-level message templates will find them missing in the copy.
- **holidayGridsManager** -- Holiday grid data (used for date calculations with business days) is not visited. Formulas that depend on custom holiday schedules will silently fall back to defaults.

The "What else is global document level?" comment suggests the author knew this list was incomplete. If Apps introduces new document-level state, it would need to be added both here (for CopyDocToExistingDoc) and in the scrub step (for ForkDocument).

---

## Blob Edge Cases

Blobs are mostly handled well, but there are two edge cases worth knowing.

### Mid-upload race condition

**`_visitBlobInfos()`** in CopyVisitor ([copy_visitor.ts:648](/modules/common/model-serialization/copy_visitor.ts#L648)):

```typescript
const canWeCopyBlob =
  sourceUri && (blobInfo.status === BlobStatus.INGESTED || blobInfo.status === BlobStatus.PREINGESTION);
const blobStatus = canWeCopyBlob ? BlobStatus.PREINGESTION : BlobStatus.FAILED;
```

If a blob is mid-upload when the copy happens (no `sourceUri` yet, or status is neither `INGESTED` nor `PREINGESTION`), it's marked as `FAILED` in the copy. The image or attachment slot exists but the content is gone. This is a CopyDocToExistingDoc concern; ForkDocument copies the raw S3 directory and handles it more robustly.

### Excessive blob pagination

In ForkDocument, the S3 blob copy has a configurable time cutoff (`initialBlobCopyCutoffMinutes`). If the blob directory is large, the copy is split into a continuation task ([fork_document.ts:183](/modules/server/workflows/fork_document.ts#L183)):

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

The document becomes available (flipToOnline) after the scrub step, but some blobs may still be copying in the background. Users might see missing images that appear minutes later.

---

## Key Takeaways

1. **ForkDocument preserves IDs; CopyDocToExistingDoc remaps them.** This is the fundamental difference. ForkDocument copies raw data and then scrubs. CopyDocToExistingDoc serializes through CopyVisitor, remaps through IdRemapper, and deserializes through PasteWriter. The string-embedded reference gap only matters for the second path.

2. **The scrub step is a 14-item checklist, not a general-purpose sanitizer.** It knows exactly what to remove. If a new feature introduces data that should be cleaned on copy, someone has to add it to the list explicitly.

3. **Pack degradation is a cascade, not a cliff.** Packs go from "same release channel" to "downgraded to Live" to "Unavailable," depending on the copier's relationship to the Pack. OAuth tokens are never copied.

4. **For Apps, the safe path is typed references.** Any ID stored as a plain string in a cell value, grid property, or column property is invisible to the copy pipeline. Use `ValueType.Reference` or `ValueType.CodaObjectReference`. This is not a style preference -- it is the difference between working after copy and silently broken.

5. **Three document-level managers are not visited by CopyVisitor.** Protection, message templates, and holiday grids are known gaps. If Apps adds document-level state, it needs entries in both the CopyVisitor (for CopyDocToExistingDoc) and the scrub step (for ForkDocument).

6. **The GC op makes scrub irreversible.** Once the scrub runs, undo cannot recover the removed data. This is by design -- you don't want comments from the source doc recoverable via undo in the copy.
