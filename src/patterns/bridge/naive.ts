export class CanvasCircle {
  radius = 5;

  draw() {
    return `arc(0, 0, ${this.radius})`;
  }
}

export class CanvasSquare {
  side = 10;

  draw() {
    return `rect(0, 0, ${this.side}, ${this.side})`;
  }
}

export class TextCircle {
  draw() {
    return '( )';
  }
}

export class TextSquare {
  draw() {
    return '[ ]';
  }
}
