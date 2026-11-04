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

export class SettingsScreen {
  constructor(private theme: string) {}

  render() {
    let button = new LightButton();
    let dialog = new LightDialog();
    if (this.theme === 'dark') {
      button = new DarkButton();
      dialog = new DarkDialog();
    }
    return [button.render(), dialog.render()];
  }
}

export class AboutScreen {
  constructor(private theme: string) {}

  render() {
    let button = new LightButton();
    const dialog = new LightDialog();
    if (this.theme === 'dark') button = new DarkButton();
    return [button.render(), dialog.render()];
  }
}
