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
}

export class Duration {
  total(list: Playlist) {
    let sum = 0;
    for (let i = 0; i < list.songs.length; i++) sum += list.songs[i]!.seconds;
    return sum;
  }
}

export class Search {
  find(list: Playlist, title: string) {
    for (let i = 0; i < list.songs.length; i++) {
      if (list.songs[i]!.title === title) return title;
    }
    return 'not found';
  }
}

export class Printer {
  lines(list: Playlist) {
    const out: string[] = [];
    for (let i = 0; i < list.songs.length; i++) out.push(`${i + 1}. ${list.songs[i]!.title}`);
    return out;
  }
}
