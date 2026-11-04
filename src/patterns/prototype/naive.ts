export class Enemy {
  constructor(
    public name: string,
    public hp: number,
    public speed: number,
    public loot: string[],
  ) {}

  pickUp(item: string) {
    this.loot.push(item);
  }
}

export class Spawner {
  spawnLike(template: Enemy, deep: boolean) {
    const loot = deep ? [...template.loot] : template.loot;
    return new Enemy(template.name, template.hp, template.speed, loot);
  }
}
