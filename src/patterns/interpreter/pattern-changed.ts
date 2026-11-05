type Ctx = Record<string, number>;

interface Expr {
  interpret(ctx: Ctx): number;
  print(): string;
}

export class Num {
  constructor(public n: number) {}

  interpret() {
    return this.n;
  }

  print() {
    return String(this.n);
  }
}

export class Var {
  constructor(public name: string) {}

  interpret(ctx: Ctx) {
    const value = ctx[this.name];
    if (value === undefined) throw new Error(`Unknown variable ${this.name}`);
    return value;
  }

  print() {
    return this.name;
  }
}

export class Add {
  constructor(
    public left: Expr,
    public right: Expr,
  ) {}

  interpret(ctx: Ctx) {
    return this.left.interpret(ctx) + this.right.interpret(ctx);
  }

  print() {
    return `${this.left.print()} + ${this.right.print()}`;
  }
}

export class Mul {
  constructor(
    public left: Expr,
    public right: Expr,
  ) {}

  interpret(ctx: Ctx) {
    return this.left.interpret(ctx) * this.right.interpret(ctx);
  }

  print() {
    const side = (e: Expr) => (e instanceof Add ? `(${e.print()})` : e.print());
    return `${side(this.left)} * ${side(this.right)}`;
  }
}

export class Max {
  constructor(
    public left: Expr,
    public right: Expr,
  ) {}

  interpret(ctx: Ctx) {
    return Math.max(this.left.interpret(ctx), this.right.interpret(ctx));
  }

  print() {
    return `max(${this.left.print()}, ${this.right.print()})`;
  }
}
