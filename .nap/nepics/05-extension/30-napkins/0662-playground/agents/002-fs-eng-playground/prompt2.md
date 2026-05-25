## Round 2: build the monaco command

Read the feature:
- `.nap/nepics/05-extension/30-napkins/0662-playground/editor/editor.nap.md`
- `.nap/nepics/05-extension/30-napkins/0662-playground/editor/editor.spec.md`
- `.nap/nepics/05-extension/30-napkins/0662-playground/editor/editor.stories.md`

After the TA finishes (run `nap3 nap 001-test-arch-playground --timeout 300` to wait), read:
- `.nap/nepics/05-extension/30-napkins/0662-playground/editor/editor.test.md`

Build the `monaco` command: `defineCommand('monaco', ...)` in a new `monaco-command.ts`. Pass store + adapter to the factory. Register alongside the git command in TerminalPane. Write vitest tests from the test plan. Run debugging scenarios. No regressions.

Write response2.md, then `nap3 done`.
