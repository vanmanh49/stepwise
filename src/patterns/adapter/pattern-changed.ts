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

interface Gateway {
  pay(amount: number): string;
}

export class Checkout {
  constructor(private gateway: Gateway) {}

  buy(amount: number) {
    return this.gateway.pay(amount);
  }
}

export class ProviderAdapter {
  constructor(private provider: NewProvider) {}

  pay(amount: number) {
    return this.provider.charge(Math.round(amount * 100), 'USD');
  }
}

export class App {
  checkout = new Checkout(new ProviderAdapter(new NewProvider()));
}
