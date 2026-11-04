export class Sender {
  send(to: string) {
    return `mail to ${to}`;
  }
}

export class Shop {
  constructor(readonly sender: Sender) {}
  order(to: string) {
    return this.sender.send(to);
  }
}
