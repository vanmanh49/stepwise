import { design, type PatternLesson } from '../steps';
import * as naive from './naive';
import * as naiveChanged from './naive-changed';
import naiveChangedSource from './naive-changed.ts?raw';
import naiveSource from './naive.ts?raw';
import * as pattern from './pattern';
import * as patternChanged from './pattern-changed';
import patternChangedSource from './pattern-changed.ts?raw';
import patternSource from './pattern.ts?raw';

export const CHANNELS = ['Email', 'SMS', 'Push'];
const WORD: Record<string, string> = { Email: 'email', SMS: 'sms', Push: 'push' };
const USER = 'ann';

type Flows = [{ welcome(user: string): string }, { reset(user: string): string }, { receipt(user: string): string }];

export const factoryMethodLesson: PatternLesson = {
  designs: {
    naive: design(naiveSource, naive),
    naiveChanged: design(naiveChangedSource, naiveChanged),
    pattern: design(patternSource, pattern),
    patternChanged: design(patternChangedSource, patternChanged),
  },
  change: 'Add Push',
  scenario: { name: 'channel', label: 'Channel', options: CHANNELS, help: 'How the app reaches its users. Push exists only after the change.', afterChangeOnly: ['Push'] },
  run(choice, channel, t) {
    const word = WORD[channel]!;
    let flows: Flows;
    if (choice.pattern) {
      // The unchanged module has no Push classes, and Push is refused before the change.
      const m = (choice.changed ? patternChanged : pattern) as typeof patternChanged;
      const notifier = channel === 'Email' ? new m.EmailNotifier() : channel === 'SMS' ? new m.SmsNotifier() : new m.PushNotifier();
      t.register(notifier);
      flows = [new m.SignupFlow(notifier), new m.ResetFlow(notifier), new m.ReceiptFlow(notifier)];
    } else {
      const m = choice.changed ? naiveChanged : naive;
      flows = [new m.SignupFlow(word), new m.ResetFlow(word), new m.ReceiptFlow(word)];
    }
    for (const flow of flows) t.register(flow);
    const sent: [string, string, string] = [flows[0].welcome(USER), flows[1].reset(USER), flows[2].receipt(USER)];
    const ok = sent.every((s) => s.startsWith(`${word} to`));
    return {
      ok,
      title: `All 3 messages went out by ${word}`,
      why: choice.pattern
        ? `Each flow asked its notifier to notify, and the ${channel} notifier's createMessage chose the message class. The flows never name it.`
        : `Each flow checked the channel itself and picked the message class with its own if.`,
      facts: [
        ['Signup', sent[0]],
        ['Reset', sent[1]],
        ['Receipt', sent[2]],
      ],
    };
  },
  notes: {
    'Notifier.notify': 'notify is written once, in the base class. It asks this.createMessage() for a message, without knowing which kind it gets.',
    'EmailNotifier.createMessage': 'This is the factory method: EmailNotifier answers it by making an EmailMessage.',
    'SmsNotifier.createMessage': 'This is the factory method: SmsNotifier answers it by making an SmsMessage.',
    'PushNotifier.createMessage': 'This is the factory method: the new PushNotifier answers it by making a PushMessage.',
    'SignupFlow.welcome': 'The signup flow sends a welcome message.',
    'ResetFlow.reset': 'The password reset flow sends a code.',
    'ReceiptFlow.receipt': 'The checkout flow sends a receipt.',
  },
};
