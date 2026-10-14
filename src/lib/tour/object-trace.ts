/**
 * What the object screen says about the reference program, taken from the program itself.
 *
 * The program is the one the benchmark verifies (docs/solution-path-examples.md,
 * task "granular-read"), and the screen runs it for real with the same
 * instrumented runtime as the code screen. Nothing below is scripted:
 *
 *   traceAccess    how many records the run read, which it followed, what came back
 *   programBlocks  which lines of the program each step lights up, found by what
 *                  the line says (so an edit to the document moves the highlight
 *                  with the code; a missing line is an error, not a wrong highlight)
 *   contractExcerpt the part of the tool description that tells the model the shape
 *
 * Pure TypeScript: it runs under `tsx --test` as well as in the browser.
 */

import type { ProjectionView } from '$lib/inventory/projection';
import { backToModelTokens } from './code-view';
import { runTracked } from './code-run';
import { fmtTokens } from './tokens';
import type { StepId } from './object-stage';

// ── the run ────────────────────────────────────────────────────────────────

export interface AccessTrace {
  /** Every resource the run touched, and how many property reads it took. */
  scanned: number;
  propertyReads: number;
  /** Records whose `id` was read: the by-id index covers all of them. */
  idReads: number;
  /** Records whose `name` was read: `find` stops at the VM. */
  nameReads: number;
  nameReadUpTo: number;
  /** Records the program read anything else from (followed or returned), in `data.resources` order. */
  usedIndexes: number[];
  /** Fields read per used record, keyed by `data.resources` index. */
  fieldsByIndex: Record<number, string[]>;
  result: Record<string, unknown>;
  resultText: string;
  /** What comes back to the model; the same audited figure the code screen shows. */
  backTokens: number;
}

export function traceAccess(code: string, projection: ProjectionView): AccessTrace {
  const outcome = runTracked({ code, projection });
  if (outcome.status !== 'ok') throw new Error(`The reference program did not run: ${outcome.error ?? outcome.status}`);
  if (!outcome.resultText) throw new Error('The reference program returned nothing');

  const indexOf = new Map(projection.resources.map((r, i) => [r.id, i]));
  let idReads = 0;
  let nameReads = 0;
  let nameReadUpTo = -1;
  const fieldsByIndex: Record<number, string[]> = {};
  for (const [id, fields] of Object.entries(outcome.scanned)) {
    const i = indexOf.get(id);
    if (i === undefined) continue;
    if (fields.includes('id')) idReads += 1;
    if (fields.includes('name')) {
      nameReads += 1;
      nameReadUpTo = Math.max(nameReadUpTo, i);
    }
    if (fields.some((f) => f !== 'id' && f !== 'name')) fieldsByIndex[i] = [...fields].sort();
  }

  return {
    scanned: outcome.totals.resourcesScanned,
    propertyReads: outcome.totals.propertyReads,
    idReads,
    nameReads,
    nameReadUpTo,
    usedIndexes: Object.keys(fieldsByIndex)
      .map(Number)
      .sort((a, b) => a - b),
    fieldsByIndex,
    result: JSON.parse(outcome.resultText) as Record<string, unknown>,
    resultText: outcome.resultText,
    backTokens: backToModelTokens(outcome)
  };
}

// ── the program, line by line ──────────────────────────────────────────────

/** Inclusive, zero-based line numbers. */
export type Block = [first: number, last: number];

export interface ProgramBlocks {
  index: Block;
  find: Block;
  nic: Block;
  ip: Block;
  ret: Block;
}

/** Widen a block upwards over the comment lines that introduce it. */
function withComments(lines: string[], block: Block): Block {
  let first = block[0];
  while (first > 0 && lines[first - 1].trim().startsWith('//')) first -= 1;
  return [first, block[1]];
}

/** The lines each access step lights up. Throws if the program no longer has one of them. */
export function programBlocks(code: string): ProgramBlocks {
  const lines = code.split('\n');
  const one = (label: string, test: (l: string) => boolean): number => {
    const hits = lines.flatMap((l, i) => (test(l) ? [i] : []));
    if (hits.length !== 1) throw new Error(`Expected exactly one "${label}" line in the reference program, found ${hits.length}`);
    return hits[0];
  };
  const code_ = (l: string): boolean => !l.trim().startsWith('//');

  const index = one('index by id', (l) => code_(l) && /new Map\(/.test(l));
  const find = one('find by name', (l) => code_(l) && /\.find\(/.test(l));
  const nic = one('follow nicId', (l) => code_(l) && /\bvm\.nicId\b/.test(l));
  const ip = one('follow publicIpId', (l) => code_(l) && /\bnic\b.*\.publicIpId\b/.test(l));
  const retStart = one('return {', (l) => /^\s*return\s*\{\s*$/.test(l));
  let retEnd = retStart;
  while (retEnd < lines.length - 1 && !/^\s*\};?\s*$/.test(lines[retEnd])) retEnd += 1;
  if (retEnd === retStart) throw new Error('The return block never closes');

  return {
    index: withComments(lines, [index, index]),
    find: withComments(lines, [find, find]),
    nic: withComments(lines, [nic, nic]),
    ip: [ip, ip],
    ret: withComments(lines, [retStart, retEnd])
  };
}

// ── syntax colour for the program panel ────────────────────────────────────

export type TokenClass = 'plain' | 'comment' | 'keyword' | 'string' | 'number';
export interface Token {
  text: string;
  cls: TokenClass;
}

const TOKEN = /(\/\/.*$)|('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")|\b(function|const|let|return|if|else|null|true|false)\b|(\b\d+(?:\.\d+)?\b)/g;

/** Split a line into coloured runs. Joining the runs gives the line back exactly. */
export function tokenizeLine(line: string): Token[] {
  const out: Token[] = [];
  let last = 0;
  for (const m of line.matchAll(TOKEN)) {
    const at = m.index ?? 0;
    if (at > last) out.push({ text: line.slice(last, at), cls: 'plain' });
    out.push({ text: m[0], cls: m[1] ? 'comment' : m[2] ? 'string' : m[3] ? 'keyword' : 'number' });
    last = at + m[0].length;
  }
  if (last < line.length) out.push({ text: line.slice(last), cls: 'plain' });
  return out;
}

// ── the tool description ───────────────────────────────────────────────────

export interface ContractExcerpt {
  /** The `type Projection = { ... }` block, without the comment markers. */
  shape: string[];
  /** The paragraph that says how references work. */
  references: string[];
}

const unComment = (l: string): string => l.replace(/^\/\/ ?/, '');

/** The two parts of the real tool description that the screen quotes. Throws if the description no longer has them. */
export function contractExcerpt(schemaDoc: string): ContractExcerpt {
  const lines = schemaDoc.split('\n');
  const start = lines.findIndex((l) => /^\/\/ type Projection = \{/.test(l));
  const end = start < 0 ? -1 : lines.findIndex((l, i) => i > start && /^\/\/ \};/.test(l));
  if (start < 0 || end < 0) throw new Error('The tool description has no `type Projection` block');
  const ref = lines.findIndex((l) => /^\/\/ References are by id/.test(l));
  if (ref < 0) throw new Error('The tool description does not explain references');
  let refEnd = ref;
  while (refEnd + 1 < lines.length && lines[refEnd + 1].trim() !== '//') refEnd += 1;
  return {
    shape: lines.slice(start, end + 1).map(unComment),
    references: lines.slice(ref, refEnd + 1).map(unComment)
  };
}

export interface ShapeLine {
  code: string;
  /** Only the note that teaches something; the rest of the real comments are left to the real description. */
  note?: string;
}

/** The shape block as the panel draws it: code, and the one note worth the room. */
export function shapeForDisplay(shape: string[]): ShapeLine[] {
  return shape.map((line) => {
    const at = line.indexOf('//');
    if (at < 0) return { code: line };
    const code = line.slice(0, at).trimEnd();
    const note = line.slice(at + 2).trim();
    return /^\s*resources:/.test(line) ? { code, note: `${note.split('.')[0]}.` } : { code };
  });
}

// ── the words ──────────────────────────────────────────────────────────────

export interface StepCopy {
  /** Short: shown beside the step counter. */
  label: string;
  /** One or two sentences: the narration. */
  text: string;
}

export interface CopyFacts {
  trace: AccessTrace;
  resources: number;
  subscriptions: number;
  groups: number;
  vmName: string;
}

export function stepCopy(id: StepId, f: CopyFacts): StepCopy {
  const t = f.trace;
  switch (id) {
    case 'estate':
      return {
        label: 'The estate',
        text: `Every fix so far added an interface for the model to learn. Change what it works on instead: turn all ${f.resources} resources into one plain object.`
      };
    case 'containers':
      return {
        label: 'Containers',
        text: `${f.subscriptions} subscriptions and ${f.groups} resource groups become two short lists. A group keeps the id of its subscription instead of sitting inside it.`
      };
    case 'links':
      return {
        label: 'Links',
        text: `${f.vmName} does not contain its NIC. It holds the id of one, and the NIC holds the id of its public IP. What the estate draws as lines, the object stores as ids.`
      };
    case 'flatten':
      return {
        label: 'One flat list',
        text: `Every resource becomes one record in one list, ${f.vmName}'s pod included. The pods were only a drawing: nothing in the object nests.`
      };
    case 'contract':
      return {
        label: 'Contract',
        text: `The model is told this shape once, in the tool description. It never receives the ${f.resources} records; the runtime keeps them.`
      };
    case 'program':
      return {
        label: 'Program',
        text: 'To answer, the model writes a small program: one tool call, however many steps the question needs. This is the benchmark\u2019s own reference program.'
      };
    case 'index':
      return {
        label: 'Index by id',
        text: `Index every record by id. It runs inside the runtime: ${t.idReads} records read, no model turn.`
      };
    case 'find':
      return {
        label: 'Find by name',
        text: `Find ${f.vmName}. It reads ${t.nameReads} names and stops at resources[${t.nameReadUpTo}], the first match.`
      };
    case 'nic':
      return {
        label: 'Follow nicId',
        text: 'The VM holds the id of its NIC, so the NIC is one lookup away: a key, not a search, and not another tool call.'
      };
    case 'ip':
      return {
        label: 'Follow publicIpId',
        text: 'The same again for the public IP, then read its address. Two lookups, no extra model turn.'
      };
    case 'return':
      return {
        label: 'Return',
        text: `Only the answer goes back to the model: ${Object.keys(t.result).length} values, \u2248 ${fmtTokens(t.backTokens)} tokens. The ${f.resources} records never entered its context.`
      };
  }
}
