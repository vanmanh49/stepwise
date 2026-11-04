export class Cart {
  rule = 'regular';

  constructor(public prices: number[]) {}

  setRule(rule: string) {
    this.rule = rule;
  }

  total() {
    const sum = this.prices.reduce((a, b) => a + b, 0);
    if (this.rule === 'member') return Math.round((sum * 90) / 100);
    if (this.rule === 'sale') {
      const big = this.prices.filter((price) => price >= 2000).reduce((a, b) => a + b, 0);
      return Math.round(sum - (big * 20) / 100);
    }
    if (this.rule === 'bulk' && this.prices.length >= 10) return Math.round((sum * 85) / 100);
    return sum;
  }
}
