import type { Dataset } from './index';

/** A small school. Includes missing emails and grades, a student with no courses and a course with no students. */
export const school: Dataset = {
  id: 'school',
  title: 'School',
  tables: [
    {
      name: 'students',
      columns: [
        { name: 'id', type: 'INTEGER' },
        { name: 'name', type: 'TEXT' },
        { name: 'year', type: 'INTEGER' },
        { name: 'email', type: 'TEXT' },
      ],
      rows: [
        [1, 'Mai', 1, 'mai@school.edu'],
        [2, 'Tuan', 2, 'tuan@school.edu'],
        [3, 'Linh', 1, null],
        [4, 'Phuong', 3, 'phuong@school.edu'],
        [5, 'Bao', 4, 'bao@school.edu'],
        [6, 'Thu', 2, 'thu@school.edu'],
        [7, 'Viet', 3, null],
        [8, 'Yen', 4, 'yen@school.edu'],
        [9, 'Hai', 1, 'hai@school.edu'],
        [10, 'Nga', 2, 'nga@school.edu'],
      ],
    },
    {
      name: 'courses',
      columns: [
        { name: 'id', type: 'INTEGER' },
        { name: 'title', type: 'TEXT' },
        { name: 'credits', type: 'INTEGER' },
      ],
      rows: [
        [1, 'Databases', 4],
        [2, 'Algorithms', 5],
        [3, 'Networks', 3],
        [4, 'Statistics', 3],
        [5, 'Ethics', 2],
        [6, 'Compilers', 4],
      ],
    },
    {
      name: 'enrollments',
      columns: [
        { name: 'student_id', type: 'INTEGER' },
        { name: 'course_id', type: 'INTEGER' },
        { name: 'grade', type: 'INTEGER' },
      ],
      rows: [
        [1, 1, 85],
        [1, 2, 72],
        [2, 1, 90],
        [2, 3, null],
        [3, 2, 64],
        [4, 1, 78],
        [4, 4, 88],
        [5, 2, 95],
        [5, 3, 70],
        [5, 5, null],
        [6, 4, 81],
        [7, 1, 59],
        [7, 5, 77],
        [8, 3, 92],
        [9, 2, null],
        [9, 4, 66],
      ],
    },
  ],
};
