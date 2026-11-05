export class TextField {
  value = '';
  visible = true;
  listener?: SubmitButton;

  type(text: string) {
    this.value = text;
    this.listener?.refresh();
  }
}

export class SubmitButton {
  enabled = false;
  checkbox?: Checkbox;

  constructor(
    public name: TextField,
    public company: TextField,
    public vat: TextField,
  ) {}

  refresh() {
    const companyOk = this.checkbox!.checked ? this.company.value !== '' && this.vat.value !== '' : true;
    this.enabled = this.name.value !== '' && companyOk;
  }
}

export class Checkbox {
  checked = false;

  constructor(
    public company: TextField,
    public vat: TextField,
    public submit: SubmitButton,
  ) {}

  toggle() {
    this.checked = !this.checked;
    this.company.visible = this.checked;
    this.vat.visible = this.checked;
    this.submit.refresh();
  }
}

export class SignupForm {
  name = new TextField();
  company = new TextField();
  vat = new TextField();
  submit = new SubmitButton(this.name, this.company, this.vat);
  account = new Checkbox(this.company, this.vat, this.submit);

  constructor() {
    this.company.visible = false;
    this.vat.visible = false;
    this.submit.checkbox = this.account;
    this.name.listener = this.submit;
    this.company.listener = this.submit;
    this.vat.listener = this.submit;
  }
}
