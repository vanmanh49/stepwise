function paint(name: string) {
  return Array.from({ length: 64 }, (_, i) => (name.charCodeAt(i % name.length) * (i + 1)) % 256);
}

export class Tree {
  texture: number[];

  constructor(
    public x: number,
    public y: number,
    public species: string,
  ) {
    this.texture = paint(species);
  }
}

export class Forest {
  trees: Tree[] = [];

  plant(x: number, y: number, species: string) {
    this.trees.push(new Tree(x, y, species));
  }

  draw() {
    const oak = this.trees.filter((tree) => tree.species === 'oak').length;
    return `${this.trees.length} trees drawn: ${oak} oak, ${this.trees.length - oak} pine`;
  }
}
