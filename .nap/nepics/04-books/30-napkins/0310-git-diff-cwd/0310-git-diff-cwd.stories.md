# 0310 — stories

## Story 1: Git gutter works for .nap files in a separate repo

The person has a project where `.nap/` is its own git repo. They open a napkin file in the left pane. Green gutter bars appear next to uncommitted lines — correctly showing changes relative to `.nap/`'s own git history, not the parent project.

## Story 2: Git gutter still works for code files

The person clicks a file:line link. A source file opens in the right pane. Git gutter shows changes relative to the parent project's git history. Same behavior as before.
