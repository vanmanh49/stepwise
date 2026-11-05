export class Song {
  constructor(
    public title: string,
    public seconds: number,
  ) {}
}

export class Playlist {
  songs: Song[] = [];

  add(song: Song) {
    this.songs.push(song);
  }

  iterator() {
    return new PlaylistIterator(this);
  }
}

export class PlaylistIterator {
  private index = 0;

  constructor(private list: Playlist) {}

  hasNext() {
    return this.index < this.list.songs.length;
  }

  next() {
    return this.list.songs[this.index++]!;
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
