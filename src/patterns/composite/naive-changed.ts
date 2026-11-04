export class File {
  constructor(
    public name: string,
    public bytes: number,
  ) {}
}

export class Folder {
  constructor(
    public name: string,
    public items: (File | Folder | Zip)[],
  ) {}
}

export class Zip {
  constructor(
    public name: string,
    public items: (File | Folder | Zip)[],
  ) {}
}

export class SizeReport {
  total(folder: Folder | Zip): number {
    let sum = 0;
    for (const item of folder.items) {
      if (item instanceof File) sum += item.bytes;
      else if (item instanceof Folder) sum += this.total(item);
      else if (item instanceof Zip) sum += Math.ceil(this.total(item) / 2);
    }
    return sum;
  }
}

export class CountReport {
  count(folder: Folder | Zip): number {
    let files = 0;
    for (const item of folder.items) {
      if (item instanceof File) files += 1;
      else if (item instanceof Folder) files += this.count(item);
      else if (item instanceof Zip) files += this.count(item);
    }
    return files;
  }
}
