import { design, type PatternLesson } from '../steps';
import * as naive from './naive';
import * as naiveChanged from './naive-changed';
import naiveChangedSource from './naive-changed.ts?raw';
import naiveSource from './naive.ts?raw';
import * as pattern from './pattern';
import * as patternChanged from './pattern-changed';
import patternChangedSource from './pattern-changed.ts?raw';
import patternSource from './pattern.ts?raw';

export const ACCOUNTS = ['Personal', 'Company, all filled', 'Company, no company name', 'Company, no VAT number'];
const NO_VAT = ACCOUNTS[3]!;

type Field = { value: string; visible: boolean; type(text: string): void };
type Form = { name: Field; company: Field; vat?: Field; account: { checked: boolean; toggle(): void }; submit: { enabled: boolean } };

/** Fields of one widget that point straight at another widget. */
const linksBetween = (widgets: object[]) =>
  widgets.reduce((sum, w) => sum + Object.values(w).filter((v: unknown) => widgets.includes(v as object)).length, 0);

export const mediatorLesson: PatternLesson = {
  designs: {
    naive: design(naiveSource, naive),
    naiveChanged: design(naiveChangedSource, naiveChanged),
    pattern: design(patternSource, pattern),
    patternChanged: design(patternChangedSource, patternChanged),
  },
  change: 'Add a VAT number field',
  scenario: {
    name: 'account',
    label: 'Account',
    options: ACCOUNTS,
    afterChangeOnly: [NO_VAT],
    help: 'What the person fills in. A company account needs a company name, and after the change a VAT number too.',
  },
  run(choice, account, t) {
    const form: Form = choice.pattern
      ? new (choice.changed ? patternChanged : pattern).SignupDialog()
      : new (choice.changed ? naiveChanged : naive).SignupForm();
    t.register(form);
    const widgets = [form.name, form.company, ...(form.vat ? [form.vat] : []), form.account, form.submit];
    for (const w of widgets) t.register(w);
    const company = account !== ACCOUNTS[0];
    if (company) form.account.toggle();
    form.name.type('Lan');
    if (company && account !== ACCOUNTS[2]) form.company.type('Acme');
    if (company && form.vat && account !== NO_VAT) form.vat.type('VN123');
    const links = linksBetween(widgets);
    return {
      ok: true,
      title: `Submit is ${form.submit.enabled ? 'enabled' : 'disabled'}`,
      why: choice.pattern
        ? 'Every widget only told SignupDialog that it changed. The dialog alone decided what to show and whether Submit may be pressed.'
        : 'The widgets updated each other directly: the checkbox showed the company field, and every field asked the button to check the others.',
      facts: [
        ['Submit', form.submit.enabled ? 'enabled' : 'disabled'],
        ['Company name field', form.company.visible ? 'shown' : 'hidden'],
        ['Links between widgets', String(links)],
      ],
    };
  },
  notes: {
    'TextField.type': 'The person types into a field.',
    'Checkbox.toggle': 'The person ticks "Company account".',
    'SubmitButton.refresh': 'The field calls the button directly, and the button reads the other widgets to decide whether it may be pressed.',
    'SignupDialog.changed': 'The widget only tells the dialog "I changed". The dialog knows every widget and decides what happens.',
  },
};
