type Expr = Num | Var | Add | Mul;

export class Num {
  constructor(public n: number) {}
}

export class Var {
  constructor(public name: string) {}
}

export class Add {
  constructor(
    public left: Expr,
    public right: Expr,
  ) {}
}

export class Mul {
  constructor(
    public left: Expr,
    public right: Expr,
  ) {}
}

export class Evaluator {
  evaluate(node: Expr, ctx: Record<string, number>): number {
    if (node instanceof Num) return node.n;
    if (node instanceof Var) {
      const value = ctx[node.name];
      if (value === undefined) throw new Error(`Unknown variable ${node.name}`);
      return value;
    }
    if (node instanceof Add) return this.evaluate(node.left, ctx) + this.evaluate(node.right, ctx);
    return this.evaluate(node.left, ctx) * this.evaluate(node.right, ctx);
  }
}

export class Printer {
  print(node: Expr): string {
    if (node instanceof Num) return String(node.n);
    if (node instanceof Var) return node.name;
    if (node instanceof Add) return `${this.print(node.left)} + ${this.print(node.right)}`;
    const side = (e: Expr) => (e instanceof Add ? `(${this.print(e)})` : this.print(e));
    return `${side(node.left)} * ${side(node.right)}`;
  }
}
