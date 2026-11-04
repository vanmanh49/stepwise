export class File {
  constructor(
    public name: string,
    public bytes: number,
  ) {}
}

export class Folder {
  constructor(
    public name: string,
    public items: (File | Folder)[],
  ) {}
}

export class SizeReport {
  total(folder: Folder): number {
    let sum = 0;
    for (const item of folder.items) {
      if (item instanceof File) sum += item.bytes;
      else if (item instanceof Folder) sum += this.total(item);
    }
    return sum;
  }
}

export class CountReport {
  count(folder: Folder): number {
    let files = 0;
    for (const item of folder.items) {
      if (item instanceof File) files += 1;
      else if (item instanceof Folder) files += this.count(item);
    }
    return files;
  }
}
