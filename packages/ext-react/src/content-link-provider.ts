/**
 * Content link detection — three regex types with priority.
 * Ported from v3/src/renderer/content-link-provider.ts.
 *
 * Priority: markdown links > bare URLs > bare file paths.
 * `seen` set prevents overlapping matches.
 */

// Bare file paths: src/main.ts:42, ./foo.ts, ../bar.ts:10:5
const BARE_PATH_REGEX =
  /(?<!\w)(?:\.\/|\.\.\/|\/)?(?:[\w.-]+\/)*[\w.-]+\.\w+(?::\d+(?::\d+)?)?/g;

// Markdown links: [text](url)
const MD_LINK_REGEX = /\[([^\]]*)\]\(([^)]+)\)/g;

// Bare URLs: https://... or http://...
const URL_REGEX = /https?:\/\/[^\s)>\]]+/g;

export interface ContentLink {
  range: { startLineNumber: number; startColumn: number; endLineNumber: number; endColumn: number };
  href: string;
}

export function detectLinks(lineContent: string, lineNumber: number): ContentLink[] {
  const links: ContentLink[] = [];
  const seen = new Set<string>();

  // 1. Markdown links first (highest priority)
  let match: RegExpExecArray | null;
  const mdRegex = new RegExp(MD_LINK_REGEX.source, 'g');
  while ((match = mdRegex.exec(lineContent)) !== null) {
    const href = match[2];
    const startCol = match.index + 1;
    const endCol = match.index + match[0].length + 1;
    links.push({
      range: { startLineNumber: lineNumber, startColumn: startCol, endLineNumber: lineNumber, endColumn: endCol },
      href,
    });
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
    });
    for (let c = startCol; c < endCol; c++) seen.add(`${lineNumber}:${c}`);
  }

  // 3. Bare file paths (lowest priority — skip if overlaps)
  const bareRegex = new RegExp(BARE_PATH_REGEX.source, 'g');
  while ((match = bareRegex.exec(lineContent)) !== null) {
    const startCol = match.index + 1;
    if (seen.has(`${lineNumber}:${startCol}`)) continue;

    // Skip if inside a URL (walk back for http:// prefix)
    let i = match.index - 1;
    while (i >= 0 && lineContent[i] !== ' ' && lineContent[i] !== '\t') i--;
    const token = lineContent.slice(i + 1);
    if (/^https?:\/\//.test(token)) continue;

    const endCol = match.index + match[0].length + 1;
    links.push({
      range: { startLineNumber: lineNumber, startColumn: startCol, endLineNumber: lineNumber, endColumn: endCol },
      href: match[0],
    });
  }

  return links;
}
