import { design, type PatternLesson } from '../steps';
import * as naive from './naive';
import * as naiveChanged from './naive-changed';
import naiveChangedSource from './naive-changed.ts?raw';
import naiveSource from './naive.ts?raw';
import * as pattern from './pattern';
import * as patternChanged from './pattern-changed';
import patternChangedSource from './pattern-changed.ts?raw';
import patternSource from './pattern.ts?raw';

export const CLIENTS = ['3 clients', '2 clients'];

/** Each client's order: the item, the price and the address. */
const ORDERS: [label: string, sku: string][] = [
  ['Web shop', 'book'],
  ['Mobile app', 'mug'],
  ['Phone orders', 'lamp'],
];
const AMOUNT = 20;
const ADDRESS = '12 Elm St';

type Client = { order(sku: string, amount: number, address: string): string[] };

export const facadeLesson: PatternLesson = {
  designs: {
    naive: design(naiveSource, naive),
    naiveChanged: design(naiveChangedSource, naiveChanged),
    pattern: design(patternSource, pattern),
    patternChanged: design(patternChangedSource, patternChanged),
  },
  change: 'Rename the payment API',
  scenario: { name: 'clients', label: 'Clients', options: CLIENTS, help: 'How many parts of the business place orders.' },
  run(choice, clients, t) {
    const count = clients === CLIENTS[0] ? 3 : 2;
    let list: Client[];
    if (choice.pattern) {
      const m = (choice.changed ? patternChanged : pattern) as typeof patternChanged;
      const orders = new m.OrderFacade(new m.Inventory(), new m.Payment(), new m.Shipping());
      t.register(orders);
      list = [new m.WebShop(orders), new m.MobileApp(orders), new m.PhoneOrders(orders)];
    } else {
      const m = (choice.changed ? naiveChanged : naive) as typeof naiveChanged;
      const parts = [new m.Inventory(), new m.Payment(), new m.Shipping()] as const;
      list = [new m.WebShop(...parts), new m.MobileApp(...parts), new m.PhoneOrders(...parts)];
    }
    list = list.slice(0, count);
    for (const client of list) t.register(client);
    const placed = list.map((client, i) => client.order(ORDERS[i]![1], AMOUNT, ADDRESS));
    return {
      ok: placed.every((steps) => steps.length === 3),
      title: `${count} orders placed, each in 3 steps`,
      why: choice.pattern
        ? 'Each client made one call to the facade. Only the facade knows the 3 subsystems and the order to call them in.'
        : 'Each client called all 3 subsystems itself, in the same order, so each one knows how every subsystem works.',
      facts: placed.map((steps, i) => [ORDERS[i]![0], steps.join(' · ')]),
    };
  },
  notes: {
    'OrderFacade.place': 'The facade is the one front door. It calls the subsystems in the right order, so clients don\'t have to.',
    'Inventory.reserve': 'Inventory holds the item so nobody else can buy it.',
    'Payment.charge': 'Payment takes the money.',
    'Payment.capture': 'Payment takes the money, through its renamed method.',
    'Shipping.book': 'Shipping books a delivery to the address.',
    'WebShop.order': 'The web shop places an order.',
    'MobileApp.order': 'The mobile app places an order.',
    'PhoneOrders.order': 'Staff place an order taken over the phone.',
  },
};
