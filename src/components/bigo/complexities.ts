export interface Complexity {
  id: string;
  label: string;
  name: string;
  /** Plain-language meaning for beginners. */
  meaning: string;
  example: string;
  fn(n: number): number;
  /** CSS colour token and dash pattern, so curves differ without colour too. */
  color: string;
  dash?: string;
}

export const COMPLEXITIES: Complexity[] = [
  {
    id: '1',
    label: 'O(1)',
    name: 'Constant',
    meaning: 'The work stays the same no matter how much data there is.',
    example: 'Reading an array item by index',
    fn: () => 1,
    color: 'var(--role-sorted)',
  },
  {
    id: 'log',
    label: 'O(log n)',
    name: 'Logarithmic',
    meaning: 'Doubling the data adds just one more step, because each step halves what is left.',
    example: 'Binary search',
    fn: (n) => Math.max(1, Math.log2(n)),
    color: 'var(--role-found)',
    dash: '10 4',
  },
  {
    id: 'n',
    label: 'O(n)',
    name: 'Linear',
    meaning: 'The work grows in step with the data: twice the data, twice the work.',
    example: 'Linear search',
    fn: (n) => n,
    color: 'var(--role-active)',
    dash: '2 5',
  },
  {
    id: 'nlogn',
    label: 'O(n log n)',
    name: 'Linearithmic',
    meaning: 'A little worse than linear. This is the speed of the best general-purpose sorts.',
    example: 'Merge sort',
    fn: (n) => Math.max(1, n * Math.log2(n)),
    color: 'var(--role-frontier)',
    dash: '12 4 2 4',
  },
  {
    id: 'n2',
    label: 'O(n²)',
    name: 'Quadratic',
    meaning: 'Twice the data means four times the work. Fine for small inputs, painful for large ones.',
    example: 'Bubble sort',
    fn: (n) => n * n,
    color: 'var(--role-pivot)',
    dash: '6 3',
  },
  {
    id: '2n',
    label: 'O(2ⁿ)',
    name: 'Exponential',
    meaning: 'Every extra item doubles the work. Only tiny inputs are practical.',
    example: 'Trying every subset of a set',
    fn: (n) => 2 ** n,
    color: 'var(--role-swap)',
    dash: '1 4',
  },
];

export function getComplexity(id: string): Complexity | undefined {
  return COMPLEXITIES.find((c) => c.id === id);
}

const NOTATION: Record<string, string> = {
  'O(1)': '1',
  'O(log n)': 'log',
  'O(n)': 'n',
  'O(V + E)': 'n',
  'O(n log n)': 'nlogn',
  'O((V + E) log V)': 'nlogn',
  'O(E log E)': 'nlogn',
  'O(E log V)': 'nlogn',
  'O(n²)': 'n2',
  'O(V²)': 'n2',
  'O(V × E)': 'n2',
  'O(2ⁿ)': '2n',
  // Notations with no curve of their own map to the nearest of the six classes.
  'O(n + k)': 'n',
  'O(d × (n + 10))': 'n',
  'O(n + m)': 'n',
  'O(α(n))': '1',
  'O(V³)': 'n2',
  'O(V × E²)': 'n2',
  'O(n × C)': 'n2',
  'O(n × amount)': 'n2',
  'O(m × n)': 'n2',
  'O(rows × cols)': 'n2',
  'O(n!)': '2n',
};

/** Maps a complexity string used in lesson data to the curve that represents it. */
export function curveForNotation(notation: string): Complexity | undefined {
  const id = NOTATION[notation];
  return id === undefined ? undefined : getComplexity(id);
}

export function formatOps(value: number): string {
  if (!Number.isFinite(value)) return '∞';
  if (value >= 1e9) return value.toExponential(1);
  return Math.round(value).toLocaleString('en-US');
}
