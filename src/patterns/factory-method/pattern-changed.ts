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

export class PushMessage {
  send(to: string, text: string) {
    return `push to ${to}: ${text}`;
  }
}

interface Message {
  send(to: string, text: string): string;
}

export abstract class Notifier {
  abstract createMessage(): Message;

  notify(to: string, text: string) {
    const message = this.createMessage();
    return message.send(to, text);
  }
}

export class EmailNotifier extends Notifier {
  createMessage() {
    return new EmailMessage();
  }
}

export class SmsNotifier extends Notifier {
  createMessage() {
    return new SmsMessage();
  }
}

export class PushNotifier extends Notifier {
  createMessage() {
    return new PushMessage();
  }
}

export class SignupFlow {
  constructor(private notifier: Notifier) {}

  welcome(user: string) {
    return this.notifier.notify(user, 'Welcome!');
  }
}

export class ResetFlow {
  constructor(private notifier: Notifier) {}

  reset(user: string) {
    return this.notifier.notify(user, 'Your code is 4821');
  }
}

export class ReceiptFlow {
  constructor(private notifier: Notifier) {}

  receipt(user: string) {
    return this.notifier.notify(user, 'You paid $20');
  }
}
