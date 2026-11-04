export interface ChangedLine {
  sign: '+' | '-';
  text: string;
  /** '(module)' outside any class. */
  className: string;
}

export interface ChangeCost {
  classesAdded: string[];
  classesRemoved: string[];
  classesEdited: string[];
  linesAdded: number;
  linesRemoved: number;
  branchesBefore: number;
  branchesAfter: number;
  lines: ChangedLine[];
}

interface Line {
  text: string;
  className: string;
}

const CLASS_START = /^(?:export )?(?:abstract )?class (\w+)/;
const MODULE = '(module)';

/** The source's code lines, trimmed, without blank lines or comments, each tagged with its top-level class. */
function linesOf(source: string): Line[] {
  const lines: Line[] = [];
  let current = MODULE;
  for (const raw of source.split('\n')) {
    const start = CLASS_START.exec(raw);
    if (start) current = start[1]!;
    const text = raw.trim();
    if (text !== '' && !text.startsWith('//')) lines.push({ text, className: current });
    if (raw === '}') current = MODULE;
  }
  return lines;
}

const isBranch = (text: string) => text.includes('if (') || text.startsWith('case ') || text.includes(' case ') || text.includes(' ? ');

export function countBranches(source: string): number {
  return linesOf(source).filter((l) => isBranch(l.text)).length;
}

const classNames = (lines: Line[]) => [...new Set(lines.map((l) => l.className))].filter((c) => c !== MODULE);

/** What changed between two sources: classes added, removed and edited, and the lines, from an LCS line diff. */
export function changeCost(before: string, after: string): ChangeCost {
  const a = linesOf(before);
  const b = linesOf(after);
  // lcs[i][j] = longest common run of a[i..] and b[j..]; sources are short, so O(n·m) is fine.
  const lcs = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i]![j] = a[i]!.text === b[j]!.text ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
    }
  }
  const lines: ChangedLine[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i]!.text === b[j]!.text) {
      i++;
      j++;
    } else if (j >= b.length || (i < a.length && lcs[i + 1]![j]! >= lcs[i]![j + 1]!)) {
      lines.push({ sign: '-', ...a[i++]! });
    } else {
      lines.push({ sign: '+', ...b[j++]! });
    }
  }
  const beforeClasses = classNames(a);
  const afterClasses = classNames(b);
  const touched = new Set(lines.map((l) => l.className));
  return {
    classesAdded: afterClasses.filter((c) => !beforeClasses.includes(c)),
    classesRemoved: beforeClasses.filter((c) => !afterClasses.includes(c)),
    classesEdited: afterClasses.filter((c) => beforeClasses.includes(c) && touched.has(c)),
    linesAdded: lines.filter((l) => l.sign === '+').length,
    linesRemoved: lines.filter((l) => l.sign === '-').length,
    branchesBefore: a.filter((l) => isBranch(l.text)).length,
    branchesAfter: b.filter((l) => isBranch(l.text)).length,
    lines,
  };
}
