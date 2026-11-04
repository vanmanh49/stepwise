export class Logger {
  level = 'info';
  lines: string[] = [];

  setLevel(level: string) {
    this.level = level;
  }

  log(level: string, text: string) {
    if (level === 'debug' && this.level !== 'debug') return;
    this.lines.push(`${level}: ${text}`);
  }
}

export class BillingModule {
  private logger = new Logger();

  charge() {
    this.logger.log('info', 'charged the card');
    this.logger.log('debug', 'card ends in 4242');
  }

  enableDebug() {
    this.logger.setLevel('debug');
  }
}

export class CartModule {
  private logger = new Logger();

  add() {
    this.logger.log('info', 'added a book');
    this.logger.log('debug', 'cart holds 3 items');
  }

  enableDebug() {
    this.logger.setLevel('debug');
  }
}

export class SearchModule {
  private logger = new Logger();

  find() {
    this.logger.log('info', 'searched for shoes');
    this.logger.log('debug', 'found 12 results');
  }

  enableDebug() {
    this.logger.setLevel('debug');
  }
}

export class DebugSwitch {
  turnOn(modules: { enableDebug(): void }[]) {
    for (const module of modules) module.enableDebug();
  }
}
