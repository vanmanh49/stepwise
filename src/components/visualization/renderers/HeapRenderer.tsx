import type { HeapView } from '../../../types/visualization';
import { ArrayRenderer } from './ArrayRenderer';
import { TreeRenderer } from './TreeRenderer';
import { heapToTree } from './treeLayout';

/** The same items drawn twice; shared roles keep the tree and the array in sync. */
export function HeapRenderer({ view }: { view: HeapView }) {
  return (
    <div className="flex flex-col items-center gap-7">
      <div className="flex flex-col items-center gap-2">
        <span className="eyebrow">As a tree</span>
        <TreeRenderer view={heapToTree(view.items)} />
      </div>
      <div className="flex flex-col items-center gap-2">
        <span className="eyebrow">As an array</span>
        <ArrayRenderer view={{ kind: 'array', cells: view.items }} />
      </div>
    </div>
  );
}
