export class Hero {
  hp = 100;
  gold = 50;
  x = 3;
  inventory: string[] = [];

  fight(win: boolean) {
    this.inventory.push('potion');
    this.x = 9;
    if (win) this.gold = 80;
    else [this.hp, this.gold] = [0, 20];
  }

  status() {
    return `hp ${this.hp}, gold ${this.gold}, x ${this.x}, items: ${this.inventory.join(', ') || 'none'}`;
  }
}

export class SaveSlot {
  private saved = { hp: 0, gold: 0, x: 0, inventory: [] as string[] };

  save(hero: Hero) {
    this.saved = { hp: hero.hp, gold: hero.gold, x: hero.x, inventory: [...hero.inventory] };
  }

  load(hero: Hero) {
    hero.hp = this.saved.hp;
    hero.gold = this.saved.gold;
    hero.x = this.saved.x;
    hero.inventory = [...this.saved.inventory];
  }
}
