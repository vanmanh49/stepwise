import type { View } from '../../../types/visualization';
import { ArrayRenderer } from './ArrayRenderer';
import { BTreeRenderer } from './BTreeRenderer';
import { BucketsRenderer } from './BucketsRenderer';
import { CallsRenderer } from './CallsRenderer';
import { GraphRenderer } from './GraphRenderer';
import { GridRenderer } from './GridRenderer';
import { HeapRenderer } from './HeapRenderer';
import { ListRenderer } from './ListRenderer';
import { PanelsRenderer } from './PanelsRenderer';
import { QueueRenderer } from './QueueRenderer';
import { SessionsRenderer } from './SessionsRenderer';
import { StackRenderer } from './StackRenderer';
import { TableRenderer } from './TableRenderer';
import { TreeRenderer } from './TreeRenderer';

/** Picks the renderer for a view. Adding a view kind means adding one case here. */
export function StepView({ view }: { view: View }) {
  switch (view.kind) {
    case 'array':
      return <ArrayRenderer view={view} />;
    case 'linked-list':
      return <ListRenderer view={view} />;
    case 'stack':
      return <StackRenderer view={view} />;
    case 'queue':
      return <QueueRenderer view={view} />;
    case 'tree':
      return <TreeRenderer view={view} />;
    case 'heap':
      return <HeapRenderer view={view} />;
    case 'graph':
      return <GraphRenderer view={view} />;
    case 'table':
      return <TableRenderer view={view} />;
    case 'grid':
      return <GridRenderer view={view} />;
    case 'calls':
      return <CallsRenderer view={view} />;
    case 'buckets':
      return <BucketsRenderer view={view} />;
    case 'btree':
      return <BTreeRenderer view={view} />;
    case 'sessions':
      return <SessionsRenderer view={view} />;
    case 'panels':
      return <PanelsRenderer view={view} renderView={(panel) => <StepView view={panel} />} />;
  }
}
