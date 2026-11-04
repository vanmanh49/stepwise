interface Observer {
  update(temp: number): void;
}

export class PhoneDisplay {
  shown: number[] = [];

  update(temp: number) {
    this.shown.push(temp);
  }
}

export class WebDisplay {
  shown: number[] = [];

  update(temp: number) {
    this.shown.push(temp);
  }
}

export class Station {
  observers: Observer[] = [];

  subscribe(observer: Observer) {
    this.observers.push(observer);
  }

  unsubscribe(observer: Observer) {
    this.observers = this.observers.filter((o) => o !== observer);
  }

  setReading(temp: number) {
    for (const observer of this.observers) observer.update(temp);
  }
}
