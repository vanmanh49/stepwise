export class Request {
  constructor(
    readonly url: string,
    readonly method = 'GET',
    readonly body: string | null = null,
    readonly json = false,
    readonly timeoutMs = 10000,
  ) {}

  send() {
    return `${this.method} ${this.url} (timeout ${this.timeoutMs} ms)`;
  }
}

export class ProfilePage {
  load() {
    return new Request('/me');
  }
}

export class UploadPage {
  save(photo: string) {
    return new Request('/photos', 'POST', photo, false, 30000);
  }
}

export class SearchPage {
  find(text: string) {
    return new Request(`/search?q=${text}`, 'GET', null, true, 5000);
  }
}
