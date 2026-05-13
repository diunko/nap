// ── Content link provider — Monaco link detection for napkin-markdown ──
//
// Detects file paths, markdown links, and URLs in the left pane editor.
// Classifies each link using routeLink() and dispatches actions.

import * as monaco from 'monaco-editor';
import { routeLink, parseLinkHref } from './routing-rules';
import type { LinkResult } from './routing-rules';

// Match bare file paths: src/main.ts:42, ./foo.ts, ../bar.ts:10:5
const BARE_PATH_REGEX =
  /(?<!\w)(?:\.\/|\.\.\/|\/)?(?:[\w.-]+\/)*[\w.-]+\.\w+(?::\d+(?::\d+)?)?/g;

// Match markdown links: [text](url)
const MD_LINK_REGEX = /\[([^\]]*)\]\(([^)]+)\)/g;

// Match bare URLs: https://... or http://...
const URL_REGEX = /https?:\/\/[^\s)>\]]+/g;

interface ContentLink {
  range: monaco.IRange;
  href: string;
  tooltip?: string;
}

function detectLinks(lineContent: string, lineNumber: number): ContentLink[] {
  const links: ContentLink[] = [];
  const seen = new Set<string>(); // Avoid overlapping matches

  // 1. Markdown links first (highest priority, most specific)
  let match: RegExpExecArray | null;
  const mdRegex = new RegExp(MD_LINK_REGEX.source, 'g');
  while ((match = mdRegex.exec(lineContent)) !== null) {
    const href = match[2];
    const startCol = match.index + 1;
    const endCol = match.index + match[0].length + 1;
    links.push({
      range: { startLineNumber: lineNumber, startColumn: startCol, endLineNumber: lineNumber, endColumn: endCol },
      href,
      tooltip: href,
    });
    // Mark columns as seen
    for (let c = startCol; c < endCol; c++) seen.add(`${lineNumber}:${c}`);
  }

  // 2. Bare URLs
  const urlRegex = new RegExp(URL_REGEX.source, 'g');
  while ((match = urlRegex.exec(lineContent)) !== null) {
    const startCol = match.index + 1;
    const endCol = match.index + match[0].length + 1;
    if (seen.has(`${lineNumber}:${startCol}`)) continue;
    links.push({
      range: { startLineNumber: lineNumber, startColumn: startCol, endLineNumber: lineNumber, endColumn: endCol },
      href: match[0],
      tooltip: match[0],
    });
    for (let c = startCol; c < endCol; c++) seen.add(`${lineNumber}:${c}`);
  }

  // 3. Bare file paths (lowest priority — skip if inside a markdown link or URL)
  const bareRegex = new RegExp(BARE_PATH_REGEX.source, 'g');
  while ((match = bareRegex.exec(lineContent)) !== null) {
    const startCol = match.index + 1;
    if (seen.has(`${lineNumber}:${startCol}`)) continue;

    // Skip if this looks like it's inside a URL (walk back for http:// prefix)
    let i = match.index - 1;
    while (i >= 0 && lineContent[i] !== ' ' && lineContent[i] !== '\t') i--;
    const token = lineContent.slice(i + 1);
    if (/^https?:\/\//.test(token)) continue;

    const endCol = match.index + match[0].length + 1;
    links.push({
      range: { startLineNumber: lineNumber, startColumn: startCol, endLineNumber: lineNumber, endColumn: endCol },
      href: match[0],
      tooltip: match[0],
    });
  }

  return links;
}

/**
 * Create and register a Monaco link provider on an editor.
 * Returns a disposable.
 */
export function registerContentLinkProvider(
  editor: monaco.editor.IStandaloneCodeEditor,
  getSourceFilePath: () => string | null,
  onResult: (result: LinkResult) => void,
): monaco.IDisposable {
  return monaco.languages.registerLinkProvider('napkin-markdown', {
    provideLinks(model) {
      const links: monaco.languages.ILink[] = [];
      const lineCount = model.getLineCount();

      for (let i = 1; i <= lineCount; i++) {
        const lineContent = model.getLineContent(i);
        const detected = detectLinks(lineContent, i);
        for (const link of detected) {
          links.push({
            range: link.range,
            url: link.href,
            tooltip: link.tooltip,
          });
        }
      }

      return { links };
    },

    resolveLink(link) {
      const sourceFilePath = getSourceFilePath();
      if (!sourceFilePath || !link.url) return link;

      const href = link.url.toString();
      const result = routeLink({ href, sourceFilePath });
      // Stash the result in the URL so we can retrieve it in the click handler
      // Monaco will call shell.openExternal for http(s) URLs, so we override the click
      link.url = `nap-link://${encodeURIComponent(JSON.stringify(result))}`;
      return link;
    },
  });
}

/**
 * Handle a link click from Monaco. Call this from editor.onMouseDown or the openerService.
 */
export function handleLinkClick(
  url: string,
  sourceFilePath: string,
  onResult: (result: LinkResult) => void,
): boolean {
  // Check for our custom protocol
  if (url.startsWith('nap-link://')) {
    try {
      const result = JSON.parse(decodeURIComponent(url.slice('nap-link://'.length)));
      onResult(result);
      return true;
    } catch {
      return false;
    }
  }

  // Direct href — classify and route
  const result = routeLink({ href: url, sourceFilePath });
  onResult(result);
  return true;
}
