export class Inventory {
  reserve(sku: string) {
    return `reserved ${sku}`;
  }
}

export class Payment {
  capture(amount: number, currency: string) {
    return `captured ${amount} ${currency}`;
  }
}

export class Shipping {
  book(address: string) {
    return `shipping to ${address}`;
  }
}

export class OrderFacade {
  constructor(private inventory: Inventory, private payment: Payment, private shipping: Shipping) {}

  place(sku: string, amount: number, address: string) {
    return [this.inventory.reserve(sku), this.payment.capture(amount, 'USD'), this.shipping.book(address)];
  }
}

export class WebShop {
  constructor(private orders: OrderFacade) {}

  order(sku: string, amount: number, address: string) {
    return this.orders.place(sku, amount, address);
  }
}

export class MobileApp {
  constructor(private orders: OrderFacade) {}

  order(sku: string, amount: number, address: string) {
    return this.orders.place(sku, amount, address);
  }
}

export class PhoneOrders {
  constructor(private orders: OrderFacade) {}

  order(sku: string, amount: number, address: string) {
    return this.orders.place(sku, amount, address);
  }
}
