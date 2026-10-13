import type { Cell, TreeView } from '../../../types/visualization';

/** x is the inorder position and y is the depth, so siblings never overlap. */
export function layoutTree(view: TreeView): { id: string; x: number; y: number }[] {
  const byId = new Map(view.nodes.map((n) => [n.id, n]));
  const result: { id: string; x: number; y: number }[] = [];
  let column = 0;
  const walk = (id: string | undefined, depth: number): void => {
    const node = id === undefined ? undefined : byId.get(id);
    if (!node) return;
    walk(node.left, depth + 1);
    result.push({ id: node.id, x: column++, y: depth });
    walk(node.right, depth + 1);
  };
  walk(view.root, 0);
  return result;
}

export function heapToTree(items: Cell[]): TreeView {
  const nodes = items.map((cell, i) => {
    const left = items[2 * i + 1];
    const right = items[2 * i + 2];
    return {
      id: cell.id,
      value: Number(cell.value),
      role: cell.role,
      ...(left && { left: left.id }),
      ...(right && { right: right.id }),
    };
  });
  return { kind: 'tree', nodes, ...(items[0] && { root: items[0].id }) };
}
