export class OldGateway {
  pay(amount: number) {
    return `paid $${amount.toFixed(2)}`;
  }
}

export class NewProvider {
  charge(cents: number, currency: string) {
    return `charged ${cents} ${currency}`;
  }
}

export class Checkout {
  private gateway = new OldGateway();

  buy(amount: number) {
    return this.gateway.pay(amount);
  }
}

export class App {
  checkout = new Checkout();
}
