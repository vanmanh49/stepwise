/** A min-heap of timed items: earliest time first, and items at the same time in the order they were pushed. */
export class EventQueue<T> {
  private heap: { time: number; seq: number; item: T }[] = [];
  private seq = 0;

  get size(): number {
    return this.heap.length;
  }

  push(time: number, item: T): void {
    this.heap.push({ time, seq: this.seq++, item });
    let i = this.heap.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (!this.before(i, parent)) break;
      this.swap(i, parent);
      i = parent;
    }
  }

  pop(): { time: number; item: T } | undefined {
    const top = this.heap[0];
    if (!top) return undefined;
    const last = this.heap.pop()!;
    if (this.heap.length > 0) {
      this.heap[0] = last;
      let i = 0;
      for (;;) {
        const left = 2 * i + 1;
        const right = left + 1;
        let smallest = i;
        if (left < this.heap.length && this.before(left, smallest)) smallest = left;
        if (right < this.heap.length && this.before(right, smallest)) smallest = right;
        if (smallest === i) break;
        this.swap(i, smallest);
        i = smallest;
      }
    }
    return { time: top.time, item: top.item };
  }

  private before(a: number, b: number): boolean {
    const x = this.heap[a]!;
    const y = this.heap[b]!;
    return x.time < y.time || (x.time === y.time && x.seq < y.seq);
  }

  private swap(a: number, b: number): void {
    [this.heap[a], this.heap[b]] = [this.heap[b]!, this.heap[a]!];
  }
}
