export class Hero {
  hp = 100;
  gold = 50;
  x = 3;

  fight(win: boolean) {
    this.x = 9;
    if (win) this.gold = 80;
    else [this.hp, this.gold] = [0, 20];
  }

  status() {
    return `hp ${this.hp}, gold ${this.gold}, x ${this.x}`;
  }
}

export class SaveSlot {
  private saved = { hp: 0, gold: 0, x: 0 };

  save(hero: Hero) {
    this.saved = { hp: hero.hp, gold: hero.gold, x: hero.x };
  }

  load(hero: Hero) {
    hero.hp = this.saved.hp;
    hero.gold = this.saved.gold;
    hero.x = this.saved.x;
  }
}
