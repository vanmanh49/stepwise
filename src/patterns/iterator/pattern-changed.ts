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

  iterator() {
    return new PlaylistIterator(this);
  }
}

export class PlaylistIterator {
  private page = 0;
  private index = 0;

  constructor(private list: Playlist) {}

  hasNext() {
    return this.page < this.list.pages.length;
  }

  next() {
    const page = this.list.pages[this.page]!;
    const song = page[this.index++]!;
    if (this.index === page.length) [this.page, this.index] = [this.page + 1, 0];
    return song;
  }
}

export class Duration {
  total(list: Playlist) {
    let sum = 0;
    const it = list.iterator();
    while (it.hasNext()) sum += it.next().seconds;
    return sum;
  }
}

export class Search {
  find(list: Playlist, title: string) {
    const it = list.iterator();
    while (it.hasNext()) {
      if (it.next().title === title) return title;
    }
    return 'not found';
  }
}

export class Printer {
  lines(list: Playlist) {
    const out: string[] = [];
    const it = list.iterator();
    for (let n = 1; it.hasNext(); n++) out.push(`${n}. ${it.next().title}`);
    return out;
  }
}
