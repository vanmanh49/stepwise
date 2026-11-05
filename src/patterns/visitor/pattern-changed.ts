interface Visitor<R> {
  visitCircle(c: Circle): R;
  visitRect(r: Rect): R;
  visitTriangle(t: Triangle): R;
}

export class Circle {
  constructor(public r: number) {}

  accept<R>(v: Visitor<R>) {
    return v.visitCircle(this);
  }
}

export class Rect {
  constructor(
    public w: number,
    public h: number,
  ) {}

  accept<R>(v: Visitor<R>) {
    return v.visitRect(this);
  }
}

export class Triangle {
  constructor(
    public base: number,
    public height: number,
  ) {}

  accept<R>(v: Visitor<R>) {
    return v.visitTriangle(this);
  }
}

export class AreaVisitor {
  visitCircle(c: Circle) {
    return Math.round(Math.PI * c.r * c.r);
  }

  visitRect(r: Rect) {
    return r.w * r.h;
  }

  visitTriangle(t: Triangle) {
    return Math.round((t.base * t.height) / 2);
  }
}

export class SvgVisitor {
  visitCircle(c: Circle) {
    return `<circle r="${c.r}"/>`;
  }

  visitRect(r: Rect) {
    return `<rect width="${r.w}" height="${r.h}"/>`;
  }

  visitTriangle(t: Triangle) {
    return `<polygon points="0,${t.height} ${t.base},${t.height} ${t.base / 2},0"/>`;
  }
}

export class JsonVisitor {
  visitCircle(c: Circle) {
    return JSON.stringify({ circle: c.r });
  }

  visitRect(r: Rect) {
    return JSON.stringify({ rect: [r.w, r.h] });
  }

  visitTriangle(t: Triangle) {
    return JSON.stringify({ triangle: [t.base, t.height] });
  }
}
