import type { CallFrame, CallsView, Role } from '../../types/visualization';

/**
 * Records a recursion as it runs. Frames on the current call path are shown as
 * waiting, the innermost one as current, finished frames with their result,
 * and pruned ones as ruled out.
 */
export class CallTree {
  private frames: { id: string; parent?: string; label: string; result?: string; done: boolean; pruned: boolean }[] = [];
  private path: string[] = [];

  call(label: string): string {
    const id = `call${this.frames.length}`;
    const parent = this.path[this.path.length - 1];
    this.frames.push({ id, label, done: false, pruned: false, ...(parent !== undefined && { parent }) });
    this.path.push(id);
    return id;
  }

  /** Ends the innermost call. */
  finish(result?: string | number, pruned = false): void {
    const id = this.path.pop();
    const frame = this.frames.find((f) => f.id === id);
    if (!frame) return;
    frame.done = true;
    frame.pruned = pruned;
    if (result !== undefined) frame.result = String(result);
  }

  get depth(): number {
    return this.path.length;
  }

  view(overrides: Record<string, Role> = {}): CallsView {
    const current = this.path[this.path.length - 1];
    const frames: CallFrame[] = this.frames.map((f) => {
      const role: Role =
        overrides[f.id] ?? (f.id === current ? 'active' : f.pruned ? 'discarded' : f.done ? 'sorted' : 'frontier');
      return { id: f.id, label: f.label, role, ...(f.parent !== undefined && { parent: f.parent }), ...(f.result !== undefined && { result: f.result }) };
    });
    return { kind: 'calls', frames };
  }
}
