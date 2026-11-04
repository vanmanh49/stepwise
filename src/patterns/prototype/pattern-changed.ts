export class Enemy {
  constructor(
    public name: string,
    public hp: number,
    public speed: number,
    public loot: string[],
    public shield = 0,
  ) {}

  pickUp(item: string) {
    this.loot.push(item);
  }

  clone(deep: boolean) {
    const copy = Object.assign(Object.create(Enemy.prototype) as Enemy, this);
    if (deep) copy.loot = [...this.loot];
    return copy;
  }
}

export class Spawner {
  spawnLike(template: Enemy, deep: boolean) {
    return template.clone(deep);
  }
}
