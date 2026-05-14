// ── Scroll sync — match scroll position between edit and rendered views ──
//
// Exported for use in ContentPane and for unit testing (SS-05).

import type * as monaco from 'monaco-editor';

/**
 * Find the rendered element with the closest `data-source-line` ≤ targetLine.
 * Prefers the block that CONTAINS the line, not the block after it.
 * If all blocks are after targetLine, returns the first element.
 */
export function findClosestSourceLine(container: HTMLElement, targetLine: number): HTMLElement | null {
  const elements = container.querySelectorAll('[data-source-line]');
  let closest: HTMLElement | null = null;
  let closestLine = -1;

  for (const el of elements) {
    const line = parseInt(el.getAttribute('data-source-line')!, 10);
    if (line <= targetLine && line > closestLine) {
      closest = el as HTMLElement;
      closestLine = line;
    }
  }

  // If all blocks are after targetLine, use the first element
  if (!closest && elements.length > 0) {
    closest = elements[0] as HTMLElement;
  }

  return closest;
}

/**
 * Find the topmost visible `data-source-line` element in the rendered view.
 * "Topmost visible" = first element whose offsetTop ≥ scrollTop.
 */
export function findTopmostVisibleSourceLine(container: HTMLElement): number | null {
  const scrollTop = container.scrollTop;
  const elements = container.querySelectorAll('[data-source-line]');

  for (const el of elements) {
    if ((el as HTMLElement).offsetTop >= scrollTop) {
      return parseInt(el.getAttribute('data-source-line')!, 10);
    }
  }

  // All above viewport — use last element
  if (elements.length > 0) {
    return parseInt(elements[elements.length - 1].getAttribute('data-source-line')!, 10);
  }

  return null;
}

/**
 * Sync scroll from edit mode to rendered view.
 * Matches the cursor (or viewport top if cursor off-screen) to the same screen y.
 */
export function syncEditToRendered(
  editor: monaco.editor.IStandaloneCodeEditor,
  rendered: HTMLDivElement,
): void {
  const position = editor.getPosition();
  if (!position) return;

  const cursorLine = position.lineNumber;
  const cursorScreenY = editor.getTopForLineNumber(cursorLine) - editor.getScrollTop();
  const viewportHeight = editor.getLayoutInfo().height;

  let anchorLine: number;
  let anchorScreenY: number;

  if (cursorScreenY < 0 || cursorScreenY > viewportHeight) {
    // Cursor off-screen — fallback to topmost visible line
    const ranges = editor.getVisibleRanges();
    anchorLine = ranges[0]?.startLineNumber ?? 1;
    anchorScreenY = 0;
  } else {
    anchorLine = cursorLine;
    anchorScreenY = cursorScreenY;
  }

  const element = findClosestSourceLine(rendered, anchorLine);
  if (element) {
    rendered.scrollTop = element.offsetTop - anchorScreenY;
  }
}

/**
 * Sync scroll from rendered view to edit mode.
 * Finds topmost visible source-line element and positions the editor cursor there.
 *
 * Requires rendered div to preserve layout state (use visibility:hidden, not display:none).
 */
export function syncRenderedToEdit(
  editor: monaco.editor.IStandaloneCodeEditor,
  rendered: HTMLDivElement,
): void {
  const line = findTopmostVisibleSourceLine(rendered);
  if (line !== null) {
    editor.setPosition({ lineNumber: line, column: 1 });
    editor.revealLineInCenter(line);
  }
}
