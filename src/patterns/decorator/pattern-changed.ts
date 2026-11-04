function compress(data: string) {
  return data.replace(/([\s\S])\1*/g, (run, ch: string) => `${ch}${run.length}`);
}

const KEY = 'k3y';

function encrypt(data: string) {
  return [...data].map((ch, i) => String.fromCharCode(ch.charCodeAt(0) ^ KEY.charCodeAt(i % KEY.length))).join('');
}

interface Sink {
  write(data: string): number;
}

export class FileSink {
  stored = '';

  write(data: string) {
    this.stored = data;
    return data.length;
  }
}

export class LoggingSink {
  log: string[] = [];

  constructor(private inner: Sink) {}

  write(data: string) {
    this.log.push(`writing ${data.length} bytes`);
    return this.inner.write(data);
  }
}

export class CompressingSink {
  constructor(private inner: Sink) {}

  write(data: string) {
    return this.inner.write(compress(data));
  }
}

export class EncryptingSink {
  constructor(private inner: Sink) {}

  write(data: string) {
    return this.inner.write(encrypt(data));
  }
}
