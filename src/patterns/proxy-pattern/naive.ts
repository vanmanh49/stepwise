const FORECASTS: Record<string, string> = { Hanoi: '31° sun', Paris: '14° rain', Lima: '19° cloud' };

export class WeatherApi {
  calls = 0;

  forecast(city: string) {
    this.calls += 1;
    return FORECASTS[city] ?? 'no data';
  }
}

export class TodayWidget {
  constructor(public weather: WeatherApi) {}

  show(city: string) {
    return `Today: ${this.weather.forecast(city)}`;
  }
}

export class WeekWidget {
  constructor(public weather: WeatherApi) {}

  show(city: string) {
    return `Week: ${this.weather.forecast(city)}`;
  }
}

export class MapWidget {
  constructor(public weather: WeatherApi) {}

  show(city: string) {
    return `Map: ${this.weather.forecast(city)}`;
  }
}
