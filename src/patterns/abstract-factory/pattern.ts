export class LightButton {
  render() { return 'light button'; }
}

export class LightDialog {
  render() { return 'light dialog'; }
}

export class DarkButton {
  render() { return 'dark button'; }
}

export class DarkDialog {
  render() { return 'dark dialog'; }
}

interface Widget {
  render(): string;
}

interface WidgetFactory {
  createButton(): Widget;
  createDialog(): Widget;
}

export class LightFactory {
  createButton() { return new LightButton(); }
  createDialog() { return new LightDialog(); }
}

export class DarkFactory {
  createButton() { return new DarkButton(); }
  createDialog() { return new DarkDialog(); }
}

export class SettingsScreen {
  constructor(private factory: WidgetFactory) {}

  render() {
    const button = this.factory.createButton();
    const dialog = this.factory.createDialog();
    return [button.render(), dialog.render()];
  }
}

export class AboutScreen {
  constructor(private factory: WidgetFactory) {}

  render() {
    const button = this.factory.createButton();
    const dialog = this.factory.createDialog();
    return [button.render(), dialog.render()];
  }
}
