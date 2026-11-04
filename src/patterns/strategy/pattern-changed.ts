interface PricingRule {
  apply(prices: number[]): number;
}

const sum = (prices: number[]) => prices.reduce((a, b) => a + b, 0);

export class RegularPrice {
  apply(prices: number[]) {
    return sum(prices);
  }
}

export class MemberPrice {
  apply(prices: number[]) {
    return Math.round((sum(prices) * 90) / 100);
  }
}

export class SalePrice {
  apply(prices: number[]) {
    const big = sum(prices.filter((price) => price >= 2000));
    return Math.round(sum(prices) - (big * 20) / 100);
  }
}

export class BulkPrice {
  apply(prices: number[]) {
    if (prices.length < 10) return sum(prices);
    return Math.round((sum(prices) * 85) / 100);
  }
}

export class Cart {
  constructor(
    public prices: number[],
    public rule: PricingRule,
  ) {}

  setRule(rule: PricingRule) {
    this.rule = rule;
  }

  total() {
    return this.rule.apply(this.prices);
  }
}
