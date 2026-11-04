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

export class ContrastButton {
  render() { return 'high-contrast button'; }
}

export class ContrastDialog {
  render() { return 'high-contrast dialog'; }
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

export class ContrastFactory {
  createButton() { return new ContrastButton(); }
  createDialog() { return new ContrastDialog(); }
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
