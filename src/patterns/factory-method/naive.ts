export class EmailMessage {
  send(to: string, text: string) {
    return `email to ${to}: ${text}`;
  }
}

export class SmsMessage {
  send(to: string, text: string) {
    return `sms to ${to}: ${text}`;
  }
}

export class SignupFlow {
  constructor(private channel: string) {}

  welcome(user: string) {
    if (this.channel === 'email') return new EmailMessage().send(user, 'Welcome!');
    return new SmsMessage().send(user, 'Welcome!');
  }
}

export class ResetFlow {
  constructor(private channel: string) {}

  reset(user: string) {
    if (this.channel === 'email') return new EmailMessage().send(user, 'Your code is 4821');
    return new SmsMessage().send(user, 'Your code is 4821');
  }
}

export class ReceiptFlow {
  constructor(private channel: string) {}

  receipt(user: string) {
    if (this.channel === 'email') return new EmailMessage().send(user, 'You paid $20');
    return new SmsMessage().send(user, 'You paid $20');
  }
}
