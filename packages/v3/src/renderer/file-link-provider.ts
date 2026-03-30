import type { Terminal, ILinkProvider, ILink, IBufferLine } from '@xterm/xterm';

// Match file paths with optional line:col
// Matches:
//   src/main/main.ts
//   ./tests/foo.ts
//   /Users/me/file.ts
//   file.ts:42:17
//   file.ts:42
// Avoids matching URLs (http://, https://)
export const FILE_PATH_REGEX =
  /(?<!\w)(?:\.\/|\.\.\/|\/)?(?:[\w.-]+\/)*[\w.-]+\.\w+(?::\d+(?::\d+)?)?/g;

function isUrl(text: string, startIndex: number): boolean {
  // Walk back to the start of the surrounding non-whitespace token.
  // Include the match itself because the regex consumes the second '/'
  // of '://' as its optional path prefix.
  let i = startIndex - 1;
  while (i >= 0 && text[i] !== ' ' && text[i] !== '\t') i--;
  const token = text.slice(i + 1);
  return /^https?:\/\//.test(token);
}

function extractPathAndLocation(match: string): { path: string; line?: number; col?: number } {
  const lineColMatch = match.match(/^(.+?):(\d+)(?::(\d+))?$/);
  if (lineColMatch) {
    return {
      path: lineColMatch[1],
      line: parseInt(lineColMatch[2], 10),
      col: lineColMatch[3] ? parseInt(lineColMatch[3], 10) : undefined,
    };
  }
  return { path: match };
}

export function createFileLinkProvider(
  terminal: Terminal,
  getCwd: () => string,
  onOpen: (absolutePath: string) => void,
): ILinkProvider {
  return {
    provideLinks(lineNumber: number, callback: (links: ILink[] | undefined) => void): void {
      const buffer = terminal.buffer.active;
      const line: IBufferLine | undefined = buffer.getLine(lineNumber - 1);
      if (!line) {
        callback(undefined);
        return;
      }

      const text = line.translateToString(true);
      const links: ILink[] = [];

      let match: RegExpExecArray | null;
      const regex = new RegExp(FILE_PATH_REGEX.source, 'g');
      while ((match = regex.exec(text)) !== null) {
        if (isUrl(text, match.index)) continue;

        const matchText = match[0];
        const startX = match.index;

        links.push({
          range: {
            start: { x: startX + 1, y: lineNumber },
            end: { x: startX + matchText.length + 1, y: lineNumber },
          },
          text: matchText,
          activate: (_event, linkText) => {
            const { path: filePath } = extractPathAndLocation(linkText);
            const cwd = getCwd();
            let resolved: string;
            if (filePath.startsWith('/')) {
              resolved = filePath;
            } else {
              // Simple path join — cwd always ends without trailing slash
              const base = cwd.endsWith('/') ? cwd.slice(0, -1) : cwd;
              const clean = filePath.startsWith('./') ? filePath.slice(2) : filePath;
              resolved = `${base}/${clean}`;
            }
            onOpen(resolved);
          },
        });
      }

      callback(links.length > 0 ? links : undefined);
    },
  };
}
