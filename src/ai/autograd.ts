/** A scalar with a gradient: the tiny reverse-mode autograd used to train the model. */
export class Value {
  grad = 0;
  private readonly parents: Value[];
  /** Adds this node's gradient into its parents' gradients. */
  private readonly pushBack: () => void;

  constructor(
    public data: number,
    parents: Value[] = [],
    pushBack: () => void = () => {},
  ) {
    this.parents = parents;
    this.pushBack = pushBack;
  }

  add(o: Value | number): Value {
    const other = wrap(o);
    const out: Value = new Value(this.data + other.data, [this, other], () => {
      this.grad += out.grad;
      other.grad += out.grad;
    });
    return out;
  }

  mul(o: Value | number): Value {
    const other = wrap(o);
    const out: Value = new Value(this.data * other.data, [this, other], () => {
      this.grad += other.data * out.grad;
      other.grad += this.data * out.grad;
    });
    return out;
  }

  pow(k: number): Value {
    const out: Value = new Value(this.data ** k, [this], () => {
      this.grad += k * this.data ** (k - 1) * out.grad;
    });
    return out;
  }

  exp(): Value {
    const out: Value = new Value(Math.exp(this.data), [this], () => {
      this.grad += out.data * out.grad;
    });
    return out;
  }

  log(): Value {
    const out: Value = new Value(Math.log(this.data), [this], () => {
      this.grad += out.grad / this.data;
    });
    return out;
  }

  relu(): Value {
    const out: Value = new Value(Math.max(0, this.data), [this], () => {
      this.grad += (this.data > 0 ? 1 : 0) * out.grad;
    });
    return out;
  }

  neg = () => this.mul(-1);
  sub = (o: Value | number) => this.add(wrap(o).neg());
  div = (o: Value | number) => this.mul(wrap(o).pow(-1));

  /** Sets this node's gradient to 1 and pushes gradients back through the graph, without recursion. */
  backward(): void {
    const order: Value[] = [];
    const seen = new Set<Value>();
    const stack: [Value, boolean][] = [[this, false]];
    while (stack.length > 0) {
      const [node, expanded] = stack.pop()!;
      if (expanded) {
        order.push(node);
        continue;
      }
      if (seen.has(node)) continue;
      seen.add(node);
      stack.push([node, true]);
      for (const p of node.parents) if (!seen.has(p)) stack.push([p, false]);
    }
    this.grad = 1;
    for (let i = order.length - 1; i >= 0; i--) order[i]!.pushBack();
  }
}

const wrap = (o: Value | number) => (o instanceof Value ? o : new Value(o));
