interface Item {
  size(): number;
  count(): number;
}

export class File {
  constructor(
    public name: string,
    public bytes: number,
  ) {}

  size() {
    return this.bytes;
  }

  count() {
    return 1;
  }
}

export class Folder {
  constructor(
    public name: string,
    public items: Item[],
  ) {}

  size() {
    return this.items.reduce((sum, item) => sum + item.size(), 0);
  }

  count() {
    return this.items.reduce((files, item) => files + item.count(), 0);
  }
}

export class Zip {
  constructor(
    public name: string,
    public items: Item[],
  ) {}

  size() {
    return Math.ceil(this.items.reduce((sum, item) => sum + item.size(), 0) / 2);
  }

  count() {
    return this.items.reduce((files, item) => files + item.count(), 0);
  }
}
