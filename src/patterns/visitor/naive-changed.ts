export class Circle {
  constructor(public r: number) {}

  area() {
    return Math.round(Math.PI * this.r * this.r);
  }

  svg() {
    return `<circle r="${this.r}"/>`;
  }

  json() {
    return JSON.stringify({ circle: this.r });
  }
}

export class Rect {
  constructor(
    public w: number,
    public h: number,
  ) {}

  area() {
    return this.w * this.h;
  }

  svg() {
    return `<rect width="${this.w}" height="${this.h}"/>`;
  }

  json() {
    return JSON.stringify({ rect: [this.w, this.h] });
  }
}

export class Triangle {
  constructor(
    public base: number,
    public height: number,
  ) {}

  area() {
    return Math.round((this.base * this.height) / 2);
  }

  svg() {
    return `<polygon points="0,${this.height} ${this.base},${this.height} ${this.base / 2},0"/>`;
  }

  json() {
    return JSON.stringify({ triangle: [this.base, this.height] });
  }
}
