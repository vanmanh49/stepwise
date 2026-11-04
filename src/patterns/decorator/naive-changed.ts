function compress(data: string) {
  return data.replace(/([\s\S])\1*/g, (run, ch: string) => `${ch}${run.length}`);
}

const KEY = 'k3y';

function encrypt(data: string) {
  return [...data].map((ch, i) => String.fromCharCode(ch.charCodeAt(0) ^ KEY.charCodeAt(i % KEY.length))).join('');
}

export class FileSink {
  stored = '';
  log: string[] = [];

  write(data: string) {
    this.stored = data;
    return data.length;
  }
}

export class LoggingSink extends FileSink {
  write(data: string) {
    this.log.push(`writing ${data.length} bytes`);
    return super.write(data);
  }
}

export class CompressingSink extends FileSink {
  write(data: string) {
    return super.write(compress(data));
  }
}

export class LoggingCompressingSink extends FileSink {
  write(data: string) {
    this.log.push(`writing ${data.length} bytes`);
    return super.write(compress(data));
  }
}

export class EncryptingSink extends FileSink {
  write(data: string) {
    return super.write(encrypt(data));
  }
}

export class LoggingEncryptingSink extends FileSink {
  write(data: string) {
    this.log.push(`writing ${data.length} bytes`);
    return super.write(encrypt(data));
  }
}

export class CompressingEncryptingSink extends FileSink {
  write(data: string) {
    return super.write(encrypt(compress(data)));
  }
}

export class LoggingCompressingEncryptingSink extends FileSink {
  write(data: string) {
    this.log.push(`writing ${data.length} bytes`);
    return super.write(encrypt(compress(data)));
  }
}
