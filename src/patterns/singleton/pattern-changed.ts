export class Logger {
  private static instance?: Logger;

  static getInstance() {
    Logger.instance ??= new Logger();
    return Logger.instance;
  }

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
  private logger = Logger.getInstance();

  charge() {
    this.logger.log('info', 'charged the card');
    this.logger.log('debug', 'card ends in 4242');
  }
}

export class CartModule {
  private logger = Logger.getInstance();

  add() {
    this.logger.log('info', 'added a book');
    this.logger.log('debug', 'cart holds 3 items');
  }
}

export class SearchModule {
  private logger = Logger.getInstance();

  find() {
    this.logger.log('info', 'searched for shoes');
    this.logger.log('debug', 'found 12 results');
  }
}

export class DebugSwitch {
  turnOn() {
    Logger.getInstance().setLevel('debug');
  }
}
