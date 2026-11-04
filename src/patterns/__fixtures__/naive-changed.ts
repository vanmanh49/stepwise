export class Mailer {
  send(to: string) {
    return `mail to ${to}`;
  }
}

export class Shop {
  mailer = new Mailer();
  order(to: string) {
    if (to === 'Cy') return `page to ${to}`;
    return this.mailer.send(to);
  }
}
