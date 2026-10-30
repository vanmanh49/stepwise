import { readText, type Read } from '../algorithms/form';
import type { ArrayView, GridView, PanelsView, Role, ServicesView } from '../types/visualization';
import { utf8 } from './crypto/bytes';

export const MAX_STEPS = 200;

export const EMPTY: ArrayView = { kind: 'array', cells: [] };

/** A text field limited in bytes, which is what the algorithms count. */
export function readBytes(values: Record<string, string>, name: string, label: string, length: { min: number; max: number }): Read<string> {
  const text = readText(values, name, label, length);
  if (text.ok && utf8(text.value).length > length.max) return { ok: false, why: `${label} must fit in ${length.max} bytes. Letters like é take two bytes.` };
  return text;
}

const hexByte = (byte: number) => byte.toString(16).padStart(2, '0');

/** Cells are 44 px wide, and a phone's stage holds 6 of them. */
const SIDE = 6;
const ACROSS = Array.from({ length: SIDE }, (_, i) => i);

/** Bytes in rows of 6, with no row labels, so they fit a phone without scrolling. */
export function byteGrid(bytes: Uint8Array, prefix: string, role: (index: number) => Role = () => 'default'): GridView {
  const rows: GridView['rows'] = [];
  for (let at = 0; at < bytes.length; at += SIDE) {
    rows.push({ cells: Array.from(bytes.subarray(at, at + SIDE), (byte, i) => ({ id: `${prefix}-${at + i}`, value: hexByte(byte), role: role(at + i) })) });
  }
  return { kind: 'grid', rows };
}

/** An AES state as 4×4; AES fills it column by column. */
export function stateGrid(state: Uint8Array, prefix: string, role: (index: number) => Role = () => 'default'): GridView {
  return {
    kind: 'grid',
    rows: [0, 1, 2, 3].map((row) => ({
      cells: [0, 1, 2, 3].map((col) => {
        const index = row + col * 4;
        return { id: `${prefix}-${index}`, value: hexByte(state[index]!), role: role(index) };
      }),
    })),
  };
}

/** A 6×6 picture: one shaded cell per block. */
export function imageGrid(heats: number[], values: string[], prefix: string): GridView {
  return {
    kind: 'grid',
    rows: ACROSS.map((row) => ({
      cells: ACROSS.map((col) => {
        const index = row * SIDE + col;
        return { id: `${prefix}-${index}`, value: values[index]!, role: 'default' as const, heat: heats[index]! };
      }),
    })),
  };
}

const bitsSet = (byte: number) => byte.toString(2).replaceAll('0', '').length;

/** Two digests, one above the other, with the bytes that differ marked. */
export function compareDigests(a: Uint8Array, b: Uint8Array): { view: PanelsView; bits: number } {
  const changed = (i: number): Role => (a[i] === b[i] ? 'default' : 'compare');
  return {
    bits: a.reduce((sum, byte, i) => sum + bitsSet(byte ^ b[i]!), 0),
    view: {
      kind: 'panels',
      panels: [
        { label: 'First', view: byteGrid(a, 'digest-a', changed) },
        { label: 'Second', view: byteGrid(b, 'digest-b', changed) },
      ],
    },
  };
}

interface PartiesInput {
  attacker: boolean;
  messages: { from: string; to: string; label: string; role: Role }[];
  /** One row per party: what it holds, under `columns`. */
  known: { party: string; values: string[] }[];
  columns: string[];
  log: string[];
  names?: { client: string; attacker: string; server: string };
}

/** Who talks to whom on the wire, above what each party knows. An attacker sits between the two. */
export function partiesView({ attacker, messages, known, columns, log, names = { client: 'Client', attacker: 'Attacker', server: 'Server' } }: PartiesInput): PanelsView {
  const node = (id: string, label: string, type: ServicesView['nodes'][number]['type'], column: number) => ({ id, label, type, column, role: 'default' as const });
  const services: ServicesView = {
    kind: 'services',
    nodes: attacker
      ? [node('client', names.client, 'client', 0), node('attacker', names.attacker, 'attacker', 1), node('server', names.server, 'service', 2)]
      : [node('client', names.client, 'client', 0), node('server', names.server, 'service', 1)],
    links: (attacker
      ? [['client', 'attacker'], ['attacker', 'server']]
      : [['client', 'server']]
    ).map(([from, to]) => ({ from: from!, to: to!, role: 'default' as const })),
    messages: messages.map((message, i) => ({ id: `message-${i}`, ...message, progress: 0.5 })),
    requests: [],
    log,
  };
  const grid: GridView = {
    kind: 'grid',
    colLabels: columns,
    rows: known.map(({ party, values }) => ({
      label: party,
      cells: values.map((value, i) => ({ id: `known-${party}-${i}`, value, role: 'default' as const })),
    })),
  };
  return {
    kind: 'panels',
    panels: [
      { label: 'On the wire', view: services },
      { label: 'Who knows what', view: grid },
    ],
  };
}
