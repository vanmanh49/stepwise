function paint(name: string) {
  return Array.from({ length: 64 }, (_, i) => (name.charCodeAt(i % name.length) * (i + 1)) % 256);
}

export class TreeType {
  texture: number[];
  bark: number[];

  constructor(public species: string) {
    this.texture = paint(species);
    this.bark = paint(`${species} bark`);
  }
}

export class TreeFactory {
  types = new Map<string, TreeType>();

  get(species: string) {
    let type = this.types.get(species);
    if (!type) {
      type = new TreeType(species);
      this.types.set(species, type);
    }
    return type;
  }
}

export class Tree {
  constructor(
    public x: number,
    public y: number,
    public type: TreeType,
  ) {}
}

export class Forest {
  trees: Tree[] = [];

  constructor(public factory: TreeFactory) {}

  plant(x: number, y: number, species: string) {
    this.trees.push(new Tree(x, y, this.factory.get(species)));
  }

  draw() {
    const oak = this.trees.filter((tree) => tree.type.species === 'oak').length;
    return `${this.trees.length} trees drawn: ${oak} oak, ${this.trees.length - oak} pine`;
  }
}
