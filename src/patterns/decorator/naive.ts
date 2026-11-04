function compress(data: string) {
  return data.replace(/([\s\S])\1*/g, (run, ch: string) => `${ch}${run.length}`);
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
