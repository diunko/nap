// ── Key parser — maps named keys to byte sequences, parses C-style escapes ──

const NAMED_KEYS: Record<string, string> = {
  enter: '\r',
  esc: '\x1b',
  tab: '\t',
  space: ' ',
  backspace: '\x7f',
  up: '\x1b[A',
  down: '\x1b[B',
  left: '\x1b[D',
  right: '\x1b[C',
  'ctrl-c': '\x03',
  'ctrl-d': '\x04',
  'ctrl-z': '\x1a',
};

/**
 * Resolve a named key to its byte sequence, or pass through raw text.
 * Case-insensitive for named keys.
 */
export function parseKey(name: string): string {
  const lower = name.toLowerCase();
  if (lower in NAMED_KEYS) return NAMED_KEYS[lower];
  return name;
}

/**
 * Parse a string with C-style escape sequences into raw bytes.
 * Supports: \x?? (hex), \r, \n, \t, \\ (literal backslash)
 * Unknown escapes pass through verbatim.
 */
export function parseSeq(input: string): string {
  let result = '';
  let i = 0;

  while (i < input.length) {
    if (input[i] === '\\' && i + 1 < input.length) {
      const next = input[i + 1];
      switch (next) {
        case 'x': {
          // Hex escape: \xHH
          if (i + 3 < input.length) {
            const hex = input.slice(i + 2, i + 4);
            const code = parseInt(hex, 16);
            if (!isNaN(code)) {
              result += String.fromCharCode(code);
              i += 4;
              continue;
            }
          }
          // Incomplete or invalid \x — pass through as literal
          result += '\\x';
          i += 2;
          break;
        }
        case 'r':
          result += '\r';
          i += 2;
          break;
        case 'n':
          result += '\n';
          i += 2;
          break;
        case 't':
          result += '\t';
          i += 2;
          break;
        case '\\':
          result += '\\';
          i += 2;
          break;
        default:
          // Unknown escape — pass through verbatim
          result += '\\' + next;
          i += 2;
          break;
      }
    } else {
      result += input[i];
      i++;
    }
  }

  return result;
}
