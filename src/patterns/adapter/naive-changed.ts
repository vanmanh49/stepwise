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
  private provider = new NewProvider();

  buy(amount: number) {
    return this.provider.charge(Math.round(amount * 100), 'USD');
  }
}

export class App {
  checkout = new Checkout();
}
