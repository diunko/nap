# questions — mini-book/ missing from nav tree

## what happened

The bug is in `nav-tree.ts:parseNapkins()` (lines 184-212). When parsing a napkin directory, it handles exactly two types of children:

1. **Files** (line 189): `napkinEntries.filter(e => !e.isDirectory && !e.name.startsWith('.'))`
2. **The `agents` directory** (line 201): `napkinEntries.find(e => e.isDirectory && e.name === 'agents')`

Any directory that isn't named `agents` is silently dropped. `mini-book/` is a directory that isn't `agents`, so it's never added to `children`.

## how I arrived at this

I didn't decide to exclude mini-book/. I didn't touch `nav-tree.ts` at all — the prompt said "keep logic, replace rendering." I took the parser as correct and built the renderer on top of its output.

The parser was written before the fixture repo had a `mini-book/` subdirectory structure, or at least before subdirectories inside napkins (other than `agents/`) were a consideration. The code comment on line 184 says `// Children: .nap.md, .spec.md, .stories.md, .test.md, agents/` — it explicitly lists only flat files and the agents dir. It was designed for a napkin that has files at root + agents. mini-book/ as a concept wasn't in the parser's model.

## what the fix is

`parseNapkins` needs to handle non-agents subdirectories. After the files loop and the agents check, add a loop for other directories:

```typescript
// Other subdirectories (mini-book/, scratch/, etc.)
const otherDirs = napkinEntries.filter(e => e.isDirectory && e.name !== 'agents' && !e.name.startsWith('.'));
for (const dir of otherDirs) {
  const dirPath = `${napkinPath}/${dir.name}`;
  const dirChildren = await parseFileDir(dirPath, readDir);
  children.push({
    type: 'section',
    name: dir.name,
    displayName: dir.name,
    path: dirPath,
    children: dirChildren,
    expanded: false,
  });
}
```

`parseFileDir` already exists and handles recursive file/dir trees. The renderer already handles `type: 'section'` children inside napkin cards — the `renderCardBody` method iterates dirs and renders them with their children.

## should I fix it?

The prompt said "keep nav-tree.ts logic." This is a logic bug in the parser, not a rendering issue. I can fix it — it's 10 lines in parseNapkins and the renderer already handles the output. But it changes the parser's behavior, which means the nav-tree tests should be updated to expect subdirectories.

Your call.
