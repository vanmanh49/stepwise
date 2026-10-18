import type { Dataset } from './index';

/** Four bank accounts and two past transfers, for transactions and isolation levels. Balances can't go below zero. */
export const bank: Dataset = {
  id: 'bank',
  title: 'Bank',
  tables: [
    {
      name: 'accounts',
      columns: [
        { name: 'id', type: 'INTEGER', primaryKey: true },
        { name: 'owner', type: 'TEXT', notNull: true },
        { name: 'balance', type: 'INTEGER', notNull: true, check: 'balance >= 0' },
      ],
      rows: [
        [1, 'An', 500],
        [2, 'Binh', 300],
        [3, 'Chi', 0],
        [4, 'Dung', 1200],
      ],
    },
    {
      name: 'transfers',
      columns: [
        { name: 'id', type: 'INTEGER', primaryKey: true },
        { name: 'from_id', type: 'INTEGER', references: { table: 'accounts', column: 'id' } },
        { name: 'to_id', type: 'INTEGER', references: { table: 'accounts', column: 'id' } },
        { name: 'amount', type: 'INTEGER', notNull: true, check: 'amount > 0' },
      ],
      rows: [
        [1, 1, 2, 100],
        [2, 4, 3, 250],
      ],
    },
  ],
};
