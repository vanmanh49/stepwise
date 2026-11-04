export class PhoneDisplay {
  shown: number[] = [];

  show(temp: number) {
    this.shown.push(temp);
  }
}

export class WebDisplay {
  shown: number[] = [];

  show(temp: number) {
    this.shown.push(temp);
  }
}

export class Station {
  constructor(
    public phone: PhoneDisplay,
    public web: WebDisplay,
  ) {}

  setReading(temp: number) {
    this.phone.show(temp);
    this.web.show(temp);
  }
}
