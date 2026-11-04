interface Renderer {
  circle(radius: number): string;
  square(side: number): string;
}

export class CanvasRenderer {
  circle(radius: number) {
    return `arc(0, 0, ${radius})`;
  }

  square(side: number) {
    return `rect(0, 0, ${side}, ${side})`;
  }
}

export class TextRenderer {
  circle() {
    return '( )';
  }

  square() {
    return '[ ]';
  }
}

export class SvgRenderer {
  circle(radius: number) {
    return `<circle r="${radius}"/>`;
  }

  square(side: number) {
    return `<rect width="${side}" height="${side}"/>`;
  }
}

export class Circle {
  radius = 5;

  constructor(public renderer: Renderer) {}

  draw() {
    return this.renderer.circle(this.radius);
  }
}

export class Square {
  side = 10;

  constructor(public renderer: Renderer) {}

  draw() {
    return this.renderer.square(this.side);
  }
}
