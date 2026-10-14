/**
 * Reading helpers for tool results: indent JSON, cut a long result to its first
 * lines, and split it into tokens a view can colour.
 *
 * Pure functions, so they can be tested without a browser. Nothing here builds
 * HTML: a view renders each token as text inside its own element, so the data
 * is never interpreted as markup.
 */

export type JsonTokenKind = 'key' | 'str' | 'num' | 'lit' | 'punct' | 'plain';

export interface JsonToken {
  k: JsonTokenKind;
  /** The token's text, with any whitespace that came before it. Joining every `s` gives back the input. */
  s: string;
}

/** Is the whole text one JSON value? */
export function isJson(text: string): boolean {
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}

/** Indent JSON for reading. Anything that is not JSON comes back unchanged. */
export function prettyJson(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

/** The first `max` lines of `text`, and how many lines were left out. */
export function clipLines(text: string, max: number): { text: string; more: number } {
  if (!Number.isFinite(max) || max < 1) return { text, more: 0 };
  let end = -1;
  let lines = 1;
  for (let at = text.indexOf('\n'); at !== -1; at = text.indexOf('\n', at + 1)) {
    if (lines === max) end = at;
    lines += 1;
  }
  if (lines <= max) return { text, more: 0 };
  return { text: text.slice(0, end), more: lines - max };
}

const NUMBER = /^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/;

function isSpace(c: string): boolean {
  return c === ' ' || c === '\n' || c === '\t' || c === '\r';
}
function isPunct(c: string): boolean {
  return c === '{' || c === '}' || c === '[' || c === ']' || c === ',' || c === ':';
}

/**
 * Split text into tokens: object keys, strings, numbers, `true`/`false`/`null`,
 * punctuation, and anything else as plain text. Never throws and never drops a
 * character: an unterminated string or stray text still comes back as tokens.
 * Whitespace is attached to the token that follows it, which keeps the number
 * of elements a view has to create low.
 */
export function tokenizeJson(text: string): JsonToken[] {
  const out: JsonToken[] = [];
  const n = text.length;
  let i = 0;
  let pad = '';
  const push = (k: JsonTokenKind, s: string): void => {
    out.push({ k, s: pad + s });
    pad = '';
  };

  while (i < n) {
    const c = text[i];
    if (isSpace(c)) {
      let j = i + 1;
      while (j < n && isSpace(text[j])) j += 1;
      pad += text.slice(i, j);
      i = j;
    } else if (c === '"') {
      let j = i + 1;
      while (j < n && text[j] !== '"') j += text[j] === '\\' ? 2 : 1;
      j = Math.min(n, j + 1);
      // A string is a key when a colon follows it (on the same line, as in indented JSON).
      let k = j;
      while (k < n && (text[k] === ' ' || text[k] === '\t')) k += 1;
      push(text[k] === ':' ? 'key' : 'str', text.slice(i, j));
      i = j;
    } else if (isPunct(c)) {
      push('punct', c);
      i += 1;
    } else {
      let j = i + 1;
      while (j < n && !isSpace(text[j]) && text[j] !== '"' && !isPunct(text[j])) j += 1;
      const word = text.slice(i, j);
      push(NUMBER.test(word) ? 'num' : word === 'true' || word === 'false' || word === 'null' ? 'lit' : 'plain', word);
      i = j;
    }
  }
  if (pad) out.push({ k: 'plain', s: pad });
  return out;
}
