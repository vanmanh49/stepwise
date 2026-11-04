export class Sender {
  send(to: string) {
    return `mail to ${to}`;
  }
}

export class Pager {
  page(to: string) {
    return `page to ${to}`;
  }
}

export class Shop {
  constructor(readonly sender: Sender) {}
  order(to: string) {
    return to === 'Cy' ? new Pager().page(to) : this.sender.send(to);
  }
}
