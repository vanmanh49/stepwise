export class HeroMemento {
  constructor(readonly state: object) {}
}

export class Hero {
  private hp = 100;
  private gold = 50;
  private x = 3;

  fight(win: boolean) {
    this.x = 9;
    if (win) this.gold = 80;
    else [this.hp, this.gold] = [0, 20];
  }

  save() {
    return new HeroMemento(structuredClone({ ...this }));
  }

  restore(memento: HeroMemento) {
    Object.assign(this, structuredClone(memento.state));
  }

  status() {
    return `hp ${this.hp}, gold ${this.gold}, x ${this.x}`;
  }
}

export class SaveSlots {
  private saves: HeroMemento[] = [];

  keep(memento: HeroMemento) {
    this.saves.push(memento);
  }

  latest() {
    return this.saves.at(-1)!;
  }
}
