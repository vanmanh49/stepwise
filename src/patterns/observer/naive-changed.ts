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

export class HeatAlert {
  alerts: number[] = [];

  check(temp: number) {
    if (temp > 30) this.alerts.push(temp);
  }
}

export class Station {
  constructor(
    public phone: PhoneDisplay,
    public web: WebDisplay,
    public alert: HeatAlert,
  ) {}

  setReading(temp: number) {
    this.phone.show(temp);
    this.web.show(temp);
    this.alert.check(temp);
  }
}
