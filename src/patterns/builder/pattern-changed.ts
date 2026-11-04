export class Request {
  constructor(
    readonly url: string,
    readonly method: string,
    readonly body: string | null,
    readonly json: boolean,
    readonly timeoutMs: number,
    readonly retries: number,
  ) {}

  send() {
    return `${this.method} ${this.url} (timeout ${this.timeoutMs} ms, ${this.retries} retries)`;
  }
}

export class RequestBuilder {
  private method = 'GET';
  private body: string | null = null;
  private json = false;
  private timeoutMs = 10000;
  private retryCount = 0;

  constructor(private url: string) {}

  post(body: string) {
    this.method = 'POST';
    this.body = body;
    return this;
  }

  asJson() {
    this.json = true;
    return this;
  }

  timeout(ms: number) {
    this.timeoutMs = ms;
    return this;
  }

  retries(count: number) {
    this.retryCount = count;
    return this;
  }

  build() {
    return new Request(this.url, this.method, this.body, this.json, this.timeoutMs, this.retryCount);
  }
}

export class ProfilePage {
  load() {
    return new RequestBuilder('/me').build();
  }
}

export class UploadPage {
  save(photo: string) {
    return new RequestBuilder('/photos').post(photo).timeout(30000).retries(3).build();
  }
}

export class SearchPage {
  find(text: string) {
    return new RequestBuilder(`/search?q=${text}`).asJson().timeout(5000).retries(2).build();
  }
}
