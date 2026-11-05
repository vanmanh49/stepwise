export class Song {
  constructor(
    public title: string,
    public seconds: number,
  ) {}
}

export class Playlist {
  pages: Song[][] = [];

  add(song: Song) {
    const last = this.pages.at(-1);
    if (last && last.length < 3) last.push(song);
    else this.pages.push([song]);
  }
}

export class Duration {
  total(list: Playlist) {
    let sum = 0;
    for (const page of list.pages) {
      for (let i = 0; i < page.length; i++) sum += page[i]!.seconds;
    }
    return sum;
  }
}

export class Search {
  find(list: Playlist, title: string) {
    for (const page of list.pages) {
      for (let i = 0; i < page.length; i++) {
        if (page[i]!.title === title) return title;
      }
    }
    return 'not found';
  }
}

export class Printer {
  lines(list: Playlist) {
    const out: string[] = [];
    let n = 1;
    for (const page of list.pages) {
      for (let i = 0; i < page.length; i++) out.push(`${n++}. ${page[i]!.title}`);
    }
    return out;
  }
}
