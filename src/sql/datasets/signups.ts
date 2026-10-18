import type { Dataset } from './index';

/**
 * One badly designed table: every sign-up repeats the student's email, the course title and the
 * teacher's room. Teacher Ha's room was changed in only one row, so it disagrees (an update anomaly).
 */
export const signups: Dataset = {
  id: 'signups',
  title: 'Sign-ups',
  tables: [
    {
      name: 'course_signups',
      columns: [
        { name: 'student', type: 'TEXT' },
        { name: 'student_email', type: 'TEXT' },
        { name: 'course', type: 'TEXT' },
        { name: 'course_title', type: 'TEXT' },
        { name: 'teacher', type: 'TEXT' },
        { name: 'teacher_room', type: 'TEXT' },
        { name: 'grade', type: 'INTEGER' },
      ],
      rows: [
        ['Mai', 'mai@uni.edu', 'DB101', 'Databases', 'Ha', 'B12', 85],
        ['Mai', 'mai@uni.edu', 'AL201', 'Algorithms', 'Son', 'C03', 72],
        ['Tuan', 'tuan@uni.edu', 'DB101', 'Databases', 'Ha', 'B12', 90],
        ['Tuan', 'tuan@uni.edu', 'NW301', 'Networks', 'Son', 'C03', null],
        ['Linh', 'linh@uni.edu', 'DB101', 'Databases', 'Ha', 'B21', 64],
        ['Linh', 'linh@uni.edu', 'AL201', 'Algorithms', 'Son', 'C03', 70],
        ['Linh', 'linh@uni.edu', 'NW301', 'Networks', 'Son', 'C03', 81],
        ['Bao', 'bao@uni.edu', 'DB101', 'Databases', 'Ha', 'B12', 77],
        ['Bao', 'bao@uni.edu', 'AL201', 'Algorithms', 'Son', 'C03', 95],
        ['Bao', 'bao@uni.edu', 'NW301', 'Networks', 'Son', 'C03', 59],
      ],
    },
  ],
};
