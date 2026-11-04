export class Inventory {
  reserve(sku: string) {
    return `reserved ${sku}`;
  }
}

export class Payment {
  charge(amount: number) {
    return `charged $${amount}`;
  }
}

export class Shipping {
  book(address: string) {
    return `shipping to ${address}`;
  }
}

export class WebShop {
  constructor(private inventory: Inventory, private payment: Payment, private shipping: Shipping) {}

  order(sku: string, amount: number, address: string) {
    return [this.inventory.reserve(sku), this.payment.charge(amount), this.shipping.book(address)];
  }
}

export class MobileApp {
  constructor(private inventory: Inventory, private payment: Payment, private shipping: Shipping) {}

  order(sku: string, amount: number, address: string) {
    return [this.inventory.reserve(sku), this.payment.charge(amount), this.shipping.book(address)];
  }
}

export class PhoneOrders {
  constructor(private inventory: Inventory, private payment: Payment, private shipping: Shipping) {}

  order(sku: string, amount: number, address: string) {
    return [this.inventory.reserve(sku), this.payment.charge(amount), this.shipping.book(address)];
  }
}
