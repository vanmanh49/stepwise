const FORECASTS: Record<string, string> = { Hanoi: '31° sun', Paris: '14° rain', Lima: '19° cloud' };

interface Weather {
  forecast(city: string): string;
}

export class WeatherApi {
  calls = 0;

  forecast(city: string) {
    this.calls += 1;
    return FORECASTS[city] ?? 'no data';
  }
}

export class CachedWeather {
  cache = new Map<string, string>();

  constructor(public api: WeatherApi) {}

  forecast(city: string) {
    const saved = this.cache.get(city);
    if (saved !== undefined) return saved;
    const fresh = this.api.forecast(city);
    this.cache.set(city, fresh);
    return fresh;
  }
}

export class TodayWidget {
  constructor(public weather: Weather) {}

  show(city: string) {
    return `Today: ${this.weather.forecast(city)}`;
  }
}

export class WeekWidget {
  constructor(public weather: Weather) {}

  show(city: string) {
    return `Week: ${this.weather.forecast(city)}`;
  }
}

export class MapWidget {
  constructor(public weather: Weather) {}

  show(city: string) {
    return `Map: ${this.weather.forecast(city)}`;
  }
}
