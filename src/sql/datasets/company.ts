import type { Dataset } from './index';

/**
 * A small company. Includes a five-level reporting chain, salary ties inside a department,
 * someone who earns more than their manager, an employee with no department and a department with no staff.
 */
export const company: Dataset = {
  id: 'company',
  title: 'Company',
  tables: [
    {
      name: 'departments',
      columns: [
        { name: 'id', type: 'INTEGER', primaryKey: true },
        { name: 'name', type: 'TEXT', notNull: true },
      ],
      rows: [
        [1, 'Management'],
        [2, 'Engineering'],
        [3, 'Sales'],
        [4, 'Support'],
      ],
    },
    {
      name: 'employees',
      columns: [
        { name: 'id', type: 'INTEGER', primaryKey: true },
        { name: 'name', type: 'TEXT', notNull: true },
        { name: 'manager_id', type: 'INTEGER', references: { table: 'employees', column: 'id' } },
        { name: 'department_id', type: 'INTEGER', references: { table: 'departments', column: 'id' } },
        { name: 'salary', type: 'INTEGER', notNull: true },
        { name: 'hired', type: 'TEXT' },
      ],
      rows: [
        [1, 'Lan', null, 1, 9000, '2015-02-01'],
        [2, 'Minh', 1, 2, 7000, '2016-05-10'],
        [3, 'Hoa', 1, 3, 6500, '2016-09-01'],
        [4, 'Tuan', 2, 2, 5200, '2018-03-15'],
        [5, 'Vy', 2, 2, 5200, '2019-01-20'],
        [6, 'Khoa', 4, 2, 5400, '2020-06-01'],
        [7, 'Nam', 4, 2, 4100, '2021-02-11'],
        [8, 'Linh', 3, 3, 4800, '2015-08-01'],
        [9, 'Quang', 3, 3, 4800, '2019-04-22'],
        [10, 'Mai', 8, 3, 3900, '2022-01-05'],
        [11, 'Bao', 6, 2, 3600, '2023-03-01'],
        [12, 'Thu', 1, null, 3000, '2020-10-10'],
      ],
    },
  ],
};
