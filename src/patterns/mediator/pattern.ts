export class TextField {
  value = '';
  visible = true;

  constructor(public dialog: SignupDialog) {}

  type(text: string) {
    this.value = text;
    this.dialog.changed(this);
  }
}

export class Checkbox {
  checked = false;

  constructor(public dialog: SignupDialog) {}

  toggle() {
    this.checked = !this.checked;
    this.dialog.changed(this);
  }
}

export class SubmitButton {
  enabled = false;
}

export class SignupDialog {
  name = new TextField(this);
  company = new TextField(this);
  account = new Checkbox(this);
  submit = new SubmitButton();

  constructor() {
    this.company.visible = false;
  }

  changed(sender: TextField | Checkbox) {
    if (sender === this.account) this.company.visible = this.account.checked;
    const companyOk = this.account.checked ? this.company.value !== '' : true;
    this.submit.enabled = this.name.value !== '' && companyOk;
  }
}
