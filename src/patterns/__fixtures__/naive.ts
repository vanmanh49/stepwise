export class Mailer {
  send(to: string) {
    return `mail to ${to}`;
  }
}

export class Shop {
  mailer = new Mailer();
  order(to: string) {
    return this.mailer.send(to);
  }
}
